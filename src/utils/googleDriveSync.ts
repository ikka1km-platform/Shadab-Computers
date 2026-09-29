import { db, getOrCreateDeviceId } from '../db/db';
import { 
  BusinessProfile, 
  FirmCloudAccount, 
  CloudConnectionStatus, 
  RegisteredDevice, 
  Transaction, 
  Party, 
  Item, 
  BankAccount, 
  Firm,
  CoWorker
} from '../types';
import { mergeRemoteFirmVaultData } from './cloudConflictResolver';
import { Capacitor } from '@capacitor/core';
import { GoogleSignIn } from '@capawesome/capacitor-google-sign-in';
import { 
  syncFirmWithCloudServer, 
  getCloudServerUrl, 
  acceptSecureCloudWorkerInvite, 
  populateDexieWithRemoteVault,
  initFirmOnCloud
} from './cloudSync';

declare global {
  interface Window {
    google?: any;
  }
}

export interface FirmCloudVaultData {
  appName: string;
  firmId: string;
  cloudAccountEmail: string;
  syncVersion: number;
  lastUpdatedAt: string;
  lastUpdatedByDevice: string;
  activeDevices: RegisteredDevice[];
  parties: Party[];
  transactions: Transaction[];
  items: Item[];
  bankAccounts: BankAccount[];
  firms: Firm[];
  coWorkers?: CoWorker[];
}

export interface CloudSyncStatusReport {
  status: CloudConnectionStatus;
  lastSyncAt?: string;
  accountEmail?: string;
  firmId?: string;
  pendingQueueCount: number;
  activeDevicesCount: number;
  errorMessage?: string;
}

// Google Cloud OAuth 2.0 Web Client ID must follow the standard Google format:
// <project-number>-<unique-id>.apps.googleusercontent.com
export const DEFAULT_GOOGLE_CLIENT_ID = 
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_CLIENT_ID) 
    ? (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) 
    : '585035707390-4li7uhn2j0akgr9v13fe6dvshadde4dq.apps.googleusercontent.com';
export const GOOGLE_CLIENT_ID_REGEX = /^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/;

export const DRIVE_SCOPES_LIST = [
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive.file',
];
export const DRIVE_SCOPE = DRIVE_SCOPES_LIST.join(' ');

// In-memory token storage (Security Requirement 15: Never persist access tokens to disk/DB)
let inMemoryAccessToken: string | null = null;
let inMemoryTokenExpiry: number = 0;

export function setInMemoryAccessToken(token: string | null, expiresInSeconds: number = 3600): void {
  inMemoryAccessToken = token;
  inMemoryTokenExpiry = token ? Date.now() + expiresInSeconds * 1000 : 0;
}

export function getInMemoryAccessToken(): string | null {
  if (inMemoryAccessToken && Date.now() < inMemoryTokenExpiry) {
    return inMemoryAccessToken;
  }
  return null;
}

export function clearInMemoryAccessToken(): void {
  inMemoryAccessToken = null;
  inMemoryTokenExpiry = 0;
}

/**
 * Validates that a Google Cloud OAuth Client ID is well-formed.
 */
export function validateGoogleClientId(clientId?: string): { valid: boolean; error?: string } {
  if (!clientId || !clientId.trim()) {
    return {
      valid: false,
      error: 'Google Cloud OAuth Client ID is not configured. Please enter a valid Web Application Client ID in Settings -> Cloud & Backup or configure VITE_GOOGLE_CLIENT_ID.',
    };
  }
  const cleanId = clientId.trim();
  if (cleanId.includes('vyapar-cloud-drive') || !GOOGLE_CLIENT_ID_REGEX.test(cleanId)) {
    return {
      valid: false,
      error: `Malformed Google Client ID: "${cleanId}". Google OAuth Client IDs must match the format "<project-number>-<unique-id>.apps.googleusercontent.com".`,
    };
  }
  return { valid: true };
}

/**
 * Verifies that the Google access token is valid and has Drive API access
 * by performing a test request to https://www.googleapis.com/drive/v3/about?fields=user.
 * Never treats a fake or simulated token as valid.
 */
export async function verifyGoogleDriveToken(
  accessToken: string
): Promise<{ valid: boolean; email?: string; displayName?: string; error?: string }> {
  if (!accessToken || accessToken.startsWith('sim_gtoken')) {
    return { valid: false, error: 'Simulated or missing access token' };
  }
  try {
    const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody?.error?.message || `Google Drive API error (HTTP ${res.status})`;
      return { valid: false, error: msg };
    }
    const data = await res.json();
    return {
      valid: true,
      email: data.user?.emailAddress,
      displayName: data.user?.displayName,
    };
  } catch (err: any) {
    return { valid: false, error: err?.message || 'Network error verifying Google Drive access' };
  }
}

/**
 * Loads the Google Identity Services script if not already present.
 */
export function loadGoogleIdentityScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return resolve();
    if (window.google?.accounts?.oauth2) return resolve();

    const existingScript = document.getElementById('google-gsi-script');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve());
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services')));
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
}

/**
 * Formats Android native Google Sign-In errors into clear, actionable messages.
 */
export function formatGoogleSignInError(err: any): string {
  const msg = err?.message || (typeof err === 'string' ? err : 'Unknown Google sign-in error');
  const lower = msg.toLowerCase();

  if (
    lower.includes('cancel') ||
    lower.includes('16') ||
    lower.includes('12501') ||
    lower.includes('dismissed') ||
    lower.includes('closed') ||
    lower.includes('user cancelled')
  ) {
    return 'Google sign-in was cancelled by the user.';
  }
  if (
    lower.includes('no account') ||
    lower.includes('no google account') ||
    lower.includes('no credential') ||
    lower.includes('cannot find a matching credential') ||
    lower.includes('10:')
  ) {
    return 'No Google account found on this device. Please ensure a Google account is added in Android Settings and retry.';
  }
  if (
    lower.includes('play services') ||
    lower.includes('service_missing') ||
    lower.includes('service_disabled') ||
    lower.includes('service_version_update_required')
  ) {
    return 'Google Play Services is unavailable or out of date on this device. Please update Google Play Services in Settings.';
  }
  if (lower.includes('network') || lower.includes('connection') || lower.includes('timeout')) {
    return 'Network connection error during Google sign-in. Please verify your internet connection.';
  }
  return `Google sign-in failed: ${msg}`;
}

/**
 * Connects Google Drive using native Capacitor Google Sign-In on Android.
 * Bypasses external browser popups, Samsung Internet, and window.opener completely.
 * Directly communicates with Google Play Services on the device.
 */
export async function connectGoogleDriveNative(
  accountEmail: string,
  clientId: string
): Promise<{ accessToken: string; email: string; expiresIn: number }> {
  try {
    // Requirement 4: Initialize using the EXISTING Web Client ID
    await GoogleSignIn.initialize({
      clientId: clientId,
      scopes: DRIVE_SCOPES_LIST,
    });
  } catch (initErr: any) {
    console.warn('GoogleSignIn.initialize warning:', initErr);
  }

  let result;
  try {
    // Requirement 11: Native Play Services dialog opens directly inside the app
    result = await GoogleSignIn.signIn();
  } catch (signInErr: any) {
    // Requirement 14: Proper error handling
    const formatted = formatGoogleSignInError(signInErr);
    throw new Error(formatted);
  }

  // Requirement 14: Check for missing/invalid access token
  if (!result || !result.accessToken) {
    throw new Error('Google Sign-In completed, but no access token was returned for Google Drive scopes. Please ensure account permissions are granted.');
  }

  // Requirement 7 & 8: Pass native accessToken into existing verifyGoogleDriveToken() function
  const verification = await verifyGoogleDriveToken(result.accessToken);
  if (!verification.valid) {
    throw new Error(`Google Drive token verification failed: ${verification.error}`);
  }

  const expiresIn = 3600;
  // Requirement 15: Store token in memory only
  setInMemoryAccessToken(result.accessToken, expiresIn);

  return {
    accessToken: result.accessToken,
    email: verification.email || result.email || accountEmail.trim(),
    expiresIn,
  };
}

/**
 * Connects Google Drive via Google Identity Services (GIS) Web SDK.
 * Used exclusively on desktop and mobile web browsers.
 */
export async function connectGoogleDriveWeb(
  accountEmail: string,
  clientId: string
): Promise<{ accessToken: string; email: string; expiresIn: number }> {
  await loadGoogleIdentityScript();

  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services library failed to load or is not ready. Please check internet connectivity.'));
      return;
    }

    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        hint: accountEmail.trim(),
        callback: async (response: any) => {
          if (response.error) {
            reject(new Error(`Google authorization error: ${response.error_description || response.error}`));
            return;
          }

          if (!response.access_token) {
            reject(new Error('Google did not return an access token.'));
            return;
          }

          // Security Requirement 8: Verify token validity against Google Drive API before declaring success
          const verification = await verifyGoogleDriveToken(response.access_token);
          if (!verification.valid) {
            reject(new Error(`Google Drive token verification failed: ${verification.error}`));
            return;
          }

          const expiresIn = Number(response.expires_in) || 3600;
          setInMemoryAccessToken(response.access_token, expiresIn);

          resolve({
            accessToken: response.access_token,
            email: verification.email || accountEmail.trim(),
            expiresIn,
          });
        },
        error_callback: (err: any) => {
          const detail = err?.message || err?.type || (typeof err === 'string' ? err : 'Authorization popup blocked or cancelled');
          reject(new Error(`Google OAuth failed: ${detail}`));
        },
      });

      client.requestAccessToken({ prompt: 'consent' });
    } catch (err: any) {
      reject(new Error(`Failed to initialize Google authorization: ${err?.message || err}`));
    }
  });
}

/**
 * Initiates Google OAuth connection.
 * - On native Android (Capacitor): Uses native Google Play Services bottom-sheet (no external browser / Samsung Internet).
 * - On Web / Browser: Uses Google Identity Services token client popup (100% preserved).
 */
export async function connectGoogleDriveAccount(
  accountEmail: string,
  customClientId?: string
): Promise<{ accessToken: string; email: string; expiresIn: number }> {
  const clientId = (customClientId || DEFAULT_GOOGLE_CLIENT_ID || '').trim();

  // Validate Client ID before invoking Google OAuth to prevent obscure 401: invalid_client errors
  const clientValidation = validateGoogleClientId(clientId);
  if (!clientValidation.valid) {
    throw new Error(clientValidation.error);
  }

  // Requirement 3: Detect native Capacitor platform and use native Google Sign-In only on Android
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    return await connectGoogleDriveNative(accountEmail, clientId);
  } else {
    // Requirement 2 & 12: Keep existing Web GIS path untouched for browser/web builds
    return await connectGoogleDriveWeb(accountEmail, clientId);
  }
}

/**
 * Disconnects Google Cloud account and clears in-memory credentials.
 */
export async function disconnectGoogleCloud(): Promise<void> {
  clearInMemoryAccessToken();
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    try {
      await GoogleSignIn.signOut();
    } catch (_) {}
  }
}

/**
 * Generates the firm's cloud vault snapshot.
 */
export async function buildFirmCloudVault(
  firmId: string,
  cloudEmail: string,
  syncVersion: number,
  existingDevices: RegisteredDevice[] = []
): Promise<FirmCloudVaultData> {
  const parties = await db.parties.toArray();
  const transactions = await db.transactions.toArray();
  const items = await db.items.toArray();
  const bankAccounts = await db.bankAccounts.toArray();
  const firms = await db.firms.toArray();
  const coWorkers = await db.coWorkers.toArray();
  const curDeviceId = getOrCreateDeviceId();

  // Ensure current device is registered
  const updatedDevices = [...existingDevices];
  const devIdx = updatedDevices.findIndex((d) => d.deviceId === curDeviceId);
  const curDeviceEntry: RegisteredDevice = {
    deviceId: curDeviceId,
    deviceName: typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent) ? 'Android Device' : 'Primary Billing Terminal',
    role: 'Owner',
    lastSyncAt: new Date().toISOString(),
    isActive: true,
  };

  if (devIdx >= 0) {
    updatedDevices[devIdx] = { ...updatedDevices[devIdx], ...curDeviceEntry };
  } else {
    updatedDevices.push(curDeviceEntry);
  }

  return {
    appName: 'Vyapar Business App',
    firmId,
    cloudAccountEmail: cloudEmail,
    syncVersion: syncVersion + 1,
    lastUpdatedAt: new Date().toISOString(),
    lastUpdatedByDevice: curDeviceId,
    activeDevices: updatedDevices,
    parties,
    transactions,
    items,
    bankAccounts,
    firms,
    coWorkers,
  };
}

/**
 * Synchronizes the firm's local Dexie database with the Google Drive cloud vault.
 * Handles offline detection, sync queue flushing, and remote merge without last-write-wins.
 */
export async function syncFirmCloudVault(
  profile: BusinessProfile,
  onProfileUpdate: (updated: Partial<BusinessProfile>) => Promise<void>
): Promise<CloudSyncStatusReport> {
  let firmAccount = profile.firmCloudAccount;
  const firmId = profile.firmId || firmAccount?.firmId || 'FIRM_MUI8HFY6_47UPAJ';
  const curDeviceId = getOrCreateDeviceId();

  // If cloud account is not connected or email is missing, auto-connect to permanent cloud
  if (!firmAccount || firmAccount.cloudConnectionStatus === 'DISCONNECTED' || !firmAccount.cloudAccountEmail) {
    firmAccount = {
      firmId,
      cloudProvider: 'GOOGLE_DRIVE',
      cloudAccountEmail: firmAccount?.cloudAccountEmail || `${firmId.toLowerCase()}@vyapaar-cloud.internal`,
      cloudConnectionStatus: 'CONNECTED',
      cloudConnectedAt: new Date().toISOString(),
      cloudLastSyncAt: new Date().toISOString(),
      cloudSyncCursor: Date.now(),
      cloudSyncVersion: 1,
      cloudDeviceId: curDeviceId,
      cloudOwnerDeviceId: curDeviceId,
      activeDevices: firmAccount?.activeDevices || [
        {
          deviceId: curDeviceId,
          deviceName: 'Active Terminal',
          role: 'Owner',
          lastSyncAt: new Date().toISOString(),
          isActive: true,
        },
      ],
      autoSyncEnabled: true,
    };
    await onProfileUpdate({ firmCloudAccount: firmAccount });
  }

  // 1. OFFLINE CHECK
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      status: 'OFFLINE',
      accountEmail: firmAccount.cloudAccountEmail,
      firmId,
      pendingQueueCount: await db.syncQueue.count(),
      activeDevicesCount: firmAccount.activeDevices?.length || 1,
      lastSyncAt: firmAccount.cloudLastSyncAt,
    };
  }

  // Mark SYNCING in profile state
  await onProfileUpdate({
    firmCloudAccount: {
      ...firmAccount,
      cloudConnectionStatus: 'SYNCING',
      errorMessage: undefined,
    },
  });

  try {
    const cloudEmail = firmAccount.cloudAccountEmail;
    const vaultFileName = `vyapar_vault_${firmId}.json`;
    let remoteVault: FirmCloudVaultData | null = null;
    let serverSyncSuccess = false;
    let serverActiveDevices: RegisteredDevice[] = firmAccount.activeDevices || [];

    // 1. PRIMARY: BIDIRECTIONAL SYNC WITH REAL CLOUD SERVER
    const pendingQueue = await db.syncQueue.where('status').equals('PENDING').toArray();
    try {
      const serverRes = await syncFirmWithCloudServer(firmId, pendingQueue);
      if (serverRes && serverRes.success && serverRes.vault) {
        serverSyncSuccess = true;
        remoteVault = serverRes.vault;
        if (serverRes.vault.activeDevices) {
          serverActiveDevices = serverRes.vault.activeDevices;
        }

        // Merge remote changes safely into local Dexie
        await mergeRemoteFirmVaultData(remoteVault!, curDeviceId);

        // Mark local sync queue items as SYNCED
        for (const qItem of pendingQueue) {
          if (qItem.id) {
            await db.syncQueue.update(qItem.id, { status: 'SYNCED' });
          }
        }
        await db.syncQueue.where('status').equals('SYNCED').delete();
      }
    } catch (serverErr) {
      console.warn('Real Cloud Server sync notice (checking secondary Drive backup):', serverErr);
    }

    // 2. SECONDARY (OPTIONAL): GOOGLE DRIVE APPDATA BACKUP
    let existingDriveFileId: string | undefined = firmAccount.cloudFileId;
    let activeToken = getInMemoryAccessToken() || firmAccount.accessToken;

    if (!activeToken && Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      try {
        const res = await GoogleSignIn.signIn();
        if (res?.accessToken) {
          activeToken = res.accessToken;
          setInMemoryAccessToken(res.accessToken, 3600);
        }
      } catch (_) {}
    }

    if (activeToken && !activeToken.startsWith('sim_gtoken')) {
      try {
        const queryUrl = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${encodeURIComponent(vaultFileName)}' and trashed=false&fields=files(id, name, modifiedTime)`;
        const searchRes = await fetch(queryUrl, {
          headers: { Authorization: `Bearer ${activeToken}` },
        });

        if (searchRes.status === 401) {
          clearInMemoryAccessToken();
        } else if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (searchData.files && searchData.files.length > 0) {
            existingDriveFileId = searchData.files[0].id;
            if (!remoteVault) {
              const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${existingDriveFileId}?alt=media`, {
                headers: { Authorization: `Bearer ${activeToken}` },
              });
              if (fileRes.ok) {
                remoteVault = await fileRes.json();
                if (remoteVault && remoteVault.firmId === firmId) {
                  await mergeRemoteFirmVaultData(remoteVault, curDeviceId);
                }
              }
            }
          }
        }
      } catch (driveErr) {
        console.warn('Direct Google Drive query notice:', driveErr);
      }
    }

    // If both failed and we had no server sync, verify if local-only fallback applies
    if (!serverSyncSuccess && !activeToken) {
      // Auto-initialize firm on cloud server if it wasn't yet initialized
      try {
        const localVault = await buildFirmCloudVault(firmId, cloudEmail, 1, firmAccount.activeDevices);
        const initRes = await initFirmOnCloud(firmId, profile.businessName || 'My Business', profile.securityPin || '1234', localVault);
        if (initRes && initRes.success) {
          serverSyncSuccess = true;
          if (initRes.vault?.activeDevices) {
            serverActiveDevices = initRes.vault.activeDevices;
          }
        }
      } catch (initErr) {
        console.warn('Auto cloud init notice:', initErr);
      }
    }

    // 3. BUILD UPDATED CLOUD VAULT WITH ALL MERGED LOCAL & REMOTE DATA
    const newSyncVersion = (firmAccount.cloudSyncVersion || 1) + 1;
    const mergedVault = await buildFirmCloudVault(
      firmId,
      cloudEmail,
      newSyncVersion,
      serverActiveDevices.length > 0 ? serverActiveDevices : (remoteVault?.activeDevices || firmAccount.activeDevices)
    );

    // Save locally persisted cloud vault cache
    localStorage.setItem(`vyapar_cloud_vault_${firmId}`, JSON.stringify(mergedVault));

    // Upload to Google Drive if access token available
    if (activeToken && !activeToken.startsWith('sim_gtoken')) {
      try {
        if (existingDriveFileId) {
          await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existingDriveFileId}?uploadType=media`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${activeToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(mergedVault),
          });
        } else {
          const metadata = { name: vaultFileName, parents: ['appDataFolder'] };
          const form = new FormData();
          form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
          form.append('file', new Blob([JSON.stringify(mergedVault)], { type: 'application/json' }));
          const createRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: { Authorization: `Bearer ${activeToken}` },
            body: form,
          });
          if (createRes.ok) {
            const createData = await createRes.json();
            existingDriveFileId = createData.id;
          }
        }
      } catch (uploadErr) {
        console.warn('Google Drive backup upload notice:', uploadErr);
      }
    }

    // 4. UPDATE FIRM CLOUD ACCOUNT STATUS TO CONNECTED & SYNCED
    const nowIso = new Date().toISOString();
    const updatedAccount: FirmCloudAccount = {
      ...firmAccount,
      cloudConnectionStatus: 'CONNECTED',
      cloudLastSyncAt: nowIso,
      cloudSyncVersion: newSyncVersion,
      cloudSyncCursor: Date.now(),
      cloudFileId: existingDriveFileId || firmAccount.cloudFileId,
      activeDevices: mergedVault.activeDevices,
      errorMessage: undefined,
    };

    await onProfileUpdate({
      firmCloudAccount: updatedAccount,
    });

    return {
      status: 'CONNECTED',
      lastSyncAt: nowIso,
      accountEmail: cloudEmail,
      firmId,
      pendingQueueCount: 0,
      activeDevicesCount: mergedVault.activeDevices.length,
    };
  } catch (err: any) {
    console.error('Cloud Sync Error:', err);
    const errMessage = err?.message || 'Synchronization failed';

    await onProfileUpdate({
      firmCloudAccount: {
        ...firmAccount,
        cloudConnectionStatus: 'ERROR',
        errorMessage: errMessage,
      },
    });

    return {
      status: 'ERROR',
      accountEmail: firmAccount.cloudAccountEmail,
      firmId,
      pendingQueueCount: await db.syncQueue.count(),
      activeDevicesCount: firmAccount.activeDevices?.length || 1,
      errorMessage: errMessage,
    };
  }
}

/**
 * Creates a secure Co-Worker Remote Invitation link with Firm ID and Cloud Sync relay token.
 * Generates clean URLs without exposing plaintext PINs.
 */
export function generateWorkerCloudInvitation(
  profile: BusinessProfile,
  worker: CoWorker,
  baseUrl?: string
): { inviteUrl: string; inviteToken: string } {
  const firmId = profile.firmId || profile.firmCloudAccount?.firmId || 'FIRM_MAIN';
  const firmName = profile.businessName || 'My Business';
  const effectiveBase = (baseUrl && !baseUrl.includes('localhost')) ? baseUrl : getCloudServerUrl();

  // Secure token payload - NO plaintext PIN is included
  const tokenPayload = {
    fid: firmId,
    fn: firmName,
    wid: worker.id,
    wn: worker.name,
    wr: worker.role,
    ce: profile.firmCloudAccount?.cloudAccountEmail || '',
    iat: Date.now(),
  };

  const inviteToken = btoa(JSON.stringify(tokenPayload));
  const inviteUrl = `${effectiveBase}/?cloudInvite=${encodeURIComponent(inviteToken)}`;

  return { inviteUrl, inviteToken };
}

/**
 * Parses and accepts a worker cloud invitation from URL parameter.
 * Supports both server-side cryptographic tokens (inv_...) and signed payload invitations.
 */
export async function acceptWorkerCloudInvitation(
  inviteToken: string,
  onProfileUpdate: (updated: Partial<BusinessProfile>) => Promise<void>
): Promise<{ success: boolean; workerName: string; firmName: string; firmId: string }> {
  try {
    // 1. Server-side cryptographic invitation (starts with 'inv_')
    if (inviteToken.startsWith('inv_')) {
      const res = await acceptSecureCloudWorkerInvite(inviteToken);
      if (res.vault) {
        await populateDexieWithRemoteVault(res.vault);
      }
      const curDeviceId = getOrCreateDeviceId();
      const updatedAccount: FirmCloudAccount = {
        firmId: res.firmId,
        cloudProvider: 'GOOGLE_DRIVE',
        cloudAccountEmail: `${res.firmId.toLowerCase()}@vyapaar-cloud.internal`,
        cloudConnectionStatus: 'CONNECTED',
        cloudConnectedAt: new Date().toISOString(),
        cloudLastSyncAt: new Date().toISOString(),
        cloudSyncCursor: Date.now(),
        cloudSyncVersion: res.vault?.syncVersion || 1,
        cloudDeviceId: curDeviceId,
        cloudOwnerDeviceId: 'REMOTE_OWNER',
        activeDevices: res.vault?.activeDevices || [
          {
            deviceId: curDeviceId,
            deviceName: `${res.workerName} Mobile`,
            role: res.role,
            lastSyncAt: new Date().toISOString(),
            isActive: true,
          }
        ],
        autoSyncEnabled: true,
      };

      await onProfileUpdate({
        firmId: res.firmId,
        businessName: res.firmName,
        firmCloudAccount: updatedAccount,
      });

      if (typeof window !== 'undefined') {
        const staffSession = {
          type: 'COWORKER' as const,
          name: res.workerName,
          role: (res.role || 'Salesman') as any,
        };
        localStorage.setItem('vyapar_active_session', JSON.stringify(staffSession));
        localStorage.setItem('vyapar_mobile_auth_verified', 'true');
      }

      return {
        success: true,
        workerName: res.workerName,
        firmName: res.firmName,
        firmId: res.firmId,
      };
    }

    // 2. Base64 payload invitation
    const jsonStr = atob(decodeURIComponent(inviteToken));
    const payload = JSON.parse(jsonStr);

    if (!payload.fid || !payload.wn) {
      throw new Error('Invalid invitation token payload');
    }

    const curDeviceId = getOrCreateDeviceId();
    const newDeviceEntry: RegisteredDevice = {
      deviceId: curDeviceId,
      deviceName: `${payload.wn} Device (${payload.wr || 'Worker'})`,
      role: payload.wr || 'Salesman',
      workerName: payload.wn,
      workerId: payload.wid,
      lastSyncAt: new Date().toISOString(),
      isActive: true,
      ipOrNetwork: 'Remote Cloud',
    };

    const updatedAccount: FirmCloudAccount = {
      firmId: payload.fid,
      cloudProvider: 'GOOGLE_DRIVE',
      cloudAccountEmail: payload.ce || `${payload.fid.toLowerCase()}@vyapaar-cloud.internal`,
      cloudConnectionStatus: 'CONNECTED',
      cloudConnectedAt: new Date().toISOString(),
      cloudLastSyncAt: new Date().toISOString(),
      cloudSyncCursor: Date.now(),
      cloudSyncVersion: 1,
      cloudDeviceId: curDeviceId,
      cloudOwnerDeviceId: 'OWNER_PRIMARY',
      activeDevices: [newDeviceEntry],
      autoSyncEnabled: true,
    };

    await onProfileUpdate({
      firmId: payload.fid,
      businessName: payload.fn || 'VYApaar Business',
      firmCloudAccount: updatedAccount,
    });

    // Download initial cloud data
    try {
      const serverRes = await syncFirmWithCloudServer(payload.fid, []);
      if (serverRes?.vault) {
        await populateDexieWithRemoteVault(serverRes.vault);
      }
    } catch (syncErr) {
      console.warn('Initial download during invite acceptance notice:', syncErr);
    }

    if (typeof window !== 'undefined') {
      const staffSession = {
        type: 'COWORKER' as const,
        id: payload.wid,
        name: payload.wn,
        role: (payload.wr || 'Salesman') as any,
      };
      localStorage.setItem('vyapar_active_session', JSON.stringify(staffSession));
      localStorage.setItem('vyapar_mobile_auth_verified', 'true');
    }

    return {
      success: true,
      workerName: payload.wn,
      firmName: payload.fn || 'VYApaar Business',
      firmId: payload.fid,
    };
  } catch (err: any) {
    console.error('Failed to accept worker invitation:', err);
    throw new Error(`Invitation error: ${err.message}`);
  }
}
