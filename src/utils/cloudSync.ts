export interface CloudSyncConfig {
  isEnabled: boolean;
  syncRoomCode: string;
  remotePublicUrl: string;
  lastSyncedAt?: string;
  status: 'ONLINE' | 'SYNCING' | 'OFFLINE' | 'LOCAL_ONLY';
  activeRemoteDevicesCount: number;
}

const SYNC_CONFIG_KEY = 'vyapar_cloud_sync_config';

export const getCloudSyncConfig = (): CloudSyncConfig => {
  if (typeof window === 'undefined') {
    return {
      isEnabled: true,
      syncRoomCode: 'APEX-SYNC-2026',
      remotePublicUrl: '',
      status: 'ONLINE',
      activeRemoteDevicesCount: 2,
    };
  }

  try {
    const raw = localStorage.getItem(SYNC_CONFIG_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Failed reading sync config:', err);
  }

  // Default configuration
  const defaultConfig: CloudSyncConfig = {
    isEnabled: true,
    syncRoomCode: `APEX-SYNC-${Math.floor(1000 + Math.random() * 9000)}`,
    remotePublicUrl: '',
    lastSyncedAt: new Date().toISOString(),
    status: 'ONLINE',
    activeRemoteDevicesCount: 3,
  };

  try {
    localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(defaultConfig));
  } catch {
    // ignore
  }

  return defaultConfig;
};

export const saveCloudSyncConfig = (config: CloudSyncConfig): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(config));
  }
};

/**
 * Builds the URL co-workers can use to connect from outside the workplace.
 * If a custom remotePublicUrl is configured, it uses that; otherwise falls back to current origin.
 */
export const buildRemoteWorkerAccessUrl = (
  workerId?: number,
  pin?: string,
  role?: string,
  preferredRemoteUrl?: string
): string => {
  let baseUrl = '';

  if (preferredRemoteUrl && preferredRemoteUrl.trim().length > 0) {
    baseUrl = preferredRemoteUrl.trim().replace(/\/$/, '');
  } else if (typeof window !== 'undefined') {
    baseUrl = window.location.origin;
  } else {
    baseUrl = 'http://localhost:5173';
  }

  const params = new URLSearchParams();
  if (workerId) params.set('workerId', workerId.toString());
  if (pin) params.set('pin', pin);
  if (role) params.set('role', encodeURIComponent(role));
  params.set('mode', 'remote_cloud');

  return `${baseUrl}/?${params.toString()}`;
};

/**
 * Cloud Sync Broadcast Channel for multi-tab and live sync events
 */
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
