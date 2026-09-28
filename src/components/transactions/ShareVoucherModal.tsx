import React, { useState } from 'react';
import { 
  X, 
  MessageCircle, 
  Share2, 
  FileDown, 
  Printer, 
  Copy, 
  Check, 
  Smartphone,
  CheckCircle2,
  Building
} from 'lucide-react';
import { Transaction, Party, BusinessProfile } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { generateReceiptVoucherPDF } from '../../utils/pdfGenerator';

interface ShareVoucherModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction;
  party?: Party;
  profile: BusinessProfile;
}

export const ShareVoucherModal: React.FC<ShareVoucherModalProps> = ({
  isOpen,
  onClose,
  transaction,
  party,
  profile,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const voucherTitle = 
    transaction.type === 'SALE' ? 'TAX INVOICE / BILL' :
    transaction.type === 'PAYMENT_IN' ? 'OFFICIAL PAYMENT RECEIPT' :
    transaction.type === 'PURCHASE' ? 'PURCHASE BILL' :
    transaction.type === 'PAYMENT_OUT' ? 'PAYMENT OUT VOUCHER' : 'EXPENSE VOUCHER';

  // Construct items summary if any
  const itemsText = transaction.items && transaction.items.length > 0
    ? transaction.items.map((it) => `• ${it.name} (${it.quantity} ${it.unit}) - ₹${it.total}`).join('\n')
    : '';

  // Mode display
  const modeDisplay = transaction.paymentMode === 'SPLIT' && transaction.splitPayment
    ? `Split (Cash ₹${transaction.splitPayment.cashAmount} + Online ₹${transaction.splitPayment.onlineAmount})`
    : transaction.paymentMode;

  const paidAmt = transaction.paidAmount !== undefined 
    ? transaction.paidAmount 
    : (transaction.paymentStatus === 'UNPAID' ? 0 : transaction.amount);
  const balanceDue = transaction.balanceDue !== undefined 
    ? transaction.balanceDue 
    : Math.max(0, transaction.amount - paidAmt);

  // UPI click-to-pay link
  const upiLink = profile.upiId && balanceDue > 0
    ? `upi://pay?pa=${encodeURIComponent(profile.upiId)}&pn=${encodeURIComponent(profile.businessName)}&am=${balanceDue}&cu=INR`
    : profile.upiId
    ? `upi://pay?pa=${encodeURIComponent(profile.upiId)}&pn=${encodeURIComponent(profile.businessName)}&cu=INR`
    : '';

  // Formatted WhatsApp message body
  const messageBody = 
`🧾 *${voucherTitle}*
*${transaction.firmName || profile.businessName}*
----------------------------------------
*Voucher No:* ${transaction.voucherNumber}
*Date:* ${formatDate(transaction.date)}
*Party:* ${party?.name || transaction.partyName || 'Customer'}
${itemsText ? `\n*Items:*\n${itemsText}\n` : ''}
*Total Amount:* ${formatCurrency(transaction.amount)}
*Amount Paid:* ${formatCurrency(paidAmt)} (${modeDisplay})
${balanceDue > 0 ? `*⚠️ Balance Due:* ${formatCurrency(balanceDue)}` : '*Payment Status:* Fully Settled ✓'}
${transaction.description ? `\n*Note:* ${transaction.description}` : ''}
----------------------------------------
${upiLink ? `💳 *Pay Online via UPI:* ${profile.upiId}\nTap to Pay: ${upiLink}\n\n` : ''}Thank you for your business!
_${profile.businessName}${profile.phone ? ` • Ph: ${profile.phone}` : ''}_`;

  const handleShareWhatsApp = () => {
    const phoneClean = party?.phone?.replace(/[^0-9]/g, '');
    const encoded = encodeURIComponent(messageBody);
    const url = phoneClean && phoneClean.length >= 10
      ? `https://wa.me/${phoneClean.startsWith('91') ? phoneClean : '91' + phoneClean}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank');
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${voucherTitle} - ${transaction.voucherNumber}`,
          text: messageBody,
        });
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error(err);
        }
      }
    } else {
      handleCopyText();
    }
  };

  const handleShareSMS = () => {
    const phoneClean = party?.phone?.replace(/[^0-9]/g, '');
    const encoded = encodeURIComponent(messageBody);
    window.location.href = `sms:${phoneClean || ''}?body=${encoded}`;
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(messageBody);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadPDF = () => {
    generateReceiptVoucherPDF(transaction, party, profile);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col border border-slate-200 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Share Voucher / Receipt</h3>
              <p className="text-[11px] text-slate-500">{transaction.voucherNumber} • {formatCurrency(transaction.amount)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Share Action Buttons Grid */}
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {/* WhatsApp Share Button */}
            <button
              onClick={handleShareWhatsApp}
              className="p-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer"
            >
              <MessageCircle className="w-6 h-6 text-white" />
              <span>Share on WhatsApp</span>
              <span className="text-[10px] text-emerald-100 font-normal">
                {party?.phone ? `To ${party.name}` : 'With Customer'}
              </span>
            </button>

            {/* Native Mobile Share */}
            <button
              onClick={handleNativeShare}
              className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer"
            >
              <Share2 className="w-6 h-6 text-white" />
              <span>Send via Apps</span>
              <span className="text-[10px] text-blue-100 font-normal">Telegram, Gmail, etc.</span>
            </button>

            {/* Download PDF Bill */}
            <button
              onClick={handleDownloadPDF}
              className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-1.5 border border-slate-200 transition-all cursor-pointer"
            >
              <FileDown className="w-6 h-6 text-slate-700" />
              <span>Download PDF Bill</span>
              <span className="text-[10px] text-slate-500 font-normal">Official Tax Invoice</span>
            </button>

            {/* SMS Share */}
            <button
              onClick={handleShareSMS}
              className="p-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-1.5 border border-slate-200 transition-all cursor-pointer"
            >
              <Smartphone className="w-6 h-6 text-indigo-600" />
              <span>Send as SMS</span>
              <span className="text-[10px] text-slate-500 font-normal">Text Message</span>
            </button>
          </div>

          {/* Copy Message Preview Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 relative">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Voucher Message Preview
              </span>
              <button
                onClick={handleCopyText}
                className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy Text'}</span>
              </button>
            </div>
            <pre className="text-xs text-slate-700 font-sans whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed bg-white p-2.5 rounded-lg border border-slate-200">
              {messageBody}
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
