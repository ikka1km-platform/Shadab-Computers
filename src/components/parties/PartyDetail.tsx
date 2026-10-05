import React, { useState, useMemo } from 'react';
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
import { Party, Transaction, BusinessProfile, BankAccount, Firm } from '../../types';
import { formatCurrency, formatDate, compareTransactionsAsc, compareTransactionsDesc } from '../../utils/formatters';
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
  firms?: Firm[];
  onBack: () => void;
  onEditParty: (party: Party) => void;
  onDeleteParty?: (partyId: number) => Promise<void> | void;
  onOpenTxModal: (type: any, partyId?: number) => void;
  onEditTx?: (tx: Transaction) => void;
  onDeleteTx?: (txId: number) => Promise<void> | void;
  onOpenSettings?: () => void;
}

export const PartyDetail: React.FC<PartyDetailProps> = ({
  party,
  transactions,
  profile,
  bankAccounts = [],
  firms = [],
  onBack,
  onEditParty,
  onDeleteParty,
  onOpenTxModal,
  onEditTx,
  onDeleteTx,
  onOpenSettings,
}) => {
  const [isReminderOpen, setIsReminderOpen] = useState(false);
  const [voucherToShare, setVoucherToShare] = useState<Transaction | null>(null);
  const [txForThermal, setTxForThermal] = useState<Transaction | null>(null);
  const [viewingAttachments, setViewingAttachments] = useState<{ attachments: string[]; title: string } | null>(null);
  const [sortOrder, setSortOrder] = useState<'NEWEST_FIRST' | 'OLDEST_FIRST'>('NEWEST_FIRST');

  // Sort chronological (oldest-to-newest) to compute mathematically accurate running balance
  const chronologicalTxs = useMemo(() => {
    return transactions
      .filter((tx) => tx.partyId === party.id)
      .sort(compareTransactionsAsc);
  }, [transactions, party.id]);

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
    generatePartyStatementPDF(party, chronologicalTxs, profile);
  };

  const ledgerRows = useMemo(() => {
    let running = party.openingBalance;
    return chronologicalTxs.map((tx) => {
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
  }, [chronologicalTxs, party.openingBalance, party.partyType]);

  const displayLedgerRows = useMemo(() => {
    return sortOrder === 'NEWEST_FIRST' ? [...ledgerRows].reverse() : ledgerRows;
  }, [ledgerRows, sortOrder]);

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
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg md:text-xl font-bold text-slate-800">{party.name}</h2>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                party.partyType === 'CUSTOMER' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
              }`}>
                {party.partyType}
              </span>
              {party.firmName && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                  🏢 {party.firmName}
                </span>
              )}
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
            <div className="flex items-center justify-between gap-2 text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-100 sm:col-span-1">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-emerald-600 shrink-0" />
                {party.phone ? (
                  <a
                    href={`tel:${party.phone}`}
                    className="text-blue-600 hover:text-blue-800 font-semibold underline flex items-center gap-1.5"
                    title={`Tap to call ${party.phone}`}
                  >
                    <span>{party.phone}</span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      Call 📞
                    </span>
                  </a>
                ) : (
                  <span className="text-slate-400">No phone recorded</span>
                )}
              </div>
              {party.phone && (
                <a
                  href={`tel:${party.phone}`}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-bold flex items-center gap-1 transition-colors shadow-xs"
                  title="Direct Call via Phone App"
                >
                  <Phone className="w-3 h-3" /> Call
                </a>
              )}
            </div>
            <div className="flex items-center gap-2 text-slate-700 p-2">
              <Hash className="w-4 h-4 text-slate-400 shrink-0" />
              <span>GSTIN: <span className="font-semibold">{party.gstin || 'Unregistered'}</span></span>
            </div>
            <div className="flex items-start gap-2 text-slate-700 sm:col-span-2 px-2">
              <MapPin className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
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
                <th className="p-3">
                  <button
                    type="button"
                    onClick={() => setSortOrder((prev) => (prev === 'NEWEST_FIRST' ? 'OLDEST_FIRST' : 'NEWEST_FIRST'))}
                    className="flex items-center gap-1.5 font-bold uppercase hover:text-blue-600 transition-colors cursor-pointer"
                    title="Click to toggle sorting (Latest on Top vs Oldest on Top)"
                  >
                    <span>Date</span>
                    <span className="text-[10px] font-black text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-sm">
                      {sortOrder === 'NEWEST_FIRST' ? '↓ Latest' : '↑ Oldest'}
                    </span>
                  </button>
                </th>
                <th className="p-3">Voucher Type & Details</th>
                <th className="p-3">Mode</th>
                <th className="p-3 text-right">Debit (+)</th>
                <th className="p-3 text-right">Credit (-)</th>
                <th className="p-3 text-right">Balance</th>
                <th className="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {sortOrder === 'OLDEST_FIRST' && (
                <tr className="bg-slate-50/70">
                  <td className="p-3 text-slate-400">{formatDate(party.createdAt)}</td>
                  <td className="p-3 font-semibold text-slate-800">
                    <span className="flex items-center gap-1.5">
                      <span>Opening Balance</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded-sm">Baseline</span>
                    </span>
                  </td>
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
              )}

              {displayLedgerRows.map((row) => (
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
                      {onDeleteTx && row.tx.id && (
                        <button
                          onClick={() => {
                            if (window.confirm(`Delete voucher ${row.tx.voucherNumber || row.tx.type} for ₹${row.tx.amount}?`)) {
                              onDeleteTx(row.tx.id!);
                            }
                          }}
                          title="Delete Transaction Voucher"
                          className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5 inline" />
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

              {sortOrder === 'NEWEST_FIRST' && (
                <tr className="bg-slate-50/70">
                  <td className="p-3 text-slate-400">{formatDate(party.createdAt)}</td>
                  <td className="p-3 font-semibold text-slate-800">
                    <span className="flex items-center gap-1.5">
                      <span>Opening Balance</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded-sm">Baseline</span>
                    </span>
                  </td>
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
              )}
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
          firms={firms}
          onOpenSettings={onOpenSettings}
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
