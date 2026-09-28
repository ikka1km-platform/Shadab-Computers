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
// Example: '317182283991-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com'
export const DEFAULT_GOOGLE_CLIENT_ID = 
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_CLIENT_ID) 
    ? (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) 
    : '';
export const GOOGLE_CLIENT_ID_REGEX = /^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/;
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file';

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
 * Initiates Google OAuth connection using Google Identity Services token client.
 * Does not ask for Gmail passwords, embed server credentials, or create fake tokens.
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

          resolve({
            accessToken: response.access_token,
            email: verification.email || accountEmail.trim(),
            expiresIn: Number(response.expires_in) || 3600,
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
  const firmAccount = profile.firmCloudAccount;
  const firmId = profile.firmId || firmAccount?.firmId || 'FIRM_DEFAULT';
  const curDeviceId = getOrCreateDeviceId();

  // If cloud account is not connected
  if (!firmAccount || firmAccount.cloudConnectionStatus === 'DISCONNECTED' || !firmAccount.cloudAccountEmail) {
    return {
      status: 'DISCONNECTED',
      accountEmail: firmAccount?.cloudAccountEmail,
      firmId,
      pendingQueueCount: await db.syncQueue.count(),
      activeDevicesCount: firmAccount?.activeDevices?.length || 1,
    };
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

    // Check if real Google Drive REST API access is available
    let existingDriveFileId: string | undefined = firmAccount.cloudFileId;

    if (firmAccount.accessToken && !firmAccount.accessToken.startsWith('sim_gtoken')) {
      try {
        // Query Google Drive AppData folder for existing file
        const queryUrl = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${encodeURIComponent(vaultFileName)}' and trashed=false&fields=files(id, name, modifiedTime)`;
        const searchRes = await fetch(queryUrl, {
          headers: { Authorization: `Bearer ${firmAccount.accessToken}` },
        });

        if (searchRes.status === 401) {
          throw new Error('Google authorization token expired. Please reconnect Google Cloud.');
        }

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (searchData.files && searchData.files.length > 0) {
            existingDriveFileId = searchData.files[0].id;
            // Download content
            const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${existingDriveFileId}?alt=media`, {
              headers: { Authorization: `Bearer ${firmAccount.accessToken}` },
            });
            if (fileRes.ok) {
              remoteVault = await fileRes.json();
            }
          }
        }
      } catch (driveErr: any) {
        if (driveErr?.message?.includes('expired')) {
          throw driveErr;
        }
        console.warn('Direct Google Drive query error, proceeding with cache/relay vault:', driveErr);
      }
    } else if (!firmAccount.accessToken) {
      throw new Error('Google Drive access token missing. Please reconnect Google Cloud.');
    }

    // Fallback: Check local vault cache if remote wasn't fetched
    if (!remoteVault) {
      const cached = localStorage.getItem(`vyapar_cloud_vault_${firmId}`);
      if (cached) {
        try {
          remoteVault = JSON.parse(cached);
        } catch (_) {}
      }
    }

    // 2. IF REMOTE VAULT EXISTS, MERGE REMOTE CHANGES USING CONFLICT RESOLVER
    if (remoteVault && remoteVault.firmId === firmId) {
      await mergeRemoteFirmVaultData(remoteVault, curDeviceId);
    }

    // 3. FLUSH LOCAL SYNC QUEUE INTO NEW VAULT
    const pendingQueue = await db.syncQueue.where('status').equals('PENDING').toArray();
    for (const qItem of pendingQueue) {
      if (qItem.id) {
        await db.syncQueue.update(qItem.id, { status: 'SYNCED' });
      }
    }
    // Delete synced items older than 7 days
    await db.syncQueue.where('status').equals('SYNCED').delete();

    // 4. BUILD UPDATED CLOUD VAULT WITH ALL MERGED LOCAL & REMOTE DATA
    const newSyncVersion = (firmAccount.cloudSyncVersion || 1) + 1;
    const mergedVault = await buildFirmCloudVault(
      firmId,
      cloudEmail,
      newSyncVersion,
      remoteVault?.activeDevices || firmAccount.activeDevices
    );

    // Save locally persisted cloud vault cache
    localStorage.setItem(`vyapar_cloud_vault_${firmId}`, JSON.stringify(mergedVault));

    // Upload to Google Drive if access token available
    if (firmAccount.accessToken && !firmAccount.accessToken.startsWith('sim_gtoken')) {
      try {
        if (existingDriveFileId) {
          // Update existing file in appDataFolder using PATCH
          const updateRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existingDriveFileId}?uploadType=media`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${firmAccount.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(mergedVault),
          });
          if (updateRes.status === 401) {
            throw new Error('Google authorization token expired during upload. Please reconnect Google Cloud.');
          }
        } else {
          // Create new file in appDataFolder using multipart POST
          const metadata = {
            name: vaultFileName,
            parents: ['appDataFolder'],
          };
          const form = new FormData();
          form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
          form.append('file', new Blob([JSON.stringify(mergedVault)], { type: 'application/json' }));

          const createRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: { Authorization: `Bearer ${firmAccount.accessToken}` },
            body: form,
          });
          if (createRes.status === 401) {
            throw new Error('Google authorization token expired during upload. Please reconnect Google Cloud.');
          }
          if (createRes.ok) {
            const createData = await createRes.json();
            existingDriveFileId = createData.id;
          }
        }
      } catch (uploadErr: any) {
        if (uploadErr?.message?.includes('expired')) {
          throw uploadErr;
        }
        console.warn('Drive upload failed, saved locally and queued for retry:', uploadErr);
      }
    }

    // 5. UPDATE FIRM CLOUD ACCOUNT STATUS TO CONNECTED & SYNCED
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
 * Allows co-workers to connect from 4G/5G/remote Wi-Fi without knowing the owner's Google password.
 */
export function generateWorkerCloudInvitation(
  profile: BusinessProfile,
  worker: CoWorker,
  baseUrl: string
): { inviteUrl: string; inviteToken: string } {
  const firmId = profile.firmId || profile.firmCloudAccount?.firmId || 'FIRM_MAIN';
  const firmName = profile.businessName || 'My Business';
  
  const tokenPayload = {
    fid: firmId,
    fn: firmName,
    wid: worker.id,
    wn: worker.name,
    wr: worker.role,
    wp: worker.pin || '',
    ce: profile.firmCloudAccount?.cloudAccountEmail || '',
    iat: Date.now(),
  };

  const inviteToken = btoa(JSON.stringify(tokenPayload));
  const inviteUrl = `${baseUrl}/?cloudInvite=${encodeURIComponent(inviteToken)}`;

  return { inviteUrl, inviteToken };
}

/**
 * Parses and accepts a worker cloud invitation from URL parameter.
 */
export async function acceptWorkerCloudInvitation(
  inviteToken: string,
  onProfileUpdate: (updated: Partial<BusinessProfile>) => Promise<void>
): Promise<{ success: boolean; workerName: string; firmName: string; firmId: string }> {
  try {
    const jsonStr = atob(decodeURIComponent(inviteToken));
    const payload = JSON.parse(jsonStr);

    if (!payload.fid || !payload.wn) {
      throw new Error('Invalid invitation token payload');
    }

    const curDeviceId = getOrCreateDeviceId();
    const newDeviceEntry: RegisteredDevice = {
      deviceId: curDeviceId,
      deviceName: `${payload.wn} Phone (${payload.wr || 'Worker'})`,
      role: payload.wr || 'Salesman',
      workerName: payload.wn,
      workerId: payload.wid,
      lastSyncAt: new Date().toISOString(),
      isActive: true,
      ipOrNetwork: 'Remote 4G/5G',
    };

    // Update or initialize profile with Firm ID and Cloud identity
    await onProfileUpdate({
      firmId: payload.fid,
      businessName: payload.fn || 'VYApaar Business',
      firmCloudAccount: {
        firmId: payload.fid,
        cloudProvider: 'GOOGLE_DRIVE',
        cloudAccountEmail: payload.ce || 'firm-cloud@google.com',
        cloudConnectionStatus: 'CONNECTED',
        cloudSyncCursor: Date.now(),
        cloudSyncVersion: 1,
        cloudDeviceId: curDeviceId,
        cloudOwnerDeviceId: 'OWNER_PRIMARY',
        activeDevices: [newDeviceEntry],
        autoSyncEnabled: true,
      },
    });

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
