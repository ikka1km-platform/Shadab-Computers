import React, { useState, useMemo } from 'react';
import { 
  X, 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle, 
  Calendar, 
  ChevronDown, 
  ChevronUp, 
  Building2, 
  Plus, 
  Eye, 
  ArrowRight, 
  ShieldAlert, 
  Check, 
  ExternalLink,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { Party, Firm, BankAccount, Transaction } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { parseDebtorsPdf, ParsedDebtorRow, ParsePdfResult } from '../../utils/pdfDebtorsParser';
import { db, updatePartyBalance, enqueueSyncItem } from '../../db/db';

interface DailyDebtorsPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  parties: Party[];
  firms?: Firm[];
  bankAccounts?: BankAccount[];
  onSuccess?: (stats: { salesCreated: number; totalSalesAmount: number }) => void;
  onOpenManualPayment?: (partyName: string, suggestedAmount: number) => void;
}

interface ReconciliationItem {
  id: string;
  parsedRow: ParsedDebtorRow;
  matchedParty?: Party;
  isNewParty: boolean;
  oldBalance: number;
  newBalance: number;
  difference: number; // newBalance - oldBalance
  category: 'SALE_INCREASE' | 'NEW_PARTY' | 'PAYMENT_ALERT' | 'UNCHANGED' | 'EXCLUDED';
  isSelected: boolean;
}

export const DailyDebtorsPdfModal: React.FC<DailyDebtorsPdfModalProps> = ({
  isOpen,
  onClose,
  parties,
  firms = [],
  bankAccounts = [],
  onSuccess,
  onOpenManualPayment,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [pdfMeta, setPdfMeta] = useState<{ title: string; period: string } | null>(null);
  const [reconciledItems, setReconciledItems] = useState<ReconciliationItem[]>([]);
  
  // Master entry date on header (defaults to today)
  const [batchDate, setBatchDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  
  // UI section collapse states
  const [showExcluded, setShowExcluded] = useState(false);
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Identify firm IDs safely
  const krishiSewaFirm = firms.find((f) => f?.name && /krishi\s*sewa/i.test(f.name)) || firms[0];
  const shadabFirm = firms.find((f) => f?.name && /shadab/i.test(f.name)) || firms[1] || firms[0];

  // Queues (Hooks must be called unconditionally on every render)
  const salesQueue = useMemo(
    () => reconciledItems.filter((i) => i.category === 'SALE_INCREASE'),
    [reconciledItems]
  );
  const newPartiesQueue = useMemo(
    () => reconciledItems.filter((i) => i.category === 'NEW_PARTY'),
    [reconciledItems]
  );
  const paymentAlertsQueue = useMemo(
    () => reconciledItems.filter((i) => i.category === 'PAYMENT_ALERT'),
    [reconciledItems]
  );
  const excludedQueue = useMemo(
    () => reconciledItems.filter((i) => i.category === 'EXCLUDED'),
    [reconciledItems]
  );
  const unchangedQueue = useMemo(
    () => reconciledItems.filter((i) => i.category === 'UNCHANGED'),
    [reconciledItems]
  );

  // Selected totals
  const selectedItemsToPost = useMemo(
    () => reconciledItems.filter((i) => i.isSelected && (i.category === 'SALE_INCREASE' || i.category === 'NEW_PARTY')),
    [reconciledItems]
  );

  const totalSelectedSalesAmount = useMemo(
    () => selectedItemsToPost.reduce((sum, i) => sum + (i.category === 'NEW_PARTY' ? i.newBalance : i.difference), 0),
    [selectedItemsToPost]
  );

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (selectedFile.type !== 'application/pdf' && !selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setParseError('Please upload a valid PDF file.');
      return;
    }

    setFile(selectedFile);
    setIsParsing(true);
    setParseError(null);

    try {
      const buffer = await selectedFile.arrayBuffer();
      const result: ParsePdfResult = await parseDebtorsPdf(buffer);

      if (!result.rows || result.rows.length === 0) {
        setParseError('Could not find any customer balance rows in this PDF. Please check the file.');
        setIsParsing(false);
        return;
      }

      setPdfMeta({
        title: result.reportTitle,
        period: result.periodText || 'Daily Closing Summary',
      });

      // Match each row against current Vyapar parties
      const items: ReconciliationItem[] = result.rows.map((row) => {
        // Find existing party by account code or cleaned name
        let matched: Party | undefined;

        if (row.accountCode) {
          matched = parties.find(
            (p) => p.accountCode === row.accountCode || (p.name && p.name.includes(row.accountCode!))
          );
        }

        if (!matched) {
          // Match by name similarity or exact match
          const cleanRowName = row.cleanedName.toLowerCase().trim();
          matched = parties.find((p) => {
            const pName = p.name.toLowerCase().trim();
            return pName === cleanRowName || pName.includes(cleanRowName) || cleanRowName.includes(pName);
          });
        }

        const isNew = !matched;
        const oldBalance = matched ? matched.currentBalance : 0;
        const newBalance = row.closingBalance;
        const diff = newBalance - oldBalance;

        let category: ReconciliationItem['category'] = 'UNCHANGED';
        let isSelected = false;

        if (row.isExcludedAgent) {
          category = 'EXCLUDED';
          isSelected = false;
        } else if (isNew) {
          category = 'NEW_PARTY';
          // User requested: New accounts placed in review queue, UNTICKED by default
          isSelected = false;
        } else if (diff > 0) {
          category = 'SALE_INCREASE';
          // Green Queue: Sales to add, TICKED by default
          isSelected = true;
        } else if (diff < 0) {
          category = 'PAYMENT_ALERT';
          // Red Queue: Reminder only, NO auto entry
          isSelected = false;
        } else {
          category = 'UNCHANGED';
          isSelected = false;
        }

        return {
          id: row.id,
          parsedRow: row,
          matchedParty: matched,
          isNewParty: isNew,
          oldBalance,
          newBalance,
          difference: diff,
          category,
          isSelected,
        };
      });

      setReconciledItems(items);
    } catch (err: any) {
      console.error('Error parsing PDF:', err);
      setParseError(err?.message || 'Failed to read PDF. Please ensure it is a valid Tally/Sundry Debtors PDF.');
    } finally {
      setIsParsing(false);
    }
  };

  // Toggle selection for an item
  const handleToggleSelect = (id: string) => {
    setReconciledItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isSelected: !item.isSelected } : item))
    );
  };

  // Select/Deselect all in Sales Queue
  const handleSetAllSalesSelected = (select: boolean) => {
    setReconciledItems((prev) =>
      prev.map((item) =>
        item.category === 'SALE_INCREASE' ? { ...item, isSelected: select } : item
      )
    );
  };


  // Execute database save
  const handleConfirmPostEntries = async () => {
    if (selectedItemsToPost.length === 0) return;
    setIsSubmitting(true);

    try {
      let salesCount = 0;
      let totalAmount = 0;

      for (const item of selectedItemsToPost) {
        let partyId = item.matchedParty?.id;
        let partyName = item.matchedParty?.name || item.parsedRow.cleanedName;

        // Auto-determine firm (Krishi Sewa Kendra if Amzera, else Shadab Computers)
        const targetFirm = item.parsedRow.suggestedFirm === 'KRISHI_SEWA' ? krishiSewaFirm : shadabFirm;
        const targetFirmId = targetFirm?.id;
        const targetFirmName = targetFirm?.name;

        // 1. Create party if brand new
        if (!partyId) {
          const nowStr = new Date().toISOString();
          const newPartyId = await db.parties.add({
            name: partyName,
            accountCode: item.parsedRow.accountCode || `CUST_${Date.now().toString(36).toUpperCase()}`,
            phone: '',
            partyType: 'CUSTOMER',
            openingBalance: 0, // Per user rule: new parties start at 0 and get a Sale entry
            currentBalance: 0,
            firmId: targetFirmId,
            firmName: targetFirmName,
            reminderRule: {
              frequency: 'DAILY',
              daysOfWeek: [1, 2, 3, 4, 5, 6], // Mon-Sat
              minAmount: 1000,
            },
            createdAt: nowStr,
            updatedAt: nowStr,
          });

          partyId = newPartyId;

          // Enqueue sync for new party
          await enqueueSyncItem({
            entityType: 'party',
            entityId: newPartyId,
            action: 'CREATE',
            payload: {
              id: newPartyId,
              name: partyName,
              accountCode: item.parsedRow.accountCode,
              partyType: 'CUSTOMER',
              openingBalance: 0,
              firmId: targetFirmId,
            },
          });
        }

        // 2. Book Sale Transaction
        const saleAmount = item.category === 'NEW_PARTY' ? item.newBalance : item.difference;
        if (saleAmount > 0) {
          const rand = Math.floor(1000 + Math.random() * 9000);
          const voucherNumber = `SL-${Date.now().toString().slice(-6)}-${rand}`;
          const nowStr = new Date().toISOString();

          const txId = await db.transactions.add({
            voucherNumber,
            type: 'SALE',
            partyId,
            partyName,
            date: batchDate,
            amount: saleAmount,
            paidAmount: 0,
            balanceDue: saleAmount,
            paymentStatus: 'UNPAID',
            paymentMode: 'CASH',
            description: `Daily Debtors PDF Sync (+₹${saleAmount})`,
            firmId: targetFirmId,
            firmName: targetFirmName,
            createdAt: nowStr,
          });

          // Enqueue sync for transaction
          await enqueueSyncItem({
            entityType: 'transaction',
            entityId: txId,
            action: 'CREATE',
            payload: {
              id: txId,
              voucherNumber,
              type: 'SALE',
              partyId,
              partyName,
              date: batchDate,
              amount: saleAmount,
              paymentStatus: 'UNPAID',
              firmId: targetFirmId,
            },
          });

          // 3. Recalculate and update party balance
          await updatePartyBalance(partyId);

          salesCount++;
          totalAmount += saleAmount;
        }
      }

      if (onSuccess) {
        onSuccess({
          salesCreated: salesCount,
          totalSalesAmount: totalAmount,
        });
      }

      onClose();
    } catch (err: any) {
      console.error('Error posting entries:', err);
      alert('Error saving entries: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl max-h-[94vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="bg-slate-900 text-white px-4 py-3.5 sm:px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center text-blue-400 font-bold">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                Daily Debtors Reconciliation
                <span className="text-[10px] bg-blue-500/20 text-blue-300 font-bold px-2 py-0.5 rounded-full border border-blue-400/20">
                  Recovery Auto-Sync
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Upload your Shadab Computers PDF to auto-detect sales and balance differences
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Master Date Picker & Controls Bar */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 sm:px-6 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-blue-600" />
              Batch Entry Date:
            </label>
            <input
              type="date"
              value={batchDate}
              onChange={(e) => setBatchDate(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 shadow-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <span className="text-[11px] text-slate-500 hidden sm:inline">(Applies to all new entries)</span>
          </div>

          {reconciledItems.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setReconciledItems([]);
                  setPdfMeta(null);
                }}
                className="text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-300 px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-xs cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Upload Another PDF
              </button>
            </div>
          )}
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          
          {/* File Upload Zone (shown when no file parsed) */}
          {reconciledItems.length === 0 && (
            <div className="space-y-4">
              <label className="border-2 border-dashed border-blue-300 hover:border-blue-500 bg-blue-50/50 hover:bg-blue-50/80 transition-all rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer text-center group">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileUpload}
                  disabled={isParsing}
                  className="hidden"
                />
                <div className="w-16 h-16 rounded-2xl bg-blue-600/10 text-blue-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  {isParsing ? (
                    <RefreshCw className="w-8 h-8 animate-spin" />
                  ) : (
                    <Upload className="w-8 h-8" />
                  )}
                </div>
                <p className="text-base font-bold text-slate-800">
                  {isParsing ? 'Reading and Parsing PDF...' : 'Click or Drop your Daily Debtors PDF here'}
                </p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  Accepts Tally "Sundry Debtors Group Summary" PDF export. Automatically categorizes sales, reviews new shops, and alerts payments.
                </p>
              </label>

              {parseError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3.5 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}
            </div>
          )}

          {/* Results View */}
          {reconciledItems.length > 0 && (
            <div className="space-y-5">
              
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <span className="text-[10px] font-bold text-emerald-800 uppercase flex items-center gap-1">
                    🟢 Sales to Add (+)
                  </span>
                  <div className="text-lg font-black text-emerald-700 mt-0.5">
                    {salesQueue.length} <span className="text-xs font-normal">parties</span>
                  </div>
                  <span className="text-[10px] text-emerald-700/80 font-bold">
                    +{formatCurrency(salesQueue.reduce((s, i) => s + i.difference, 0))}
                  </span>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <span className="text-[10px] font-bold text-amber-800 uppercase flex items-center gap-1">
                    🟠 New Accounts
                  </span>
                  <div className="text-lg font-black text-amber-700 mt-0.5">
                    {newPartiesQueue.length} <span className="text-xs font-normal">parties</span>
                  </div>
                  <span className="text-[10px] text-amber-700/80 font-bold">Needs Review</span>
                </div>

                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3">
                  <span className="text-[10px] font-bold text-rose-800 uppercase flex items-center gap-1">
                    🔴 Payment Alerts (-)
                  </span>
                  <div className="text-lg font-black text-rose-700 mt-0.5">
                    {paymentAlertsQueue.length} <span className="text-xs font-normal">alerts</span>
                  </div>
                  <span className="text-[10px] text-rose-700/80 font-bold">No Auto Entry</span>
                </div>

                <div className="bg-slate-100 border border-slate-200 rounded-xl p-3">
                  <span className="text-[10px] font-bold text-slate-600 uppercase flex items-center gap-1">
                    🚫 Other Agent
                  </span>
                  <div className="text-lg font-black text-slate-700 mt-0.5">
                    {excludedQueue.length} <span className="text-xs font-normal">ignored</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium">Nalchha, JPM, etc.</span>
                </div>
              </div>

              {/* SECTION 1: 🟢 SALES TO ADD (+) */}
              {salesQueue.length > 0 && (
                <div className="border border-emerald-200 bg-emerald-50/20 rounded-2xl p-3.5 sm:p-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <h3 className="text-sm font-black text-emerald-900 uppercase tracking-wider">
                        1. Sales to Add (+ Balance Increased) ({salesQueue.length})
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSetAllSalesSelected(true)}
                        className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 bg-emerald-100/80 px-2 py-0.5 rounded cursor-pointer"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetAllSalesSelected(false)}
                        className="text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-slate-200/80 px-2 py-0.5 rounded cursor-pointer"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {salesQueue.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleToggleSelect(item.id)}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                          item.isSelected
                            ? 'bg-white border-emerald-400 shadow-xs ring-1 ring-emerald-300'
                            : 'bg-white/60 border-slate-200 opacity-60 hover:opacity-100'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs sm:text-sm text-slate-900 truncate">
                              {item.parsedRow.cleanedName}
                            </span>
                            <span className="text-[10px] bg-slate-100 text-slate-600 font-semibold px-1.5 py-0.5 rounded border border-slate-200">
                              {item.parsedRow.suggestedFirm === 'KRISHI_SEWA' ? 'Krishi Sewa' : 'Shadab Comp'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                            <span>Old: {formatCurrency(item.oldBalance)}</span>
                            <span>➔</span>
                            <span className="font-bold text-slate-700">PDF: {formatCurrency(item.newBalance)}</span>
                          </div>
                        </div>

                        {/* Amount & Thumb-friendly Checkbox on the FAR RIGHT */}
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <div className="text-xs sm:text-sm font-black text-emerald-600">
                              +{formatCurrency(item.difference)}
                            </div>
                            <span className="text-[9px] font-bold text-emerald-700 uppercase bg-emerald-100 px-1 py-0.2 rounded">
                              Sale
                            </span>
                          </div>

                          <div
                            className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-all ${
                              item.isSelected
                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {item.isSelected && <Check className="w-4 h-4 stroke-[3]" />}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SECTION 2: 🟠 NEW ACCOUNTS FOUND (REVIEW REQUIRED) */}
              {newPartiesQueue.length > 0 && (
                <div className="border border-amber-200 bg-amber-50/30 rounded-2xl p-3.5 sm:p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      <h3 className="text-sm font-black text-amber-900 uppercase tracking-wider">
                        2. New Accounts Found ({newPartiesQueue.length})
                      </h3>
                    </div>
                    <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                      Unticked by default (Verify route)
                    </span>
                  </div>

                  <p className="text-[11px] text-amber-700">
                    These parties are not in your Vyapar yet. Check if they belong to your recovery route before ticking.
                  </p>

                  <div className="space-y-2">
                    {newPartiesQueue.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleToggleSelect(item.id)}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                          item.isSelected
                            ? 'bg-white border-amber-400 shadow-xs ring-1 ring-amber-300'
                            : 'bg-white/70 border-slate-200'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs sm:text-sm text-slate-900 truncate">
                              {item.parsedRow.cleanedName}
                            </span>
                            <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded border border-amber-200">
                              NEW PARTY
                            </span>
                            <span className="text-[10px] bg-slate-100 text-slate-600 font-semibold px-1.5 py-0.5 rounded border border-slate-200">
                              {item.parsedRow.suggestedFirm === 'KRISHI_SEWA' ? 'Krishi Sewa' : 'Shadab Comp'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            PDF Balance: <span className="font-bold text-slate-800">{formatCurrency(item.newBalance)}</span>
                          </div>
                        </div>

                        {/* Thumb-friendly Checkbox on the FAR RIGHT */}
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <div className="text-xs sm:text-sm font-black text-amber-700">
                              +{formatCurrency(item.newBalance)}
                            </div>
                            <span className="text-[9px] font-bold text-amber-800 uppercase bg-amber-100 px-1 py-0.2 rounded">
                              Initial Sale
                            </span>
                          </div>

                          <div
                            className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-all ${
                              item.isSelected
                                ? 'bg-amber-600 border-amber-600 text-white'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {item.isSelected && <Check className="w-4 h-4 stroke-[3]" />}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SECTION 3: 🔴 PAYMENT / DECREASE ALERTS (-) */}
              {paymentAlertsQueue.length > 0 && (
                <div className="border border-rose-200 bg-rose-50/20 rounded-2xl p-3.5 sm:p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                      <h3 className="text-sm font-black text-rose-900 uppercase tracking-wider">
                        3. Payment / Balance Drop Reminders ({paymentAlertsQueue.length})
                      </h3>
                    </div>
                    <span className="text-[11px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                      ⚠️ Audit Only (No Auto Entry)
                    </span>
                  </div>

                  <p className="text-[11px] text-rose-700">
                    These customers show reduced balances on the sheet. Verify with your cash/bank and enter payments manually.
                  </p>

                  <div className="space-y-2">
                    {paymentAlertsQueue.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-xl border border-rose-200 bg-white flex items-center justify-between gap-3 shadow-xs"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-xs sm:text-sm text-slate-900 truncate">
                            {item.parsedRow.cleanedName}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                            <span>Vyapar: {formatCurrency(item.oldBalance)}</span>
                            <span>➔</span>
                            <span className="font-bold text-slate-700">PDF: {formatCurrency(item.newBalance)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <div className="text-xs sm:text-sm font-black text-rose-600">
                              {formatCurrency(item.difference)}
                            </div>
                            <span className="text-[9px] font-bold text-rose-700 uppercase bg-rose-100 px-1 py-0.2 rounded">
                              Decreased
                            </span>
                          </div>

                          {onOpenManualPayment && (
                            <button
                              type="button"
                              onClick={() => onOpenManualPayment(item.parsedRow.cleanedName, Math.abs(item.difference))}
                              className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-all shadow-xs"
                            >
                              <Plus className="w-3.5 h-3.5" /> Enter Payment
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SECTION 4: 🚫 AUTO-EXCLUDED (OTHER AGENT'S ACCOUNTS) */}
              {excludedQueue.length > 0 && (
                <div className="border border-slate-200 bg-slate-50 rounded-2xl p-3.5 space-y-2">
                  <button
                    type="button"
                    onClick={() => setShowExcluded(!showExcluded)}
                    className="w-full flex items-center justify-between text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-slate-400" />
                      <span>Other Agent's Accounts (Auto-Ignored: Nalchha, JPM, Sajid) ({excludedQueue.length})</span>
                    </div>
                    {showExcluded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {showExcluded && (
                    <div className="pt-2 border-t border-slate-200 space-y-1.5 max-h-48 overflow-y-auto">
                      {excludedQueue.map((item) => (
                        <div key={item.id} className="text-xs text-slate-500 py-1 px-2 rounded bg-white flex items-center justify-between">
                          <span className="truncate">{item.parsedRow.cleanedName}</span>
                          <span className="text-[10px] text-slate-400 shrink-0">{item.parsedRow.excludeReason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* SECTION 5: UNCHANGED ACCOUNTS */}
              {unchangedQueue.length > 0 && (
                <div className="border border-slate-200 bg-slate-50/60 rounded-xl p-2.5">
                  <button
                    type="button"
                    onClick={() => setShowUnchanged(!showUnchanged)}
                    className="w-full flex items-center justify-between text-xs font-semibold text-slate-500 hover:text-slate-700 cursor-pointer"
                  >
                    <span>Unchanged Balances (Matches Vyapar Ledger) ({unchangedQueue.length})</span>
                    {showUnchanged ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {showUnchanged && (
                    <div className="pt-2 mt-1 border-t border-slate-200 space-y-1 max-h-36 overflow-y-auto">
                      {unchangedQueue.map((item) => (
                        <div key={item.id} className="text-[11px] text-slate-500 py-0.5 px-2 flex justify-between">
                          <span>{item.parsedRow.cleanedName}</span>
                          <span>{formatCurrency(item.newBalance)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>
          )}

        </div>

        {/* Footer */}
        {reconciledItems.length > 0 && (
          <div className="bg-slate-50 border-t border-slate-200 px-4 py-3 sm:px-6 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="text-xs text-slate-600">
              Selected to Add: <span className="font-bold text-emerald-700">{selectedItemsToPost.length} Sales</span> (
              <span className="font-black text-slate-900">{formatCurrency(totalSelectedSalesAmount)}</span>)
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-xs sm:text-sm cursor-pointer transition-all"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmPostEntries}
                disabled={isSubmitting || selectedItemsToPost.length === 0}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-black rounded-xl text-xs sm:text-sm shadow-md flex items-center gap-2 cursor-pointer transition-all"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Saving Entries...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Post {selectedItemsToPost.length} Selected Sales
                  </>
                )}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
