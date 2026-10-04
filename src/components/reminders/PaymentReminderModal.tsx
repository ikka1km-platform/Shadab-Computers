import React, { useState, useEffect } from 'react';
import { 
  X, 
  MessageCircle, 
  Share2, 
  Copy, 
  Check, 
  Landmark,
  Building2
} from 'lucide-react';
import { Party, BusinessProfile, BankAccount, Firm } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { Capacitor } from '@capacitor/core';
import { NativeShare } from '../../utils/imageGenerator';

interface PaymentReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  party: Party;
  profile: BusinessProfile;
  bankAccounts?: BankAccount[];
  firms?: Firm[];
}

export const PaymentReminderModal: React.FC<PaymentReminderModalProps> = ({
  isOpen,
  onClose,
  party,
  profile,
  bankAccounts = [],
  firms = [],
}) => {
  const [tone, setTone] = useState<'polite' | 'standard' | 'urgent'>('polite');
  const [copied, setCopied] = useState(false);

  // Cash account detector to prevent Cash in Hand from appearing in bank transfer instructions
  const isCashAccount = (b?: BankAccount): boolean => {
    if (!b) return false;
    const num = (b.accountNumber || '').toUpperCase();
    const name = (b.bankName || '').toLowerCase();
    const accName = (b.accountName || '').toLowerCase();
    return num.includes('CASH') || name.includes('cash') || accName.includes('cash');
  };

  const realBankAccounts = bankAccounts.filter((b) => !isCashAccount(b));

  const isAmzera = Boolean(
    (party.name && /AMZERA|AMZREA/i.test(party.name)) ||
    (party.firmName && /AMZERA|AMZREA|KRISHI/i.test(party.firmName))
  );

  const krishiSewaFirm = firms.find((f) => f?.name && /krishi\s*sewa/i.test(f.name));
  const shadabFirm = firms.find((f) => f?.name && /shadab/i.test(f.name)) || firms[0];

  // Identify party's associated firm
  const partyFirm = firms.find((f) => f.id === party.firmId) || (isAmzera ? krishiSewaFirm : shadabFirm);
  const activeFirmName = partyFirm?.name || party.firmName || (isAmzera ? 'Krishi sewa kendra' : profile.businessName || 'Shadab Computers');
  const defaultUpiId = isAmzera ? 'Krishisewa86@icici' : 'eazypay.447KINJ6OP7QYA5@ICICI';

  // Find real bank account linked to this firm
  const firmBanks = realBankAccounts.filter((b) => 
    (partyFirm?.id && b.firmId === partyFirm.id) || 
    (partyFirm?.name && b.firmName === partyFirm.name) ||
    (isAmzera ? b.accountNumber === '406205001843' : b.accountNumber === '406205001812')
  );

  const initialBank = firmBanks.find((b) => b.upiId && b.upiId !== 'krishisewa@sbi') || 
                      firmBanks[0] || 
                      realBankAccounts.find((b) => b.isDefault) || 
                      realBankAccounts[0] ||
                      (isAmzera ? {
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
                      } : {
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
                      });

  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    initialBank ? `BANK_${initialBank.id}` : 'PROFILE_UPI'
  );

  useEffect(() => {
    const matchedBank = firmBanks.find((b) => b.upiId && b.upiId !== 'krishisewa@sbi') || firmBanks[0] || realBankAccounts.find((b) => b.isDefault) || realBankAccounts[0];
    if (matchedBank) {
      setSelectedAccountId(`BANK_${matchedBank.id}`);
    } else {
      setSelectedAccountId('PROFILE_UPI');
    }
  }, [party, firms, bankAccounts]);

  if (!isOpen) return null;

  const dueAmount = Math.abs(party.currentBalance);

  // Determine active bank and active UPI ID based on selected account
  let activeBank: BankAccount | undefined = undefined;
  let activeUpiId = '';

  if (selectedAccountId.startsWith('BANK_')) {
    const bankId = Number(selectedAccountId.replace('BANK_', ''));
    activeBank = realBankAccounts.find((b) => b.id === bankId) || initialBank;
    activeUpiId = (activeBank?.upiId && activeBank.upiId !== 'krishisewa@sbi' ? activeBank.upiId : '') ||
                  (partyFirm?.upiId && partyFirm.upiId !== 'krishisewa@sbi' ? partyFirm.upiId : '') ||
                  defaultUpiId;
  } else {
    activeUpiId = (partyFirm?.upiId && partyFirm.upiId !== 'krishisewa@sbi' ? partyFirm.upiId : '') ||
                  (profile.upiId && profile.upiId !== 'krishisewa@sbi' ? profile.upiId : '') ||
                  defaultUpiId;
    activeBank = initialBank;
  }

  // Click-to-pay link for mobile UPI apps without hardcoded amount
  // Customer can manually enter the exact or partial amount they want to pay
  const upiPayLink = activeUpiId
    ? `upi://pay?pa=${encodeURIComponent(activeUpiId)}&pn=${encodeURIComponent(activeFirmName)}&cu=INR`
    : '';

  // Tone message templates
  let reminderIntro = '';
  if (tone === 'polite') {
    reminderIntro = `Dear ${party.name}, gentle greeting from ${activeFirmName}. We hope you are doing well. This is a friendly reminder that an outstanding payment of ${formatCurrency(dueAmount)} is pending on your account.`;
  } else if (tone === 'standard') {
    reminderIntro = `Dear ${party.name}, payment reminder for your pending balance of ${formatCurrency(dueAmount)} with ${activeFirmName}. Please arrange to clear the dues at your earliest convenience.`;
  } else {
    reminderIntro = `URGENT PAYMENT REMINDER: Dear ${party.name}, your payment of ${formatCurrency(dueAmount)} with ${activeFirmName} is overdue. Kindly settle this balance today to avoid disruption in services.`;
  }

  const bankText = activeBank && !isCashAccount(activeBank)
    ? `\n*Bank Transfer Details:*\nBank: ${activeBank.bankName}\nA/C Name: ${activeBank.accountName}\nA/C No: ${activeBank.accountNumber}${activeBank.ifscCode ? `\nIFSC: ${activeBank.ifscCode}` : ''}`
    : '';

  const fullMessage = 
`${reminderIntro}

*Outstanding Due Amount:* ${formatCurrency(dueAmount)}
----------------------------------------
${activeUpiId ? `💳 *Pay via UPI:* ${activeUpiId}\n📲 *Tap to Pay with UPI (GPay/PhonePe):* ${upiPayLink}\n_(Tap link & enter the amount you wish to pay)_\n` : ''}${bankText}
----------------------------------------
If you have already made the payment, please disregard this reminder.

Regards,
*${activeFirmName}*
${partyFirm?.phone || profile.phone ? `Ph: ${partyFirm?.phone || profile.phone}` : ''}`;

  const handleShareWhatsApp = () => {
    const phoneClean = party.phone?.replace(/[^0-9]/g, '');
    const encoded = encodeURIComponent(fullMessage);
    const url = phoneClean && phoneClean.length >= 10
      ? `https://wa.me/${phoneClean.startsWith('91') ? phoneClean : '91' + phoneClean}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank');
  };

  const handleNativeShare = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        await NativeShare.shareText?.({
          title: `Payment Reminder - ${party.name}`,
          text: fullMessage,
          target: 'all',
        });
        return;
      } catch (nativeErr) {
        console.warn('Native share error, falling back:', nativeErr);
      }
    }
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Payment Reminder - ${party.name}`,
          text: fullMessage,
        });
      } catch (err: any) {
        if (err.name !== 'AbortError') console.error(err);
      }
    } else {
      handleCopyText();
    }
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(fullMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col border border-slate-200 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-amber-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-800 text-sm">Send Payment Reminder (Udhar)</h3>
                {partyFirm && (
                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded flex items-center gap-1">
                    <Building2 className="w-3 h-3 text-indigo-600" />
                    {partyFirm.name}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">{party.name} • Pending: {formatCurrency(dueAmount)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Associated Account & UPI Selection */}
          {(realBankAccounts.length > 0 || profile.upiId) && (
            <div className="bg-blue-50/60 border border-blue-200/80 p-3 rounded-xl space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-blue-900">
                  <Landmark className="w-3.5 h-3.5 text-blue-600" />
                  Receiving Bank & UPI Account:
                </span>
                <span className="text-[10px] text-blue-600 font-semibold lowercase">Linked to firm</span>
              </label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
              >
                {realBankAccounts.map((b) => (
                  <option key={b.id} value={`BANK_${b.id}`}>
                    {b.bankName} - {b.accountName} {b.upiId ? `(UPI: ${b.upiId})` : ''} {b.firmName ? `[Firm: ${b.firmName}]` : ''}
                  </option>
                ))}
                {profile.upiId && (
                  <option value="PROFILE_UPI">
                    Company UPI: {profile.upiId} ({profile.businessName})
                  </option>
                )}
              </select>
              <p className="text-[10px] text-slate-500">
                Payment link will share UPI without fixed amount so customer can enter their desired payment.
              </p>
            </div>
          )}

          {/* Tone Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">Reminder Tone:</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTone('polite')}
                className={`py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                  tone === 'polite'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                😊 Polite
              </button>
              <button
                type="button"
                onClick={() => setTone('standard')}
                className={`py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                  tone === 'standard'
                    ? 'bg-blue-50 border-blue-500 text-blue-800'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                📋 Standard
              </button>
              <button
                type="button"
                onClick={() => setTone('urgent')}
                className={`py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                  tone === 'urgent'
                    ? 'bg-rose-50 border-rose-500 text-rose-800'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                ⚠️ Urgent
              </button>
            </div>
          </div>

          {/* Quick Share Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleShareWhatsApp}
              className="p-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer"
            >
              <MessageCircle className="w-6 h-6 text-white" />
              <span>Send via WhatsApp</span>
              <span className="text-[10px] text-emerald-100 font-normal">
                {party.phone ? party.phone : 'Enter WhatsApp number'}
              </span>
            </button>

            <button
              onClick={handleNativeShare}
              className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer"
            >
              <Share2 className="w-6 h-6 text-white" />
              <span>Send via Apps</span>
              <span className="text-[10px] text-blue-100 font-normal">Telegram, SMS, Gmail</span>
            </button>
          </div>

          {/* Message Preview */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Reminder Text Preview (with Open UPI link)
              </span>
              <button
                onClick={handleCopyText}
                className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
            <pre className="text-xs text-slate-700 font-sans whitespace-pre-wrap max-h-36 overflow-y-auto leading-relaxed bg-white p-2.5 rounded-lg border border-slate-200">
              {fullMessage}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
