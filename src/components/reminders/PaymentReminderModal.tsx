import React, { useState } from 'react';
import { 
  X, 
  MessageCircle, 
  Share2, 
  Smartphone, 
  Copy, 
  Check, 
  Send, 
  AlertCircle,
  Landmark,
  QrCode
} from 'lucide-react';
import { Party, BusinessProfile, BankAccount } from '../../types';
import { formatCurrency } from '../../utils/formatters';

interface PaymentReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  party: Party;
  profile: BusinessProfile;
  bankAccounts?: BankAccount[];
}

export const PaymentReminderModal: React.FC<PaymentReminderModalProps> = ({
  isOpen,
  onClose,
  party,
  profile,
  bankAccounts = [],
}) => {
  const [tone, setTone] = useState<'polite' | 'standard' | 'urgent'>('polite');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const dueAmount = Math.abs(party.currentBalance);
  const defaultBank = bankAccounts.find((b) => b.isDefault) || bankAccounts[0];

  // Click-to-pay link for mobile UPI apps (PhonePe, GPay, Paytm, BHIM)
  const upiPayLink = profile.upiId
    ? `upi://pay?pa=${encodeURIComponent(profile.upiId)}&pn=${encodeURIComponent(profile.businessName)}&am=${dueAmount}&cu=INR`
    : '';

  // Tone message templates
  let reminderIntro = '';
  if (tone === 'polite') {
    reminderIntro = `Dear ${party.name}, gentle greeting from ${profile.businessName}. We hope you are doing well. This is a friendly reminder that an outstanding payment of ${formatCurrency(dueAmount)} is pending on your account.`;
  } else if (tone === 'standard') {
    reminderIntro = `Dear ${party.name}, payment reminder for your pending balance of ${formatCurrency(dueAmount)} with ${profile.businessName}. Please arrange to clear the dues at your earliest convenience.`;
  } else {
    reminderIntro = `URGENT PAYMENT REMINDER: Dear ${party.name}, your payment of ${formatCurrency(dueAmount)} with ${profile.businessName} is overdue. Kindly settle this balance today to avoid disruption in services.`;
  }

  const bankText = defaultBank
    ? `\n*Bank Transfer Details:*\nBank: ${defaultBank.bankName}\nA/C Name: ${defaultBank.accountName}\nA/C No: ${defaultBank.accountNumber}${defaultBank.ifscCode ? `\nIFSC: ${defaultBank.ifscCode}` : ''}`
    : '';

  const fullMessage = 
`${reminderIntro}

*Outstanding Due Amount:* ${formatCurrency(dueAmount)}
----------------------------------------
${profile.upiId ? `💳 *Pay via UPI:* ${profile.upiId}\n📲 *Tap to Pay with GPay/PhonePe:* ${upiPayLink}\n` : ''}${bankText}
----------------------------------------
If you have already made the payment, please disregard this reminder.

Regards,
*${profile.businessName}*
${profile.phone ? `Ph: ${profile.phone}` : ''}`;

  const handleShareWhatsApp = () => {
    const phoneClean = party.phone?.replace(/[^0-9]/g, '');
    const encoded = encodeURIComponent(fullMessage);
    const url = phoneClean && phoneClean.length >= 10
      ? `https://wa.me/${phoneClean.startsWith('91') ? phoneClean : '91' + phoneClean}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank');
  };

  const handleShareSMS = () => {
    const phoneClean = party.phone?.replace(/[^0-9]/g, '');
    const encoded = encodeURIComponent(fullMessage);
    window.location.href = `sms:${phoneClean || ''}?body=${encoded}`;
  };

  const handleNativeShare = async () => {
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
              <h3 className="font-bold text-slate-800 text-sm">Send Payment Reminder (Udhar)</h3>
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
                ⚠️ Urgent / Overdue
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
                Reminder Text Preview (with UPI link)
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
