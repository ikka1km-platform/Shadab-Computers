import { PlusCircle, Settings, Building2, Landmark, RefreshCw, Lock, Printer, Users2, Globe2, ShieldCheck, User, Tablet, Cloud, AlertTriangle, ArrowLeft } from 'lucide-react';
import { BusinessProfile, CloudConnectionStatus } from '../../types';
import { useThermalPrinters } from '../../utils/printerStorage';
import { UserSession } from '../../utils/userSession';

interface NavbarProps {
  profile?: BusinessProfile;
  activeSession?: UserSession;
  canGoBack?: boolean;
  onGoBack?: () => void;
  onOpenQuickTx: () => void;
  onOpenSettings: () => void;
  onOpenBanking?: () => void;
  onOpenPrinterSettings?: () => void;
  onOpenTeamSync?: () => void;
  onOpenUserSwitcher?: () => void;
  onOpenNewCompany?: () => void;
  onLockApp?: () => void;
  onEnterShowroomMode?: () => void;
  isPinEnabled?: boolean;
  onOpenCloudSync?: () => void;
  unresolvedConflictsCount?: number;
  onOpenConflictReview?: () => void;
  onTriggerSyncNow?: () => void;
  isSyncing?: boolean;
  pendingQueueCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  profile,
  activeSession,
  canGoBack,
  onGoBack,
  onOpenQuickTx,
  onOpenSettings,
  onOpenBanking,
  onOpenPrinterSettings,
  onOpenTeamSync,
  onOpenUserSwitcher,
  onOpenNewCompany,
  onLockApp,
  onEnterShowroomMode,
  isPinEnabled,
  onOpenCloudSync,
  unresolvedConflictsCount = 0,
  onOpenConflictReview,
  onTriggerSyncNow,
  isSyncing = false,
  pendingQueueCount = 0,
}) => {
  const { defaultPrinter } = useThermalPrinters();
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs w-full max-w-full overflow-hidden">
      {/* Top Main Row */}
      <div className="px-3 sm:px-4 lg:px-6 py-2 sm:py-2.5 flex items-center justify-between gap-2">
        {/* Left: Brand / Company Info */}
        <div className="flex items-center gap-2 min-w-0">
          {canGoBack && onGoBack && (
            <button
              type="button"
              onClick={onGoBack}
              className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-extrabold shrink-0 border border-slate-300 shadow-2xs"
              title="Go Back to Previous Screen (Swipe Left/Right)"
            >
              <ArrowLeft className="w-4 h-4 text-blue-600" />
              <span>Back</span>
            </button>
          )}
          <div 
            onClick={onOpenNewCompany}
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm sm:text-lg shadow-sm cursor-pointer hover:opacity-90 shrink-0"
            title="Click to Create New Company"
          >
            {profile?.businessName ? profile.businessName.charAt(0) : 'V'}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 
                onClick={onOpenNewCompany}
                className="font-bold text-slate-800 text-xs sm:text-base leading-tight hover:text-blue-600 transition-colors cursor-pointer truncate max-w-[120px] xs:max-w-[160px] sm:max-w-[220px]"
                title={profile?.businessName || 'My Business'}
              >
                {profile?.businessName || 'My Business'}
              </h1>
              {onOpenNewCompany && (
                <button
                  type="button"
                  onClick={onOpenNewCompany}
                  className="text-[9px] sm:text-[10px] font-extrabold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-1.5 py-0.5 rounded-full border border-emerald-300 transition-colors cursor-pointer shrink-0"
                  title="Create New Company / Fresh Workspace"
                >
                  + New
                </button>
              )}
            </div>
            <p className="text-[10px] sm:text-xs text-slate-500 hidden sm:flex items-center gap-1.5 mt-0.5 truncate">
              <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>{profile?.phone || '+91 - Register Phone'}</span>
            </p>
          </div>
        </div>

        {/* Right (Mobile View): Compact Role & Quick Add Button */}
        <div className="flex md:hidden items-center gap-1.5 shrink-0">
          {activeSession && onOpenUserSwitcher && (
            <button
              type="button"
              onClick={onOpenUserSwitcher}
              className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-300 bg-slate-50 text-[10px] font-extrabold text-slate-700 cursor-pointer shadow-2xs"
              title="Click to Switch Role or Enter Staff PIN"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>{activeSession.role}</span>
            </button>
          )}

          <button
            onClick={onOpenQuickTx}
            className="flex items-center gap-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs px-2.5 py-1.5 rounded-lg shadow-xs active:scale-95 transition-all cursor-pointer"
            title="Add Transaction"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>+ Add</span>
          </button>
        </div>

        {/* Right (Desktop View): Full Switches Row */}
        <div className="hidden md:flex items-center gap-2">
          {/* Active Role & User Switcher Pill */}
          {activeSession && onOpenUserSwitcher && (
            <button
              type="button"
              onClick={onOpenUserSwitcher}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer shadow-2xs ${
                activeSession.role === 'Owner'
                  ? 'bg-slate-50 hover:bg-slate-100 border-slate-300 text-slate-800'
                  : activeSession.role === 'Salesman'
                  ? 'bg-blue-50 hover:bg-blue-100 border-blue-300 text-blue-800'
                  : activeSession.role === 'Biller'
                  ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-800'
                  : 'bg-purple-50 hover:bg-purple-100 border-purple-300 text-purple-800'
              }`}
              title="Click to Switch Role or Enter Staff PIN"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="hidden sm:inline">{activeSession.name}</span>
              <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-black/10">
                {activeSession.role}
              </span>
            </button>
          )}

          {onEnterShowroomMode && (
            <button
              type="button"
              onClick={onEnterShowroomMode}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
              title="Lock tablet into Customer Showroom Mode"
            >
              <Tablet className="w-3.5 h-3.5 text-purple-600" />
              <span className="hidden md:inline">Showroom Mode</span>
            </button>
          )}

          <button
            onClick={onOpenQuickTx}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium text-sm px-4 py-2 rounded-lg shadow-sm active:scale-98 transition-all cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Add Transaction</span>
          </button>

          {onOpenBanking && (
            <button
              onClick={onOpenBanking}
              className="p-2 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
              title="Manage Bank Accounts & Multiple Firms"
            >
              <Landmark className="w-5 h-5" />
            </button>
          )}

          {onOpenTeamSync && (
            <button
              onClick={onOpenTeamSync}
              className="relative p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
              title="Co-Workers & Multi-Device Wi-Fi Sync"
            >
              <Users2 className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white animate-pulse" />
            </button>
          )}

          {/* Unresolved Conflict Review Alert Pill */}
          {unresolvedConflictsCount > 0 && onOpenConflictReview && (
            <button
              type="button"
              onClick={onOpenConflictReview}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs animate-pulse"
              title="Conflicting records detected across devices"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Review Conflict ({unresolvedConflictsCount})</span>
            </button>
          )}

          {/* Cloud Sync Status Indicator */}
          <button
            type="button"
            onClick={onOpenCloudSync || onTriggerSyncNow}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer shadow-2xs ${
              profile?.firmCloudAccount?.cloudConnectionStatus === 'CONNECTED'
                ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-800'
                : isSyncing || profile?.firmCloudAccount?.cloudConnectionStatus === 'SYNCING'
                ? 'bg-blue-50 hover:bg-blue-100 border-blue-300 text-blue-800'
                : pendingQueueCount > 0 || profile?.firmCloudAccount?.cloudConnectionStatus === 'PENDING'
                ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-800'
                : profile?.firmCloudAccount?.cloudConnectionStatus === 'OFFLINE'
                ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-500'
            }`}
            title={`Firm Cloud Account: ${profile?.firmCloudAccount?.cloudAccountEmail || 'Not Connected'} (Click for Cloud Settings)`}
          >
            <Cloud className="w-3.5 h-3.5" />
            <span className={`w-2 h-2 rounded-full ${
              profile?.firmCloudAccount?.cloudConnectionStatus === 'CONNECTED'
                ? 'bg-emerald-500'
                : isSyncing || profile?.firmCloudAccount?.cloudConnectionStatus === 'SYNCING'
                ? 'bg-blue-500 animate-pulse'
                : pendingQueueCount > 0
                ? 'bg-amber-500 animate-ping'
                : 'bg-slate-400'
            }`} />
            <span className="hidden lg:inline">
              {profile?.firmCloudAccount?.cloudConnectionStatus === 'CONNECTED'
                ? '● Synced'
                : isSyncing || profile?.firmCloudAccount?.cloudConnectionStatus === 'SYNCING'
                ? '◐ Syncing'
                : pendingQueueCount > 0
                ? `⚠ Pending (${pendingQueueCount})`
                : profile?.firmCloudAccount?.cloudConnectionStatus === 'OFFLINE'
                ? 'Offline'
                : 'Cloud'}
            </span>
          </button>

          {isPinEnabled && onLockApp && (
            <button
              onClick={onLockApp}
              className="p-2 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
              title="Lock App Screen (Requires PIN to unlock)"
            >
              <Lock className="w-5 h-5" />
            </button>
          )}

          <button
            onClick={() => {
              if ((window as any).forceClearCacheAndReload) {
                (window as any).forceClearCacheAndReload();
              } else {
                window.location.reload();
              }
            }}
            className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
            title="Sync & Reload Latest App Version (Clears Mobile Cache)"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {onOpenPrinterSettings && (
            <button
              onClick={onOpenPrinterSettings}
              className="relative p-2 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
              title={defaultPrinter ? `Thermal Printer: ${defaultPrinter.name} (Default)` : 'Set Default Thermal Printer'}
            >
              <Printer className="w-5 h-5 text-slate-600 hover:text-indigo-600" />
              {defaultPrinter && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />
              )}
            </button>
          )}

          <button
            onClick={onOpenSettings}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Business Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Row 2 (Mobile only): Quick Switches Utility Strip - ALL SWITCHES FIT IN ONE SCREEN */}
      <div className="flex md:hidden items-center justify-around px-2 py-1 bg-slate-50/90 border-t border-slate-200/80 text-slate-600">
        {onEnterShowroomMode && (
          <button
            type="button"
            onClick={onEnterShowroomMode}
            className="p-2 text-purple-700 hover:bg-purple-100 rounded-lg transition-colors cursor-pointer active:scale-90"
            title="Showroom Mode (Tablet Catalog)"
          >
            <Tablet className="w-4 h-4" />
          </button>
        )}

        {onOpenBanking && (
          <button
            type="button"
            onClick={onOpenBanking}
            className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer active:scale-90"
            title="Manage Bank Accounts & Multiple Firms"
          >
            <Landmark className="w-4 h-4" />
          </button>
        )}

        {onOpenTeamSync && (
          <button
            type="button"
            onClick={onOpenTeamSync}
            className="relative p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer active:scale-90"
            title="Co-Workers & Multi-Device Sync"
          >
            <Users2 className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500 ring-1 ring-white animate-pulse" />
          </button>
        )}

        <button
          type="button"
          onClick={unresolvedConflictsCount > 0 ? onOpenConflictReview : (onOpenCloudSync || onTriggerSyncNow)}
          className={`relative p-2 rounded-lg transition-colors cursor-pointer active:scale-90 ${
            unresolvedConflictsCount > 0
              ? 'text-amber-600 bg-amber-50'
              : profile?.firmCloudAccount?.cloudConnectionStatus === 'CONNECTED'
              ? 'text-blue-600 hover:bg-blue-50'
              : 'text-slate-500 hover:bg-slate-200'
          }`}
          title={unresolvedConflictsCount > 0 ? `Review ${unresolvedConflictsCount} Conflicts` : 'Firm Cloud Sync'}
        >
          {unresolvedConflictsCount > 0 ? (
            <AlertTriangle className="w-4 h-4 text-amber-600 animate-bounce" />
          ) : (
            <Cloud className="w-4 h-4" />
          )}
          {profile?.firmCloudAccount?.cloudConnectionStatus === 'CONNECTED' && unresolvedConflictsCount === 0 && (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 ring-1 ring-white" />
          )}
          {pendingQueueCount > 0 && unresolvedConflictsCount === 0 && (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 ring-1 ring-white animate-pulse" />
          )}
        </button>

        {isPinEnabled && onLockApp && (
          <button
            type="button"
            onClick={onLockApp}
            className="p-2 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer active:scale-90"
            title="Lock App Screen"
          >
            <Lock className="w-4 h-4" />
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            if ((window as any).forceClearCacheAndReload) {
              (window as any).forceClearCacheAndReload();
            } else {
              window.location.reload();
            }
          }}
          className="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer active:scale-90"
          title="Sync & Reload Latest App Version"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        {onOpenPrinterSettings && (
          <button
            type="button"
            onClick={onOpenPrinterSettings}
            className="relative p-2 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer active:scale-90"
            title={defaultPrinter ? `Thermal Printer: ${defaultPrinter.name}` : 'Thermal Printer'}
          >
            <Printer className="w-4 h-4" />
            {defaultPrinter && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500 ring-1 ring-white" />
            )}
          </button>
        )}

        <button
          type="button"
          onClick={onOpenSettings}
          className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer active:scale-90"
          title="Business Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
