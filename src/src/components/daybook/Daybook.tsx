import React, { useState } from 'react';
import { 
  Calendar, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Printer, 
  Search, 
  Plus,
  Edit3,
  Building,
  Share2,
  Paperclip,
  Receipt,
  FileSpreadsheet,
  ArrowRightLeft,
  ArrowLeftRight,
  RotateCcw
} from 'lucide-react';
import { Transaction, Party, BusinessProfile, Firm, BankAccount } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { generateReceiptVoucherPDF } from '../../utils/pdfGenerator';
import { ShareVoucherModal } from '../transactions/ShareVoucherModal';
import { AttachmentViewerModal } from '../common/AttachmentViewerModal';
import { ThermalSlipModal } from '../transactions/ThermalSlipModal';
import { ThermalPrinterManagerModal } from '../printer/ThermalPrinterManagerModal';
import { CollectionImporterModal } from '../importer/CollectionImporterModal';
import { db, updatePartyBalance, updateBankAccountBalances } from '../../db/db';

interface DaybookProps {
  transactions: Transaction[];
  parties: Party[];
  profile: BusinessProfile;
  firms?: Firm[];
  bankAccounts?: BankAccount[];
  initialFirmId?: number | 'ALL';
  onOpenTxModal: (type?: any) => void;
  onEditTx?: (tx: Transaction) => void;
}

export const Daybook: React.FC<DaybookProps> = ({
  transactions,
  parties,
  profile,
  firms = [],
  bankAccounts = [],
  initialFirmId = 'ALL',
  onOpenTxModal,
  onEditTx,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [filterMode, setFilterMode] = useState<string>('ALL');
  const [selectedFirmId, setSelectedFirmId] = useState<number | 'ALL'>(initialFirmId);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [txToShare, setTxToShare] = useState<Transaction | null>(null);
  const [txForThermal, setTxForThermal] = useState<Transaction | null>(null);
  const [isPrinterManagerOpen, setIsPrinterManagerOpen] = useState(false);
  const [isImporterOpen, setIsImporterOpen] = useState(false);
  const [viewingAttachment, setViewingAttachment] = useState<string | null>(null);

  const handleConvertEstimateToSale = async (tx: Transaction) => {
    if (!tx.id) return;
    if (!window.confirm(`Convert Estimate #${tx.voucherNumber} into an official Sale Invoice? This will deduct item stock and post the receivable.`)) {
      return;
    }

    const newVoucher = tx.voucherNumber.replace('EST-', 'INV-');
    await db.transactions.update(tx.id, {
      type: 'SALE',
      voucherNumber: newVoucher,
    });

    if (tx.partyId) {
      await updatePartyBalance(tx.partyId);
    }

    if (tx.items && tx.items.length > 0) {
      for (const line of tx.items) {
        if (line.itemId) {
          const itemRecord = await db.items.get(line.itemId);
          if (itemRecord) {
            await db.items.update(line.itemId, { stockQuantity: itemRecord.stockQuantity - line.quantity });
          }
        }
      }
    }

    alert(`Estimate converted to confirmed Sale Invoice #${newVoucher}!`);
  };

  const activeFirm = selectedFirmId !== 'ALL' ? firms.find((f) => f.id === Number(selectedFirmId)) : undefined;

  const filteredTxs = transactions.filter((tx) => {
    const matchesDate = !selectedDate || tx.date === selectedDate;
    const matchesMode = filterMode === 'ALL' || tx.paymentMode === filterMode;
    const matchesSearch =
      tx.voucherNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.partyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    let matchesFirm = true;
    if (selectedFirmId !== 'ALL') {
      if (tx.firmId !== undefined) {
        matchesFirm = tx.firmId === Number(selectedFirmId);
      } else if (activeFirm && tx.firmName) {
        matchesFirm = tx.firmName.toLowerCase() === activeFirm.name.toLowerCase();
      } else if (activeFirm?.isDefault && !tx.firmName) {
        matchesFirm = true;
      } else {
        matchesFirm = false;
      }
    }

    return matchesDate && matchesMode && matchesSearch && matchesFirm;
  });

  const totalIn = filteredTxs
    .reduce((sum, tx) => {
      if (tx.type === 'PAYMENT_IN') return sum + tx.amount;
      if (tx.type === 'SALE') {
        const paid = tx.paidAmount !== undefined ? tx.paidAmount : (tx.paymentStatus === 'UNPAID' ? 0 : tx.amount);
        return sum + paid;
      }
      return sum;
    }, 0);

  const totalOut = filteredTxs
    .reduce((sum, tx) => {
      if (tx.type === 'PAYMENT_OUT' || tx.type === 'EXPENSE') return sum + tx.amount;
      if (tx.type === 'PURCHASE') {
        const paid = tx.paidAmount !== undefined ? tx.paidAmount : (tx.paymentStatus === 'UNPAID' ? 0 : tx.amount);
        return sum + paid;
      }
      return sum;
    }, 0);

  return (
    <div className="space-y-2.5 sm:space-y-3 pb-16 md:pb-6">
      <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg sm:text-xl font-bold text-slate-800">Daily Cashbook & Daybook</h2>
            {activeFirm && (
              <span className="bg-indigo-100 text-indigo-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase flex items-center gap-1">
                <Building className="w-3 h-3" /> {activeFirm.name}
              </span>
            )}
          </div>
          <p className="text-[11px] sm:text-xs text-slate-500">Day-wise log of Cash In, Online UPI, and Cash Out</p>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {firms && firms.length > 0 && (
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-xl shadow-xs">
              <Building className="w-3.5 h-3.5 text-indigo-600" />
              <select
                value={selectedFirmId}
                onChange={(e) => setSelectedFirmId(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
                className="text-xs font-bold text-slate-800 bg-transparent outline-none cursor-pointer"
              >
                <option value="ALL">🏢 All Firms</option>
                {firms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} {f.isDefault ? '(Main)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => setIsImporterOpen(true)}
            className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
            title="Import collection sheet or paste rows from WhatsApp/Excel"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" />
            <span className="hidden xs:inline">Import</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenTxModal('CONTRA')}
            className="px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
            title="Record Cash Deposit, Withdrawal, or Bank-to-Bank transfer"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-purple-600" />
            <span>Contra</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenTxModal('CREDIT_NOTE')}
            className="px-2.5 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 rounded-xl text-xs font-bold flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
            title="Record Sale Return / Credit Note"
          >
            <RotateCcw className="w-3.5 h-3.5 text-teal-600" />
            <span>Return</span>
          </button>

          <button
            onClick={() => onOpenTxModal('PAYMENT_IN')}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> + Payment In
          </button>
        </div>
      </div>

      {/* 3 Compact Summary Cards - One Single Row on All Screen Sizes */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <div className="bg-white p-2.5 sm:p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1 text-slate-500">
            <span className="text-[10px] sm:text-xs font-bold uppercase truncate">Money In</span>
            <div className="p-1 sm:p-1.5 bg-emerald-50 rounded-lg text-emerald-600 shrink-0">
              <ArrowDownLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="text-sm sm:text-lg md:text-xl font-black text-emerald-600 mt-1 truncate">
            {formatCurrency(totalIn)}
          </div>
        </div>

        <div className="bg-white p-2.5 sm:p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1 text-slate-500">
            <span className="text-[10px] sm:text-xs font-bold uppercase truncate">Money Out</span>
            <div className="p-1 sm:p-1.5 bg-rose-50 rounded-lg text-rose-600 shrink-0">
              <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="text-sm sm:text-lg md:text-xl font-black text-rose-600 mt-1 truncate">
            {formatCurrency(totalOut)}
          </div>
        </div>

        <div className="bg-white p-2.5 sm:p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-1 text-slate-500">
            <span className="text-[10px] sm:text-xs font-bold uppercase truncate">Net Day</span>
            <div className="p-1 sm:p-1.5 bg-blue-50 rounded-lg text-blue-600 shrink-0">
              <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className={`text-sm sm:text-lg md:text-xl font-black mt-1 truncate ${totalIn - totalOut >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>
            {formatCurrency(totalIn - totalOut)}
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-stretch sm:items-center justify-between">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200 shadow-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs font-semibold text-slate-700 bg-transparent outline-none cursor-pointer"
            />
          </div>

          <div className="flex bg-slate-200/80 p-0.5 rounded-xl gap-0.5 overflow-x-auto">
            {['ALL', 'CASH', 'BANK', 'UPI', 'SPLIT'].map((m) => (
              <button
                key={m}
                onClick={() => setFilterMode(m)}
                className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-colors cursor-pointer ${
                  filterMode === m ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by party, voucher, remarks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 bg-white text-xs sm:text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none shadow-xs"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
              <tr>
                <th className="p-3">Time / Date</th>
                <th className="p-3">Voucher #</th>
                <th className="p-3">Firm / Unit</th>
                <th className="p-3">Type & Status</th>
                <th className="p-3">Party / Particulars</th>
                <th className="p-3">Mode & Breakdown</th>
                <th className="p-3 text-right">In (₹)</th>
                <th className="p-3 text-right">Out (₹)</th>
                <th className="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredTxs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400">
                    No transactions recorded for this selection.
                  </td>
                </tr>
              ) : (
                filteredTxs.map((tx) => {
                  const isPositive = tx.type === 'PAYMENT_IN' || tx.type === 'SALE';
                  const party = parties.find((p) => p.id === tx.partyId);
                  const effectiveIn = tx.type === 'PAYMENT_IN' 
                    ? tx.amount 
                    : tx.type === 'SALE' 
                      ? (tx.paidAmount !== undefined ? tx.paidAmount : (tx.paymentStatus === 'UNPAID' ? 0 : tx.amount))
                      : 0;
                  const effectiveOut = (tx.type === 'PAYMENT_OUT' || tx.type === 'EXPENSE')
                    ? tx.amount 
                    : tx.type === 'PURCHASE'
                      ? (tx.paidAmount !== undefined ? tx.paidAmount : (tx.paymentStatus === 'UNPAID' ? 0 : tx.amount))
                      : 0;

                  return (
                    <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 text-slate-500 whitespace-nowrap">{formatDate(tx.date)}</td>
                      <td className="p-3 font-mono font-bold text-slate-800">{tx.voucherNumber}</td>
                      <td className="p-3">
                        <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded text-[10px] font-bold">
                          {tx.firmName || 'Main Firm'}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col gap-1 items-start">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            tx.type === 'PAYMENT_IN' ? 'bg-emerald-100 text-emerald-800' :
                            tx.type === 'SALE' ? 'bg-blue-100 text-blue-800' :
                            tx.type === 'CREDIT_NOTE' ? 'bg-teal-100 text-teal-800' :
                            tx.type === 'DEBIT_NOTE' ? 'bg-orange-100 text-orange-800' :
                            tx.type === 'CONTRA' ? 'bg-purple-100 text-purple-800' :
                            tx.type === 'ESTIMATE' ? 'bg-indigo-100 text-indigo-800' :
                            tx.type === 'PAYMENT_OUT' ? 'bg-rose-100 text-rose-800' :
                            tx.type === 'PURCHASE' ? 'bg-amber-100 text-amber-800' :
                            'bg-slate-100 text-slate-800'
                          }`}>
                            {tx.type === 'ESTIMATE' ? 'Estimate / Kachha' :
                             tx.type === 'CREDIT_NOTE' ? 'Sale Return' :
                             tx.type === 'DEBIT_NOTE' ? 'Purchase Return' :
                             tx.type === 'CONTRA' ? 'Contra Transfer' :
                             tx.type.replace('_', ' ')}
                          </span>
                          {tx.paymentStatus && (tx.type === 'SALE' || tx.type === 'PURCHASE') && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-sm uppercase ${
                              tx.paymentStatus === 'PAID' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                              tx.paymentStatus === 'UNPAID' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                              'bg-amber-50 text-amber-800 border border-amber-200'
                            }`}>
                              {tx.paymentStatus === 'PAID' ? '✓ Paid' :
                               tx.paymentStatus === 'UNPAID' ? '🔴 Udhar (Due)' :
                               `🟡 Part Due (₹${tx.balanceDue})`}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-slate-800">{tx.partyName || 'Self / Expense'}</div>
                        {tx.description && <div className="text-[11px] text-slate-400">{tx.description}</div>}
                        {tx.attachments && tx.attachments.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setViewingAttachment(tx.attachments![0])}
                            className="mt-1 inline-flex items-center gap-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors"
                            title="Click to view attached bill / document"
                          >
                            <Paperclip className="w-3 h-3 text-blue-600" />
                            <span>{tx.attachments.length} {tx.attachments.length === 1 ? 'Bill Photo' : 'Photos'}</span>
                          </button>
                        )}
                      </td>
                      <td className="p-3">
                        {tx.paymentStatus === 'UNPAID' && (tx.type === 'SALE' || tx.type === 'PURCHASE') ? (
                          <span className="bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase">
                            Credit / Udhar
                          </span>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold text-slate-800">{tx.paymentMode}</span>
                            {tx.paymentMode === 'SPLIT' && tx.splitPayment && (
                              <span className="text-[10px] text-slate-500">
                                Cash ₹{tx.splitPayment.cashAmount} / {tx.splitPayment.onlineMode} ₹{tx.splitPayment.onlineAmount}
                              </span>
                            )}
                            {tx.cashDenominations && tx.cashDenominations.totalNotes ? (
                              <span className="text-[10px] font-bold text-emerald-600">
                                💵 {tx.cashDenominations.totalNotes} notes tallied
                              </span>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-right font-bold text-emerald-600">
                        {effectiveIn > 0 ? formatCurrency(effectiveIn) : '-'}
                      </td>
                      <td className="p-3 text-right font-bold text-rose-600">
                        {effectiveOut > 0 ? formatCurrency(effectiveOut) : '-'}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {tx.type === 'ESTIMATE' && (
                            <button
                              type="button"
                              onClick={() => handleConvertEstimateToSale(tx)}
                              className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-bold border border-indigo-200 flex items-center gap-1 cursor-pointer transition-colors shadow-2xs whitespace-nowrap"
                              title="Convert this estimate into confirmed Sale Bill"
                            >
                              <ArrowRightLeft className="w-3 h-3" />
                              <span>To Sale</span>
                            </button>
                          )}
                          <button
                            onClick={() => setTxForThermal(tx)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            title="Print 58mm / 80mm POS Thermal Slip"
                          >
                            <Receipt className="w-4 h-4 text-indigo-600" />
                          </button>
                          <button
                            onClick={() => setTxToShare(tx)}
                            className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                            title="Share Voucher (WhatsApp / SMS / PDF)"
                          >
                            <Share2 className="w-4 h-4 text-emerald-600" />
                          </button>
                          {onEditTx && (
                            <button
                              onClick={() => onEditTx(tx)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                              title="Edit Voucher / Receipt"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => generateReceiptVoucherPDF(tx, party, profile)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="Print / Save Receipt PDF"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Share Voucher Modal */}
      {txToShare && (
        <ShareVoucherModal
          isOpen={Boolean(txToShare)}
          onClose={() => setTxToShare(null)}
          transaction={txToShare}
          party={parties.find((p) => p.id === txToShare.partyId)}
          profile={profile}
        />
      )}

      {/* Attachment Fullscreen Viewer Lightbox */}
      <AttachmentViewerModal
        isOpen={Boolean(viewingAttachment)}
        onClose={() => setViewingAttachment(null)}
        imageUrl={viewingAttachment || undefined}
        title="Voucher Document / Bill Photo"
      />

      {/* POS Thermal Slip Modal */}
      {txForThermal && (
        <ThermalSlipModal
          isOpen={Boolean(txForThermal)}
          onClose={() => setTxForThermal(null)}
          transaction={txForThermal}
          party={parties.find((p) => p.id === txForThermal.partyId)}
          profile={profile}
          onOpenPrinterManager={() => setIsPrinterManagerOpen(true)}
        />
      )}

      {/* Daily Collection Sheet Batch Importer */}
      {isImporterOpen && (
        <CollectionImporterModal
          isOpen={isImporterOpen}
          onClose={() => setIsImporterOpen(false)}
          parties={parties}
          firms={firms}
          bankAccounts={bankAccounts}
        />
      )}

      {/* Bluetooth / USB Thermal Printer Manager Modal */}
      <ThermalPrinterManagerModal
        isOpen={isPrinterManagerOpen}
        onClose={() => setIsPrinterManagerOpen(false)}
      />
    </div>
  );
};
