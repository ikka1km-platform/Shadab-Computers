import React, { useState, useMemo } from 'react';
import { 
  X, 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  UserPlus, 
  Layers, 
  ArrowRight, 
  Building, 
  Landmark, 
  RotateCcw,
  Sparkles,
  ClipboardPaste,
  FileSpreadsheet,
  Download
} from 'lucide-react';
import { Party, Firm, BankAccount, Transaction } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { db, updatePartyBalance, updateBankAccountBalances } from '../../db/db';

interface CollectionImporterModalProps {
  isOpen: boolean;
  onClose: () => void;
  parties: Party[];
  firms?: Firm[];
  bankAccounts?: BankAccount[];
  onImportComplete?: () => void;
}

interface ParsedCollectionRow {
  id: string;
  rawText: string;
  accountCode: string;
  name: string;
  amount: number;
  paymentMode: 'CASH' | 'UPI' | 'BANK';
  matchedPartyId?: number;
  matchedPartyName?: string;
  matchedAccountCode?: string;
  remarks?: string;
  status: 'MATCHED' | 'UNMATCHED' | 'INVALID';
}

export const CollectionImporterModal: React.FC<CollectionImporterModalProps> = ({
  isOpen,
  onClose,
  parties,
  firms = [],
  bankAccounts = [],
  onImportComplete,
}) => {
  const [activeStep, setActiveStep] = useState<'upload' | 'reconcile' | 'success'>('upload');
  const [rawInputText, setRawInputText] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedCollectionRow[]>([]);
  const [targetFirmId, setTargetFirmId] = useState<number | undefined>(firms[0]?.id);
  const [targetBankAccountId, setTargetBankAccountId] = useState<number | undefined>(bankAccounts[0]?.id);
  const [collectionDate, setCollectionDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [successStats, setSuccessStats] = useState<{ totalAmount: number; count: number; batchId: number } | null>(null);

  if (!isOpen) return null;

  // Parser: handles CSV lines, tab-separated lines, or comma-separated lines
  const parseCollectionData = (text: string) => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    const results: ParsedCollectionRow[] = [];

    lines.forEach((line, idx) => {
      // Ignore header lines like "Account, Name, Amount..."
      if (idx === 0 && (line.toLowerCase().includes('account') || line.toLowerCase().includes('amount') || line.toLowerCase().includes('name'))) {
        return;
      }

      // Delimiters: comma, tab, or pipe
      const parts = line.includes('\t')
        ? line.split('\t')
        : line.includes(',')
          ? line.split(',')
          : line.split('|');

      const cleanParts = parts.map((p) => p.trim().replace(/^["']|["']$/g, ''));
      if (cleanParts.length < 2) return;

      let code = '';
      let partyName = '';
      let amount = 0;
      let mode: 'CASH' | 'UPI' | 'BANK' = 'CASH';
      let remarks = '';

      // Pattern 1: Code, Name, Amount, Mode, Remarks
      // Pattern 2: Name, Amount, Mode
      // Pattern 3: Code, Amount
      const numIdx = cleanParts.findIndex((p) => !isNaN(parseFloat(p.replace(/[^0-9.]/g, ''))) && parseFloat(p.replace(/[^0-9.]/g, '')) > 0);

      if (numIdx !== -1) {
        amount = parseFloat(cleanParts[numIdx].replace(/[^0-9.]/g, '')) || 0;
        if (numIdx === 0) {
          partyName = cleanParts[1] || '';
        } else if (numIdx === 1) {
          const first = cleanParts[0];
          // Check if first matches an account code or name
          code = first;
          partyName = first;
        } else if (numIdx >= 2) {
          code = cleanParts[0];
          partyName = cleanParts[1];
        }

        const remaining = cleanParts.slice(numIdx + 1);
        if (remaining.length > 0) {
          const potentialMode = remaining[0].toUpperCase();
          if (potentialMode.includes('UPI') || potentialMode.includes('GPAY') || potentialMode.includes('PHONEPE')) mode = 'UPI';
          else if (potentialMode.includes('BANK') || potentialMode.includes('NEFT') || potentialMode.includes('IMPS')) mode = 'BANK';
          else mode = 'CASH';

          if (remaining.length > 1) remarks = remaining.slice(1).join(' ');
        }
      }

      if (amount <= 0) return;

      // Smart matching against existing database parties
      let matched = parties.find((p) => code && p.accountCode.toLowerCase() === code.toLowerCase());
      if (!matched && partyName) {
        matched = parties.find((p) => p.name.toLowerCase() === partyName.toLowerCase());
      }
      if (!matched && partyName) {
        matched = parties.find((p) => p.name.toLowerCase().includes(partyName.toLowerCase()) || partyName.toLowerCase().includes(p.name.toLowerCase()));
      }

      results.push({
        id: `row-${idx}-${Date.now()}`,
        rawText: line,
        accountCode: code,
        name: partyName,
        amount,
        paymentMode: mode,
        matchedPartyId: matched?.id,
        matchedPartyName: matched?.name,
        matchedAccountCode: matched?.accountCode,
        remarks: remarks || `Daily Collection - ${collectionDate}`,
        status: matched ? 'MATCHED' : 'UNMATCHED',
      });
    });

    setParsedRows(results);
    setActiveStep('reconcile');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setRawInputText(text);
      parseCollectionData(text);
    };
    reader.readAsText(file);
  };

  const handleManualMapParty = (rowId: string, partyId: number) => {
    const party = parties.find((p) => p.id === partyId);
    if (!party) return;

    setParsedRows((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? {
              ...r,
              matchedPartyId: party.id,
              matchedPartyName: party.name,
              matchedAccountCode: party.accountCode,
              status: 'MATCHED',
            }
          : r
      )
    );
  };

  const handleQuickCreateParty = async (rowId: string, nameToCreate: string) => {
    const newCode = `ACC-${Math.floor(1000 + Math.random() * 9000)}`;
    const newId = await db.parties.add({
      name: nameToCreate || 'New Customer',
      accountCode: newCode,
      phone: '',
      partyType: 'CUSTOMER',
      openingBalance: 0,
      currentBalance: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    setParsedRows((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? {
              ...r,
              matchedPartyId: newId as number,
              matchedPartyName: nameToCreate,
              matchedAccountCode: newCode,
              status: 'MATCHED',
            }
          : r
      )
    );
  };

  const handleBatchPost = async () => {
    const validRows = parsedRows.filter((r) => r.matchedPartyId && r.amount > 0);
    if (validRows.length === 0) {
      alert('No matched customers to post. Please match at least one customer.');
      return;
    }

    setIsProcessing(true);
    const batchId = Date.now();
    const activeFirm = firms.find((f) => f.id === targetFirmId);
    const activeBank = bankAccounts.find((b) => b.id === targetBankAccountId);

    try {
      for (const row of validRows) {
        await db.transactions.add({
          voucherNumber: `REC-${batchId.toString().slice(-4)}-${Math.floor(100 + Math.random() * 900)}`,
          type: 'PAYMENT_IN',
          partyId: row.matchedPartyId,
          partyName: row.matchedPartyName,
          date: collectionDate,
          amount: row.amount,
          paidAmount: row.amount,
          balanceDue: 0,
          paymentStatus: 'PAID',
          paymentMode: row.paymentMode,
          firmId: activeFirm?.id,
          firmName: activeFirm?.name,
          bankAccountId: row.paymentMode !== 'CASH' ? activeBank?.id : undefined,
          bankAccountName: row.paymentMode !== 'CASH' ? activeBank?.accountName : undefined,
          description: row.remarks || `Daily Collection Sheet Batch #${batchId}`,
          importBatchId: batchId,
          createdAt: new Date().toISOString(),
        });

        if (row.matchedPartyId) {
          await updatePartyBalance(row.matchedPartyId);
        }
      }

      await updateBankAccountBalances();

      const totalAmt = validRows.reduce((sum, r) => sum + r.amount, 0);
      setSuccessStats({ totalAmount: totalAmt, count: validRows.length, batchId });
      setActiveStep('success');
      if (onImportComplete) onImportComplete();
    } catch (err: any) {
      alert(`Batch posting error: ${err?.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Sample collection template generator
  const downloadSampleTemplate = () => {
    const sample = "Account Code,Customer Name,Amount,Payment Mode,Remarks\n" +
      (parties[0] ? `${parties[0].accountCode},${parties[0].name},1500,CASH,Daily Route A\n` : "ACC-101,Ramesh Traders,1500,CASH,Route A\n") +
      (parties[1] ? `${parties[1].accountCode},${parties[1].name},3200,UPI,Morning collection\n` : "ACC-102,Sharma General Store,3200,UPI,Collection\n");
    
    const blob = new Blob([sample], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "Daily_Collection_Sample_Sheet.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const totalCalculated = parsedRows.reduce((sum, r) => sum + r.amount, 0);
  const matchedCount = parsedRows.filter((r) => r.status === 'MATCHED').length;
  const unmatchedCount = parsedRows.filter((r) => r.status === 'UNMATCHED').length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base md:text-lg">Daily Collection Sheet & PDF Reconciler</h3>
              <p className="text-xs text-slate-400">Batch auto-post payments to customer ledgers in 1 click</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* STEP 1: UPLOAD OR PASTE */}
          {activeStep === 'upload' && (
            <div className="space-y-4">
              <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-indigo-600 mt-0.5" />
                <div className="flex-1 text-xs text-indigo-900">
                  <span className="font-bold block mb-0.5">Automate Your Daily Field Collections</span>
                  Upload your daily agent collection CSV/sheet or paste raw collection rows. The app will automatically match customer accounts, reconcile balances, and post receipts in batch.
                </div>
                <button
                  type="button"
                  onClick={downloadSampleTemplate}
                  className="px-2.5 py-1 bg-white hover:bg-indigo-100 text-indigo-700 rounded-lg font-bold text-xs border border-indigo-200 flex items-center gap-1 shadow-2xs whitespace-nowrap cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> Sample CSV
                </button>
              </div>

              {/* Upload Card */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="p-6 border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-all bg-slate-50 hover:bg-blue-50/50">
                  <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center mb-2 shadow-2xs">
                    <Upload className="w-6 h-6" />
                  </div>
                  <span className="font-bold text-slate-800 text-sm">Select CSV or Collection File</span>
                  <span className="text-xs text-slate-400 mt-1">Supports .csv, .txt, or export sheets</span>
                  <input type="file" accept=".csv, .txt" onChange={handleFileUpload} className="hidden" />
                </label>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col justify-between space-y-2">
                  <div className="flex items-center gap-2">
                    <ClipboardPaste className="w-4 h-4 text-slate-600" />
                    <span className="text-xs font-bold text-slate-700">Paste Text from WhatsApp / Excel</span>
                  </div>
                  <textarea
                    rows={4}
                    value={rawInputText}
                    onChange={(e) => setRawInputText(e.target.value)}
                    placeholder={`e.g.\nACC-101, Ramesh Kumar, 2500, CASH\nACC-102, Sharma Ji, 1800, UPI`}
                    className="w-full p-2.5 text-xs font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => parseCollectionData(rawInputText)}
                    disabled={!rawInputText.trim()}
                    className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-40 cursor-pointer"
                  >
                    Parse Collection Rows
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: RECONCILIATION TABLE */}
          {activeStep === 'reconcile' && (
            <div className="space-y-4">
              {/* Batch Metadata Controls */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Building className="w-3.5 h-3.5 text-indigo-600" /> Receiving Firm:
                  </label>
                  <select
                    value={targetFirmId}
                    onChange={(e) => setTargetFirmId(Number(e.target.value))}
                    className="w-full p-2 border border-slate-300 rounded-xl font-bold bg-white outline-none"
                  >
                    {firms.map((f) => (
                      <option key={f.id} value={f.id}>{f.name} {f.isDefault ? '(Main)' : ''}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Landmark className="w-3.5 h-3.5 text-blue-600" /> Deposit Bank (for UPI/Bank):
                  </label>
                  <select
                    value={targetBankAccountId}
                    onChange={(e) => setTargetBankAccountId(Number(e.target.value))}
                    className="w-full p-2 border border-slate-300 rounded-xl font-bold bg-white outline-none"
                  >
                    {bankAccounts.map((b) => (
                      <option key={b.id} value={b.id}>{b.accountName} ({b.bankName})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Collection Date:</label>
                  <input
                    type="date"
                    value={collectionDate}
                    onChange={(e) => setCollectionDate(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-xl font-bold bg-white outline-none"
                  />
                </div>
              </div>

              {/* Status Header */}
              <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className="text-xs">
                    <span className="text-slate-400">Total Rows:</span> <b className="text-slate-800">{parsedRows.length}</b>
                  </div>
                  <div className="text-xs">
                    <span className="text-emerald-600">✓ Matched:</span> <b className="text-emerald-700">{matchedCount}</b>
                  </div>
                  {unmatchedCount > 0 && (
                    <div className="text-xs">
                      <span className="text-amber-600">⚠️ Needs Action:</span> <b className="text-amber-700">{unmatchedCount}</b>
                    </div>
                  )}
                </div>
                <div className="text-sm font-black text-slate-900">
                  Total: {formatCurrency(totalCalculated)}
                </div>
              </div>

              {/* Table of Parsed Entries */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                <div className="overflow-x-auto max-h-[340px]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 uppercase font-semibold sticky top-0 z-10 border-b border-slate-200">
                      <tr>
                        <th className="p-3">Status</th>
                        <th className="p-3">Parsed Account / Name</th>
                        <th className="p-3">Amount</th>
                        <th className="p-3">Mode</th>
                        <th className="p-3">Mapped Database Party</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {parsedRows.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3 whitespace-nowrap">
                            {row.status === 'MATCHED' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Matched
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 inline-flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Unmatched
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="font-bold text-slate-800">{row.name || 'Unknown'}</div>
                            {row.accountCode && <div className="text-[10px] text-slate-400 font-mono">#{row.accountCode}</div>}
                          </td>
                          <td className="p-3 font-black text-emerald-600 text-sm whitespace-nowrap">
                            {formatCurrency(row.amount)}
                          </td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 uppercase">
                              {row.paymentMode}
                            </span>
                          </td>
                          <td className="p-3">
                            {row.status === 'MATCHED' ? (
                              <div className="text-slate-800">
                                <span className="font-bold">{row.matchedPartyName}</span>
                                <span className="text-[10px] text-slate-400 font-mono ml-1.5">({row.matchedAccountCode})</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <select
                                  onChange={(e) => handleManualMapParty(row.id, Number(e.target.value))}
                                  className="p-1 border border-slate-300 rounded-lg text-xs bg-white"
                                  defaultValue=""
                                >
                                  <option value="" disabled>-- Select Existing Customer --</option>
                                  {parties.filter((p) => p.partyType === 'CUSTOMER').map((p) => (
                                    <option key={p.id} value={p.id}>{p.name} ({p.accountCode})</option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => handleQuickCreateParty(row.id, row.name)}
                                  className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-bold text-[10px] border border-blue-200 flex items-center gap-1 whitespace-nowrap"
                                  title="Create this customer instantly"
                                >
                                  <UserPlus className="w-3 h-3" /> Quick Add
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: SUCCESS CONFIRMATION */}
          {activeStep === 'success' && successStats && (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-md">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h3 className="text-xl font-black text-slate-800">Daily Collections Successfully Posted!</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Batch #{successStats.batchId} has been posted to customer ledgers and daily daybook.
              </p>

              <div className="bg-slate-50 p-4 rounded-2xl max-w-sm mx-auto border border-slate-200 grid grid-cols-2 gap-3 text-left">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Total Collected</span>
                  <div className="text-xl font-black text-emerald-600">{formatCurrency(successStats.totalAmount)}</div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Receipts Created</span>
                  <div className="text-xl font-black text-slate-800">{successStats.count} Vouchers</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
          {activeStep === 'reconcile' ? (
            <>
              <button
                type="button"
                onClick={() => setActiveStep('upload')}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl"
              >
                ← Back to Upload
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBatchPost}
                  disabled={isProcessing || matchedCount === 0}
                  className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {isProcessing ? 'Posting Batch...' : `Post ${matchedCount} Collections (${formatCurrency(totalCalculated)})`}
                </button>
              </div>
            </>
          ) : activeStep === 'success' ? (
            <div className="w-full flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="w-full flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
