import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users2, 
  Plus, 
  QrCode, 
  Phone, 
  MessageCircle, 
  ShieldCheck, 
  Lock, 
  CheckCircle2, 
  Copy, 
  Edit3, 
  UserCheck, 
  Smartphone, 
  Search, 
  Check, 
  X, 
  Eye,
  Cloud,
  CheckCircle,
  ToggleLeft,
  ToggleRight,
  Shield,
  Sparkles
} from 'lucide-react';
import QRCode from 'qrcode';
import { CoWorker, UserRole, BusinessProfile } from '../../types';
import { CoWorkerModal } from './CoWorkerModal';
import { UserSession } from '../../utils/userSession';
import { generateWorkerCloudInvitation } from '../../utils/googleDriveSync';
import { getCloudServerUrl } from '../../utils/cloudSync';

interface CoWorkerSyncProps {
  coWorkers: CoWorker[];
  profile: BusinessProfile;
  activeSession: UserSession;
  onSelectUser: (session: UserSession) => void;
  onSaveCoWorker: (workerData: Partial<CoWorker>) => Promise<void>;
  onDeleteCoWorker: (id: number) => Promise<void>;
}

export const CoWorkerSync: React.FC<CoWorkerSyncProps> = ({
  coWorkers,
  profile,
  activeSession,
  onSelectUser,
  onSaveCoWorker,
  onDeleteCoWorker,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [workerToEdit, setWorkerToEdit] = useState<CoWorker | null>(null);
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Auto Cloud Sync State (Like Vyapar Auto-Sync ON/OFF)
  const [isAutoSyncEnabled, setIsAutoSyncEnabled] = useState<boolean>(() => {
    return localStorage.getItem('vyapar_auto_sync_enabled') !== 'false';
  });

  // QR Code Modal State
  const [qrModalWorker, setQrModalWorker] = useState<CoWorker | null>(null);
  const [isShopQrOpen, setIsShopQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleToggleAutoSync = () => {
    const newState = !isAutoSyncEnabled;
    setIsAutoSyncEnabled(newState);
    localStorage.setItem('vyapar_auto_sync_enabled', newState ? 'true' : 'false');
    showToast(newState ? '✓ Auto Cloud Sync Enabled (Live Sync Active)' : 'Auto Cloud Sync Paused');
  };

  const handleSwitchToOwner = () => {
    if (activeSession.role === 'Owner') return;
    const masterPin = profile?.securityPin || (profile as any)?.ownerPin || '1234';
    const entered = window.prompt('Enter Master Owner PIN:');
    if (entered === masterPin) {
      onSelectUser({ type: 'OWNER', name: `${profile?.businessName || 'Owner'} (Admin)`, role: 'Owner' });
    } else if (entered !== null) {
      alert('Incorrect Master PIN.');
    }
  };

  // Base app link for sharing - always resolves to public HTTPS cloud URL
  const appBaseUrl = useMemo(() => {
    return getCloudServerUrl();
  }, []);

  // Build clean staff access link with Firm Cloud Identity (no plaintext PIN in URL)
  const getStaffLink = (worker?: CoWorker) => {
    if (!worker) return appBaseUrl;
    if (profile?.firmId) {
      return generateWorkerCloudInvitation(profile, worker, appBaseUrl).inviteUrl;
    }
    return `${appBaseUrl}/?workerId=${worker.id}`;
  };

  // Generate QR Code when QR modal is opened
  useEffect(() => {
    if (qrModalWorker || isShopQrOpen) {
      const targetUrl = qrModalWorker ? getStaffLink(qrModalWorker) : appBaseUrl;
      QRCode.toDataURL(targetUrl, {
        margin: 1.5,
        width: 260,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('Failed to generate QR code:', err));
    }
  }, [qrModalWorker, isShopQrOpen, appBaseUrl]);

  const handleCopyLink = (urlToCopy: string) => {
    navigator.clipboard.writeText(urlToCopy);
    showToast('✓ Link copied to clipboard!');
  };

  // WhatsApp Invite (Dead-simple message like Vyapar)
  const handleShareWorkerWhatsApp = (worker: CoWorker) => {
    const cleanPhone = worker.phone.replace(/[^0-9]/g, '');
    const staffLink = getStaffLink(worker);
    const pinText = worker.pin ? `%0A🔑 *Your Login PIN:* ${worker.pin}` : '';

    let roleDescription = '';
    if (worker.role === 'Salesman') {
      roleDescription = '%0A💼 *Role:* Salesman (View product catalog, live stock, and create customer sales bills).';
    } else if (worker.role === 'Biller') {
      roleDescription = '%0A🧾 *Role:* Biller (POS counter billing and print receipts).';
    } else if (worker.role === 'Secondary Admin') {
      roleDescription = '%0A🛡️ *Role:* Secondary Admin (Manage sales, inventory, and store daybook).';
    } else {
      roleDescription = `%0A👥 *Role:* ${worker.role}`;
    }

    const text = `👋 Hello *${worker.name}*,%0A%0AYou have been added to *${profile.businessName}* on our Billing App.${roleDescription}%0A%0A📲 *Open App on your Phone:*%0A${staffLink}${pinText}%0A%0A(Open the link on your mobile phone to start billing)`;

    const targetUrl = cleanPhone.length >= 10 ? `https://wa.me/${cleanPhone}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(targetUrl, '_blank');
  };

  // General App Share WhatsApp
  const handleGeneralAppShareWhatsApp = () => {
    const text = `📲 *CONNECT TO ${profile.businessName.toUpperCase()} BILLING APP*%0A%0AOpen our store app to create bills, browse products, and sync orders:%0A${appBaseUrl}`;
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  // Filtered workers
  const filteredWorkers = useMemo(() => {
    return coWorkers.filter((w) => {
      if (selectedRoleFilter !== 'ALL' && w.role !== selectedRoleFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          w.name.toLowerCase().includes(q) ||
          w.phone.includes(q) ||
          (w.email && w.email.toLowerCase().includes(q)) ||
          w.role.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [coWorkers, selectedRoleFilter, searchQuery]);

  // Counts by role
  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {
      'Secondary Admin': 0,
      'Salesman': 0,
      'Biller': 0,
      'Other': 0,
    };
    coWorkers.forEach((w) => {
      if (counts[w.role] !== undefined) counts[w.role]++;
      else counts['Other']++;
    });
    return counts;
  }, [coWorkers]);

  return (
    <div className="space-y-5 pb-16 md:pb-6 relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. TOP HERO: SIMPLE VYAPAR-STYLE AUTO SYNC & SHARE BANNER */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-5 md:p-6 rounded-2xl text-white shadow-md border border-indigo-900/50 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="p-2 bg-blue-600 rounded-xl shadow-xs">
              <Users2 className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-xl md:text-2xl font-black tracking-tight">Staff Management & Cloud Sync</h2>
            
            {/* Auto Sync Toggle Status Button */}
            <button
              type="button"
              onClick={handleToggleAutoSync}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black transition-all cursor-pointer border ${
                isAutoSyncEnabled
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                  : 'bg-slate-700 text-slate-300 border-slate-600 hover:bg-slate-600'
              }`}
              title="Click to toggle automatic background cloud synchronization"
            >
              <span className={`w-2 h-2 rounded-full ${isAutoSyncEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`} />
              <span>{isAutoSyncEnabled ? 'Auto Sync: ON' : 'Auto Sync: PAUSED'}</span>
            </button>

            {profile?.firmId && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/10 text-blue-200 border border-white/15">
                Firm: {profile.firmId}
              </span>
            )}
            {profile?.firmCloudAccount?.cloudAccountEmail && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <Cloud className="w-3 h-3 text-emerald-400" />
                <span>{profile.firmCloudAccount.cloudAccountEmail}</span>
              </span>
            )}
          </div>

          <p className="text-xs text-indigo-200/80 max-w-2xl leading-relaxed">
            Invite your salesmen, billers, and managers. All transactions, live stock, and customer ledgers sync automatically in the background. Staff can open the app on their phone anywhere (4G/5G or Wi-Fi).
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          <button
            type="button"
            onClick={() => setIsShopQrOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
          >
            <QrCode className="w-4 h-4 text-emerald-400" />
            <span>Show QR</span>
          </button>

          <button
            type="button"
            onClick={handleGeneralAppShareWhatsApp}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Share on WhatsApp</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setWorkerToEdit(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Add Staff Member</span>
          </button>
        </div>
      </div>

      {/* 2. ACTIVE USER SWITCHER BAR (QUICK COUNTER LOGIN & ROLE PREVIEW) */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-2xs">
            {activeSession.role === 'Owner' ? '👑' : '👤'}
          </div>
          <div>
            <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5 flex-wrap">
              <span>Active User:</span>
              <span className="font-extrabold text-blue-700">{activeSession.name}</span>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                {activeSession.role}
              </span>
              {activeSession.role !== 'Owner' && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                  Role Scoped View Active
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              {activeSession.role === 'Owner'
                ? 'Master owner session with full visibility of purchase prices and company net profit.'
                : `Active as ${activeSession.name} (${activeSession.role}). Wholesale buy price & confidential ledgers are automatically hidden.`}
            </p>
          </div>
        </div>

        {/* 1-Tap Quick Switch Buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Switch View:</span>

          <button
            type="button"
            onClick={handleSwitchToOwner}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
              activeSession.role === 'Owner'
                ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200'
            }`}
          >
            👑 Owner View
          </button>

          {coWorkers.slice(0, 3).map((w) => {
            const isCur = activeSession.id === w.id;
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => onSelectUser({
                  type: 'COWORKER',
                  id: w.id,
                  name: w.name,
                  phone: w.phone,
                  role: w.role,
                  pin: w.pin,
                  isRemote: true
                })}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border flex items-center gap-1 ${
                  isCur
                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200'
                }`}
                title={`Click to preview app as ${w.name}`}
              >
                <span>{w.role === 'Salesman' ? '💼' : w.role === 'Biller' ? '🧾' : '🛡️'}</span>
                <span>{w.name.split(' ')[0]} ({w.role})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. ROLE SUMMARY METRICS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-purple-50/70 border border-purple-200/70 rounded-xl p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-purple-800 uppercase tracking-wider">Secondary Admins</span>
            <div className="text-xl font-black text-purple-700 mt-0.5">{roleCounts['Secondary Admin']} Members</div>
          </div>
          <ShieldCheck className="w-6 h-6 text-purple-600" />
        </div>

        <div className="bg-blue-50/70 border border-blue-200/70 rounded-xl p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-blue-800 uppercase tracking-wider">Salesmen</span>
            <div className="text-xl font-black text-blue-700 mt-0.5">{roleCounts['Salesman']} Members</div>
          </div>
          <Smartphone className="w-6 h-6 text-blue-600" />
        </div>

        <div className="bg-emerald-50/70 border border-emerald-200/70 rounded-xl p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider">Billers & POS</span>
            <div className="text-xl font-black text-emerald-700 mt-0.5">{roleCounts['Biller']} Members</div>
          </div>
          <UserCheck className="w-6 h-6 text-emerald-600" />
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider">Other Roles</span>
            <div className="text-xl font-black text-slate-700 mt-0.5">{roleCounts['Other']} Members</div>
          </div>
          <Users2 className="w-6 h-6 text-slate-500" />
        </div>
      </div>

      {/* 4. FILTER AND SEARCH BAR */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(['ALL', 'Secondary Admin', 'Salesman', 'Biller', 'Other'] as const).map((roleKey) => (
            <button
              key={roleKey}
              type="button"
              onClick={() => setSelectedRoleFilter(roleKey)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                selectedRoleFilter === roleKey
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {roleKey === 'ALL' ? 'All Staff' : roleKey}
              {roleKey !== 'ALL' && ` (${roleCounts[roleKey] || 0})`}
            </button>
          ))}
        </div>

        <div className="relative min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by name or mobile..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
      </div>

      {/* 5. CO-WORKERS & STAFF LIST CARDS */}
      <div className="space-y-3">
        {filteredWorkers.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
            <Users2 className="w-12 h-12 mx-auto text-slate-300 mb-2" />
            <h4 className="font-bold text-slate-700 text-sm">No staff members found</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Add your store staff, salesmen, and billing counter operators to share role-scoped access.
            </p>
            <button
              type="button"
              onClick={() => {
                setWorkerToEdit(null);
                setIsModalOpen(true);
              }}
              className="mt-4 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add First Staff Member
            </button>
          </div>
        ) : (
          filteredWorkers.map((worker) => {
            const roleBadgeStyle =
              worker.role === 'Secondary Admin'
                ? 'bg-purple-100 text-purple-800 border-purple-200'
                : worker.role === 'Salesman'
                ? 'bg-blue-100 text-blue-800 border-blue-200'
                : worker.role === 'Biller'
                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                : 'bg-slate-100 text-slate-800 border-slate-200';

            const staffDirectUrl = getStaffLink(worker);

            return (
              <div
                key={worker.id}
                className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 shadow-xs hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex items-start sm:items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-slate-100 to-slate-200 border border-slate-300 flex items-center justify-center font-bold text-slate-700 text-base shadow-2xs shrink-0">
                    {worker.name.charAt(0).toUpperCase()}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-extrabold text-slate-900 text-sm md:text-base leading-tight">
                        {worker.name}
                      </h4>
                      <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${roleBadgeStyle}`}>
                        {worker.role}
                      </span>
                      {worker.status === 'ACTIVE' ? (
                        <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                          <Check className="w-2.5 h-2.5" /> Active
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          {worker.status}
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-500 flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1 font-medium">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        {worker.phone}
                      </span>

                      {worker.pin && (
                        <span className="flex items-center gap-1 font-mono text-[11px] bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                          <Lock className="w-3 h-3 text-slate-400" />
                          Login PIN: <b className="text-slate-800">{worker.pin}</b>
                        </span>
                      )}
                    </div>

                    {/* Clean Role Scope Summary */}
                    <div className="text-[11px] text-slate-600 flex items-center gap-1.5 flex-wrap pt-0.5">
                      <span className="font-bold text-slate-700">App Access:</span>
                      {worker.role === 'Salesman' && (
                        <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          🛍️ Product catalog, stock & sales bills (Buy price & profit hidden)
                        </span>
                      )}
                      {worker.role === 'Biller' && (
                        <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          🧾 POS counter billing, customer receipts & thermal printing
                        </span>
                      )}
                      {worker.role === 'Secondary Admin' && (
                        <span className="text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                          🛡️ Full store operations, daily ledger & reports
                        </span>
                      )}
                      {worker.role === 'Other' && (
                        <span className="text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          📦 Inventory stock count & dispatch
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Co-Worker Action Buttons */}
                <div className="flex items-center gap-2 flex-wrap self-end md:self-center shrink-0">
                  {/* Test Role */}
                  <button
                    type="button"
                    onClick={() => onSelectUser({
                      type: 'COWORKER',
                      id: worker.id,
                      name: worker.name,
                      phone: worker.phone,
                      role: worker.role,
                      pin: worker.pin,
                      isRemote: true
                    })}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                    title={`Switch into ${worker.name}'s role view`}
                  >
                    <Eye className="w-3.5 h-3.5 text-blue-600" />
                    <span>Test Role</span>
                  </button>

                  {/* QR Code */}
                  <button
                    type="button"
                    onClick={() => setQrModalWorker(worker)}
                    className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer"
                    title="View QR Code for Phone Camera"
                  >
                    <QrCode className="w-4 h-4" />
                  </button>

                  {/* Copy Link */}
                  <button
                    type="button"
                    onClick={() => handleCopyLink(staffDirectUrl)}
                    className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer"
                    title="Copy Staff Login Link"
                  >
                    <Copy className="w-4 h-4" />
                  </button>

                  {/* WhatsApp Direct Invite */}
                  <button
                    type="button"
                    onClick={() => handleShareWorkerWhatsApp(worker)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                    title="Share Invite via WhatsApp"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>WhatsApp Invite</span>
                  </button>

                  {/* Edit */}
                  <button
                    type="button"
                    onClick={() => {
                      setWorkerToEdit(worker);
                      setIsModalOpen(true);
                    }}
                    className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                    title="Edit Staff Member"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 6. ROLE PERMISSIONS & SECURITY MATRIX */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-blue-600" />
          <h3 className="font-bold text-slate-800 text-base">
            Role Security & Privileges Matrix
          </h3>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          Wholesale purchase costs, company net profit margins, and confidential bank accounts are strictly protected according to the staff member's role.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-extrabold">
                <th className="py-2.5 px-3">Module & Business Data</th>
                <th className="py-2.5 px-3 text-purple-700">Secondary Admin</th>
                <th className="py-2.5 px-3 text-blue-700">Salesman</th>
                <th className="py-2.5 px-3 text-emerald-700">Biller</th>
                <th className="py-2.5 px-3 text-slate-700">Other (Helper)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-600">
              <tr>
                <td className="py-2.5 px-3 font-semibold text-slate-800">Product Catalogue & Sale Price</td>
                <td className="py-2.5 px-3 text-emerald-600 font-bold">✓ Full Access</td>
                <td className="py-2.5 px-3 text-emerald-600 font-bold">✓ Full Access</td>
                <td className="py-2.5 px-3 text-emerald-600 font-bold">✓ Full Access</td>
                <td className="py-2.5 px-3 text-emerald-600 font-bold">✓ Stock View</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-slate-800">Wholesale Purchase Price & Cost</td>
                <td className="py-2.5 px-3 text-emerald-600 font-bold">✓ Visible</td>
                <td className="py-2.5 px-3 text-rose-500 font-black">✗ HIDDEN (Restricted)</td>
                <td className="py-2.5 px-3 text-rose-500 font-black">✗ HIDDEN (Restricted)</td>
                <td className="py-2.5 px-3 text-rose-500 font-black">✗ HIDDEN</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-slate-800">Sales Invoices & Orders</td>
                <td className="py-2.5 px-3 text-emerald-600 font-bold">✓ Create & Edit</td>
                <td className="py-2.5 px-3 text-emerald-600 font-bold">✓ Create & Share</td>
                <td className="py-2.5 px-3 text-emerald-600 font-bold">✓ Fast POS Billing</td>
                <td className="py-2.5 px-3 text-slate-400">✗ Blocked</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-slate-800">Supplier Purchases & Vendor Debt</td>
                <td className="py-2.5 px-3 text-emerald-600 font-bold">✓ Full</td>
                <td className="py-2.5 px-3 text-rose-500 font-black">✗ Blocked</td>
                <td className="py-2.5 px-3 text-rose-500 font-black">✗ Blocked</td>
                <td className="py-2.5 px-3 text-slate-400">✗ Blocked</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-slate-800">Cash Drawer Tally & Bank Accounts</td>
                <td className="py-2.5 px-3 text-emerald-600 font-bold">✓ Full</td>
                <td className="py-2.5 px-3 text-rose-500 font-black">✗ Blocked</td>
                <td className="py-2.5 px-3 text-emerald-600 font-bold">✓ Counter Cash Tally</td>
                <td className="py-2.5 px-3 text-slate-400">✗ Blocked</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-semibold text-slate-800">Business Net Profit & Reports</td>
                <td className="py-2.5 px-3 text-emerald-600 font-bold">✓ Full Reports</td>
                <td className="py-2.5 px-3 text-rose-500 font-black">✗ Blocked</td>
                <td className="py-2.5 px-3 text-rose-500 font-black">✗ Blocked</td>
                <td className="py-2.5 px-3 text-slate-400">✗ Blocked</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 7. QR CODE MODAL */}
      {(qrModalWorker || isShopQrOpen) && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 p-5 text-center space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h4 className="font-bold text-slate-800 text-sm">
                {qrModalWorker ? `Scan for ${qrModalWorker.name}` : 'Shop App QR Code'}
              </h4>
              <button
                onClick={() => {
                  setQrModalWorker(null);
                  setIsShopQrOpen(false);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              {qrModalWorker
                ? `Scan with phone camera to open app directly as ${qrModalWorker.name} (${qrModalWorker.role}).`
                : 'Co-workers can scan this QR code with their phone camera to open the app instantly.'}
            </p>

            <div className="flex justify-center p-3 bg-slate-50 rounded-2xl border border-slate-200">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="App Access QR Code" className="w-56 h-56 rounded-lg" />
              ) : (
                <div className="w-56 h-56 flex items-center justify-center text-slate-400 text-xs">
                  Generating QR...
                </div>
              )}
            </div>

            {qrModalWorker?.pin && (
              <div className="bg-blue-50 text-blue-800 p-2.5 rounded-xl border border-blue-200 text-xs font-mono font-bold">
                🔑 Login PIN: {qrModalWorker.pin}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                const targetUrl = qrModalWorker ? getStaffLink(qrModalWorker) : appBaseUrl;
                handleCopyLink(targetUrl);
              }}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Full Link</span>
            </button>
          </div>
        </div>
      )}

      {/* 8. Add / Edit Co-Worker Modal */}
      <CoWorkerModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setWorkerToEdit(null);
        }}
        onSave={onSaveCoWorker}
        onDelete={onDeleteCoWorker}
        workerToEdit={workerToEdit}
      />
    </div>
  );
};
