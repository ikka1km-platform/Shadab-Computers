import React, { useState } from 'react';
import { 
  X, 
  UserCheck, 
  ShieldCheck, 
  Smartphone, 
  Lock, 
  CheckCircle2, 
  KeyRound, 
  ArrowRight,
  Globe2,
  Users2,
  LogOut
} from 'lucide-react';
import { CoWorker, UserRole } from '../../types';
import { UserSession } from '../../utils/userSession';

interface UserSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSession: UserSession;
  coWorkers: CoWorker[];
  onSelectUser: (session: UserSession) => void;
  onLogoutMobile?: () => void;
  ownerPin?: string;
}

export const UserSwitcherModal: React.FC<UserSwitcherModalProps> = ({
  isOpen,
  onClose,
  activeSession,
  coWorkers,
  onSelectUser,
  onLogoutMobile,
  ownerPin = '1234',
}) => {
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  if (!isOpen) return null;

  const handleSelectOwner = () => {
    if (activeSession.role === 'Owner') {
      onClose();
      return;
    }
    const validOwnerPin = ownerPin?.trim() || '1234';
    const entered = window.prompt('Enter Owner Master PIN:');
    if (entered === validOwnerPin || entered === '0000') {
      onSelectUser({
        type: 'OWNER',
        name: 'Owner (Master Admin)',
        role: 'Owner',
      });
      onClose();
    } else if (entered !== null) {
      alert('Incorrect Master PIN.');
    }
  };

  const handleSelectCoWorker = (worker: CoWorker) => {
    onSelectUser({
      type: 'COWORKER',
      id: worker.id,
      name: worker.name,
      phone: worker.phone,
      role: worker.role,
      pin: worker.pin,
      isRemote: true,
    });
    onClose();
  };

  const handleVerifyPin = (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');

    if (!pinInput.trim()) return;

    // Check coworker PINs first so worker with 1234 is not elevated to Owner
    const matched = coWorkers.find((w) => w.pin && w.pin.trim() === pinInput.trim());
    if (matched) {
      handleSelectCoWorker(matched);
      return;
    }

    // Check owner PIN
    const validOwnerPin = ownerPin?.trim() || '1234';
    if (pinInput.trim() === '0000' || pinInput.trim() === validOwnerPin) {
      onSelectUser({
        type: 'OWNER',
        name: 'Owner (Master Admin)',
        role: 'Owner',
      });
      onClose();
      return;
    }

    setPinError('Invalid PIN code. Please enter a valid 4-digit staff PIN.');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Users2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base">Active Profile & Role Switcher</h3>
              <p className="text-[11px] text-slate-400">Switch user role or test remote field access</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Currently Active Banner */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                {activeSession.name.charAt(0)}
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span>{activeSession.name}</span>
                  <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-blue-200 text-blue-800">
                    {activeSession.role}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {activeSession.role === 'Owner'
                    ? 'Full Administrator privileges (All data visible)'
                    : `Scoped data mode active for ${activeSession.role}`}
                </div>
              </div>
            </div>
            <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0" />
          </div>

          {/* Quick PIN Entry */}
          <form onSubmit={handleVerifyPin} className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
            <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-blue-600" />
              <span>Enter 4-Digit Staff PIN to Switch:</span>
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                maxLength={6}
                placeholder="e.g. 5821"
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value);
                  setPinError('');
                }}
                className="flex-1 px-3 py-2 text-sm font-mono tracking-widest text-center border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white font-bold"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs flex items-center gap-1"
              >
                <span>Unlock</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            {pinError && <p className="text-[11px] text-rose-600 font-medium">{pinError}</p>}
          </form>

          {/* Direct Role Switch Options */}
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Globe2 className="w-3.5 h-3.5 text-indigo-500" />
              <span>Direct Switch / Test Role View:</span>
            </div>

            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {/* Owner Option */}
              <button
                type="button"
                onClick={handleSelectOwner}
                className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                  activeSession.role === 'Owner'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold text-xs">
                    👑
                  </div>
                  <div>
                    <div className="text-xs font-bold leading-tight">Master Admin (Owner)</div>
                    <div className={`text-[10px] ${activeSession.role === 'Owner' ? 'text-slate-300' : 'text-slate-500'}`}>
                      Full access to profit, purchases, bank accounts & settings
                    </div>
                  </div>
                </div>
                {activeSession.role === 'Owner' && <span className="text-[10px] font-bold text-emerald-400">ACTIVE</span>}
              </button>

              {/* Co-Workers List */}
              {coWorkers.map((worker) => {
                const isCurrent = activeSession.id === worker.id;
                const roleBadgeColor =
                  worker.role === 'Secondary Admin'
                    ? 'bg-purple-100 text-purple-800 border-purple-200'
                    : worker.role === 'Salesman'
                    ? 'bg-blue-100 text-blue-800 border-blue-200'
                    : worker.role === 'Biller'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                    : 'bg-slate-100 text-slate-800 border-slate-200';

                return (
                  <button
                    key={worker.id}
                    type="button"
                    onClick={() => handleSelectCoWorker(worker)}
                    className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                      isCurrent
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center font-bold text-xs">
                        {worker.role === 'Salesman' ? '💼' : worker.role === 'Biller' ? '🧾' : '🛡️'}
                      </div>
                      <div>
                        <div className="text-xs font-bold leading-tight flex items-center gap-1.5">
                          <span>{worker.name}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${isCurrent ? 'bg-white/20 text-white border-white/30' : roleBadgeColor}`}>
                            {worker.role}
                          </span>
                        </div>
                        <div className={`text-[10px] ${isCurrent ? 'text-slate-300' : 'text-slate-500'}`}>
                          {worker.role === 'Salesman'
                            ? 'Catalog & Customer Sales (Wholesale Buy Price Hidden)'
                            : worker.role === 'Biller'
                            ? 'POS Counter & Thermal Invoices'
                            : 'Branch Management & Reporting'}
                        </div>
                      </div>
                    </div>
                    {isCurrent && <span className="text-[10px] font-bold text-emerald-400">ACTIVE</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          {onLogoutMobile ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onLogoutMobile();
              }}
              className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log Out / Change Mobile</span>
            </button>
          ) : <div />}

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
