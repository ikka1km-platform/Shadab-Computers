import { db, getOrCreateDeviceId, updatePartyBalance, updateBankAccountBalances } from '../db/db';
import { BusinessProfile, RegisteredDevice, CoWorker, FirmCloudAccount } from '../types';
import { mergeRemoteFirmVaultData } from './cloudConflictResolver';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { saveUserSession, setMobileLoggedIn } from './userSession';

export const DEFAULT_PUBLIC_CLOUD_URL = 'https://mssopping.onrender.com';
export const DEFAULT_LOCAL_WIFI_URL = 'http://10.218.3.180:3000';
const STORAGE_CLOUD_API_KEY = 'vyapar_cloud_api_url';
const STORAGE_CLOUD_TOKEN_PREFIX = 'vyapar_cloud_token_';

export interface CloudSyncConfig {
  isEnabled: boolean;
  syncRoomCode: string;
  remotePublicUrl: string;
  lastSyncedAt?: string;
  status: 'ONLINE' | 'SYNCING' | 'OFFLINE' | 'LOCAL_ONLY';
  activeRemoteDevicesCount: number;
}

export interface CloudFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  signal?: AbortSignal;
}

export interface CloudFetchResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  json: () => Promise<any>;
}

/**
 * Universal HTTP client for both Native Android and Web (iPhone Safari / Desktop).
 * On Native Android (Capacitor), uses native OkHttpClient via CapacitorHttp to completely
 * bypass WebView CORS restrictions, preflights, and Android sandbox limitations.
 * On Web / Safari, uses standard browser fetch with proper credentials and headers.
 */
async function singleFetch(url: string, options: CloudFetchOptions = {}): Promise<CloudFetchResponse> {
  const method = (options.method || 'GET').toUpperCase();
  const headers = { ...(options.headers || {}) };

  // On Native Android/iOS, use CapacitorHttp (native OkHttp / NSURLSession)
  if (Capacitor.isNativePlatform()) {
    try {
      let dataPayload = options.body;
      if (typeof dataPayload === 'string') {
        try {
          dataPayload = JSON.parse(dataPayload);
        } catch {
          // keep as string
        }
      }

      const res = await CapacitorHttp.request({
        url,
        method,
        headers,
        data: dataPayload,
        connectTimeout: 8000,
        readTimeout: 20000,
      });

      if (res.status > 0) {
        return {
          ok: res.status >= 200 && res.status < 300,
          status: res.status,
          statusText: `HTTP ${res.status}`,
          json: async () => {
            if (typeof res.data === 'string') {
              try {
                return JSON.parse(res.data);
              } catch {
                return res.data;
              }
            }
            return res.data;
          },
        };
      }
    } catch (nativeErr: any) {
      console.warn('[CloudSync] CapacitorHttp attempt failed:', nativeErr);
    }
  }

  // Web Browser fallback (iPhone Safari, Desktop Web)
  const bodyContent =
    typeof options.body === 'object' && options.body !== null && !(options.body instanceof FormData)
      ? JSON.stringify(options.body)
      : options.body;

  const res = await fetch(url, {
    method,
    headers,
    body: bodyContent,
    signal: options.signal,
  });

  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    json: async () => res.json(),
  };
}

export async function cloudFetch(url: string, options: CloudFetchOptions = {}): Promise<CloudFetchResponse> {
  try {
    const res = await singleFetch(url, options);
    if (res.ok || (res.status >= 400 && res.status < 500)) {
      return res;
    }
    throw new Error(`Server returned HTTP ${res.status}`);
  } catch (err: any) {
    // Intelligent auto-fallback: if the primary URL fails, try alternate route (Local Wi-Fi or Live Tunnel)
    try {
      const parsed = new URL(url);
      let fallbackBase: string | null = null;
      if (url !== DEFAULT_PUBLIC_CLOUD_URL && !url.startsWith(DEFAULT_PUBLIC_CLOUD_URL)) {
        fallbackBase = DEFAULT_PUBLIC_CLOUD_URL;
      }

      if (fallbackBase) {
        const fallbackUrl = `${fallbackBase}${parsed.pathname}${parsed.search}`;
        if (fallbackUrl !== url) {
          console.log(`[CloudSync] Primary URL failed, trying permanent Render cloud: ${fallbackUrl}`);
          const fallbackRes = await singleFetch(fallbackUrl, options);
          if (fallbackRes.ok || (fallbackRes.status >= 400 && fallbackRes.status < 500)) {
            // Succeeded! Clear stale temporary URL and stick to permanent Render cloud
            if (typeof window !== 'undefined') {
              localStorage.setItem(STORAGE_CLOUD_API_KEY, fallbackBase);
            }
            return fallbackRes;
          }
        }
      }
    } catch (_) {}

    throw err;
  }
}

export function getCloudServerUrl(): string {
  if (typeof window !== 'undefined') {
    // If the browser is directly running on a public HTTPS server (e.g. iPhone Safari on Cloudflare tunnel),
    // use that same origin as the API backend
    const origin = window.location.origin;
    if (origin && origin.startsWith('https://') && !origin.includes('localhost')) {
      return origin;
    }
    const custom = localStorage.getItem(STORAGE_CLOUD_API_KEY);
    if (custom && custom.trim().length > 0) {
      const trimmed = custom.trim().replace(/\/$/, '');
      // If the stored URL is an outdated/dead trycloudflare.com URL that doesn't match current DEFAULT, purge it
      if (trimmed.includes('trycloudflare.com') && trimmed !== DEFAULT_PUBLIC_CLOUD_URL) {
        localStorage.removeItem(STORAGE_CLOUD_API_KEY);
        return DEFAULT_PUBLIC_CLOUD_URL;
      }
      return trimmed;
    }
  }
  return DEFAULT_PUBLIC_CLOUD_URL;
}

export function setCustomCloudServerUrl(url: string): void {
  if (typeof window !== 'undefined') {
    if (!url || !url.trim() || url.trim() === DEFAULT_PUBLIC_CLOUD_URL) {
      localStorage.removeItem(STORAGE_CLOUD_API_KEY);
    } else {
      localStorage.setItem(STORAGE_CLOUD_API_KEY, url.trim().replace(/\/$/, ''));
    }
  }
}

export function getCloudAuthToken(firmId: string): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(`${STORAGE_CLOUD_TOKEN_PREFIX}${firmId}`);
}

export function setCloudAuthToken(firmId: string, token: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(`${STORAGE_CLOUD_TOKEN_PREFIX}${firmId}`, token);
  }
}

export function clearCloudAuthToken(firmId: string): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(`${STORAGE_CLOUD_TOKEN_PREFIX}${firmId}`);
  }
}

/**
 * Checks cloud server health and returns connectivity status.
 * Can test the currently active server URL or any arbitrary target URL.
 */
export async function checkCloudHealth(targetUrl?: string): Promise<{ online: boolean; publicUrl: string; service?: string }> {
  const baseUrl = targetUrl ? targetUrl.trim().replace(/\/$/, '') : getCloudServerUrl();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const res = await cloudFetch(`${baseUrl}/api/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      return { online: true, publicUrl: baseUrl, service: data.service };
    }
    return { online: false, publicUrl: baseUrl };
  } catch (e) {
    return { online: false, publicUrl: baseUrl };
  }
}

/**
 * Initializes this firm on the remote Cloud Server.
 * Called when the business owner connects or syncs for the first time.
 */
export async function initFirmOnCloud(
  firmId: string,
  firmName: string,
  ownerPin: string = '1234',
  vaultData?: any
): Promise<{ success: boolean; token: string; firmId: string; syncVersion: number; vault: any }> {
  const baseUrl = getCloudServerUrl();
  const deviceId = getOrCreateDeviceId();
  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const deviceName = isMobile ? 'Primary Mobile/Tablet' : 'Primary Billing Terminal';

  const res = await cloudFetch(`${baseUrl}/api/firm/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      firmId,
      firmName,
      ownerPin,
      deviceId,
      deviceName,
      vaultData,
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Firm initialization failed with HTTP ${res.status}`);
  }

  const data = await res.json();
  if (data.token) {
    setCloudAuthToken(firmId, data.token);
  }
  return data;
}

/**
 * Authenticates a device (Owner or Co-Worker) into an existing firm using Firm ID + PIN.
 * Used when opening VYApaar on iPhone Safari or a secondary tablet.
 */
export async function authenticateFirmOnCloud(
  firmId: string,
  pin: string
): Promise<{
  success: boolean;
  firmId: string;
  firmName: string;
  role: string;
  workerName: string;
  workerId?: number;
  token: string;
  syncVersion: number;
  vault: any;
}> {
  const baseUrl = getCloudServerUrl();
  const deviceId = getOrCreateDeviceId();
  const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const deviceName = isMobile ? 'iPhone Safari' : 'Web Terminal';

  const res = await cloudFetch(`${baseUrl}/api/firm/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      firmId,
      pin,
      deviceId,
      deviceName,
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Authentication failed with HTTP ${res.status}`);
  }

  const data = await res.json();
  if (data.token) {
    setCloudAuthToken(firmId, data.token);
  }
  return data;
}

/**
 * Downloads the full current cloud vault for a firm.
 */
export async function downloadCloudVault(firmId: string): Promise<any> {
  const baseUrl = getCloudServerUrl();
  const token = getCloudAuthToken(firmId);
  if (!token) {
    throw new Error(`Firm ${firmId} is not authenticated on this device.`);
  }

  const res = await cloudFetch(`${baseUrl}/api/firm/vault`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-firm-id': firmId,
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed fetching vault with HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.vault;
}

/**
 * Performs real bidirectional synchronization with the cloud server.
 * Pushes pending changes and merges remote changes without data loss.
 */
export async function syncFirmWithCloudServer(
  firmId: string,
  pendingQueue: any[] = []
): Promise<{ success: boolean; syncVersion: number; vault: any; lastUpdatedAt: string }> {
  const baseUrl = getCloudServerUrl();
  let token = getCloudAuthToken(firmId);

  // If token is missing, attempt auto-initialization or authentication from local database
  if (!token) {
    const profile = await db.businessProfile.toArray().then((p) => p[0]);
    const parties = await db.parties.toArray();
    const transactions = await db.transactions.toArray();
    const items = await db.items.toArray();
    const bankAccounts = await db.bankAccounts.toArray();
    const firms = await db.firms.toArray();
    const coWorkers = await db.coWorkers.toArray();
    const localVault = { parties, transactions, items, bankAccounts, firms, coWorkers };

    try {
      const initRes = await initFirmOnCloud(
        firmId,
        profile?.businessName || 'MS Shopping',
        profile?.securityPin || '1234',
        localVault
      );
      token = initRes.token;
    } catch {
      try {
        const authRes = await authenticateFirmOnCloud(firmId, profile?.securityPin || '1234');
        token = authRes.token;
      } catch (authErr) {
        console.warn('Auto cloud auth fallback error:', authErr);
      }
    }
  }

  const deviceId = getOrCreateDeviceId();
  const allLocalTxs = await db.transactions.toArray();
  const allLocalParties = await db.parties.toArray();
  const allLocalWorkers = await db.coWorkers.toArray();

  let res = await cloudFetch(`${baseUrl}/api/firm/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'x-firm-id': firmId,
    },
    body: {
      firmId,
      deviceId,
      pendingQueue,
      localTransactions: allLocalTxs,
      localParties: allLocalParties,
      localCoWorkers: allLocalWorkers,
    },
  });

  // If 401 or 403, clear stale token, re-authenticate immediately, and retry once
  if (!res.ok && (res.status === 401 || res.status === 403)) {
    clearCloudAuthToken(firmId);
    try {
      const profile = await db.businessProfile.toArray().then((p) => p[0]);
      const authRes = await authenticateFirmOnCloud(firmId, profile?.securityPin || '1234');
      token = authRes.token;
      res = await cloudFetch(`${baseUrl}/api/firm/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-firm-id': firmId,
        },
        body: {
          firmId,
          deviceId,
          pendingQueue,
          localTransactions: allLocalTxs,
          localParties: allLocalParties,
          localCoWorkers: allLocalWorkers,
        },
      });
    } catch (retryErr) {
      console.warn('Re-authentication retry failed:', retryErr);
    }
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Sync failed with HTTP ${res.status}`);
  }

  return await res.json();
}

/**
 * Creates a secure Co-Worker invitation link on the cloud server.
 * Uses a cryptographically random token (zero plaintext PINs).
 */
export async function createSecureCloudWorkerInvite(
  firmId: string,
  workerId: number,
  role: string = 'Salesman'
): Promise<{ inviteToken: string; inviteUrl: string; workerName: string; role: string }> {
  const baseUrl = getCloudServerUrl();
  const token = getCloudAuthToken(firmId);
  if (!token) {
    throw new Error('Firm must be connected to cloud before generating invitations.');
  }

  const res = await cloudFetch(`${baseUrl}/api/firm/invite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'x-firm-id': firmId,
    },
    body: {
      workerId,
      role,
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed creating invite with HTTP ${res.status}`);
  }

  return await res.json();
}

/**
 * Accepts a secure cloud worker invitation on iPhone or remote browser.
 */
export async function acceptSecureCloudWorkerInvite(
  inviteToken: string
): Promise<{
  success: boolean;
  firmId: string;
  firmName: string;
  role: string;
  workerName: string;
  token: string;
  vault: any;
}> {
  const baseUrl = getCloudServerUrl();
  const deviceId = getOrCreateDeviceId();
  const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const deviceName = isMobile ? 'iPhone Safari' : 'Web Terminal';

  const res = await cloudFetch(`${baseUrl}/api/firm/accept-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {
      inviteToken,
      deviceId,
      deviceName,
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed accepting invite with HTTP ${res.status}`);
  }

  const data = await res.json();
  if (data.token && data.firmId) {
    setCloudAuthToken(data.firmId, data.token);
  }
  return data;
}

/**
 * Checks if the local Dexie database currently holds sample/demo/preloaded data.
 * Used to prevent merging real cloud data on top of dummy records.
 */
export async function isLocalDatabaseDemoData(): Promise<boolean> {
  try {
    const profile = await db.businessProfile.toArray().then((p) => p[0]);
    if (!profile) return false;
    if (profile.businessName === 'Apex Traders & Distributors') return true;
    if (profile.email === 'contact@apextraders.in') return true;
    if (profile.ownerName === 'Sunil Verma') return true;

    const demoTxCount = await db.transactions
      .where('voucherNumber')
      .anyOf(['INV-001', 'INV-002', 'PUR-001', 'REC-001', 'EXP-001'])
      .count();
    if (demoTxCount > 0) return true;

    const demoPartyCount = await db.parties
      .where('name')
      .anyOf(['Sharma General Store', 'Royal Supermart', 'Gupta Wholesale Suppliers'])
      .count();
    if (demoPartyCount > 0) return true;

    const demoFirmCount = await db.firms
      .where('name')
      .anyOf(['Apex Traders (Firm A)', 'Apex Enterprises (Firm B)'])
      .count();
    if (demoFirmCount > 0) return true;
  } catch (err) {
    console.error('Error checking demo data status:', err);
  }
  return false;
}

/**
 * Hydrates Dexie with the downloaded cloud vault.
 * Wipes demo/sample data, imports actual accounting records (parties, transactions, items, firms, bank accounts),
 * recalculates balances, and optionally reloads the application.
 */
export async function hydrateDexieWithCloudVault(
  vault: any,
  options: { clearExisting?: boolean; forceReload?: boolean; userSession?: any } = {}
): Promise<void> {
  if (!vault || !vault.firmId) {
    throw new Error('Invalid cloud firm vault data received.');
  }

  const { clearExisting = true, forceReload = true } = options;
  const localDeviceId = getOrCreateDeviceId();

  console.log(`[CloudSync] Starting Dexie hydration for firm: ${vault.firmId} (clearExisting=${clearExisting})`);

  // Step 1: Immediately clear local pending queue so NO stale demo records get pushed to the cloud
  await db.syncQueue.clear();

  // Step 2: Determine authoritative firm name and primary profile attributes
  const realFirmName =
    vault.firmName ||
    vault.firms?.find((f: any) => f.isDefault)?.name ||
    vault.firms?.[0]?.name ||
    vault.appName ||
    'MS Shopping';

  const defaultFirm = vault.firms?.find((f: any) => f.isDefault) || vault.firms?.[0];

  // Step 3: Atomic Dexie database operation across all accounting tables
  await db.transaction(
    'rw',
    [
      db.parties,
      db.transactions,
      db.items,
      db.firms,
      db.bankAccounts,
      db.coWorkers,
      db.businessProfile,
      db.syncQueue,
      db.conflictRecords,
    ],
    async () => {
      if (clearExisting) {
        await db.parties.clear();
        await db.transactions.clear();
        await db.items.clear();
        await db.firms.clear();
        await db.bankAccounts.clear();
        await db.coWorkers.clear();
        await db.syncQueue.clear();
        await db.conflictRecords.clear();
      }

      // Hydrate Firms (Preserving exact IDs so transaction/party foreign keys remain intact)
      if (Array.isArray(vault.firms) && vault.firms.length > 0) {
        if (clearExisting) {
          await db.firms.bulkAdd(vault.firms);
        } else {
          for (const f of vault.firms) {
            await db.firms.put(f);
          }
        }
      } else if (clearExisting) {
        await db.firms.add({
          name: realFirmName,
          code: 'MAIN',
          isDefault: true,
          phone: vault.phone || '9303965160',
          address: vault.address || '',
          firmId: vault.firmId,
          createdAt: new Date().toISOString(),
        });
      }

      // Hydrate Bank Accounts
      if (Array.isArray(vault.bankAccounts) && vault.bankAccounts.length > 0) {
        if (clearExisting) {
          await db.bankAccounts.bulkAdd(vault.bankAccounts);
        } else {
          for (const b of vault.bankAccounts) {
            await db.bankAccounts.put(b);
          }
        }
      }

      // Hydrate Parties
      if (Array.isArray(vault.parties) && vault.parties.length > 0) {
        if (clearExisting) {
          await db.parties.bulkAdd(vault.parties);
        } else {
          for (const p of vault.parties) {
            await db.parties.put(p);
          }
        }
      }

      // Hydrate Items
      if (Array.isArray(vault.items) && vault.items.length > 0) {
        if (clearExisting) {
          await db.items.bulkAdd(vault.items);
        } else {
          for (const item of vault.items) {
            await db.items.put(item);
          }
        }
      }

      // Hydrate Transactions (All sales, invoices, purchases, payments, receipts, expenses, daybook)
      if (Array.isArray(vault.transactions) && vault.transactions.length > 0) {
        if (clearExisting) {
          await db.transactions.bulkAdd(vault.transactions);
        } else {
          for (const tx of vault.transactions) {
            await db.transactions.put(tx);
          }
        }
      }

      // Hydrate CoWorkers
      if (Array.isArray(vault.coWorkers) && vault.coWorkers.length > 0) {
        if (clearExisting) {
          await db.coWorkers.bulkAdd(vault.coWorkers);
        } else {
          for (const w of vault.coWorkers) {
            await db.coWorkers.put(w);
          }
        }
      }

      // Setup connected Business Profile
      const updatedCloudAccount: FirmCloudAccount = {
        firmId: vault.firmId,
        cloudProvider: 'GOOGLE_DRIVE',
        cloudAccountEmail: vault.cloudAccountEmail || `${vault.firmId.toLowerCase()}@vyapaar-cloud.internal`,
        cloudConnectionStatus: 'CONNECTED',
        cloudConnectedAt: new Date().toISOString(),
        cloudLastSyncAt: vault.lastUpdatedAt || new Date().toISOString(),
        cloudSyncCursor: Date.now(),
        cloudSyncVersion: vault.syncVersion || 1,
        cloudDeviceId: localDeviceId,
        cloudOwnerDeviceId: vault.lastUpdatedByDevice || localDeviceId,
        activeDevices: vault.activeDevices || [],
        autoSyncEnabled: true,
      };

      const profileData: BusinessProfile = {
        businessName: realFirmName,
        tagline: vault.tagline || defaultFirm?.name || 'Wholesale & Retail',
        ownerName: vault.ownerName || 'Admin',
        phone: defaultFirm?.phone || vault.phone || '9303965160',
        email: vault.email || vault.cloudAccountEmail || '',
        address: defaultFirm?.address || vault.address || '',
        gstin: defaultFirm?.gstin || vault.gstin || '',
        upiId: defaultFirm?.upiId || vault.upiId || '',
        currencySymbol: vault.currencySymbol || '₹',
        firmId: vault.firmId,
        securityPin: vault.securityPin || '1234',
        isPinLockEnabled: false,
        firmCloudAccount: updatedCloudAccount,
      };

      if (clearExisting) {
        await db.businessProfile.clear();
        await db.businessProfile.add(profileData);
      } else {
        const existingProfiles = await db.businessProfile.toArray();
        if (existingProfiles.length > 0) {
          await db.businessProfile.put({ ...profileData, id: existingProfiles[0].id });
        } else {
          await db.businessProfile.add(profileData);
        }
      }
    }
  );

  // Step 4: Recalculate mathematical party and bank balances from hydrated ledger
  const allParties = await db.parties.toArray();
  for (const party of allParties) {
    if (party.id) {
      await updatePartyBalance(party.id);
    }
  }
  await updateBankAccountBalances();

  // Step 5: Mark localStorage flags so demo data will never be re-seeded and session remains active
  if (typeof window !== 'undefined') {
    localStorage.setItem('vyapar_initialized', 'clean_user_company');
    localStorage.setItem('vyapar_mobile_auth_verified', 'true');

    let sessionToSave = options.userSession;
    if (!sessionToSave) {
      const existingRaw = localStorage.getItem('vyapar_active_session');
      if (existingRaw) {
        try {
          const parsed = JSON.parse(existingRaw);
          if (parsed && parsed.role && parsed.role !== 'Owner') {
            sessionToSave = parsed;
          }
        } catch {}
      }
    }
    if (!sessionToSave) {
      sessionToSave = {
        type: 'OWNER' as const,
        name: `${realFirmName} (Admin)`,
        phone: defaultFirm?.phone || '',
        role: 'Owner' as const,
      };
    }
    localStorage.setItem('vyapar_active_session', JSON.stringify(sessionToSave));

    // Clear any transient join query params from address bar
    try {
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch {}

    // Step 6: Trigger clean interface reload so all LiveQueries & memory state reflect hydrated records
    if (forceReload) {
      console.log('[CloudSync] Hydration finished successfully. Reloading application...');
      window.location.reload();
    }
  }
}

/**
 * Safely applies a downloaded cloud vault into the local Dexie database.
 * If local database is uninitialized, holds demo data, or belongs to another firm,
 * it performs a clean hydration. Otherwise, merges changes safely.
 */
export async function populateDexieWithRemoteVault(
  vault: any,
  options: { clearExisting?: boolean; forceReload?: boolean } = {}
): Promise<void> {
  if (!vault) return;

  // Determine if full hydration is required
  let shouldFullHydrate = options.clearExisting === true;

  if (!shouldFullHydrate) {
    const isDemo = await isLocalDatabaseDemoData();
    const currentProfile = await db.businessProfile.toArray().then((p) => p[0]);
    if (isDemo || !currentProfile || currentProfile.firmId !== vault.firmId) {
      shouldFullHydrate = true;
    }
  }

  if (shouldFullHydrate) {
    await hydrateDexieWithCloudVault(vault, {
      clearExisting: true,
      forceReload: options.forceReload ?? false,
    });
    return;
  }

  // Otherwise, incremental merge using conflict resolver
  const localDeviceId = getOrCreateDeviceId();
  await mergeRemoteFirmVaultData(
    {
      firmId: vault.firmId,
      parties: vault.parties || [],
      transactions: vault.transactions || [],
      items: vault.items || [],
      bankAccounts: vault.bankAccounts || [],
      firms: vault.firms || [],
      lastUpdatedByDevice: vault.lastUpdatedByDevice,
    },
    localDeviceId
  );

  // Co-workers sync
  if (Array.isArray(vault.coWorkers) && vault.coWorkers.length > 0) {
    for (const worker of vault.coWorkers) {
      const existing = await db.coWorkers.get(worker.id);
      if (!existing) {
        await db.coWorkers.put(worker);
      } else {
        await db.coWorkers.update(worker.id, worker);
      }
    }
  }

  // Update Business Profile metadata
  const existingProfiles = await db.businessProfile.toArray();
  const primaryProfile = existingProfiles[0];
  const realFirmName =
    vault.firmName ||
    vault.firms?.find((f: any) => f.isDefault)?.name ||
    vault.firms?.[0]?.name ||
    vault.appName ||
    primaryProfile?.businessName;

  const updatedCloudAccount: FirmCloudAccount = {
    firmId: vault.firmId,
    cloudProvider: 'GOOGLE_DRIVE' as const,
    cloudAccountEmail: vault.cloudAccountEmail || `${vault.firmId.toLowerCase()}@vyapaar-cloud.internal`,
    cloudConnectionStatus: 'CONNECTED' as const,
    cloudConnectedAt: new Date().toISOString(),
    cloudLastSyncAt: vault.lastUpdatedAt || new Date().toISOString(),
    cloudSyncCursor: Date.now(),
    cloudSyncVersion: vault.syncVersion || 1,
    cloudDeviceId: localDeviceId,
    cloudOwnerDeviceId: vault.lastUpdatedByDevice || localDeviceId,
    activeDevices: vault.activeDevices || [],
    autoSyncEnabled: true,
  };

  if (primaryProfile && primaryProfile.id) {
    await db.businessProfile.update(primaryProfile.id, {
      firmId: vault.firmId,
      businessName: realFirmName,
      firmCloudAccount: updatedCloudAccount,
    });
  }
}

// -------------------------------------------------------------
// Compatibility & Bus Utilities
// -------------------------------------------------------------
const SYNC_CONFIG_KEY = 'vyapar_cloud_sync_config';

export const getCloudSyncConfig = (): CloudSyncConfig => {
  if (typeof window === 'undefined') {
    return {
      isEnabled: true,
      syncRoomCode: 'APEX-SYNC-2026',
      remotePublicUrl: DEFAULT_PUBLIC_CLOUD_URL,
      status: 'ONLINE',
      activeRemoteDevicesCount: 2,
    };
  }

  try {
    const raw = localStorage.getItem(SYNC_CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch (err) {
    console.error('Failed reading sync config:', err);
  }

  return {
    isEnabled: true,
    syncRoomCode: 'APEX-SYNC-2026',
    remotePublicUrl: DEFAULT_PUBLIC_CLOUD_URL,
    lastSyncedAt: new Date().toISOString(),
    status: 'ONLINE',
    activeRemoteDevicesCount: 2,
  };
};

export const saveCloudSyncConfig = (config: CloudSyncConfig): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(config));
  }
};

class CloudSyncManager {
  private channel: BroadcastChannel | null = null;
  private listeners: Array<(event: { type: string; payload?: any }) => void> = [];

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.channel = new BroadcastChannel('vyapar_cloud_sync_bus');
      this.channel.onmessage = (event) => {
        this.notifyListeners(event.data);
      };
    }
  }

  public notifySyncEvent(type: string, payload?: any) {
    if (this.channel) {
      this.channel.postMessage({ type, payload, timestamp: Date.now() });
    }
    this.notifyListeners({ type, payload });
  }

  public subscribe(callback: (event: { type: string; payload?: any }) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  private notifyListeners(data: any) {
    this.listeners.forEach((listener) => {
      try {
        listener(data);
      } catch (err) {
        console.error('Error in sync listener:', err);
      }
    });
  }
}

export const cloudSyncBus = new CloudSyncManager();
