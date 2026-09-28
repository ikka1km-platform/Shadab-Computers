import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Phone, 
  MapPin, 
  Hash, 
  FileDown, 
  Printer, 
  Edit3,
  MessageCircle,
  Paperclip,
  Share2,
  BellRing,
  Receipt,
  Trash2
} from 'lucide-react';
import { Party, Transaction, BusinessProfile, BankAccount } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { generatePartyStatementPDF, generateReceiptVoucherPDF } from '../../utils/pdfGenerator';
import { PaymentReminderModal } from '../reminders/PaymentReminderModal';
import { ShareVoucherModal } from '../transactions/ShareVoucherModal';
import { AttachmentViewerModal } from '../common/AttachmentViewerModal';
import { ThermalSlipModal } from '../transactions/ThermalSlipModal';

interface PartyDetailProps {
  party: Party;
  transactions: Transaction[];
  profile: BusinessProfile;
  bankAccounts?: BankAccount[];
  onBack: () => void;
  onEditParty: (party: Party) => void;
  onDeleteParty?: (partyId: number) => Promise<void> | void;
  onOpenTxModal: (type: any, partyId?: number) => void;
  onEditTx?: (tx: Transaction) => void;
}

export const PartyDetail: React.FC<PartyDetailProps> = ({
  party,
  transactions,
  profile,
  bankAccounts = [],
  onBack,
  onEditParty,
  onDeleteParty,
  onOpenTxModal,
  onEditTx,
}) => {
  const [isReminderOpen, setIsReminderOpen] = useState(false);
  const [voucherToShare, setVoucherToShare] = useState<Transaction | null>(null);
  const [txForThermal, setTxForThermal] = useState<Transaction | null>(null);
  const [viewingAttachments, setViewingAttachments] = useState<{ attachments: string[]; title: string } | null>(null);

  const partyTxs = transactions
    .filter((tx) => tx.partyId === party.id)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const isReceivable = party.currentBalance > 0;
  const isPayable = party.currentBalance < 0;

  const handleShareWhatsApp = () => {
    const balanceText = isReceivable
      ? `Dear ${party.name}, gentle reminder that your pending balance with ${profile.businessName} is ${formatCurrency(party.currentBalance)}. Kindly clear the dues at your earliest convenience.`
      : `Dear ${party.name}, your account statement with ${profile.businessName} is updated. Current balance is ${formatCurrency(Math.abs(party.currentBalance))}.`;

    const encoded = encodeURIComponent(balanceText);
    const phoneClean = party.phone?.replace(/[^0-9]/g, '');
    const url = phoneClean
      ? `https://wa.me/${phoneClean.startsWith('91') ? phoneClean : '91' + phoneClean}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank');
  };

  const handleDownloadPDF = () => {
    generatePartyStatementPDF(party, partyTxs, profile);
  };

  let running = party.openingBalance;
  const ledgerRows = partyTxs.map((tx) => {
    let debit = 0;
    let credit = 0;
    const paidOnSpot = tx.paidAmount !== undefined ? tx.paidAmount : (tx.paymentStatus === 'PAID' ? tx.amount : 0);

    if (party.partyType === 'CUSTOMER') {
      if (tx.type === 'SALE') {
        const netDue = tx.amount - paidOnSpot;
        debit = tx.amount;
        credit = paidOnSpot;
        running += netDue;
      } else if (tx.type === 'PAYMENT_IN') {
        credit = tx.amount;
        running -= tx.amount;
      }
    } else {
      if (tx.type === 'PURCHASE') {
        const netDue = tx.amount - paidOnSpot;
        credit = tx.amount;
        debit = paidOnSpot;
        running -= netDue;
      } else if (tx.type === 'PAYMENT_OUT') {
        debit = tx.amount;
        running += tx.amount;
      }
    }

    return {
      tx,
      debit,
      credit,
      runningBalance: running,
    };
  });

  return (
    <div className="space-y-5 pb-16 md:pb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg md:text-xl font-bold text-slate-800">{party.name}</h2>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                party.partyType === 'CUSTOMER' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
              }`}>
                {party.partyType}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">Code: {party.accountCode}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isReceivable && (
            <button
              onClick={() => setIsReminderOpen(true)}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              title="Send WhatsApp Payment Reminder with direct UPI link"
            >
              <BellRing className="w-4 h-4" /> Remind (UPI)
            </button>
          )}
          <button
            onClick={() => onEditParty(party)}
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
          >
            <Edit3 className="w-3.5 h-3.5" /> Edit
          </button>
          <button
            onClick={handleShareWhatsApp}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
          >
            <MessageCircle className="w-4 h-4 text-emerald-600" /> WhatsApp
          </button>
          <button
            onClick={handleDownloadPDF}
            className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <FileDown className="w-4 h-4" /> Statement PDF
          </button>
          {onDeleteParty && (
            <button
              type="button"
              onClick={() => onDeleteParty(party.id!)}
              className="px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-rose-200"
              title="Delete this party"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Party
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase">Current Ledger Balance</span>
          <div className="my-2">
            <div className={`text-2xl font-black ${
              isReceivable ? 'text-emerald-600' : isPayable ? 'text-rose-600' : 'text-slate-800'
            }`}>
              {formatCurrency(Math.abs(party.currentBalance))}
            </div>
            <span className={`text-xs font-bold mt-1 inline-block ${
              isReceivable ? 'text-emerald-700' : isPayable ? 'text-rose-700' : 'text-slate-500'
            }`}>
              {isReceivable ? "You'll Receive (Debit)" : isPayable ? "You'll Pay (Credit)" : 'Settled Balance'}
            </span>
          </div>

          <div className="flex gap-2 pt-2 border-t border-slate-100">
            {party.partyType === 'CUSTOMER' ? (
              <>
                <button
                  onClick={() => onOpenTxModal('PAYMENT_IN', party.id)}
                  className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors"
                >
                  + Receive Money
                </button>
                <button
                  onClick={() => onOpenTxModal('SALE', party.id)}
                  className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors"
                >
                  + Add Sale
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => onOpenTxModal('PAYMENT_OUT', party.id)}
                  className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors"
                >
                  + Pay Money
                </button>
                <button
                  onClick={() => onOpenTxModal('PURCHASE', party.id)}
                  className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors"
                >
                  + Add Bill
                </button>
              </>
            )}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs md:col-span-2 space-y-2">
          <span className="text-xs font-semibold text-slate-500 uppercase">Contact & Address</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
            <div className="flex items-center gap-2 text-slate-700">
              <Phone className="w-4 h-4 text-slate-400" />
              <span>{party.phone || 'No phone recorded'}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-700">
              <Hash className="w-4 h-4 text-slate-400" />
              <span>GSTIN: {party.gstin || 'Unregistered'}</span>
            </div>
            <div className="flex items-start gap-2 text-slate-700 sm:col-span-2">
              <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
              <span>{party.address || 'No address provided'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm">Ledger Entries & History</h3>
          <span className="text-xs text-slate-400">{ledgerRows.length + 1} Total Records</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Voucher Type & Details</th>
                <th className="p-3">Mode</th>
                <th className="p-3 text-right">Debit (+)</th>
                <th className="p-3 text-right">Credit (-)</th>
                <th className="p-3 text-right">Balance</th>
                <th className="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              <tr className="bg-slate-50/50">
                <td className="p-3 text-slate-400">{formatDate(party.createdAt)}</td>
                <td className="p-3 font-semibold text-slate-800">Opening Balance</td>
                <td className="p-3 text-slate-400">-</td>
                <td className="p-3 text-right text-emerald-600 font-semibold">
                  {party.openingBalance > 0 ? formatCurrency(party.openingBalance) : '-'}
                </td>
                <td className="p-3 text-right text-rose-600 font-semibold">
                  {party.openingBalance < 0 ? formatCurrency(Math.abs(party.openingBalance)) : '-'}
                </td>
                <td className="p-3 text-right font-bold text-slate-900">
                  {formatCurrency(party.openingBalance)}
                </td>
                <td className="p-3 text-center text-slate-300">-</td>
              </tr>

              {ledgerRows.map((row) => (
                <tr key={row.tx.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3 text-slate-500 whitespace-nowrap">{formatDate(row.tx.date)}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-800">
                        {row.tx.voucherNumber} ({row.tx.type.replace('_', ' ')})
                      </span>
                      {row.tx.paymentStatus && (row.tx.type === 'SALE' || row.tx.type === 'PURCHASE') && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-sm uppercase ${
                          row.tx.paymentStatus === 'PAID' ? 'bg-emerald-100 text-emerald-800' :
                          row.tx.paymentStatus === 'UNPAID' ? 'bg-rose-100 text-rose-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {row.tx.paymentStatus === 'PAID' ? '✓ Paid' :
                           row.tx.paymentStatus === 'UNPAID' ? '🔴 Due (Udhar)' :
                           `🟡 Part Paid (Due ₹${row.tx.balanceDue})`}
                        </span>
                      )}
                    </div>
                    {row.tx.description && (
                      <div className="text-[11px] text-slate-400 truncate max-w-xs">{row.tx.description}</div>
                    )}
                  </td>
                  <td className="p-3">
                    <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase">
                      {row.tx.paymentMode}
                    </span>
                  </td>
                  <td className="p-3 text-right text-emerald-600 font-semibold">
                    {row.debit > 0 ? formatCurrency(row.debit) : '-'}
                  </td>
                  <td className="p-3 text-right text-rose-600 font-semibold">
                    {row.credit > 0 ? formatCurrency(row.credit) : '-'}
                  </td>
                  <td className="p-3 text-right font-bold text-slate-900">
                    {formatCurrency(row.runningBalance)}
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {row.tx.attachments && row.tx.attachments.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setViewingAttachments({
                            attachments: row.tx.attachments!,
                            title: `${row.tx.voucherNumber} Attachments`
                          })}
                          title={`View ${row.tx.attachments.length} attachment(s)`}
                          className="p-1 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded transition-colors cursor-pointer flex items-center gap-0.5"
                        >
                          <Paperclip className="w-3.5 h-3.5" />
                          <span className="text-[10px] font-bold">{row.tx.attachments.length}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setTxForThermal(row.tx)}
                        title="Print 58mm / 80mm POS Thermal Slip"
                        className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors cursor-pointer"
                      >
                        <Receipt className="w-3.5 h-3.5 text-indigo-600" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setVoucherToShare(row.tx)}
                        title="Share Voucher (WhatsApp / Print / SMS)"
                        className="p-1 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded transition-colors cursor-pointer"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>
                      {onEditTx && (
                        <button
                          onClick={() => onEditTx(row.tx)}
                          title="Edit Transaction Voucher"
                          className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5 inline" />
                        </button>
                      )}
                      <button
                        onClick={() => generateReceiptVoucherPDF(row.tx, party, profile)}
                        title="Print Voucher Receipt"
                        className="p-1 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5 inline" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isReminderOpen && (
        <PaymentReminderModal
          isOpen={isReminderOpen}
          onClose={() => setIsReminderOpen(false)}
          party={party}
          profile={profile}
          bankAccounts={bankAccounts}
        />
      )}

      {voucherToShare && (
        <ShareVoucherModal
          isOpen={Boolean(voucherToShare)}
          onClose={() => setVoucherToShare(null)}
          transaction={voucherToShare}
          party={party}
          profile={profile}
        />
      )}

      {txForThermal && (
        <ThermalSlipModal
          isOpen={Boolean(txForThermal)}
          onClose={() => setTxForThermal(null)}
          transaction={txForThermal}
          party={party}
          profile={profile}
        />
      )}

      {viewingAttachments && (
        <AttachmentViewerModal
          isOpen={Boolean(viewingAttachments)}
          onClose={() => setViewingAttachments(null)}
          attachments={viewingAttachments.attachments}
          title={viewingAttachments.title}
        />
      )}
    </div>
  );
};
