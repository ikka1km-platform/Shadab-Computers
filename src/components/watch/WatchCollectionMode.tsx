import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  Calculator, 
  Printer, 
  RefreshCw, 
  Smartphone, 
  CheckCircle2, 
  Search, 
  Mic, 
  Plus, 
  Trash2, 
  X, 
  ArrowLeft, 
  Building2, 
  Coins, 
  Wallet, 
  Bluetooth, 
  Check, 
  ChevronRight,
  Split,
  MapPin,
  Sparkles
} from 'lucide-react';
import { Party, Transaction, Firm, BankAccount, BusinessProfile, PaymentMode, DenominationBreakdown } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { 
  CollectionRoute, 
  getStoredRoutes, 
  saveStoredRoutes, 
  matchPartyToRoute, 
  DEFAULT_COLLECTION_ROUTES 
} from '../../utils/routeManager';
import { buildTransactionEscPos } from '../../utils/escpos';
import { 
  NativeBluetoothPrinter, 
  isNativeAndroidApp, 
  uint8ArrayToBase64, 
  PairedDevice 
} from '../../utils/nativeBluetoothPrinter';
import { isCashAccount } from '../../db/db';
import { 
  authenticateFirmOnCloud, 
  downloadCloudVault, 
  hydrateDexieWithCloudVault,
  getCloudServerUrl
} from '../../utils/cloudSync';

interface WatchCollectionModeProps {
  parties: Party[];
  transactions: Transaction[];
  firms: Firm[];
  bankAccounts: BankAccount[];
  profile: BusinessProfile;
  selectedFirmId: number | 'ALL';
  onChangeFirm: (firmId: number | 'ALL') => void;
  onSaveTx: (txData: Partial<Transaction>, shouldPrint?: boolean) => Promise<any>;
  onExitWatchMode?: () => void;
  onManualSync?: () => Promise<void>;
  isSyncing?: boolean;
}

export const WatchCollectionMode: React.FC<WatchCollectionModeProps> = ({
  parties,
  transactions,
  firms,
  bankAccounts,
  profile,
  selectedFirmId,
  onChangeFirm,
  onSaveTx,
  onExitWatchMode,
  onManualSync,
  isSyncing = false,
}) => {
  // Navigation tabs on watch
  const [activeTab, setActiveTab] = useState<'DEBTORS' | 'CASH_TALLY'>('DEBTORS');

  // Routes & Search
  const [routes, setRoutes] = useState<CollectionRoute[]>(getStoredRoutes);
  const [selectedRouteId, setSelectedRouteId] = useState<string | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isRouteModalOpen, setIsRouteModalOpen] = useState<boolean>(false);
  const [isPrinterModalOpen, setIsPrinterModalOpen] = useState<boolean>(false);

  // New Route Form
  const [newRouteName, setNewRouteName] = useState<string>('');
  const [newRouteKeywords, setNewRouteKeywords] = useState<string>('');

  // Paired Bluetooth Printers
  const [pairedPrinters, setPairedPrinters] = useState<PairedDevice[]>([]);
  const [selectedPrinterAddress, setSelectedPrinterAddress] = useState<string>(() => {
    return localStorage.getItem('vyapar_watch_default_printer_mac') || '';
  });

  // Toast feedback
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Payment Wizard State
  const [activeParty, setActiveParty] = useState<Party | null>(null);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [inputAmount, setInputAmount] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [cashPart, setCashPart] = useState<string>('');
  const [onlinePart, setOnlinePart] = useState<string>('');
  const [isSplitPrompter, setIsSplitPrompter] = useState<boolean>(false);
  const [denoms, setDenoms] = useState<DenominationBreakdown>({
    c500: 0, c200: 0, c100: 0, c50: 0, c20: 0, c10: 0, c5: 0, coins: 0
  });

  // Tally Tab Note Counter
  const [tallyDenoms, setTallyDenoms] = useState<DenominationBreakdown>({
    c500: 0, c200: 0, c100: 0, c50: 0, c20: 0, c10: 0, c5: 0, coins: 0
  });

  const [isWatchSyncing, setIsWatchSyncing] = useState<boolean>(false);

  const handleWatchCloudSync = async () => {
    setIsWatchSyncing(true);
    showToast('Connecting to Cloud...');
    try {
      const firmIdToUse = profile?.firmId || 'FIRM_MUI8HFY6_47UPAJ';
      const pinToUse = profile?.securityPin || '1234';
      const res = await authenticateFirmOnCloud(firmIdToUse, pinToUse);
      let vault = res.vault;
      if (!vault) {
        vault = await downloadCloudVault(firmIdToUse);
      }
      if (!vault) {
        throw new Error('Could not download cloud vault.');
      }
      vault.firmId = vault.firmId || res.firmId || firmIdToUse;

      showToast(`Hydrating ${vault.parties?.length || 0} parties...`);
      await hydrateDexieWithCloudVault(vault, {
        clearExisting: true,
        forceReload: false,
        userSession: {
          type: res.role === 'Owner' ? 'OWNER' : 'COWORKER',
          id: res.workerId,
          name: res.workerName || 'Owner (Admin)',
          role: res.role || 'Owner',
        },
      });
      showToast(`Loaded ${vault.parties?.length || 0} parties on wrist!`);
    } catch (err: any) {
      console.error('Watch sync error:', err);
      if (onManualSync) {
        try {
          await onManualSync();
          showToast('Synced with phone cloud');
          return;
        } catch (_) {}
      }
      showToast(`Sync: ${err.message || 'Check connection'}`);
    } finally {
      setIsWatchSyncing(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  // Load Bluetooth devices on mount
  useEffect(() => {
    if (isNativeAndroidApp()) {
      NativeBluetoothPrinter.listPairedDevices()
        .then((res) => {
          if (res?.devices) {
            setPairedPrinters(res.devices);
            if (!selectedPrinterAddress && res.devices.length > 0) {
              setSelectedPrinterAddress(res.devices[0].address);
              localStorage.setItem('vyapar_watch_default_printer_mac', res.devices[0].address);
            }
          }
        })
        .catch(console.warn);
    }
  }, []);

  // Filter parties by firm and active collection route
  const currentRoute = useMemo(() => {
    return routes.find((r) => r.id === selectedRouteId);
  }, [routes, selectedRouteId]);

  const filteredParties = useMemo(() => {
    return parties
      .filter((p) => {
        // Firm match
        const matchesFirm = selectedFirmId === 'ALL' || !p.firmId || p.firmId === Number(selectedFirmId);
        if (!matchesFirm) return false;

        // Route match
        if (currentRoute) {
          const matchesRoute = matchPartyToRoute(p, currentRoute);
          if (!matchesRoute) return false;
        }

        // Search text match
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchesSearch =
            p.name.toLowerCase().includes(q) ||
            (p.phone && p.phone.includes(q)) ||
            (p.address && p.address.toLowerCase().includes(q));
          if (!matchesSearch) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // High dues first
        if (a.currentBalance > 0 && b.currentBalance <= 0) return -1;
        if (a.currentBalance <= 0 && b.currentBalance > 0) return 1;
        return b.currentBalance - a.currentBalance;
      });
  }, [parties, selectedFirmId, currentRoute, searchQuery]);

  // Route counts for badges
  const getRouteCount = (route: CollectionRoute) => {
    return parties.filter((p) => {
      const matchesFirm = selectedFirmId === 'ALL' || !p.firmId || p.firmId === Number(selectedFirmId);
      return matchesFirm && p.currentBalance > 0 && matchPartyToRoute(p, route);
    }).length;
  };

  const totalDuesCount = useMemo(() => {
    return parties.filter((p) => (selectedFirmId === 'ALL' || !p.firmId || p.firmId === Number(selectedFirmId)) && p.currentBalance > 0).length;
  }, [parties, selectedFirmId]);

  // Total Tallied Cash in wizard
  const totalTalliedNotes =
    (denoms.c500 || 0) * 500 +
    (denoms.c200 || 0) * 200 +
    (denoms.c100 || 0) * 100 +
    (denoms.c50 || 0) * 50 +
    (denoms.c20 || 0) * 20 +
    (denoms.c10 || 0) * 10 +
    (denoms.c5 || 0) * 5 +
    (denoms.coins || 0);

  // Today Inflow metrics for Tally Tab
  const todayStr = new Date().toISOString().split('T')[0];
  const todayCashTotal = useMemo(() => {
    return transactions
      .filter((tx) => {
        const matchesFirm = selectedFirmId === 'ALL' || tx.firmId === Number(selectedFirmId);
        const matchesDate = tx.date === todayStr;
        return matchesFirm && matchesDate && (tx.type === 'PAYMENT_IN' || tx.type === 'SALE');
      })
      .reduce((sum, tx) => {
        if (tx.paymentMode === 'CASH') {
          return sum + (tx.paidAmount !== undefined ? tx.paidAmount : tx.amount);
        }
        if (tx.paymentMode === 'SPLIT' && tx.splitPayment?.cashAmount) {
          return sum + tx.splitPayment.cashAmount;
        }
        return sum;
      }, 0);
  }, [transactions, selectedFirmId, todayStr]);

  const todayUpiTotal = useMemo(() => {
    return transactions
      .filter((tx) => {
        const matchesFirm = selectedFirmId === 'ALL' || tx.firmId === Number(selectedFirmId);
        const matchesDate = tx.date === todayStr;
        return matchesFirm && matchesDate && (tx.type === 'PAYMENT_IN' || tx.type === 'SALE');
      })
      .reduce((sum, tx) => {
        if (tx.paymentMode === 'UPI' || tx.paymentMode === 'BANK') {
          return sum + (tx.paidAmount !== undefined ? tx.paidAmount : tx.amount);
        }
        if (tx.paymentMode === 'SPLIT' && tx.splitPayment?.onlineAmount) {
          return sum + tx.splitPayment.onlineAmount;
        }
        return sum;
      }, 0);
  }, [transactions, selectedFirmId, todayStr]);

  // Open Payment Wizard
  const handleOpenPartyReceipt = (party: Party) => {
    setActiveParty(party);
    setWizardStep(1);
    const defAmt = party.currentBalance > 0 ? String(party.currentBalance) : '';
    setInputAmount(defAmt);
    setPaymentMode('CASH');
    setCashPart(defAmt);
    setOnlinePart('0');
    setIsSplitPrompter(false);
    setDenoms({ c500: 0, c200: 0, c100: 0, c50: 0, c20: 0, c10: 0, c5: 0, coins: 0 });
  };

  // Close wizard and preserve current route filter
  const handleCloseWizard = () => {
    setActiveParty(null);
    setWizardStep(1);
    setInputAmount('');
  };

  // Dialpad handlers
  const handleDialpadPress = (val: string) => {
    if (val === 'C') {
      setInputAmount('');
    } else if (val === '⌫') {
      setInputAmount((prev) => prev.slice(0, -1));
    } else {
      setInputAmount((prev) => (prev === '0' ? val : prev + val));
    }
  };

  // Handle Save & Direct Bluetooth Print
  const handleCompleteReceipt = async (shouldPrint: boolean) => {
    if (!activeParty || Number(inputAmount) <= 0) return;

    const amt = Number(inputAmount);
    const selectedFirm = firms.find((f) => f.id === activeParty.firmId) || firms[0];
    const nonCashBanks = bankAccounts.filter((b) => !isCashAccount(b));
    const targetBank = nonCashBanks.find((b) => b.firmId === selectedFirm?.id) || nonCashBanks[0] || bankAccounts[0];

    const voucherNum = `REC-${Math.floor(1000 + Math.random() * 9000)}`;

    let splitData = undefined;
    if (paymentMode === 'SPLIT') {
      splitData = {
        cashAmount: Number(cashPart || amt),
        onlineAmount: Number(onlinePart || 0),
        onlineMode: 'UPI' as const,
        bankAccountId: targetBank?.id,
        bankAccountName: targetBank?.accountName,
      };
    }

    const txPayload: Partial<Transaction> = {
      voucherNumber: voucherNum,
      type: 'PAYMENT_IN',
      partyId: activeParty.id,
      partyName: activeParty.name,
      amount: amt,
      paidAmount: amt,
      balanceDue: 0,
      paymentStatus: 'PAID',
      paymentMode,
      splitPayment: splitData,
      bankAccountId: (paymentMode === 'UPI' || (paymentMode === 'SPLIT' && Number(onlinePart) > 0)) ? targetBank?.id : undefined,
      bankAccountName: (paymentMode === 'UPI' || (paymentMode === 'SPLIT' && Number(onlinePart) > 0)) ? targetBank?.accountName : undefined,
      firmId: selectedFirm?.id,
      firmName: selectedFirm?.name,
      date: new Date().toISOString().split('T')[0],
      description: `Collected via Wrist Watch (${selectedRouteId !== 'ALL' ? currentRoute?.name : 'Field'})`,
      cashDenominations: (paymentMode === 'CASH' || paymentMode === 'SPLIT') && totalTalliedNotes > 0 ? denoms : undefined,
    };

    try {
      const saved = await onSaveTx(txPayload, false);

      // Execute Direct Bluetooth ESC/POS Print
      if (shouldPrint && isNativeAndroidApp()) {
        try {
          const printerAddress = selectedPrinterAddress || (pairedPrinters[0]?.address);
          if (printerAddress) {
            const slipBytes = buildTransactionEscPos(
              saved || (txPayload as Transaction),
              activeParty,
              profile,
              '58mm'
            );
            const base64Data = uint8ArrayToBase64(slipBytes);
            await NativeBluetoothPrinter.printRaw({
              address: printerAddress,
              data: base64Data,
            });
            showToast(`✓ Slip #${voucherNum} Printed!`);
          } else {
            showToast('✓ Saved! (No Bluetooth Printer Paired)');
          }
        } catch (printErr: any) {
          console.warn('Watch print error:', printErr);
          showToast(`✓ Saved! (Print: ${printErr.message || 'Check BT'})`);
        }
      } else {
        showToast(`✓ Saved: ₹${amt} from ${activeParty.name}`);
      }
    } catch (saveErr: any) {
      console.error('Watch save error:', saveErr);
      showToast(`Error: ${saveErr.message || 'Failed to save'}`);
    } finally {
      // Auto-return immediately to the active route screen!
      handleCloseWizard();
    }
  };

  // Route Management
  const handleAddNewRoute = () => {
    if (!newRouteName.trim()) return;
    const kwList = newRouteKeywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    const newR: CollectionRoute = {
      id: `route_${Date.now()}`,
      name: newRouteName.trim(),
      keywords: kwList.length > 0 ? kwList : [newRouteName.trim().toLowerCase()],
    };

    const nextRoutes = [...routes, newR];
    setRoutes(nextRoutes);
    saveStoredRoutes(nextRoutes);
    setNewRouteName('');
    setNewRouteKeywords('');
    showToast(`✓ Added ${newR.name}`);
  };

  const handleDeleteRoute = (id: string) => {
    const nextRoutes = routes.filter((r) => r.id !== id);
    setRoutes(nextRoutes);
    saveStoredRoutes(nextRoutes);
    if (selectedRouteId === id) setSelectedRouteId('ALL');
    showToast('✓ Route Removed');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col justify-start select-none overflow-x-hidden touch-manipulation max-w-full pb-8">
      {/* Toast Alert */}
      {toastMsg && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-slate-950 font-black px-4 py-2 rounded-full shadow-2xl text-xs tracking-tight animate-in fade-in zoom-in duration-150 border border-emerald-300">
          {toastMsg}
        </div>
      )}

      {/* TOP COMPACT WATCH HEADER */}
      <div className="bg-slate-900 border-b border-slate-800 p-2 sm:p-2.5 flex items-center justify-between gap-1.5 shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Firm Switcher */}
          <select
            value={selectedFirmId}
            onChange={(e) => onChangeFirm(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
            className="bg-slate-800 text-emerald-400 font-bold text-xs border border-slate-700 rounded-lg px-2 py-1 outline-none truncate max-w-[140px]"
          >
            <option value="ALL">🏢 All Firms</option>
            {firms.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Bluetooth Thermal Printer Button */}
          <button
            onClick={() => setIsPrinterModalOpen(true)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700"
            title="Bluetooth Printer"
          >
            <Bluetooth className="w-4 h-4" />
          </button>

          {/* Sync Button */}
          {onManualSync && (
            <button
            onClick={handleWatchCloudSync}
            disabled={isWatchSyncing || isSyncing}
            className={`p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 ${isWatchSyncing || isSyncing ? 'animate-spin' : ''}`}
            title="Sync Debtors from Phone Cloud"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          )}

          {/* Route Config Button */}
          <button
            onClick={() => setIsRouteModalOpen(true)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-purple-400 border border-slate-700"
            title="Manage Routes"
          >
            <MapPin className="w-4 h-4" />
          </button>

          {/* Exit Watch Mode Button */}
          {onExitWatchMode && (
            <button
              onClick={onExitWatchMode}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
              title="Exit Watch View"
            >
              <Smartphone className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* WATCH MAIN TAB SELECTOR (Debtors vs Cash Tally) */}
      <div className="bg-slate-900/80 p-1 flex border-b border-slate-800 gap-1 text-xs font-bold">
        <button
          onClick={() => setActiveTab('DEBTORS')}
          className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'DEBTORS' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>You'll Get ({totalDuesCount})</span>
        </button>

        <button
          onClick={() => setActiveTab('CASH_TALLY')}
          className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'CASH_TALLY' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Calculator className="w-3.5 h-3.5" />
          <span>Cash Tally</span>
        </button>
      </div>

      {/* TAB 1: DEBTORS / COLLECTION MODE */}
      {activeTab === 'DEBTORS' && (
        <div className="flex-1 flex flex-col space-y-2 p-2">
          {/* SWIPEABLE HORIZONTAL ROUTE PILLS */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedRouteId('ALL')}
              className={`px-2.5 py-1 text-xs font-bold rounded-full whitespace-nowrap transition-all shrink-0 ${
                selectedRouteId === 'ALL'
                  ? 'bg-blue-600 text-white ring-2 ring-blue-400'
                  : 'bg-slate-800 text-slate-300 border border-slate-700'
              }`}
            >
              📍 All ({totalDuesCount})
            </button>

            {routes.map((r) => {
              const count = getRouteCount(r);
              const isSelected = selectedRouteId === r.id;
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedRouteId(r.id)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-full whitespace-nowrap transition-all shrink-0 flex items-center gap-1 ${
                    isSelected
                      ? 'bg-purple-600 text-white ring-2 ring-purple-400'
                      : 'bg-slate-800 text-slate-300 border border-slate-700'
                  }`}
                >
                  <span>{r.name}</span>
                  <span className={`text-[10px] px-1 rounded-full ${isSelected ? 'bg-purple-900 text-purple-200' : 'bg-slate-700 text-slate-300'}`}>
                    {count}
                  </span>
                </button>
              );
            })}

            <button
              onClick={() => setIsRouteModalOpen(true)}
              className="p-1 bg-slate-800 text-slate-400 hover:text-white border border-slate-700 rounded-full shrink-0"
              title="Add Route"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Quick Search Box with voice trigger */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder={`Search in ${currentRoute?.name || 'All'}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-8 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs font-medium text-white outline-none focus:border-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-500 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* LIST OF DEBTORS (Large thumb-friendly cards) */}
          <div className="space-y-1.5 flex-1 overflow-y-auto">
            {parties.length === 0 ? (
              <div className="text-center py-5 px-3 bg-slate-900 border border-slate-800 rounded-2xl my-2 space-y-2.5">
                <div className="w-10 h-10 mx-auto rounded-full bg-blue-900/40 text-blue-400 flex items-center justify-center border border-blue-700">
                  <RefreshCw className={`w-5 h-5 ${isWatchSyncing || isSyncing ? 'animate-spin text-blue-400' : ''}`} />
                </div>
                <div>
                  <h4 className="font-bold text-xs text-white">Load Customer Accounts</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                    Sync 96 debtors & pending balances from Shadab Computers
                  </p>
                </div>
                <button
                  onClick={handleWatchCloudSync}
                  disabled={isWatchSyncing || isSyncing}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow-md flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isWatchSyncing || isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isWatchSyncing || isSyncing ? 'Connecting...' : '1-Tap Sync from Phone'}</span>
                </button>
              </div>
            ) : filteredParties.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs">
                No debtors found in this route.
              </div>
            ) : (
              filteredParties.map((p) => {
                const isPaid = p.currentBalance <= 0;
                return (
                  <div
                    key={p.id}
                    className={`p-2.5 rounded-xl border transition-all flex flex-col gap-1.5 ${
                      isPaid
                        ? 'bg-slate-900/40 border-slate-800/60 opacity-60'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="min-w-0">
                        <h4 className="font-bold text-sm text-white truncate leading-tight">
                          {p.name}
                        </h4>
                        <div className="flex items-center gap-1 text-[11px] text-slate-400 truncate mt-0.5">
                          {p.address && <span>📍 {p.address}</span>}
                          {p.phone && <span>&bull; {p.phone}</span>}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        {isPaid ? (
                          <span className="text-[10px] font-black text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-md border border-emerald-800">
                            ✓ Cleared
                          </span>
                        ) : (
                          <div className="text-sm font-black text-rose-400">
                            {formatCurrency(p.currentBalance)}
                          </div>
                        )}
                      </div>
                    </div>

                    {!isPaid && (
                      <button
                        onClick={() => handleOpenPartyReceipt(p)}
                        className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-xs rounded-lg flex items-center justify-center gap-1.5 shadow-sm transition-all"
                      >
                        <span>💵 Receive Payment</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 2: CASH TALLY VIEW ON WATCH */}
      {activeTab === 'CASH_TALLY' && (
        <div className="p-2 space-y-2.5 flex-1 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Today's Field Collection</span>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/80">
                  <span className="text-[10px] text-emerald-400 font-bold block">💵 Total Cash</span>
                  <div className="text-sm font-black text-emerald-300">{formatCurrency(todayCashTotal)}</div>
                </div>
                <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/80">
                  <span className="text-[10px] text-blue-400 font-bold block">📱 Total UPI</span>
                  <div className="text-sm font-black text-blue-300">{formatCurrency(todayUpiTotal)}</div>
                </div>
              </div>
            </div>

            {/* Pocket Note Tally - Direct Type Method (No +- buttons) */}
            <div className="bg-slate-900 p-2 rounded-xl border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase font-bold text-slate-400">
                  Pocket Note Counts
                </span>
                <button
                  type="button"
                  onClick={() => setTallyDenoms({ c500: 0, c200: 0, c100: 0, c50: 0, c20: 0, c10: 0, c5: 0, coins: 0 })}
                  className="text-[10px] text-rose-400 font-bold hover:underline"
                >
                  Clear All
                </button>
              </div>

              {[500, 200, 100, 50, 20, 10].map((note) => {
                const key = `c${note}` as keyof DenominationBreakdown;
                const count = tallyDenoms[key] || 0;
                return (
                  <div key={note} className="flex items-center justify-between bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800">
                    <div className="flex items-center gap-1.5 min-w-[55px]">
                      <span className="text-xs font-black text-slate-200">₹{note}</span>
                      <span className="text-[10px] text-slate-500 font-bold">×</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="0"
                        value={count === 0 ? '' : count}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          const num = val === '' ? 0 : parseInt(val, 10);
                          setTallyDenoms(prev => ({ ...prev, [key]: num }));
                        }}
                        className="w-20 py-1 px-2 text-center text-sm font-black text-white bg-slate-900 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg outline-none"
                      />
                      <span className="text-[11px] font-black text-emerald-400 w-16 text-right truncate">
                        {count > 0 ? formatCurrency(count * note) : '—'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-emerald-950/60 border border-emerald-800/80 p-2 rounded-xl text-center">
            <span className="text-[10px] text-emerald-400 font-bold uppercase">Total Tallied Pocket Cash</span>
            <div className="text-lg font-black text-emerald-300">
              {formatCurrency(
                (tallyDenoms.c500 || 0) * 500 +
                (tallyDenoms.c200 || 0) * 200 +
                (tallyDenoms.c100 || 0) * 100 +
                (tallyDenoms.c50 || 0) * 50
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4-STEP PAYMENT WIZARD MODAL (FULL WATCH SCREEN) */}
      {activeParty && (
        <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col justify-between p-2.5 animate-in fade-in zoom-in-95 duration-100 overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
            <div className="min-w-0">
              <span className="text-[10px] uppercase font-bold text-blue-400 block">Step {wizardStep} of 4</span>
              <h3 className="text-xs font-bold text-white truncate max-w-[200px]">{activeParty.name}</h3>
            </div>
            <button
              onClick={handleCloseWizard}
              className="p-1 rounded-lg text-slate-400 hover:text-white bg-slate-900 border border-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* STEP 1: AMOUNT INPUT */}
          {wizardStep === 1 && (
            <div className="flex-1 flex flex-col justify-between py-2 space-y-2">
              <div className="text-center">
                <span className="text-[10px] text-slate-400 font-bold uppercase">
                  Pending Due: <strong className="text-rose-400">{formatCurrency(activeParty.currentBalance)}</strong>
                </span>
                {/* Big Amount Display */}
                <div className="bg-slate-900 border-2 border-blue-500 rounded-xl p-2.5 mt-1 flex items-center justify-center">
                  <span className="text-lg font-bold text-blue-400 mr-1">₹</span>
                  <span className="text-2xl font-black text-white tracking-wide">
                    {inputAmount || '0'}
                  </span>
                </div>

                {/* 1-Tap Pay Full Due Button */}
                {activeParty.currentBalance > 0 && (
                  <button
                    onClick={() => setInputAmount(String(activeParty.currentBalance))}
                    className="mt-1.5 px-3 py-1 bg-blue-950 text-blue-300 border border-blue-700/60 rounded-full text-[11px] font-bold active:scale-95"
                  >
                    ⚡ Pay Full ({formatCurrency(activeParty.currentBalance)})
                  </button>
                )}
              </div>

              {/* Large Phone-Dialer Style Keypad */}
              <div className="grid grid-cols-3 gap-1.5 text-sm font-black">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
                  <button
                    key={k}
                    onClick={() => handleDialpadPress(k)}
                    className="py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 active:bg-blue-600 text-white rounded-lg active:scale-95 transition-all text-base font-black flex items-center justify-center"
                  >
                    {k}
                  </button>
                ))}
              </div>

              <button
                disabled={Number(inputAmount) <= 0}
                onClick={() => setWizardStep(2)}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-black text-xs rounded-xl shadow-md flex items-center justify-center gap-1.5 transition-all"
              >
                <span>Next: Payment Mode</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* STEP 2: PAYMENT MODE SELECTION */}
          {wizardStep === 2 && (
            <div className="flex-1 flex flex-col justify-between py-2 space-y-2">
              <div className="text-center">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Amount Received</span>
                <div className="text-2xl font-black text-emerald-400">₹ {inputAmount}</div>
              </div>

              <div className="space-y-2 flex-1 flex flex-col justify-center">
                {/* Mode Option 1: CASH */}
                <button
                  onClick={() => {
                    setPaymentMode('CASH');
                    setCashPart(inputAmount);
                    setOnlinePart('0');
                    setWizardStep(3); // Go to Notes
                  }}
                  className="w-full p-3 bg-slate-900 hover:bg-emerald-950 border border-slate-800 hover:border-emerald-600 rounded-xl text-left flex items-center justify-between transition-all"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold">
                      <Wallet className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-white">💵 Full Cash</h4>
                      <p className="text-[10px] text-slate-400">Physical notes received</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </button>

                {/* Mode Option 2: UPI */}
                <button
                  onClick={() => {
                    setPaymentMode('UPI');
                    setOnlinePart(inputAmount);
                    setCashPart('0');
                    setWizardStep(4); // Skip notes, go straight to print!
                  }}
                  className="w-full p-3 bg-slate-900 hover:bg-blue-950 border border-slate-800 hover:border-blue-600 rounded-xl text-left flex items-center justify-between transition-all"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-white">📱 UPI / QR Transfer</h4>
                      <p className="text-[10px] text-slate-400">PhonePe, GPay, Paytm</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </button>

                {/* Mode Option 3: SPLIT */}
                <button
                  onClick={() => {
                    setPaymentMode('SPLIT');
                    const half = Math.floor(Number(inputAmount) / 2);
                    setCashPart(String(half));
                    setOnlinePart(String(Number(inputAmount) - half));
                    setIsSplitPrompter(true);
                  }}
                  className="w-full p-3 bg-slate-900 hover:bg-purple-950 border border-slate-800 hover:border-purple-600 rounded-xl text-left flex items-center justify-between transition-all"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center font-bold">
                      <Split className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-white">✂️ Split Payment</h4>
                      <p className="text-[10px] text-slate-400">Part Cash + Part Online</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </button>
              </div>

              {/* Split Prompt Sub-modal */}
              {isSplitPrompter && (
                <div className="bg-slate-900 border border-purple-500 p-2.5 rounded-xl space-y-2 animate-in fade-in">
                  <span className="text-xs font-bold text-purple-300 block">How much in Cash?</span>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={cashPart}
                      onChange={(e) => {
                        const c = Math.min(Number(inputAmount), Math.max(0, Number(e.target.value)));
                        setCashPart(String(c));
                        setOnlinePart(String(Number(inputAmount) - c));
                      }}
                      className="flex-1 p-2 bg-slate-950 border border-slate-700 rounded-lg text-sm font-bold text-white outline-none"
                      placeholder="Cash amount"
                    />
                  </div>
                  <div className="text-[11px] text-slate-300">
                    UPI will be: <strong className="text-blue-400">₹{onlinePart}</strong>
                  </div>
                  <button
                    onClick={() => {
                      setIsSplitPrompter(false);
                      setWizardStep(3); // Go to notes for cash portion
                    }}
                    className="w-full py-1.5 bg-purple-600 text-white font-bold rounded-lg text-xs"
                  >
                    Confirm Split & Count Notes ❯
                  </button>
                </div>
              )}

              <button
                onClick={() => setWizardStep(1)}
                className="w-full py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-lg"
              >
                ‹ Back to Amount
              </button>
            </div>
          )}

          {/* STEP 3: CASH NOTE DENOMINATION COUNTER - DIRECT TYPE METHOD */}
          {wizardStep === 3 && (() => {
            const targetCash = Number(paymentMode === 'SPLIT' ? cashPart : inputAmount);
            const diff = targetCash - totalTalliedNotes;

            return (
              <div className="flex-1 flex flex-col justify-between py-2 space-y-2 overflow-y-auto">
                <div className="text-center bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <span className="text-slate-400 uppercase">Cash to Tally:</span>
                    <span className="text-white font-black">₹{targetCash}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-bold mt-1">
                    <span className="text-slate-400">Tallied:</span>
                    {diff === 0 ? (
                      <span className="text-emerald-400 font-black">✓ ₹{totalTalliedNotes} (Matched)</span>
                    ) : diff > 0 ? (
                      <span className="text-amber-400 font-black">₹{totalTalliedNotes} (₹{diff} left)</span>
                    ) : (
                      <span className="text-rose-400 font-black">₹{totalTalliedNotes} (+₹{Math.abs(diff)} extra)</span>
                    )}
                  </div>

                  {/* 1-Tap Quick Auto-Fill Shortcuts (e.g. 150 notes of 100) */}
                  {targetCash > 0 && (
                    <div className="flex items-center gap-1.5 overflow-x-auto pt-2 pb-0.5 mt-1 border-t border-slate-800/80">
                      <span className="text-[10px] text-slate-500 font-bold uppercase shrink-0">Auto:</span>
                      {targetCash >= 500 && (
                        <button
                          type="button"
                          onClick={() => setDenoms({ c500: Math.floor(targetCash / 500), c200: 0, c100: 0, c50: 0, c20: 0, c10: 0, c5: 0, coins: targetCash % 500 })}
                          className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-blue-300 border border-slate-700 rounded-md text-[10px] font-bold shrink-0 active:scale-95"
                        >
                          All 500s ({Math.floor(targetCash / 500)})
                        </button>
                      )}
                      {targetCash >= 200 && (
                        <button
                          type="button"
                          onClick={() => setDenoms({ c500: 0, c200: Math.floor(targetCash / 200), c100: 0, c50: 0, c20: 0, c10: 0, c5: 0, coins: targetCash % 200 })}
                          className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-blue-300 border border-slate-700 rounded-md text-[10px] font-bold shrink-0 active:scale-95"
                        >
                          All 200s ({Math.floor(targetCash / 200)})
                        </button>
                      )}
                      {targetCash >= 100 && (
                        <button
                          type="button"
                          onClick={() => setDenoms({ c500: 0, c200: 0, c100: Math.floor(targetCash / 100), c50: 0, c20: 0, c10: 0, c5: 0, coins: targetCash % 100 })}
                          className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-blue-300 border border-slate-700 rounded-md text-[10px] font-bold shrink-0 active:scale-95"
                        >
                          All 100s ({Math.floor(targetCash / 100)})
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDenoms({ c500: 0, c200: 0, c100: 0, c50: 0, c20: 0, c10: 0, c5: 0, coins: 0 })}
                        className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-rose-300 border border-slate-700 rounded-md text-[10px] font-bold shrink-0 active:scale-95"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>

                {/* Direct Type Note Inputs (No +- buttons, pure typing) */}
                <div className="space-y-1.5 flex-1 overflow-y-auto max-h-[170px] pr-0.5">
                  {[500, 200, 100, 50, 20, 10].map((note) => {
                    const key = `c${note}` as keyof DenominationBreakdown;
                    const count = denoms[key] || 0;
                    return (
                      <div key={note} className="flex items-center justify-between bg-slate-900 px-2.5 py-1.5 rounded-xl border border-slate-800 focus-within:border-blue-500">
                        <div className="flex items-center gap-1.5 min-w-[55px]">
                          <span className="text-xs font-black text-white">₹{note}</span>
                          <span className="text-[10px] text-slate-500 font-bold">×</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="0"
                            value={count === 0 ? '' : count}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '');
                              const num = val === '' ? 0 : parseInt(val, 10);
                              setDenoms(prev => ({ ...prev, [key]: num }));
                            }}
                            className="w-20 py-1 px-2 text-center text-sm font-black text-white bg-slate-950 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg outline-none"
                          />
                          <span className="text-[11px] font-black text-emerald-400 w-16 text-right truncate">
                            {count > 0 ? formatCurrency(count * note) : '—'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-1.5 pt-1">
                  <button
                    onClick={() => setWizardStep(4)}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs rounded-xl shadow-md flex items-center justify-center gap-1 active:scale-95 transition-all"
                  >
                    <span>Next: Summary & Print</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => {
                      setDenoms({ c500: 0, c200: 0, c100: 0, c50: 0, c20: 0, c10: 0, c5: 0, coins: 0 });
                      setWizardStep(4);
                    }}
                    className="w-full py-1.5 bg-slate-800 text-amber-300 border border-slate-700 rounded-lg text-[11px] font-bold active:scale-95"
                  >
                    ⚡ Skip Notes & Print Directly
                  </button>
                </div>
              </div>
            );
          })()}

          {/* STEP 4: RECEIPT SUMMARY & 1-TAP PRINT */}
          {wizardStep === 4 && (
            <div className="flex-1 flex flex-col justify-between py-2 space-y-2">
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-1.5 text-xs">
                <div className="text-[10px] text-slate-400 font-bold uppercase border-b border-slate-800 pb-1">
                  Receipt Summary
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Party:</span>
                  <span className="font-bold text-white truncate max-w-[140px]">{activeParty.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Received:</span>
                  <span className="font-black text-emerald-400 text-sm">₹ {inputAmount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Mode:</span>
                  <span className="font-bold text-blue-400">
                    {paymentMode === 'SPLIT' ? `Cash ₹${cashPart} + UPI ₹${onlinePart}` : paymentMode}
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-800 pt-1">
                  <span className="text-slate-400">Remaining Due:</span>
                  <span className="font-bold text-white">
                    {formatCurrency(Math.max(0, activeParty.currentBalance - Number(inputAmount)))}
                  </span>
                </div>
              </div>

              {/* GIANT ACTION BUTTONS */}
              <div className="space-y-2">
                <button
                  onClick={() => handleCompleteReceipt(true)}
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-black text-sm rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all"
                >
                  <Printer className="w-5 h-5 text-white" />
                  <span>SAVE & PRINT SLIP</span>
                </button>

                <button
                  onClick={() => handleCompleteReceipt(false)}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-lg transition-all"
                >
                  Save Only (No Print)
                </button>

                <button
                  onClick={() => setWizardStep(paymentMode === 'UPI' ? 2 : 3)}
                  className="w-full py-1 text-slate-500 hover:text-slate-300 text-[11px]"
                >
                  ‹ Back to Edit
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MANAGE ROUTES MODAL */}
      {isRouteModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 flex flex-col justify-between p-3 animate-in fade-in duration-150 overflow-y-auto">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
              <h3 className="font-bold text-sm text-white flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-purple-400" /> Manage Collection Routes
              </h3>
              <button
                onClick={() => setIsRouteModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Existing Routes List */}
            <div className="space-y-1.5 max-h-[160px] overflow-y-auto mb-3">
              {routes.map((r) => (
                <div key={r.id} className="p-2 bg-slate-900 rounded-lg border border-slate-800 flex items-center justify-between">
                  <div className="min-w-0">
                    <h5 className="font-bold text-xs text-white truncate">{r.name}</h5>
                    <p className="text-[10px] text-slate-400 truncate">{r.keywords.join(', ')}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteRoute(r.id)}
                    className="p-1 text-slate-500 hover:text-rose-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add New Route Form */}
            <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 space-y-2">
              <span className="text-xs font-bold text-purple-300 block">+ Add New Route</span>
              <input
                type="text"
                placeholder="Route Name (e.g. Tirla Circle)"
                value={newRouteName}
                onChange={(e) => setNewRouteName(e.target.value)}
                className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white outline-none"
              />
              <input
                type="text"
                placeholder="Villages/Keywords (comma separated)"
                value={newRouteKeywords}
                onChange={(e) => setNewRouteKeywords(e.target.value)}
                className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white outline-none"
              />
              <button
                onClick={handleAddNewRoute}
                className="w-full py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-lg"
              >
                Save Route
              </button>
            </div>
          </div>

          <button
            onClick={() => {
              setRoutes(DEFAULT_COLLECTION_ROUTES);
              saveStoredRoutes(DEFAULT_COLLECTION_ROUTES);
              showToast('✓ Restored Default Routes');
            }}
            className="w-full py-1 text-slate-500 hover:text-slate-300 text-[10px]"
          >
            Reset to Default Routes
          </button>
        </div>
      )}

      {/* BLUETOOTH PRINTER CONFIG MODAL */}
      {isPrinterModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 flex flex-col justify-between p-3 animate-in fade-in duration-150">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
              <h3 className="font-bold text-sm text-white flex items-center gap-1.5">
                <Bluetooth className="w-4 h-4 text-blue-400" /> Bluetooth Printer
              </h3>
              <button
                onClick={() => setIsPrinterModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-slate-400 mb-2">
              Select your paired thermal printer from Android Settings:
            </p>

            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {pairedPrinters.length === 0 ? (
                <div className="p-3 bg-slate-900 rounded-lg text-xs text-slate-400 text-center">
                  No paired Bluetooth devices found. Pair your 58mm printer in watch Android Settings first (PIN 0000 or 1234).
                </div>
              ) : (
                pairedPrinters.map((dev) => {
                  const isSelected = selectedPrinterAddress === dev.address;
                  return (
                    <button
                      key={dev.address}
                      onClick={() => {
                        setSelectedPrinterAddress(dev.address);
                        localStorage.setItem('vyapar_watch_default_printer_mac', dev.address);
                        showToast(`✓ Selected ${dev.name}`);
                      }}
                      className={`w-full p-2 rounded-lg border text-left flex items-center justify-between ${
                        isSelected
                          ? 'bg-blue-950/80 border-blue-500 text-white'
                          : 'bg-slate-900 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-xs">{dev.name || 'Bluetooth Printer'}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{dev.address}</div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-blue-400" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <button
            onClick={() => setIsPrinterModalOpen(false)}
            className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
};
