import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Building2, 
  Phone, 
  Mail, 
  MapPin, 
  Hash, 
  RefreshCw, 
  Lock, 
  ShieldCheck, 
  FileText, 
  Percent, 
  Download, 
  Upload, 
  Image as ImageIcon,
  CheckCircle,
  AlertCircle,
  QrCode,
  Landmark,
  Printer,
  Clock,
  Send,
  Calendar,
  HardDrive,
  Cloud,
  Laptop,
  Smartphone,
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Globe,
  ExternalLink,
  ArrowRight,
  LogIn,
  Activity,
  Wifi,
  Settings2,
  RotateCcw,
  ArrowLeft,
} from 'lucide-react';
import { BusinessProfile, FirmCloudAccount } from '../../types';
import { exportFullBackup, restoreFromBackup, sendBackupToEmail } from '../../utils/backupRestore';
import { compressImage } from '../../utils/imageCompressor';
import { connectGoogleDriveAccount, syncFirmCloudVault, validateGoogleClientId, DEFAULT_GOOGLE_CLIENT_ID, disconnectGoogleCloud } from '../../utils/googleDriveSync';
import { db, getOrCreateDeviceId } from '../../db/db';
import { 
  initFirmOnCloud, 
  authenticateFirmOnCloud, 
  getCloudServerUrl, 
  setCustomCloudServerUrl,
  DEFAULT_PUBLIC_CLOUD_URL,
  DEFAULT_LOCAL_WIFI_URL,
  populateDexieWithRemoteVault, 
  hydrateDexieWithCloudVault,
  downloadCloudVault,
  checkCloudHealth 
} from '../../utils/cloudSync';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile?: BusinessProfile;
  onSaveProfile: (profile: Partial<BusinessProfile>) => Promise<void>;
  onResetDemo: () => Promise<void>;
  onOpenNewCompany?: () => void;
  onOpenPrinterSettings?: () => void;
}

type SettingsTab = 'profile' | 'invoice' | 'tax' | 'security' | 'backup';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  profile,
  onSaveProfile,
  onResetDemo,
  onOpenNewCompany,
  onOpenPrinterSettings,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  // Business Profile
  const [businessName, setBusinessName] = useState('');
  const [tagline, setTagline] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [state, setState] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);

  // Invoice & Print Settings
  const [invoiceTitle, setInvoiceTitle] = useState('TAX INVOICE');
  const [termsAndConditions, setTermsAndConditions] = useState('');
  const [invoiceFooterNote, setInvoiceFooterNote] = useState('');
  const [showBankDetailsOnInvoice, setShowBankDetailsOnInvoice] = useState(true);
  const [showQrOnInvoice, setShowQrOnInvoice] = useState(true);
  const [signatureText, setSignatureText] = useState('Authorized Signatory');

  // Tax & UPI
  const [gstin, setGstin] = useState('');
  const [upiId, setUpiId] = useState('');
  const [defaultGstRate, setDefaultGstRate] = useState<number>(18);

  // Security & PIN Lock
  const [isPinLockEnabled, setIsPinLockEnabled] = useState(false);
  const [securityPin, setSecurityPin] = useState('1234');
  const [confirmPin, setConfirmPin] = useState('1234');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccessMsg, setPinSuccessMsg] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);
  const [isSavingPin, setIsSavingPin] = useState(false);

  // Backup & Restore
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Daily Auto Backup & Email
  const [isDailyAutoBackupEnabled, setIsDailyAutoBackupEnabled] = useState(false);
  const [backupEmail, setBackupEmail] = useState('');
  const [autoDownloadOnDailyBackup, setAutoDownloadOnDailyBackup] = useState(false);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const [isEmailSending, setIsEmailSending] = useState(false);
  const [hasDailySnapshot, setHasDailySnapshot] = useState(false);

  // Firm Cloud Account & Sync
  const [cloudAccountEmail, setCloudAccountEmail] = useState('');
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [isConnectingCloud, setIsConnectingCloud] = useState(false);
  const [showDevicesModal, setShowDevicesModal] = useState(false);
  const [cloudStatusMsg, setCloudStatusMsg] = useState<string | null>(null);
  const [googleClientId, setGoogleClientId] = useState('');
  const [showAdvancedCloud, setShowAdvancedCloud] = useState(false);
  const [copiedFirmId, setCopiedFirmId] = useState(false);
  const [showJoinFirmForm, setShowJoinFirmForm] = useState(true);
  const [joinFirmId, setJoinFirmId] = useState('FIRM_MUI8HFY6_47UPAJ');
  const [joinPin, setJoinPin] = useState('1234');
  const [isJoiningFirm, setIsJoiningFirm] = useState(false);
  const [copiedWebUrl, setCopiedWebUrl] = useState(false);
  const [isTestingCloud, setIsTestingCloud] = useState(false);
  const [cloudServerUrlInput, setCloudServerUrlInput] = useState(getCloudServerUrl());
  const [showEditServerUrl, setShowEditServerUrl] = useState(false);

  useEffect(() => {
    if (profile) {
      setBusinessName(profile.businessName || '');
      setTagline(profile.tagline || '');
      setOwnerName(profile.ownerName || '');
      setPhone(profile.phone || '');
      setEmail(profile.email || '');
      setAddress(profile.address || '');
      setState(profile.state || '');
      setLogoUrl(profile.logoUrl);

      setInvoiceTitle(profile.invoiceTitle || 'TAX INVOICE');
      setTermsAndConditions(profile.termsAndConditions || '1. Goods once sold will not be returned.\n2. Subject to local jurisdiction.\n3. Payment due within agreed terms.');
      setInvoiceFooterNote(profile.invoiceFooterNote || 'Thank you for your business! Visit again.');
      setShowBankDetailsOnInvoice(profile.showBankDetailsOnInvoice !== false);
      setShowQrOnInvoice(profile.showQrOnInvoice !== false);
      setSignatureText(profile.signatureText || 'Authorized Signatory');

      setGstin(profile.gstin || '');
      setUpiId(profile.upiId || '');
      setDefaultGstRate(profile.defaultGstRate ?? 18);

      setIsPinLockEnabled(Boolean(profile.isPinLockEnabled));
      const activePin = profile.securityPin || '1234';
      setSecurityPin(activePin);
      setConfirmPin(activePin);
      setPinError(null);
      setPinSuccessMsg(null);

      setIsDailyAutoBackupEnabled(Boolean(profile.isDailyAutoBackupEnabled));
      setBackupEmail(profile.backupEmail || profile.email || '');
      setAutoDownloadOnDailyBackup(Boolean(profile.autoDownloadOnDailyBackup));
      if (typeof window !== 'undefined') {
        setHasDailySnapshot(Boolean(localStorage.getItem('vyapar_daily_snapshot')));
      }

      setCloudAccountEmail(profile.firmCloudAccount?.cloudAccountEmail || profile.backupEmail || profile.email || '');
      setGoogleClientId(profile.firmCloudAccount?.googleClientId || '');
    }
  }, [profile, isOpen]);

  if (!isOpen) return null;

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, 600, 0.8);
      setLogoUrl(compressed);
    } catch (err) {
      console.error('Failed to compress logo:', err);
    }
  };

  const handleExportBackup = async () => {
    try {
      const filename = await exportFullBackup();
      setBackupStatus(`Backup downloaded: ${filename}`);
      setTimeout(() => setBackupStatus(null), 4000);
    } catch (err: any) {
      alert(`Backup failed: ${err?.message}`);
    }
  };

  const handleSendBackupToMail = async () => {
    if (!backupEmail || !backupEmail.includes('@')) {
      alert('Please enter a valid email address to send the backup.');
      return;
    }
    setIsEmailSending(true);
    setEmailStatus(null);
    try {
      const res = await sendBackupToEmail(backupEmail, businessName);
      if (res.method === 'share_api') {
        setEmailStatus(`Backup file attached and shared for ${backupEmail}!`);
      } else {
        setEmailStatus(`Backup downloaded (${res.filename}) & email draft prepared for ${backupEmail}!`);
      }
      setTimeout(() => setEmailStatus(null), 6000);
    } catch (err: any) {
      alert(`Email backup failed: ${err.message}`);
    } finally {
      setIsEmailSending(false);
    }
  };

  const handleRestoreDailySnapshot = async () => {
    const snap = localStorage.getItem('vyapar_daily_snapshot');
    const snapDate = localStorage.getItem('vyapar_daily_snapshot_date');
    if (!snap) {
      alert('No daily auto-backup snapshot found on this device yet.');
      return;
    }
    const dateFormatted = snapDate ? new Date(snapDate).toLocaleString() : 'today';
    if (window.confirm(`Restore emergency daily snapshot from ${dateFormatted}? Existing records will be updated.`)) {
      setLoading(true);
      try {
        const stats = await restoreFromBackup(snap);
        setBackupStatus(`Restored from auto-snapshot: ${stats.parties} parties, ${stats.transactions} bills, ${stats.items} items!`);
        setTimeout(() => setBackupStatus(null), 5000);
      } catch (err: any) {
        alert(`Restore failed: ${err.message}`);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!window.confirm('Restoring will replace current business data with the backup file. Do you wish to continue?')) {
      return;
    }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = ev.target?.result as string;
        const res = await restoreFromBackup(text);
        alert(`Data successfully restored!\n• ${res.parties} Parties\n• ${res.transactions} Transactions\n• ${res.items} Items\n• ${res.firms} Firms\n• ${res.bankAccounts} Bank Accounts`);
        window.location.reload();
      } catch (err: any) {
        alert(`Restore failed: ${err?.message}`);
      }
    };
    reader.readAsText(file);
  };

  const handleCopyFirmId = () => {
    const fid = profile?.firmId || 'FIRM_MAIN';
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(fid);
      setCopiedFirmId(true);
      setTimeout(() => setCopiedFirmId(false), 2000);
    }
  };

  const handleConnectCloud = async () => {
    if (!cloudAccountEmail || !cloudAccountEmail.includes('@')) {
      alert('Please enter a valid Google account email (e.g. abc.traders@gmail.com).');
      return;
    }

    const targetClientId = (googleClientId || profile?.firmCloudAccount?.googleClientId || DEFAULT_GOOGLE_CLIENT_ID || '').trim();
    const validation = validateGoogleClientId(targetClientId);
    if (!validation.valid) {
      setShowAdvancedCloud(true);
      alert(validation.error);
      return;
    }

    setIsConnectingCloud(true);
    setCloudStatusMsg(null);
    try {
      const res = await connectGoogleDriveAccount(cloudAccountEmail, targetClientId);
      const firmId = profile?.firmId || `FIRM_${Date.now().toString(36).toUpperCase()}`;
      const curDevId = getOrCreateDeviceId();
      const updatedAccount: FirmCloudAccount = {
        firmId,
        cloudProvider: 'GOOGLE_DRIVE',
        cloudAccountEmail: res.email,
        cloudConnectionStatus: 'CONNECTED',
        cloudConnectedAt: new Date().toISOString(),
        cloudLastSyncAt: new Date().toISOString(),
        cloudSyncCursor: Date.now(),
        cloudSyncVersion: 1,
        cloudDeviceId: curDevId,
        cloudOwnerDeviceId: curDevId,
        // Security Requirement 15: Do not store Google access token in localStorage, IndexedDB, or Dexie DB
        accessToken: undefined,
        tokenExpiry: Date.now() + res.expiresIn * 1000,
        activeDevices: profile?.firmCloudAccount?.activeDevices?.length ? profile.firmCloudAccount.activeDevices : [
          {
            deviceId: curDevId,
            deviceName: 'Owner Primary Terminal',
            role: 'Owner',
            lastSyncAt: new Date().toISOString(),
            isActive: true,
          }
        ],
        autoSyncEnabled: true,
        googleClientId: targetClientId,
      };

      await onSaveProfile({
        firmId,
        firmCloudAccount: updatedAccount,
      });

      // Trigger initial sync
      if (profile) {
        await syncFirmCloudVault({ ...profile, firmId, firmCloudAccount: updatedAccount }, onSaveProfile);
      }

      setCloudStatusMsg(`✓ Connected Google Cloud Account: ${res.email}`);
      setTimeout(() => setCloudStatusMsg(null), 4000);
    } catch (err: any) {
      console.error('Google Cloud connection error:', err);
      alert(`Google Cloud connection failed: ${err.message || 'Authorization rejected'}`);
      if (profile?.firmCloudAccount) {
        await onSaveProfile({
          firmCloudAccount: {
            ...profile.firmCloudAccount,
            cloudConnectionStatus: 'ERROR',
            errorMessage: err.message || 'Authorization failed',
          },
        });
      }
    } finally {
      setIsConnectingCloud(false);
    }
  };

  const handleEnableFirmCloud = async () => {
    if (!profile) return;
    setIsConnectingCloud(true);
    setCloudStatusMsg(null);
    try {
      const firmId = profile.firmId || `FIRM_${Date.now().toString(36).toUpperCase()}`;
      const parties = await db.parties.toArray();
      const transactions = await db.transactions.toArray();
      const items = await db.items.toArray();
      const bankAccounts = await db.bankAccounts.toArray();
      const firms = await db.firms.toArray();
      const coWorkers = await db.coWorkers.toArray();
      const localVault = { parties, transactions, items, bankAccounts, firms, coWorkers };

      const res = await initFirmOnCloud(
        firmId,
        businessName || profile.businessName || 'My Business',
        profile.securityPin || '1234',
        localVault
      );
      const curDevId = getOrCreateDeviceId();
      const updatedAccount: FirmCloudAccount = {
        firmId,
        cloudProvider: 'GOOGLE_DRIVE',
        cloudAccountEmail: cloudAccountEmail.trim() || `${firmId.toLowerCase()}@vyapaar-cloud.internal`,
        cloudConnectionStatus: 'CONNECTED',
        cloudConnectedAt: new Date().toISOString(),
        cloudLastSyncAt: new Date().toISOString(),
        cloudSyncCursor: Date.now(),
        cloudSyncVersion: res.syncVersion || 1,
        cloudDeviceId: curDevId,
        cloudOwnerDeviceId: curDevId,
        activeDevices: res.vault?.activeDevices || [
          {
            deviceId: curDevId,
            deviceName: 'Primary Terminal',
            role: 'Owner',
            lastSyncAt: new Date().toISOString(),
            isActive: true,
          }
        ],
        autoSyncEnabled: true,
      };

      await onSaveProfile({
        firmId,
        firmCloudAccount: updatedAccount,
      });

      if (profile) {
        await syncFirmCloudVault({ ...profile, firmId, firmCloudAccount: updatedAccount }, onSaveProfile);
      }
      setCloudStatusMsg('✓ Firm Cloud Sync is live! Accessible from iPhone and any web browser.');
      setTimeout(() => setCloudStatusMsg(null), 4500);
    } catch (err: any) {
      console.error('Enable cloud error:', err);
      alert(`Cloud activation error: ${err.message || err}`);
    } finally {
      setIsConnectingCloud(false);
    }
  };

  const handleJoinExistingFirm = async () => {
    if (!joinFirmId.trim()) {
      alert('Please enter a Firm ID (e.g. FIRM_ABC123).');
      return;
    }
    if (!joinPin.trim()) {
      alert('Please enter the 4-digit Master or Staff PIN.');
      return;
    }
    setIsJoiningFirm(true);
    setCloudStatusMsg(null);
    try {
      const cleanFirmId = joinFirmId.trim().toUpperCase();
      const res = await authenticateFirmOnCloud(cleanFirmId, joinPin.trim());
      
      let vault = res.vault;
      if (!vault) {
        vault = await downloadCloudVault(cleanFirmId);
      }
      if (!vault) {
        throw new Error(`Firm ${cleanFirmId} was authenticated, but cloud vault could not be downloaded.`);
      }

      setCloudStatusMsg(`✓ Authenticated with ${res.firmName || cleanFirmId}! Hydrating business data...`);

      const userSession = {
        type: res.role === 'Owner' ? 'OWNER' : 'COWORKER',
        id: res.workerId,
        name: res.workerName || (res.role === 'Owner' ? `${res.firmName || cleanFirmId} (Admin)` : 'Staff'),
        role: res.role || 'Owner',
      };

      // Complete hydration: clear demo records, populate with downloaded vault, recompute balances, and reload
      await hydrateDexieWithCloudVault(vault, { clearExisting: true, forceReload: true, userSession });
    } catch (err: any) {
      console.error('Join firm error:', err);
      alert(`Failed to join firm: ${err.message || err}`);
    } finally {
      setIsJoiningFirm(false);
    }
  };

  const handleCopyWebUrl = () => {
    const publicUrl = getCloudServerUrl();
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(publicUrl);
      setCopiedWebUrl(true);
      setTimeout(() => setCopiedWebUrl(false), 2500);
    }
  };

  const handleTestCloudConnection = async (targetUrlToTest?: string) => {
    setIsTestingCloud(true);
    setCloudStatusMsg(null);
    try {
      const urlToTest = targetUrlToTest || getCloudServerUrl();
      const res = await checkCloudHealth(urlToTest);
      if (res.online) {
        setCloudStatusMsg(`✅ Cloud Server is reachable & online (${res.service || 'Active'})!`);
      } else {
        setCloudStatusMsg(`⚠️ Server could not be reached at ${res.publicUrl}. Check connection or pick a preset below.`);
        setShowEditServerUrl(true);
      }
      setTimeout(() => setCloudStatusMsg(null), 7000);
    } catch (err: any) {
      setCloudStatusMsg(`⚠️ Server connection error: ${err.message}`);
      setShowEditServerUrl(true);
      setTimeout(() => setCloudStatusMsg(null), 7000);
    } finally {
      setIsTestingCloud(false);
    }
  };

  const handleApplyServerUrl = async (newUrl: string) => {
    setCustomCloudServerUrl(newUrl);
    const active = getCloudServerUrl();
    setCloudServerUrlInput(active);
    await handleTestCloudConnection(active);
  };

  const handleDisconnectCloud = async () => {
    if (window.confirm('Disconnect firm from Google Cloud Sync? Local business data on this device will remain safe.')) {
      await disconnectGoogleCloud();
      if (profile?.firmCloudAccount) {
        await onSaveProfile({
          firmCloudAccount: {
            ...profile.firmCloudAccount,
            cloudConnectionStatus: 'DISCONNECTED',
            accessToken: undefined,
          },
        });
        setCloudStatusMsg('Cloud account disconnected.');
        setTimeout(() => setCloudStatusMsg(null), 3000);
      }
    }
  };

  const handleSyncNow = async () => {
    if (!profile) return;
    setIsSyncingCloud(true);
    setCloudStatusMsg(null);
    try {
      const res = await syncFirmCloudVault(profile, onSaveProfile);
      if (res.status === 'CONNECTED') {
        setCloudStatusMsg('✓ Cloud Synchronization complete! All records up to date.');
      } else if (res.status === 'OFFLINE') {
        setCloudStatusMsg('Device is currently offline. Changes are saved and queued for sync.');
      } else {
        setCloudStatusMsg(res.errorMessage || 'Sync completed with warnings.');
      }
      setTimeout(() => setCloudStatusMsg(null), 4000);
    } catch (err: any) {
      alert(`Sync error: ${err.message}`);
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const handleUpdatePinOnly = async () => {
    setPinError(null);
    setPinSuccessMsg(null);

    const cleanPin = (securityPin || '').trim();
    if (!/^\d{4}$/.test(cleanPin)) {
      setPinError('Master PIN must be exactly 4 digits (0-9)');
      return;
    }
    if (confirmPin && cleanPin !== confirmPin.trim()) {
      setPinError('PIN and Confirmation PIN do not match');
      return;
    }

    setIsSavingPin(true);
    try {
      await onSaveProfile({
        securityPin: cleanPin,
        isPinLockEnabled,
      });
      setPinSuccessMsg(`✓ Master PIN updated to "${cleanPin}"! Saved successfully.`);
      setTimeout(() => setPinSuccessMsg(null), 4000);
    } catch (err: any) {
      setPinError(`Failed to save PIN: ${err?.message || err}`);
    } finally {
      setIsSavingPin(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);

    const pinToSave = (securityPin || '').trim() || profile?.securityPin || '1234';
    if (!/^\d{4}$/.test(pinToSave)) {
      setActiveTab('security');
      setPinError('Master PIN must be exactly 4 digits');
      return;
    }
    if (confirmPin && pinToSave !== confirmPin.trim()) {
      setActiveTab('security');
      setPinError('PIN and Confirmation PIN do not match');
      return;
    }

    setLoading(true);
    try {
      await onSaveProfile({
        businessName,
        tagline,
        ownerName,
        phone,
        email,
        address,
        state,
        logoUrl,
        invoiceTitle,
        termsAndConditions,
        invoiceFooterNote,
        showBankDetailsOnInvoice,
        showQrOnInvoice,
        signatureText,
        gstin,
        upiId,
        defaultGstRate,
        isPinLockEnabled,
        securityPin: pinToSave,
        isDailyAutoBackupEnabled,
        backupEmail,
        autoDownloadOnDailyBackup,
        firmId: profile?.firmId,
        firmCloudAccount: profile?.firmCloudAccount ? {
          ...profile.firmCloudAccount,
          cloudAccountEmail: cloudAccountEmail.trim(),
          googleClientId: googleClientId.trim() || undefined,
        } : undefined,
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="p-1 sm:p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors cursor-pointer flex items-center gap-1 text-xs font-bold shrink-0 border border-slate-700 shadow-2xs mr-0.5"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4 text-emerald-400" />
              <span>Back</span>
            </button>
            <div>
              <h3 className="font-bold text-base sm:text-lg">Business Settings & Configurations</h3>
              <p className="text-xs text-slate-400">Customizations, invoice print styling, tax & security</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-4 gap-2 overflow-x-auto scrollbar-none">
          {[
            { id: 'profile', label: 'Company Profile', icon: Building2 },
            { id: 'invoice', label: 'Invoice & Print', icon: FileText },
            { id: 'tax', label: 'GST & UPI', icon: Percent },
            { id: 'security', label: 'PIN Security', icon: Lock },
            { id: 'backup', label: 'Cloud & Backup', icon: Cloud },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as SettingsTab)}
                className={`py-3 px-3.5 text-xs font-bold whitespace-nowrap border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
                  isActive
                    ? 'border-blue-600 text-blue-600 bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* TAB 1: COMPANY PROFILE */}
          {activeTab === 'profile' && (
            <div className="space-y-4">
              {/* Logo Picker */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-white border border-slate-300 flex items-center justify-center overflow-hidden shadow-2xs">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-slate-300" />
                  )}
                </div>
                <div className="flex-1">
                  <span className="block text-xs font-bold text-slate-800">Business Logo</span>
                  <span className="text-[11px] text-slate-400 block mb-2">Printed on PDF statements & bills</span>
                  <div className="flex items-center gap-2">
                    <label className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-lg border border-blue-200 cursor-pointer transition-colors">
                      Upload Logo
                      <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                    </label>
                    {logoUrl && (
                      <button
                        type="button"
                        onClick={() => setLogoUrl(undefined)}
                        className="px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Business / Firm Legal Name</label>
                <input
                  type="text"
                  required
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Apex Traders & Distributors"
                  className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tagline / Business Description</label>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="e.g. Wholesale & Retail General Merchant"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Owner / Signatory Name</label>
                  <input
                    type="text"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Contact Phone Number</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">State / Place of Supply</label>
                  <input
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="e.g. Delhi (07)"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Complete Business Address</label>
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          )}

          {/* TAB 2: INVOICE & PRINT THEMES */}
          {activeTab === 'invoice' && (
            <div className="space-y-4">
              {/* Thermal Printer Settings Action Card */}
              {onOpenPrinterSettings && (
                <div className="p-4 bg-gradient-to-r from-indigo-50 via-slate-50 to-blue-50 border border-indigo-200 rounded-2xl flex items-center justify-between shadow-2xs">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-xs">
                      <Printer className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-800">Thermal Printer Device Setup</h4>
                      <p className="text-[11px] text-slate-500">Configure Bluetooth (MPT-II), USB & WiFi POS roll printers</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenPrinterSettings}
                    className="px-3 py-1.5 bg-[#E11D48] hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-xs whitespace-nowrap"
                  >
                    Set Default Device
                  </button>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Invoice Header Title</label>
                <input
                  type="text"
                  value={invoiceTitle}
                  onChange={(e) => setInvoiceTitle(e.target.value)}
                  placeholder="TAX INVOICE / BILL OF SUPPLY"
                  className="w-full px-3 py-2 text-sm font-bold uppercase border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Landmark className="w-4 h-4 text-indigo-600" />
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">Bank Details on Bill</span>
                      <span className="text-[10px] text-slate-400">Print IFSC & A/C # on invoices</span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={showBankDetailsOnInvoice}
                    onChange={(e) => setShowBankDetailsOnInvoice(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-emerald-600" />
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">UPI QR on Bill</span>
                      <span className="text-[10px] text-slate-400">Print scan-to-pay QR on invoices</span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={showQrOnInvoice}
                    onChange={(e) => setShowQrOnInvoice(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Terms & Conditions</label>
                <textarea
                  rows={3}
                  value={termsAndConditions}
                  onChange={(e) => setTermsAndConditions(e.target.value)}
                  placeholder="Terms printed at bottom of customer invoices..."
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Invoice Footer Greeting</label>
                  <input
                    type="text"
                    value={invoiceFooterNote}
                    onChange={(e) => setInvoiceFooterNote(e.target.value)}
                    placeholder="Thank you for your business!"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Signature Line Label</label>
                  <input
                    type="text"
                    value={signatureText}
                    onChange={(e) => setSignatureText(e.target.value)}
                    placeholder="Authorized Signatory"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: GST & TAX */}
          {activeTab === 'tax' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">GSTIN Number</label>
                  <input
                    type="text"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value)}
                    placeholder="07AAAAA0000A1Z5"
                    className="w-full px-3 py-2 text-sm font-mono uppercase border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Default GST Rate (%)</label>
                  <select
                    value={defaultGstRate}
                    onChange={(e) => setDefaultGstRate(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  >
                    <option value={0}>0% (Exempted)</option>
                    <option value={5}>5% GST</option>
                    <option value={12}>12% GST</option>
                    <option value={18}>18% GST (Standard)</option>
                    <option value={28}>28% GST</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">UPI ID for Direct Customer Payments</label>
                <input
                  type="text"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="yourname@upi / 9876543210@paytm"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Used in 1-Click WhatsApp payment reminders and invoice QR codes.
                </span>
              </div>
            </div>
          )}

          {/* TAB 4: SECURITY & PIN LOCK */}
          {activeTab === 'security' && (
            <div className="space-y-4 animate-in fade-in">
              {/* Card 1: Master Security PIN Setup */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shadow-xs shrink-0">
                      <KeyRound className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-800">Master Owner Security PIN</h4>
                        {(profile?.securityPin || '1234') === '1234' ? (
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded-full border border-amber-200">
                            Default: 1234
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200">
                            Custom PIN Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Authorizes manager actions, exits Showroom Kiosk mode, and unlocks the app
                      </p>
                    </div>
                  </div>
                </div>

                {/* Current Saved PIN banner */}
                <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-semibold text-slate-600">Active Saved PIN:</span>
                    <span className="font-mono text-base font-black tracking-widest text-slate-900 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
                      {showPin ? (profile?.securityPin || '1234') : '••••'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 px-2.5 py-1 rounded-lg hover:bg-blue-50 transition-colors cursor-pointer"
                  >
                    {showPin ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Hide PIN</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        <span>Reveal PIN</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Change PIN Form Inputs */}
                <div className="pt-3 border-t border-slate-200/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 block">Change Master PIN</span>
                    <span className="text-[11px] text-slate-400">Default PIN is 1234</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">New 4-Digit PIN</label>
                      <input
                        type={showPin ? 'text' : 'password'}
                        inputMode="numeric"
                        maxLength={4}
                        value={securityPin}
                        onChange={(e) => {
                          setSecurityPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                          setPinError(null);
                          setPinSuccessMsg(null);
                        }}
                        placeholder="e.g. 1234"
                        className="w-full px-3 py-2 text-center text-lg font-mono tracking-widest font-black border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none bg-white shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Confirm New PIN</label>
                      <input
                        type={showPin ? 'text' : 'password'}
                        inputMode="numeric"
                        maxLength={4}
                        value={confirmPin}
                        onChange={(e) => {
                          setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                          setPinError(null);
                          setPinSuccessMsg(null);
                        }}
                        placeholder="e.g. 1234"
                        className="w-full px-3 py-2 text-center text-lg font-mono tracking-widest font-black border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none bg-white shadow-2xs"
                      />
                    </div>
                  </div>

                  {pinError && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-700 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                      <span>{pinError}</span>
                    </div>
                  )}

                  {pinSuccessMsg && (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-700 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>{pinSuccessMsg}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSecurityPin('1234');
                        setConfirmPin('1234');
                        setPinError(null);
                      }}
                      className="text-xs text-slate-500 hover:text-slate-700 underline cursor-pointer"
                    >
                      Reset input to 1234
                    </button>
                    <button
                      type="button"
                      disabled={isSavingPin || securityPin.length !== 4}
                      onClick={handleUpdatePinOnly}
                      className="px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Check className="w-4 h-4" />
                      <span>{isSavingPin ? 'Saving...' : 'Update PIN Now'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Card 2: App Screen Lock Toggle */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shadow-2xs">
                      <Lock className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">App Startup Screen Lock</h4>
                      <p className="text-xs text-slate-500">Require Master PIN every time the app opens or unlocks</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isPinLockEnabled}
                      onChange={(e) => {
                        setIsPinLockEnabled(e.target.checked);
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>

              {/* Card 3: Security & Access Scope */}
              <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-200/70 text-xs text-slate-600 space-y-1.5">
                <span className="font-bold text-blue-900 block flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  Where Your Master PIN Is Used:
                </span>
                <ul className="list-disc pl-4 space-y-1 text-slate-600">
                  <li><b>Customer Showroom Kiosk:</b> Entering this PIN exits self-service kiosk mode back to accounting dashboard.</li>
                  <li><b>Owner Role Verification:</b> Used when switching back to Master Admin from salesman/biller roles.</li>
                  <li><b>App Startup Lock:</b> Required when App Screen Lock toggle is turned ON.</li>
                </ul>
              </div>
            </div>
          )}

          {/* TAB 5: VYAPAR CLOUD & DATA BACKUP */}
          {activeTab === 'backup' && (
            <div className="space-y-4">
              {/* Header Banner */}
              <div className="p-4 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-2xl space-y-1.5 shadow-sm">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Cloud className="w-5 h-5 text-blue-400" />
                    <h4 className="text-sm font-black tracking-wide uppercase">VYAPAR CLOUD & DATA BACKUP</h4>
                  </div>
                  {profile?.firmId && (
                    <div 
                      onClick={handleCopyFirmId}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded-xl text-[11px] font-mono text-blue-200 cursor-pointer transition-colors"
                      title="Click to copy Firm Cloud ID"
                    >
                      <span>Firm ID: {profile.firmId}</span>
                      {copiedFirmId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-300" />}
                    </div>
                  )}
                </div>
                <p className="text-xs text-blue-200/90 leading-relaxed">
                  Your business data is stored securely on this device and synchronized with your firm's cloud account when enabled.
                </p>
              </div>

              {/* Multi-Device Web App Public Link */}
              <div className="p-3.5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 rounded-2xl flex flex-col gap-3">
                <div className="flex items-center justify-between flex-wrap gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-slate-800 block">iPhone Safari & Web Access URL</span>
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                          {getCloudServerUrl().startsWith('https://') ? 'Live HTTPS' : 'Local Wi-Fi'}
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowEditServerUrl(!showEditServerUrl)}
                          className="text-[10px] font-bold text-blue-600 hover:text-blue-800 underline cursor-pointer ml-1"
                        >
                          {showEditServerUrl ? 'Hide Settings' : 'Change Server / Presets'}
                        </button>
                      </div>
                      <span className="text-[11px] font-mono text-blue-700 select-all block truncate max-w-[240px] sm:max-w-xs md:max-w-md font-bold">
                        {getCloudServerUrl()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleTestCloudConnection()}
                      disabled={isTestingCloud}
                      className="px-2.5 py-1.5 bg-white border border-blue-200 hover:bg-blue-50 text-blue-700 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer shrink-0"
                      title="Check cloud server status"
                    >
                      <Activity className={`w-3.5 h-3.5 ${isTestingCloud ? 'animate-spin text-blue-600' : 'text-blue-500'}`} />
                      <span>{isTestingCloud ? 'Checking...' : 'Check Server'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyWebUrl}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      {copiedWebUrl ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedWebUrl ? 'Link Copied!' : 'Copy Web Link'}</span>
                    </button>
                  </div>
                </div>

                {/* Expandable Server URL Editor & 1-Click Presets */}
                {showEditServerUrl && (
                  <div className="pt-2 border-t border-blue-200/60 flex flex-col gap-2.5 animate-in fade-in">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={cloudServerUrlInput}
                          onChange={(e) => setCloudServerUrlInput(e.target.value)}
                          placeholder={`https://... or ${DEFAULT_LOCAL_WIFI_URL}`}
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleApplyServerUrl(cloudServerUrlInput)}
                          disabled={isTestingCloud}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Apply & Test</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApplyServerUrl(DEFAULT_PUBLIC_CLOUD_URL)}
                          disabled={isTestingCloud}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                          title="Reset to live Cloudflare tunnel"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                          <span className="hidden sm:inline">Reset</span>
                        </button>
                      </div>
                    </div>

                    {/* Quick Presets Strip */}
                    <div className="flex items-center gap-2 flex-wrap text-[11px]">
                      <span className="font-bold text-slate-500">Quick Presets:</span>
                      <button
                        type="button"
                        onClick={() => handleApplyServerUrl(DEFAULT_PUBLIC_CLOUD_URL)}
                        className={`px-2.5 py-1 rounded-lg font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                          getCloudServerUrl() === DEFAULT_PUBLIC_CLOUD_URL
                            ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <Globe className="w-3 h-3 text-blue-500" />
                        <span>24/7 Cloud Server (Render)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleApplyServerUrl(DEFAULT_LOCAL_WIFI_URL)}
                        className={`px-2.5 py-1 rounded-lg font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                          getCloudServerUrl() === DEFAULT_LOCAL_WIFI_URL
                            ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <Wifi className="w-3 h-3 text-indigo-500" />
                        <span>Local Wi-Fi ({DEFAULT_LOCAL_WIFI_URL.replace(/^https?:\/\//, '')})</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Status messages */}
              {cloudStatusMsg && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs font-bold text-blue-800 flex items-center gap-2 animate-in fade-in">
                  <Cloud className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>{cloudStatusMsg}</span>
                </div>
              )}

              {backupStatus && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{backupStatus}</span>
                </div>
              )}

              {emailStatus && (
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs font-bold text-indigo-800 flex items-center gap-2">
                  <Send className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>{emailStatus}</span>
                </div>
              )}

              {/* PROMINENT JOIN EXISTING FIRM CARD FOR IPHONE & SECONDARY DEVICES */}
              <div className="p-4 bg-gradient-to-br from-indigo-50 via-blue-50 to-indigo-50 border-2 border-indigo-200 rounded-2xl space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-xs">
                      <LogIn className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-800">Join Existing Shop Firm</h4>
                      <p className="text-[11px] text-slate-500">Connect this iPhone to your Android tablet firm to download real data</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowJoinFirmForm(!showJoinFirmForm)}
                    className="px-3 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs transition-all cursor-pointer"
                  >
                    {showJoinFirmForm ? 'Hide Form' : 'Enter Firm ID'}
                  </button>
                </div>

                {showJoinFirmForm && (
                  <div className="pt-2 border-t border-indigo-100 space-y-2.5 animate-in fade-in">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1 uppercase tracking-wide">Firm ID</label>
                        <input
                          type="text"
                          placeholder="e.g. FIRM_MUI8HFY6_47UPAJ"
                          value={joinFirmId}
                          onChange={(e) => setJoinFirmId(e.target.value.toUpperCase())}
                          className="w-full px-3 py-2 text-xs font-mono font-bold bg-white border border-indigo-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1 uppercase tracking-wide">PIN</label>
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={4}
                          placeholder="e.g. 1234"
                          value={joinPin}
                          onChange={(e) => setJoinPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                          className="w-full px-3 py-2 text-xs font-mono font-bold text-center bg-white border border-indigo-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleJoinExistingFirm}
                      disabled={isJoiningFirm || !joinFirmId.trim() || !joinPin.trim()}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <LogIn className="w-4 h-4" />
                      <span>{isJoiningFirm ? 'Connecting to Cloud & Downloading Data...' : 'Join Firm & Download Data'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* 1. FIRM CLOUD SYNC CARD */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                      <Cloud className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-bold text-slate-800">FIRM CLOUD SYNC</h4>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wide uppercase ${
                          profile?.firmCloudAccount?.cloudConnectionStatus === 'CONNECTED'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : profile?.firmCloudAccount?.cloudConnectionStatus === 'SYNCING'
                            ? 'bg-blue-100 text-blue-800 border border-blue-200 animate-pulse'
                            : profile?.firmCloudAccount?.cloudConnectionStatus === 'PENDING'
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : profile?.firmCloudAccount?.cloudConnectionStatus === 'OFFLINE'
                            ? 'bg-slate-200 text-slate-700 border border-slate-300'
                            : 'bg-slate-200 text-slate-600 border border-slate-300'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            profile?.firmCloudAccount?.cloudConnectionStatus === 'CONNECTED'
                              ? 'bg-emerald-500'
                              : profile?.firmCloudAccount?.cloudConnectionStatus === 'SYNCING'
                              ? 'bg-blue-500'
                              : profile?.firmCloudAccount?.cloudConnectionStatus === 'PENDING'
                              ? 'bg-amber-500'
                              : 'bg-slate-400'
                          }`} />
                          <span>
                            {profile?.firmCloudAccount?.cloudConnectionStatus === 'CONNECTED'
                              ? '● Connected'
                              : profile?.firmCloudAccount?.cloudConnectionStatus === 'SYNCING'
                              ? '◐ Syncing'
                              : profile?.firmCloudAccount?.cloudConnectionStatus === 'PENDING'
                              ? '⚠ Pending Sync'
                              : profile?.firmCloudAccount?.cloudConnectionStatus === 'OFFLINE'
                              ? 'Offline'
                              : 'Disconnected'}
                          </span>
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">Google-authorized secure firm vault with multi-device live sync</p>
                    </div>
                  </div>

                  {/* Sync Now button */}
                  {profile?.firmCloudAccount?.cloudConnectionStatus === 'CONNECTED' && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSyncNow}
                        disabled={isSyncingCloud}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-95"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCloud ? 'animate-spin' : ''}`} />
                        <span>{isSyncingCloud ? 'Syncing...' : 'Sync Now'}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Cloud Details Body */}
                <div className="pt-2 border-t border-slate-200/80 space-y-3">
                  {profile?.firmCloudAccount?.cloudConnectionStatus === 'CONNECTED' ? (
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                          <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">Cloud Account</span>
                          <span className="font-bold text-slate-800 truncate block mt-0.5" title={profile.firmCloudAccount.cloudAccountEmail}>
                            {profile.firmCloudAccount.cloudAccountEmail || 'Connected'}
                          </span>
                        </div>

                        <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                          <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">Last Sync</span>
                          <span className="font-bold text-slate-800 block mt-0.5">
                            {profile.firmCloudAccount.cloudLastSyncAt
                              ? new Date(profile.firmCloudAccount.cloudLastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                              : 'Just now'}
                          </span>
                        </div>

                        <div 
                          onClick={() => setShowDevicesModal(!showDevicesModal)}
                          className="bg-white p-2.5 rounded-xl border border-slate-200 hover:border-blue-300 transition-colors cursor-pointer"
                          title="Click to view connected devices"
                        >
                          <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 flex items-center justify-between">
                            <span>Devices</span>
                            <span className="text-blue-600 text-[10px] font-bold">View</span>
                          </span>
                          <span className="font-bold text-blue-700 block mt-0.5">
                            {profile.firmCloudAccount.activeDevices?.length || 1} Active
                          </span>
                        </div>
                      </div>

                      {/* Active devices drawer */}
                      {showDevicesModal && (
                        <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2 animate-in fade-in">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                            <span>Active Firm Terminals & Devices</span>
                            <span className="text-[11px] text-slate-400 font-normal">Remote 4G/5G + Local Terminals</span>
                          </div>
                          <div className="divide-y divide-slate-100 max-h-40 overflow-y-auto">
                            {(profile.firmCloudAccount.activeDevices || []).map((dev, idx) => (
                              <div key={idx} className="py-1.5 flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                  {dev.deviceName.toLowerCase().includes('android') || dev.deviceName.toLowerCase().includes('phone') ? (
                                    <Smartphone className="w-3.5 h-3.5 text-blue-600" />
                                  ) : (
                                    <Laptop className="w-3.5 h-3.5 text-slate-600" />
                                  )}
                                  <div>
                                    <span className="font-bold text-slate-800 block leading-tight">{dev.deviceName}</span>
                                    <span className="text-[10px] text-slate-400">{dev.role} • {dev.ipOrNetwork || 'Active'}</span>
                                  </div>
                                </div>
                                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                                  Online
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
                        <span className="text-[11px] text-slate-400">
                          Continuous multi-device cloud sync is active.
                        </span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setShowJoinFirmForm(!showJoinFirmForm)}
                            className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                          >
                            {showJoinFirmForm ? 'Hide Switch Firm' : 'Switch / Join Another Firm'}
                          </button>
                          <button
                            type="button"
                            onClick={handleDisconnectCloud}
                            className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
                          >
                            Disconnect Cloud
                          </button>
                        </div>
                      </div>

                      {/* Join different firm modal drawer */}
                      {showJoinFirmForm && (
                        <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2.5 animate-in fade-in">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                              <LogIn className="w-3.5 h-3.5 text-blue-600" />
                              Join Another Existing Firm
                            </span>
                            <span className="text-[10px] text-blue-600">Replaces active firm on this device</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="text"
                              placeholder="Firm ID (e.g. FIRM_ABC123)"
                              value={joinFirmId}
                              onChange={(e) => setJoinFirmId(e.target.value.toUpperCase())}
                              className="px-3 py-1.5 text-xs font-mono font-bold border border-slate-300 rounded-lg outline-none bg-white"
                            />
                            <input
                              type="password"
                              inputMode="numeric"
                              maxLength={4}
                              placeholder="4-Digit Master PIN"
                              value={joinPin}
                              onChange={(e) => setJoinPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                              className="px-3 py-1.5 text-xs font-mono font-bold text-center border border-slate-300 rounded-lg outline-none bg-white"
                            />
                          </div>
                          <div className="flex justify-end pt-1">
                            <button
                              type="button"
                              onClick={handleJoinExistingFirm}
                              disabled={isJoiningFirm || !joinFirmId || !joinPin}
                              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <LogIn className="w-3.5 h-3.5" />
                              <span>{isJoiningFirm ? 'Connecting...' : 'Join & Download Data'}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Option A: One-Click Firm Cloud Enable */}
                      <div className="p-3.5 bg-white border border-blue-200 rounded-xl space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div>
                            <span className="text-xs font-bold text-slate-800 block">Real Multi-Device Cloud Sync</span>
                            <span className="text-[11px] text-slate-500">Enables instant real-time sync with iPhone Safari, desktop, and other tablets.</span>
                          </div>
                          <button
                            type="button"
                            onClick={handleEnableFirmCloud}
                            disabled={isConnectingCloud}
                            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <Cloud className="w-4 h-4" />
                            <span>{isConnectingCloud ? 'Enabling Cloud...' : 'Enable Firm Cloud Sync'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Option B: Join Existing Firm (For iPhone & Secondary Devices) */}
                      <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-2.5">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-xs font-bold text-slate-800 block">Join Existing Firm</span>
                            <span className="text-[11px] text-slate-500">Connect this device to a business created on another tablet or phone.</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowJoinFirmForm(!showJoinFirmForm)}
                            className="px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                          >
                            {showJoinFirmForm ? 'Hide Form' : 'Enter Firm ID'}
                          </button>
                        </div>

                        {showJoinFirmForm && (
                          <div className="pt-2 border-t border-slate-100 space-y-2 animate-in fade-in">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Firm ID</label>
                                <input
                                  type="text"
                                  placeholder="e.g. FIRM_DEFAULT"
                                  value={joinFirmId}
                                  onChange={(e) => setJoinFirmId(e.target.value.toUpperCase())}
                                  className="w-full px-3 py-1.5 text-xs font-mono font-bold border border-slate-300 rounded-lg outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Master or Staff PIN</label>
                                <input
                                  type="password"
                                  inputMode="numeric"
                                  maxLength={4}
                                  placeholder="e.g. 1234"
                                  value={joinPin}
                                  onChange={(e) => setJoinPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                  className="w-full px-3 py-1.5 text-xs font-mono font-bold text-center border border-slate-300 rounded-lg outline-none"
                                />
                              </div>
                            </div>
                            <div className="flex justify-end pt-1">
                              <button
                                type="button"
                                onClick={handleJoinExistingFirm}
                                disabled={isJoiningFirm || !joinFirmId || !joinPin}
                                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              >
                                <LogIn className="w-3.5 h-3.5" />
                                <span>{isJoiningFirm ? 'Connecting...' : 'Join Firm & Download Data'}</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Option C: Optional Google Drive Cloud Connection */}
                      <div className="pt-2 border-t border-slate-200/80 space-y-2">
                        <label className="block text-xs font-semibold text-slate-700">
                          Optional: Connect Dedicated Google Account for Drive Backup
                        </label>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <div className="relative flex-1">
                            <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                            <input
                              type="email"
                              placeholder="e.g. abc.traders@gmail.com"
                              value={cloudAccountEmail}
                              onChange={(e) => setCloudAccountEmail(e.target.value)}
                              className="w-full pl-9 pr-3 py-2 text-xs font-medium border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={handleConnectCloud}
                            disabled={isConnectingCloud}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50"
                          >
                            <Cloud className="w-4 h-4 text-blue-400" />
                            <span>{isConnectingCloud ? 'Connecting...' : 'Connect Google Cloud'}</span>
                          </button>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span>Uses Google Identity Services. Password is never requested or stored.</span>
                          <button
                            type="button"
                            onClick={() => setShowAdvancedCloud(!showAdvancedCloud)}
                            className="text-blue-600 hover:underline cursor-pointer"
                          >
                            {showAdvancedCloud ? 'Hide Advanced' : 'Custom Client ID'}
                          </button>
                        </div>

                        {showAdvancedCloud && (
                          <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1.5 animate-in fade-in">
                            <label className="block text-[11px] font-bold text-slate-700">Google Cloud OAuth Web Client ID</label>
                            <input
                              type="text"
                              placeholder="e.g. 123456789012-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com"
                              value={googleClientId}
                              onChange={(e) => setGoogleClientId(e.target.value)}
                              className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg outline-none"
                            />
                            <span className="text-[10px] text-slate-500 block">
                              {DEFAULT_GOOGLE_CLIENT_ID
                                ? 'Leave blank to use default built-in Vyapar authorization, or enter your Google Cloud Web Client ID.'
                                : 'Enter your Web Application Client ID from Google Cloud Console.'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. DAILY AUTO-BACKUP CARD */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">Daily Auto Backup</h4>
                      <p className="text-xs text-slate-500">Automatically creates a daily backup snapshot in background</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isDailyAutoBackupEnabled}
                      onChange={(e) => setIsDailyAutoBackupEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>

                {isDailyAutoBackupEnabled && (
                  <div className="pt-3 border-t border-slate-200/80 space-y-2.5">
                    <div className="flex items-center justify-between text-xs text-slate-600 flex-wrap gap-2">
                      <div className="flex items-center gap-1.5 font-medium">
                        <Calendar className="w-3.5 h-3.5 text-purple-600" />
                        <span>
                          Last Auto-Backup:{' '}
                          <b className="text-slate-800">
                            {profile?.lastAutoBackupDate
                              ? new Date(profile.lastAutoBackupDate).toLocaleString()
                              : 'Scheduled (Runs daily)'}
                          </b>
                        </span>
                      </div>

                      {hasDailySnapshot && (
                        <button
                          type="button"
                          onClick={handleRestoreDailySnapshot}
                          className="text-[11px] font-bold text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                        >
                          Restore Latest Snapshot
                        </button>
                      )}
                    </div>

                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={autoDownloadOnDailyBackup}
                        onChange={(e) => setAutoDownloadOnDailyBackup(e.target.checked)}
                        className="rounded text-purple-600 focus:ring-purple-500 w-3.5 h-3.5"
                      />
                      <span>Also download a copy of .json file to Downloads folder daily</span>
                    </label>
                  </div>
                )}
              </div>

              {/* 3. BACKUP TO EMAIL CARD (OPTIONAL EMERGENCY BACKUP) */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">Backup to Email (Optional)</h4>
                    <p className="text-xs text-slate-500">Optional emergency/manual backup sent as an attachment</p>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200/80 space-y-2">
                  <label className="block text-xs font-semibold text-slate-700">Backup Email Address</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="email"
                        placeholder="e.g. backup@example.com"
                        value={backupEmail}
                        onChange={(e) => setBackupEmail(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-xs font-medium border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSendBackupToMail}
                      disabled={isEmailSending}
                      className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{isEmailSending ? 'Sending...' : 'Send to Mail'}</span>
                    </button>
                  </div>
                  <span className="text-[11px] text-slate-400 block">
                    Prepares a manual backup snapshot file attached to Gmail / email client.
                  </span>
                </div>
              </div>

              {/* 3. MANUAL DOWNLOAD & RESTORE */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={handleExportBackup}
                  className="p-4 bg-white border border-slate-200 hover:border-blue-400 hover:shadow-xs rounded-2xl text-left transition-all cursor-pointer flex flex-col justify-between space-y-3"
                >
                  <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                    <Download className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-800 text-sm block">Download Full Backup</span>
                    <span className="text-[11px] text-slate-400">Saves all accounts, bills, stock & firms into a .json file</span>
                  </div>
                </button>

                <div className="p-4 bg-white border border-slate-200 hover:border-emerald-400 hover:shadow-xs rounded-2xl text-left transition-all flex flex-col justify-between space-y-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-800 text-sm block">Restore from Backup</span>
                    <span className="text-[11px] text-slate-400">Restore business records from a previous backup file</span>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleRestoreFile}
                    className="text-xs text-slate-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
                  />
                </div>
              </div>

              {/* Start Fresh / Create New Company */}
              <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-emerald-50/50 p-4 rounded-2xl border border-emerald-200">
                <div>
                  <span className="text-xs font-black text-emerald-950 block">Start Fresh / Create New Company</span>
                  <span className="text-[11px] text-emerald-800/80">Wipe all demo items, dummy parties, and test bills to launch your own clean company</span>
                </div>
                {onOpenNewCompany && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenNewCompany();
                    }}
                    className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-xl text-xs font-black shadow-xs transition-all cursor-pointer flex items-center gap-1.5 shrink-0 active:scale-95"
                  >
                    <Building2 className="w-3.5 h-3.5" /> Start New Company
                  </button>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-700 block">Factory Reset</span>
                  <span className="text-[11px] text-slate-400">Clear all records and reload default sample data</span>
                </div>
                <button
                  type="button"
                  onClick={onResetDemo}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold border border-rose-200 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Reset Data
                </button>
              </div>
            </div>
          )}

          {/* Footer Bar inside form */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <span className="text-xs text-slate-400">Changes apply instantly to invoices & reports</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save All Settings'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
