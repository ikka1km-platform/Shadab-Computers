import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Calculator, 
  FileDown, 
  Coins, 
  Building,
  CheckCircle2,
  FileSpreadsheet,
  Share2,
  Image,
  Loader2
} from 'lucide-react';
import { Transaction, BusinessProfile, DenominationBreakdown, Firm } from '../../types';
import { formatCurrency, formatDate, numberToWordsINR } from '../../utils/formatters';
import { generateDailyDenominationPDF } from '../../utils/pdfGenerator';
import { generateDenominationJPEG, shareDenominationJPEG, downloadBlob } from '../../utils/imageGenerator';

interface DenominationReportProps {
  transactions: Transaction[];
  profile: BusinessProfile;
  firms?: Firm[];
  initialFirmId?: number | 'ALL';
  onSelectFirm?: (firmId: number | 'ALL') => void;
}

export const DenominationReport: React.FC<DenominationReportProps> = ({
  transactions,
  profile,
  firms = [],
  initialFirmId = 'ALL',
  onSelectFirm,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [selectedFirmId, setSelectedFirmId] = useState<number | 'ALL'>(initialFirmId);
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    if (initialFirmId !== undefined) {
      setSelectedFirmId(initialFirmId);
    }
  }, [initialFirmId]);

  const handleFirmChange = (val: number | 'ALL') => {
    setSelectedFirmId(val);
    if (onSelectFirm) onSelectFirm(val);
  };

  const activeFirm = selectedFirmId !== 'ALL' 
    ? firms.find((f) => f.id === Number(selectedFirmId)) 
    : undefined;

  // Filter all cash-bearing transactions on the selected date across all firms
  const allDayCashTxs = transactions.filter((tx) => {
    const isDateMatch = tx.date === selectedDate;
    const isUnpaid = tx.paymentStatus === 'UNPAID' && (tx.type === 'SALE' || tx.type === 'PURCHASE');
    const hasCash = !isUnpaid && (
      tx.paymentMode === 'CASH' || 
      (tx.paymentMode === 'SPLIT' && (tx.splitPayment?.cashAmount || 0) > 0)
    );
    return isDateMatch && hasCash;
  });

  // Calculate cash collection for each firm for quick summary pills
  const getFirmCashTotal = (fId: number | 'ALL') => {
    if (fId === 'ALL') {
      return allDayCashTxs.reduce((sum, tx) => {
        const val = tx.paymentMode === 'SPLIT' && tx.splitPayment 
          ? tx.splitPayment.cashAmount 
          : (tx.paidAmount !== undefined ? tx.paidAmount : tx.amount);
        return sum + val;
      }, 0);
    }
    const targetFirm = firms.find((f) => f.id === fId);
    return allDayCashTxs
      .filter((tx) => {
        if (tx.firmId !== undefined) return tx.firmId === fId;
        if (targetFirm && tx.firmName) return tx.firmName.toLowerCase() === targetFirm.name.toLowerCase();
        if (targetFirm?.isDefault && !tx.firmName) return true;
        return false;
      })
      .reduce((sum, tx) => {
        const val = tx.paymentMode === 'SPLIT' && tx.splitPayment 
          ? tx.splitPayment.cashAmount 
          : (tx.paidAmount !== undefined ? tx.paidAmount : tx.amount);
        return sum + val;
      }, 0);
  };

  const getFirmReceiptCount = (fId: number | 'ALL') => {
    if (fId === 'ALL') return allDayCashTxs.length;
    const targetFirm = firms.find((f) => f.id === fId);
    return allDayCashTxs.filter((tx) => {
      if (tx.firmId !== undefined) return tx.firmId === fId;
      if (targetFirm && tx.firmName) return tx.firmName.toLowerCase() === targetFirm.name.toLowerCase();
      if (targetFirm?.isDefault && !tx.firmName) return true;
      return false;
    }).length;
  };

  // Filter transactions specifically for the selected firm (or ALL)
  const dayCashTxs = allDayCashTxs.filter((tx) => {
    if (selectedFirmId === 'ALL') return true;
    if (tx.firmId !== undefined) return tx.firmId === Number(selectedFirmId);
    if (activeFirm && tx.firmName) return tx.firmName.toLowerCase() === activeFirm.name.toLowerCase();
    if (activeFirm?.isDefault && !tx.firmName) return true;
    return false;
  });

  // Aggregate note denominations across receipts on this date for the chosen firm
  const aggregatedDenoms: DenominationBreakdown = {
    c500: 0,
    c200: 0,
    c100: 0,
    c50: 0,
    c20: 0,
    c10: 0,
    c5: 0,
    coins: 0,
    totalNotes: 0,
    totalAmount: 0,
  };

  dayCashTxs.forEach((tx) => {
    if (tx.cashDenominations) {
      const cd = tx.cashDenominations;
      aggregatedDenoms.c500 = (aggregatedDenoms.c500 || 0) + (cd.c500 || 0);
      aggregatedDenoms.c200 = (aggregatedDenoms.c200 || 0) + (cd.c200 || 0);
      aggregatedDenoms.c100 = (aggregatedDenoms.c100 || 0) + (cd.c100 || 0);
      aggregatedDenoms.c50 = (aggregatedDenoms.c50 || 0) + (cd.c50 || 0);
      aggregatedDenoms.c20 = (aggregatedDenoms.c20 || 0) + (cd.c20 || 0);
      aggregatedDenoms.c10 = (aggregatedDenoms.c10 || 0) + (cd.c10 || 0);
      aggregatedDenoms.c5 = (aggregatedDenoms.c5 || 0) + (cd.c5 || 0);
      aggregatedDenoms.coins = (aggregatedDenoms.coins || 0) + (cd.coins || 0);
    } else {
      // If a cash transaction didn't have explicit note entry, count actual paid cash amount as loose cash
      const cashVal = tx.paymentMode === 'SPLIT' && tx.splitPayment
        ? tx.splitPayment.cashAmount
        : (tx.paidAmount !== undefined ? tx.paidAmount : tx.amount);
      aggregatedDenoms.coins = (aggregatedDenoms.coins || 0) + cashVal;
    }
  });

  aggregatedDenoms.totalNotes =
    (aggregatedDenoms.c500 || 0) +
    (aggregatedDenoms.c200 || 0) +
    (aggregatedDenoms.c100 || 0) +
    (aggregatedDenoms.c50 || 0) +
    (aggregatedDenoms.c20 || 0) +
    (aggregatedDenoms.c10 || 0) +
    (aggregatedDenoms.c5 || 0);

  aggregatedDenoms.totalAmount =
    (aggregatedDenoms.c500 || 0) * 500 +
    (aggregatedDenoms.c200 || 0) * 200 +
    (aggregatedDenoms.c100 || 0) * 100 +
    (aggregatedDenoms.c50 || 0) * 50 +
    (aggregatedDenoms.c20 || 0) * 20 +
    (aggregatedDenoms.c10 || 0) * 10 +
    (aggregatedDenoms.c5 || 0) * 5 +
    (aggregatedDenoms.coins || 0);

  const denomRows = [
    { label: '₹500 Notes', val: 500, count: aggregatedDenoms.c500 || 0, subtotal: (aggregatedDenoms.c500 || 0) * 500, color: 'bg-stone-50 border-stone-200 text-stone-900' },
    { label: '₹200 Notes', val: 200, count: aggregatedDenoms.c200 || 0, subtotal: (aggregatedDenoms.c200 || 0) * 200, color: 'bg-amber-50 border-amber-200 text-amber-900' },
    { label: '₹100 Notes', val: 100, count: aggregatedDenoms.c100 || 0, subtotal: (aggregatedDenoms.c100 || 0) * 100, color: 'bg-indigo-50 border-indigo-200 text-indigo-900' },
    { label: '₹50 Notes', val: 50, count: aggregatedDenoms.c50 || 0, subtotal: (aggregatedDenoms.c50 || 0) * 50, color: 'bg-cyan-50 border-cyan-200 text-cyan-900' },
    { label: '₹20 Notes', val: 20, count: aggregatedDenoms.c20 || 0, subtotal: (aggregatedDenoms.c20 || 0) * 20, color: 'bg-orange-50 border-orange-200 text-orange-900' },
    { label: '₹10 Notes', val: 10, count: aggregatedDenoms.c10 || 0, subtotal: (aggregatedDenoms.c10 || 0) * 10, color: 'bg-emerald-50 border-emerald-200 text-emerald-900' },
    { label: '₹5 Notes', val: 5, count: aggregatedDenoms.c5 || 0, subtotal: (aggregatedDenoms.c5 || 0) * 5, color: 'bg-slate-50 border-slate-200 text-slate-900' },
    { label: 'Coins (₹)', val: 1, count: '-', subtotal: aggregatedDenoms.coins || 0, color: 'bg-yellow-50 border-yellow-200 text-yellow-900', isCoin: true },
  ];

  const firmDisplayName = activeFirm ? activeFirm.name : 'All Firms (Consolidated)';

  // PDF Download Handler
  const handleDownloadPDF = () => {
    generateDailyDenominationPDF(
      selectedDate, 
      aggregatedDenoms, 
      dayCashTxs, 
      profile,
      firmDisplayName
    );
  };

  // JPG / JPEG Native Share Handler
  const handleShareJPG = async () => {
    setIsSharing(true);
    try {
      const result = await shareDenominationJPEG({
        selectedDate,
        totalDenoms: aggregatedDenoms,
        cashTransactions: dayCashTxs,
        profile,
        firmName: firmDisplayName,
      });

      if (result.downloaded) {
        setToastMsg(`✅ ${firmDisplayName} Note Re-Tally sheet saved as JPG image!`);
        setTimeout(() => setToastMsg(null), 4000);
      } else if (result.shared) {
        setToastMsg(`✅ Shared note demonstration sheet for ${firmDisplayName}!`);
        setTimeout(() => setToastMsg(null), 4000);
      }
    } catch (err) {
      console.error(err);
      alert('Unable to share image. Please try again.');
    } finally {
      setIsSharing(false);
    }
  };

  // Direct JPG / JPEG Download Handler
  const handleDownloadJPG = async () => {
    setIsSharing(true);
    try {
      const { dataUrl, filename } = await generateDenominationJPEG({
        selectedDate,
        totalDenoms: aggregatedDenoms,
        cashTransactions: dayCashTxs,
        profile,
        firmName: firmDisplayName,
      });
      downloadBlob(dataUrl, filename);
      setToastMsg(`✅ Saved ${filename} as JPG!`);
      setTimeout(() => setToastMsg(null), 4000);
    } catch (err) {
      console.error(err);
      alert('Failed to generate JPG image.');
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="space-y-5 pb-16 md:pb-6 relative">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-20 right-6 z-50 bg-slate-900 text-white text-xs font-bold px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Header & Date/Firm Selectors */}
      <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-slate-800">Daily Cash Denomination & Re-Tally Report</h2>
            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase">
              Bank Slip Ready
            </span>
            {activeFirm && (
              <span className="bg-indigo-100 text-indigo-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase flex items-center gap-1">
                <Building className="w-3 h-3" /> {activeFirm.name}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Check exact physical currency note piece counts (₹500, ₹200, ₹100...) received for each firm on any date
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Firm Selector Dropdown */}
          {firms && firms.length > 0 && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl shadow-xs">
              <Building className="w-4 h-4 text-indigo-600" />
              <select
                value={selectedFirmId}
                onChange={(e) => handleFirmChange(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
                className="text-xs font-bold text-slate-800 bg-transparent outline-none cursor-pointer"
              >
                <option value="ALL">🏢 All Firms (Consolidated)</option>
                {firms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} {f.isDefault ? '(Main)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Date Picker */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl shadow-xs">
            <Calendar className="w-4 h-4 text-blue-600" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs font-bold text-slate-800 bg-transparent outline-none cursor-pointer"
            />
          </div>

          {/* Top Share JPG Action Switch */}
          <button
            onClick={handleShareJPG}
            disabled={isSharing || dayCashTxs.length === 0}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-50"
            title="Share Note Demonstration Sheet with Firm Name as JPG image"
          >
            {isSharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
            <span>Share JPG</span>
          </button>

          {/* Download PDF Slip Button */}
          <button
            onClick={handleDownloadPDF}
            disabled={dayCashTxs.length === 0}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-all cursor-pointer disabled:opacity-50"
            title="Download Bank Cash Deposit Slip PDF"
          >
            <FileDown className="w-4 h-4" /> 
            <span className="hidden sm:inline">Deposit Slip PDF</span>
          </button>
        </div>
      </div>

      {/* Quick Firm Filter Pills / Summary Strip */}
      {firms && firms.length > 1 && (
        <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200 flex items-center gap-2 overflow-x-auto">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider pl-2 whitespace-nowrap flex items-center gap-1.5">
            <Building className="w-3.5 h-3.5 text-slate-400" /> Switch Firm:
          </span>

          <button
            onClick={() => handleFirmChange('ALL')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              selectedFirmId === 'ALL'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <span>All Firms Consolidated</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
              selectedFirmId === 'ALL' ? 'bg-blue-700 text-blue-100' : 'bg-slate-100 text-slate-600'
            }`}>
              {formatCurrency(getFirmCashTotal('ALL'))}
            </span>
          </button>

          {firms.map((f) => {
            const isSelected = selectedFirmId === f.id;
            const firmCash = getFirmCashTotal(f.id!);
            const firmReceipts = getFirmReceiptCount(f.id!);
            return (
              <button
                key={f.id}
                onClick={() => handleFirmChange(f.id!)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span>{f.name}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                  isSelected ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-100 text-slate-600'
                }`}>
                  {formatCurrency(firmCash)} ({firmReceipts} rx)
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* 3 Top Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
              {activeFirm ? `${activeFirm.name} Physical Cash` : 'Total Cash to Deposit (All)'}
            </span>
            <Coins className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700 mt-1">
            {formatCurrency(aggregatedDenoms.totalAmount || 0)}
          </div>
          <p className="text-[11px] text-emerald-800/80 mt-1">
            {numberToWordsINR(aggregatedDenoms.totalAmount || 0)}
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-800 uppercase tracking-wider">
              Total Currency Notes Counted
            </span>
            <Calculator className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-blue-700 mt-1">
            {aggregatedDenoms.totalNotes} Pieces
          </div>
          <p className="text-[11px] text-blue-800/80 mt-1">
            Loose coins: {formatCurrency(aggregatedDenoms.coins || 0)}
          </p>
        </div>

        <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Cash Receipts Count
            </span>
            <FileSpreadsheet className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-white mt-1">
            {dayCashTxs.length} Receipts
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {activeFirm ? `Logged under ${activeFirm.name}` : 'Logged across all business firms'} on {formatDate(selectedDate)}
          </p>
        </div>
      </div>

      {/* Denomination Re-Tally Grid with Dedicated Share JPG Switch */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 flex-wrap">
              <span>Currency Denomination Sheet (Re-Tally)</span>
              {activeFirm ? (
                <span className="bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full text-[11px] font-bold border border-indigo-200 flex items-center gap-1">
                  <Building className="w-3 h-3" /> {activeFirm.name}
                </span>
              ) : (
                <span className="bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full text-[11px] font-bold">
                  All Firms Consolidated
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400">Exact piece count per currency note for counter verification and bank deposit</p>
          </div>

          {/* Action Switch Toolbar right at the Re-Tally table */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Share Switch */}
            <button
              onClick={handleShareJPG}
              disabled={isSharing || dayCashTxs.length === 0}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
              title="Share note demonstration with firm name as JPG image on WhatsApp / Apps"
            >
              {isSharing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
              <span>Share JPG</span>
            </button>

            {/* Save JPG File */}
            <button
              onClick={handleDownloadJPG}
              disabled={isSharing || dayCashTxs.length === 0}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
              title="Download high-resolution JPG image file"
            >
              <Image className="w-3.5 h-3.5 text-slate-600" />
              <span>Save JPG</span>
            </button>

            {/* Date Badge */}
            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
              {formatDate(selectedDate)}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
              <tr>
                <th className="p-3.5">Denomination Value</th>
                <th className="p-3.5 text-center">Piece / Note Count</th>
                <th className="p-3.5 text-right">Calculated Subtotal (₹)</th>
                <th className="p-3.5 text-right">Share of Cash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {denomRows.map((row) => {
                const totalAmt = aggregatedDenoms.totalAmount || 1;
                const percentage = totalAmt > 0 ? ((row.subtotal / totalAmt) * 100).toFixed(1) : '0.0';
                return (
                  <tr key={row.label} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3.5 flex items-center gap-2.5 font-bold text-slate-800">
                      <span className={`w-8 h-6 rounded flex items-center justify-center text-[10px] font-black border ${row.color}`}>
                        {row.val === 1 ? 'COIN' : `₹${row.val}`}
                      </span>
                      <span>{row.label}</span>
                    </td>
                    <td className="p-3.5 text-center font-mono font-bold text-sm text-slate-800">
                      {row.count}
                    </td>
                    <td className="p-3.5 text-right font-black text-sm text-emerald-700">
                      {formatCurrency(row.subtotal)}
                    </td>
                    <td className="p-3.5 text-right text-slate-400 text-xs">
                      {percentage}%
                    </td>
                  </tr>
                );
              })}

              {/* Total Summary Row */}
              <tr className="bg-emerald-50/70 border-t-2 border-emerald-300 font-black text-slate-900">
                <td className="p-4 text-emerald-950 text-sm font-black">
                  GRAND TOTAL CASH ({activeFirm ? activeFirm.name : 'ALL FIRMS'})
                </td>
                <td className="p-4 text-center font-mono text-base text-emerald-950 font-black">
                  {aggregatedDenoms.totalNotes} Notes
                </td>
                <td className="p-4 text-right text-base text-emerald-700 font-black">
                  {formatCurrency(aggregatedDenoms.totalAmount || 0)}
                </td>
                <td className="p-4 text-right text-emerald-800">100.0%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer Receipt Breakdown Log */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Receipt-Wise Customer Note Ledger</h3>
            <p className="text-xs text-slate-400">
              Customer receipts and note breakdowns for {activeFirm ? activeFirm.name : 'all firms'} on {formatDate(selectedDate)}
            </p>
          </div>
          <span className="text-xs text-slate-500 font-semibold">{dayCashTxs.length} Cash Receipts</span>
        </div>

        {dayCashTxs.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            No cash receipts recorded on {formatDate(selectedDate)} {activeFirm ? `under ${activeFirm.name}` : ''}.
            <br />
            Select another date or switch firm filter above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="p-3">Voucher #</th>
                  <th className="p-3">Customer / Party</th>
                  <th className="p-3">Firm / Unit</th>
                  <th className="p-3">Mode</th>
                  <th className="p-3 text-right">Cash Received</th>
                  <th className="p-3">Notes Breakdown Provided</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {dayCashTxs.map((tx) => {
                  const cd = tx.cashDenominations;
                  const cashVal = tx.paymentMode === 'SPLIT' && tx.splitPayment ? tx.splitPayment.cashAmount : (tx.paidAmount !== undefined ? tx.paidAmount : tx.amount);

                  const noteChips: string[] = [];
                  if (cd?.c500) noteChips.push(`₹500 × ${cd.c500}`);
                  if (cd?.c200) noteChips.push(`₹200 × ${cd.c200}`);
                  if (cd?.c100) noteChips.push(`₹100 × ${cd.c100}`);
                  if (cd?.c50) noteChips.push(`₹50 × ${cd.c50}`);
                  if (cd?.c20) noteChips.push(`₹20 × ${cd.c20}`);
                  if (cd?.c10) noteChips.push(`₹10 × ${cd.c10}`);
                  if (cd?.c5) noteChips.push(`₹5 × ${cd.c5}`);
                  if (cd?.coins) noteChips.push(`Coins ₹${cd.coins}`);

                  return (
                    <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3 font-mono font-bold text-slate-800">{tx.voucherNumber}</td>
                      <td className="p-3">
                        <div className="font-bold text-slate-800">{tx.partyName || 'Customer'}</div>
                        {tx.description && <div className="text-[11px] text-slate-400">{tx.description}</div>}
                      </td>
                      <td className="p-3">
                        <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded text-[10px] font-bold">
                          {tx.firmName || 'Main Firm'}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          tx.paymentMode === 'SPLIT' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {tx.paymentMode}
                        </span>
                      </td>
                      <td className="p-3 text-right font-bold text-emerald-700">
                        {formatCurrency(cashVal)}
                      </td>
                      <td className="p-3">
                        {noteChips.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {noteChips.map((chip, idx) => (
                              <span key={idx} className="bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded text-[11px] font-mono font-bold">
                                {chip}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs italic">No note breakdown specified</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
