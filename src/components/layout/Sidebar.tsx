import React from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Package, 
  BookOpen, 
  BarChart3, 
  Calculator,
  Settings,
  Landmark,
  Users2
} from 'lucide-react';
import { UserRole } from '../../types';
import { getFilteredNavTabs, canManageSettings } from '../../utils/userSession';

export type NavTab = 'dashboard' | 'parties' | 'items' | 'daybook' | 'cash_tally' | 'reports' | 'team';

interface SidebarProps {
  activeTab: NavTab;
  currentRole?: 'Owner' | UserRole;
  onSelectTab: (tab: NavTab) => void;
  onOpenSettings: () => void;
  onOpenBanking?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  activeTab, 
  currentRole = 'Owner',
  onSelectTab, 
  onOpenSettings, 
  onOpenBanking 
}) => {
  const allNavItems = [
    { id: 'dashboard' as NavTab, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'parties' as NavTab, label: 'Parties & Ledgers', icon: Users },
    { id: 'cash_tally' as NavTab, label: 'Cash Note Retally', icon: Calculator, badge: 'New' },
    { id: 'daybook' as NavTab, label: 'Daily Cashbook', icon: BookOpen },
    { id: 'items' as NavTab, label: 'Items & Inventory', icon: Package },
    { id: 'reports' as NavTab, label: 'Business Reports', icon: BarChart3 },
    { id: 'team' as NavTab, label: 'Co-Workers & Sync', icon: Users2, badge: 'Staff' },
  ];

  const allowedTabs = getFilteredNavTabs(currentRole);
  const navItems = allNavItems.filter((item) => allowedTabs.includes(item.id));
  const isSettingsAllowed = canManageSettings(currentRole);

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex-shrink-0 flex flex-col justify-between hidden md:flex border-r border-slate-800 select-none">
      <div>
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center text-white font-black text-base shadow-md">
              V
            </div>
            <div>
              <span className="font-bold text-white tracking-wide text-base block">VYAPAR PLUS</span>
              <span className="text-[10px] text-blue-400 font-medium uppercase tracking-wider block">
                {currentRole === 'Owner' ? 'Master Admin' : `${currentRole} View`}
              </span>
            </div>
          </div>
        </div>

        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-bold px-1.5 py-0.2 rounded border border-emerald-500/30">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {allowedTabs.includes('cash_tally') && (
          <div className="mx-3 mt-4 p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300 mb-1">
              <Calculator className="w-3.5 h-3.5" />
              <span>Note Denomination Ready</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              All customer receipts auto-feed into your daily bank deposit & counter retally sheet.
            </p>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-slate-800 space-y-1">
        {onOpenBanking && isSettingsAllowed && (
          <button
            onClick={onOpenBanking}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-indigo-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer font-medium"
          >
            <Landmark className="w-5 h-5 text-indigo-400" />
            Bank Accounts & Firms
          </button>
        )}
        {isSettingsAllowed && (
          <button
            onClick={onOpenSettings}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Settings className="w-5 h-5" />
            Settings & Profile
          </button>
        )}
      </div>
    </aside>
  );
};

export const MobileTabBar: React.FC<{
  activeTab: NavTab;
  currentRole?: 'Owner' | UserRole;
  onSelectTab: (tab: NavTab) => void;
}> = ({ activeTab, currentRole = 'Owner', onSelectTab }) => {
  const allTabs = [
    { id: 'dashboard' as NavTab, label: 'Home', icon: LayoutDashboard },
    { id: 'cash_tally' as NavTab, label: 'Cash Tally', icon: Calculator },
    { id: 'parties' as NavTab, label: 'Parties', icon: Users },
    { id: 'daybook' as NavTab, label: 'Daybook', icon: BookOpen },
    { id: 'items' as NavTab, label: 'Store', icon: Package },
    { id: 'reports' as NavTab, label: 'Reports', icon: BarChart3 },
  ];

  const allowedTabs = getFilteredNavTabs(currentRole);
  const tabs = allTabs.filter((t) => allowedTabs.includes(t.id));

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-30 flex items-center justify-around py-2 shadow-lg">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`flex flex-col items-center gap-1 text-[11px] font-medium py-1 px-2 rounded-lg transition-colors cursor-pointer ${
              isActive ? 'text-blue-600 font-bold' : 'text-slate-500'
            }`}
          >
            <Icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};
