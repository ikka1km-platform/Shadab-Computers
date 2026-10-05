import React, { useState, useMemo } from 'react';
import { 
  X, 
  MessageCircle, 
  Send, 
  Check, 
  Clock, 
  SlidersHorizontal, 
  Building2, 
  Phone, 
  Calendar, 
  Filter, 
  Search, 
  ShieldAlert, 
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { Party, Firm, BankAccount, BusinessProfile, ReminderRule } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { isOtherAgentAccount } from '../../utils/pdfDebtorsParser';
import { db } from '../../db/db';
import { getEffectiveReminderTemplates, renderReminderTemplate } from '../../utils/reminderTemplates';

interface SplitScreenRecoveryQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  parties: Party[];
  firms?: Firm[];
  bankAccounts?: BankAccount[];
  profile?: BusinessProfile;
  onUpdateParty?: (updated: Party) => void;
  onOpenSettings?: () => void;
}

const DAYS_NAME = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const SplitScreenRecoveryQueueModal: React.FC<SplitScreenRecoveryQueueModalProps> = ({
  isOpen,
  onClose,
  parties,
  firms = [],
  bankAccounts = [],
  profile,
  onUpdateParty,
  onOpenSettings,
}) => {
  const [activeTab, setActiveTab] = useState<'TODAY_DUE' | 'ALL_PENDING' | 'AMZERA' | 'RAJGARH'>('TODAY_DUE');
  const [searchQuery, setSearchQuery] = useState('');
  const [sentPartyIds, setSentPartyIds] = useState<Set<number>>(new Set());
  
  // Rule editor state for an individual party
  const [editingPartyRule, setEditingPartyRule] = useState<Party | null>(null);
  const [ruleFrequency, setRuleFrequency] = useState<'DAILY' | 'FIXED_DAYS' | 'MANUAL'>('DAILY');
  const [ruleDays, setRuleDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [ruleMinAmount, setRuleMinAmount] = useState<number>(1000);
  const [editPhone, setEditPhone] = useState<string>('');

  const todayDayOfWeek = new Date().getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat

  // Cash account detector to prevent Cash in Hand from appearing in bank transfer instructions
  const isCashAccount = (b?: BankAccount): boolean => {
    if (!b) return false;
    const num = (b.accountNumber || '').toUpperCase();
    const name = (b.bankName || '').toLowerCase();
    const accName = (b.accountName || '').toLowerCase();
    return num.includes('CASH') || name.includes('cash') || accName.includes('cash');
  };

  // Identify firm banks safely
  const krishiSewaFirm = firms.find((f) => f?.name && /krishi\s*sewa/i.test(f.name)) || firms[0];
  const shadabFirm = firms.find((f) => f?.name && /shadab/i.test(f.name)) || firms[1] || firms[0];

  const getBankForFirm = (firm?: Firm, isAmzera?: boolean): BankAccount | undefined => {
    const isAmz = isAmzera ?? (firm?.name ? /AMZERA|AMZREA|KRISHI/i.test(firm.name) : false);

    // Only consider real bank accounts (filter out Cash in Hand / CASH-01)
    const realBanks = bankAccounts.filter((b) => !isCashAccount(b));

    let matched: BankAccount | undefined;
    if (isAmz) {
      // Prioritize Krishi Sewa Kendra ICICI bank account (406205001843)
      matched =
        realBanks.find((b) => b.accountNumber === '406205001843') ||
        realBanks.find((b) => /krishi/i.test(b.accountName || '') || /krishi/i.test(b.firmName || '')) ||
        (krishiSewaFirm?.id ? realBanks.find((b) => b.firmId === krishiSewaFirm.id) : undefined);
    } else {
      // Prioritize Shadab Computers ICICI bank account (406205001812)
      matched =
        realBanks.find((b) => b.accountNumber === '406205001812') ||
        realBanks.find((b) => /shadab/i.test(b.accountName || '') || /shadab/i.test(b.firmName || '')) ||
        (shadabFirm?.id ? realBanks.find((b) => b.firmId === shadabFirm.id) : undefined);
    }

    if (matched) return matched;

    // Fallback: any real bank with upiId or first real bank
    const anyWithUpi = realBanks.find((b) => Boolean(b.upiId && b.upiId !== 'krishisewa@sbi'));
    if (anyWithUpi) return anyWithUpi;
    if (realBanks.length > 0) return realBanks[0];

    // Synthetic fallback matching the exact ICICI details if not yet in state
    if (isAmz) {
      return {
        id: 8,
        accountName: 'Krishi sewa kendra',
        bankName: 'Icici',
        accountNumber: '406205001843',
        ifscCode: 'ICIC0004062',
        upiId: 'Krishisewa86@icici',
        openingBalance: 0,
        currentBalance: 0,
        firmName: 'Krishi sewa kendra',
        createdAt: new Date().toISOString(),
      };
    } else {
      return {
        id: 9,
        accountName: 'Shadab Computers',
        bankName: 'Icicic',
        accountNumber: '406205001812',
        ifscCode: 'ICIC0004062',
        upiId: 'eazypay.447KINJ6OP7QYA5@ICICI',
        openingBalance: 0,
        currentBalance: 0,
        firmName: 'Shadab Computers',
        createdAt: new Date().toISOString(),
      };
    }
  };

  // Filter out the other agent's accounts (Nalchha, JPM, Sajid, Shin Shakti)
  const myParties = useMemo(() => {
    if (!parties || !Array.isArray(parties)) return [];
    return parties.filter((p) => {
      // Must be customer with positive balance
      if (p.partyType !== 'CUSTOMER' || (p.currentBalance || 0) <= 0) return false;
      // Auto-ignore Nalchha, JPM, Sajid, Shin Shakti
      const { isExcluded } = isOtherAgentAccount(p.name);
      return !isExcluded;
    });
  }, [parties]);

  // Determine which parties qualify for Today's Due
  const dueTodayParties = useMemo(() => {
    return myParties.filter((p) => {
      const rule = p.reminderRule || {
        frequency: 'DAILY',
        daysOfWeek: [1, 2, 3, 4, 5, 6],
        minAmount: 500,
      };

      // Check min amount condition
      const minAmt = rule.minAmount !== undefined ? rule.minAmount : 500;
      if ((p.currentBalance || 0) < minAmt) return false;

      // Check day rule
      if (rule.frequency === 'DAILY') return true;
      if (rule.frequency === 'FIXED_DAYS') {
        return rule.daysOfWeek && rule.daysOfWeek.includes(todayDayOfWeek);
      }
      return false; // MANUAL
    });
  }, [myParties, todayDayOfWeek]);

  // Filter based on active tab and search query
  const displayedParties = useMemo(() => {
    let list: Party[] = [];
    if (activeTab === 'TODAY_DUE') {
      list = dueTodayParties;
    } else if (activeTab === 'ALL_PENDING') {
      list = myParties;
    } else if (activeTab === 'AMZERA') {
      list = myParties.filter((p) => p.name && /AMZERA|AMZREA/i.test(p.name));
    } else if (activeTab === 'RAJGARH') {
      list = myParties.filter((p) => p.name && !/AMZERA|AMZREA/i.test(p.name));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((p) => (p.name && p.name.toLowerCase().includes(q)) || p.phone?.includes(q));
    }

    return list;
  }, [activeTab, dueTodayParties, myParties, searchQuery]);

  if (!isOpen) return null;

  // Generate the WhatsApp reminder message with flexible UPI pay link (NO hardcoded amount)
  const generateWhatsAppMessage = (party: Party) => {
    const isAmzera = Boolean(
      (party.name && /AMZERA|AMZREA/i.test(party.name)) ||
      (party.firmName && /AMZERA|AMZREA|KRISHI/i.test(party.firmName)) ||
      (krishiSewaFirm?.id && party.firmId === krishiSewaFirm.id)
    );
    const assignedFirm = isAmzera ? krishiSewaFirm : shadabFirm;
    const firmName = assignedFirm?.name || (isAmzera ? 'Krishi sewa kendra' : 'Shadab Computers');
    const firmBank = getBankForFirm(assignedFirm, isAmzera);

    const defaultUpiId = isAmzera ? 'Krishisewa86@icici' : 'eazypay.447KINJ6OP7QYA5@ICICI';

    let activeUpiId = '';
    if (firmBank?.upiId && firmBank.upiId !== 'krishisewa@sbi') {
      activeUpiId = firmBank.upiId;
    } else if (assignedFirm?.upiId && assignedFirm.upiId !== 'krishisewa@sbi') {
      activeUpiId = assignedFirm.upiId;
    } else {
      activeUpiId = defaultUpiId;
    }

    const dueAmount = Math.abs(party.currentBalance);

    // Clickable UPI link with OPEN AMOUNT (omitting &am= so payer can pay partial or advance freely)
    const upiPayLink = `upi://pay?pa=${encodeURIComponent(activeUpiId)}&pn=${encodeURIComponent(firmName)}&cu=INR`;

    const templates = getEffectiveReminderTemplates(profile);
    const isRealBank = firmBank && !isCashAccount(firmBank);
    const bankDetailsText = isRealBank
      ? `🏦 *Bank Transfer Details:*\n* Bank: ${firmBank.bankName}\n* A/C Name: ${firmBank.accountName}\n* A/C No: ${firmBank.accountNumber}${firmBank.ifscCode ? `\n* IFSC: ${firmBank.ifscCode}` : ''}`
      : '';

    const serviceName = isAmzera ? 'Krishi Sewa Kendra' : 'Jio';

    const text = renderReminderTemplate(templates.recoveryQueue, {
      partyName: party.name,
      amount: formatCurrency(dueAmount),
      firmName: firmName,
      serviceName: serviceName,
      upiId: activeUpiId,
      upiLink: upiPayLink,
      bankDetails: bankDetailsText,
      phone: assignedFirm?.phone || profile?.phone,
    });

    return { text, phone: party.phone || '' };
  };

  // Handle clicking Send WhatsApp
  const handleSendWhatsApp = (party: Party) => {
    const { text, phone } = generateWhatsAppMessage(party);
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const encodedText = encodeURIComponent(text);

    // Mark as sent in state immediately so the split screen shows tick
    if (party.id) {
      setSentPartyIds((prev) => new Set(prev).add(party.id!));
      // Save last reminder sent in Dexie
      db.parties.update(party.id, {
        lastReminderSentAt: new Date().toISOString(),
      }).catch(console.error);
    }

    // Launch WhatsApp
    let url = '';
    if (cleanPhone.length >= 10) {
      const fullPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
      url = `https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodedText}`;
    } else {
      url = `https://api.whatsapp.com/send?text=${encodedText}`;
    }

    window.open(url, '_blank');
  };

  // Open Rule Editor for a party
  const handleOpenRuleEditor = (party: Party) => {
    setEditingPartyRule(party);
    const rule = party.reminderRule || {
      frequency: 'DAILY',
      daysOfWeek: [1, 2, 3, 4, 5, 6],
      minAmount: 1000,
    };
    setRuleFrequency(rule.frequency || 'DAILY');
    setRuleDays(rule.daysOfWeek || [1, 2, 3, 4, 5, 6]);
    setRuleMinAmount(rule.minAmount || 1000);
    setEditPhone(party.phone || '');
  };

  // Save Rule Editor
  const handleSaveRule = async () => {
    if (!editingPartyRule?.id) return;

    const updatedRule: ReminderRule = {
      frequency: ruleFrequency,
      daysOfWeek: ruleDays,
      minAmount: ruleMinAmount,
    };

    await db.parties.update(editingPartyRule.id, {
      phone: editPhone.trim(),
      reminderRule: updatedRule,
      updatedAt: new Date().toISOString(),
    });

    if (onUpdateParty) {
      onUpdateParty({
        ...editingPartyRule,
        phone: editPhone.trim(),
        reminderRule: updatedRule,
      });
    }

    setEditingPartyRule(null);
  };

  const toggleDay = (dayIdx: number) => {
    setRuleDays((prev) =>
      prev.includes(dayIdx) ? prev.filter((d) => d !== dayIdx) : [...prev, dayIdx].sort()
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl max-h-[96vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        
        {/* Compact Split-Screen Header */}
        <div className="bg-slate-900 text-white px-3.5 py-2.5 sm:px-5 sm:py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-400/30 flex items-center justify-center font-bold">
              <MessageCircle className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-xs sm:text-sm font-black tracking-tight">
                  Jio WhatsApp Recovery Queue
                </h2>
                <span className="text-[9px] bg-emerald-500/20 text-emerald-300 font-bold px-1.5 py-0.2 rounded-full border border-emerald-400/20">
                  Split Screen Ready
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                1-Tap Send • Opens WhatsApp top half • "Jio" Balance Template
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {onOpenSettings && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
                className="px-2 py-1 text-[11px] font-bold text-emerald-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
                title="Edit WhatsApp Queue Message Template in Settings"
              >
                <span>⚙ Templates</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Filter Tabs & Search Bar */}
        <div className="bg-slate-50 border-b border-slate-200 px-3 py-2 space-y-2 shrink-0">
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar">
            <button
              onClick={() => setActiveTab('TODAY_DUE')}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all shrink-0 cursor-pointer ${
                activeTab === 'TODAY_DUE'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              ⚡ Today's Due ({dueTodayParties.length})
            </button>

            <button
              onClick={() => setActiveTab('ALL_PENDING')}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all shrink-0 cursor-pointer ${
                activeTab === 'ALL_PENDING'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              All My Shops ({myParties.length})
            </button>

            <button
              onClick={() => setActiveTab('AMZERA')}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all shrink-0 cursor-pointer ${
                activeTab === 'AMZERA'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Krishi Sewa (Amzera)
            </button>

            <button
              onClick={() => setActiveTab('RAJGARH')}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all shrink-0 cursor-pointer ${
                activeTab === 'RAJGARH'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              Shadab (Rajgarh/Other)
            </button>
          </div>

          {/* Quick Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search shop name or mobile..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
            />
          </div>
        </div>

        {/* Queue List (Compact for split-screen) */}
        <div className="flex-1 overflow-y-auto p-2.5 sm:p-3 space-y-2">
          {displayedParties.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              <Check className="w-8 h-8 mx-auto text-emerald-500 mb-1 opacity-80" />
              <p className="font-bold text-slate-700">No Reminders Pending!</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                All scheduled shops are cleared, or no customers matched this filter.
              </p>
            </div>
          ) : (
            displayedParties.map((party, index) => {
              const isSent = party.id ? sentPartyIds.has(party.id) : false;
              const isAmzera = /AMZERA|AMZREA/i.test(party.name);
              const assignedFirmName = isAmzera ? 'Krishi Sewa UPI' : 'Shadab Comp UPI';
              const rule = party.reminderRule;

              return (
                <div
                  key={party.id || index}
                  className={`p-2.5 sm:p-3 rounded-xl border flex items-center justify-between gap-2.5 transition-all shadow-2xs ${
                    isSent
                      ? 'bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-200'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Shop Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-bold text-slate-400">#{index + 1}</span>
                      <h4 className="font-black text-xs sm:text-sm text-slate-900 truncate">
                        {party.name}
                      </h4>
                      {isSent && (
                        <span className="text-[9px] bg-emerald-600 text-white font-bold px-1.5 py-0.2 rounded flex items-center gap-0.5">
                          <Check className="w-2.5 h-2.5 stroke-[3]" /> Sent
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500 flex-wrap">
                      <span className="font-black text-xs text-rose-600">
                        {formatCurrency(party.currentBalance)}
                      </span>
                      <span>•</span>
                      <span className="bg-slate-100 text-slate-700 px-1 py-0.2 rounded font-semibold">
                        {assignedFirmName}
                      </span>
                      {party.phone && (
                        <>
                          <span>•</span>
                          <span className="text-slate-600 flex items-center gap-0.5">
                            <Phone className="w-2.5 h-2.5" /> {party.phone}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions: Setting Rule + 1-Tap Send */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenRuleEditor(party)}
                      title="Edit Customer Payment Rule"
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSendWhatsApp(party)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95 ${
                        isSent
                          ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      }`}
                    >
                      <Send className="w-3 h-3" />
                      <span>{isSent ? 'Send Again' : 'Send'}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer: Split-screen tip & progress */}
        <div className="bg-slate-50 border-t border-slate-200 px-3.5 py-2 flex items-center justify-between text-[11px] text-slate-500 shrink-0">
          <span>
            Sent Today: <strong className="text-emerald-700">{sentPartyIds.size}</strong> / {displayedParties.length}
          </span>
          <span className="text-slate-400 italic">
            Top: WhatsApp • Bottom: Vyapar
          </span>
        </div>

      </div>

      {/* Customer Rule Config Modal */}
      {editingPartyRule && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-sm rounded-2xl p-4 shadow-2xl border border-slate-200 space-y-3.5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-slate-900 truncate">
                  Recovery Rule: {editingPartyRule.name}
                </h3>
                <p className="text-[10px] text-slate-500">Configure when this customer gets reminded</p>
              </div>
              <button
                onClick={() => setEditingPartyRule(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mobile / Phone Input */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                WhatsApp Phone Number:
              </label>
              <input
                type="tel"
                placeholder="e.g. 9826012345"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800"
              />
            </div>

            {/* Schedule Type */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Schedule Frequency:</label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'DAILY', label: 'Daily' },
                  { id: 'FIXED_DAYS', label: 'Fixed Days' },
                  { id: 'MANUAL', label: 'Manual' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setRuleFrequency(opt.id as any)}
                    className={`py-1 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                      ruleFrequency === opt.id
                        ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Days of Week (if FIXED_DAYS) */}
            {ruleFrequency === 'FIXED_DAYS' && (
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Select Reminder Days:
                </label>
                <div className="grid grid-cols-7 gap-1">
                  {DAYS_NAME.map((day, idx) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(idx)}
                      className={`py-1 text-[10px] font-bold rounded-md border text-center cursor-pointer ${
                        ruleDays.includes(idx)
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Min Amount Threshold */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Minimum Balance to Remind (₹):
              </label>
              <input
                type="number"
                value={ruleMinAmount}
                onChange={(e) => setRuleMinAmount(Number(e.target.value) || 0)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                Don't send if balance is lower than this amount.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingPartyRule(null)}
                className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveRule}
                className="px-4 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer shadow-xs"
              >
                Save Rule
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
