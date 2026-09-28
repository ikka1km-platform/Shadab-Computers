import React, { useState, useMemo } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Package, 
  Wallet, 
  Calculator, 
  Building, 
  FileSpreadsheet, 
  Printer, 
  Calendar, 
  AlertTriangle, 
  ArrowUpRight, 
  ArrowDownLeft, 
  MessageCircle,
  FileText,
  Clock,
  CheckCircle,
  ChevronDown,
  Scale,
  Landmark,
  ShieldAlert,
  Search,
  CheckCircle2,
  RefreshCw,
  PhoneCall,
  ArrowRightLeft
} from 'lucide-react';
import { Party, Transaction, Item, BusinessProfile, Firm, BankAccount } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { exportToCsv } from '../../utils/exportToCsv';
import { DenominationReport } from './DenominationReport';
import { PaymentReminderModal } from '../reminders/PaymentReminderModal';

interface ReportsProps {
  parties: Party[];
  transactions: Transaction[];
  items: Item[];
  profile: BusinessProfile;
  firms?: Firm[];
  bankAccounts?: BankAccount[];
  initialFirmId?: number | 'ALL';
}

type ReportTab = 
  | 'pnl' 
  | 'balance_sheet' 
  | 'cashflow' 
  | 'aging' 
  | 'receivables' 
  | 'sales' 
  | 'purchases' 
  | 'stock' 
  | 'denomination';

type DateFilter = 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'THIS_YEAR' | 'ALL' | 'CUSTOM';
type AgingPartyType = 'CUSTOMERS' | 'SUPPLIERS';

export const Reports: React.FC<ReportsProps> = ({
  parties,
  transactions,
  items,
  profile,
  firms = [],
  bankAccounts = [],
  initialFirmId = 'ALL',
}) => {
  const [reportTab, setReportTab] = useState<ReportTab>('pnl');
  const [selectedFirmId, setSelectedFirmId] = useState<number | 'ALL'>(initialFirmId);
  const [dateFilter, setDateFilter] = useState<DateFilter>('THIS_MONTH');
  const [customStartDate, setCustomStartDate] = useState<string>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  );
  const [customEndDate, setCustomEndDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [partyToRemind, setPartyToRemind] = useState<Party | null>(null);

  // Aging sub-tab & search
  const [agingPartyType, setAgingPartyType] = useState<AgingPartyType>('CUSTOMERS');
  const [agingSearchQuery, setAgingSearchQuery] = useState<string>('');

  // Cashflow filter tab (All, Inflow, Outflow, Contra)
  const [cashflowTableFilter, setCashflowTableFilter] = useState<'ALL' | 'IN' | 'OUT' | 'CONTRA'>('ALL');

  const activeFirm = selectedFirmId !== 'ALL' ? firms.find((f) => f.id === Number(selectedFirmId)) : undefined;

  // Filter transactions by Firm
  const firmFilteredTxs = useMemo(() => {
    return selectedFirmId === 'ALL'
      ? transactions
      : transactions.filter((tx) => {
          if (tx.firmId !== undefined) return tx.firmId === Number(selectedFirmId);
          if (activeFirm && tx.firmName) return tx.firmName.toLowerCase() === activeFirm.name.toLowerCase();
          if (activeFirm?.isDefault && !tx.firmName) return true;
          return false;
        });
  }, [transactions, selectedFirmId, activeFirm]);

  // Filter transactions by Date Range
  const filteredTxs = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    return firmFilteredTxs.filter((tx) => {
      const txDateStr = tx.date;
      if (dateFilter === 'ALL') return true;
      if (dateFilter === 'TODAY') return txDateStr === todayStr;

      if (dateFilter === 'THIS_WEEK') {
        const txTime = new Date(txDateStr).getTime();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        return txTime >= startOfWeek.getTime();
      }

      if (dateFilter === 'THIS_MONTH') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        return txDateStr >= startOfMonth && txDateStr <= todayStr;
      }

      if (dateFilter === 'THIS_YEAR') {
        const startOfYear = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
        return txDateStr >= startOfYear && txDateStr <= todayStr;
      }

      if (dateFilter === 'CUSTOM') {
        return txDateStr >= customStartDate && txDateStr <= customEndDate;
      }

      return true;
    });
  }, [firmFilteredTxs, dateFilter, customStartDate, customEndDate]);

  // Aggregate metrics
  const totalSales = useMemo(() => {
    return filteredTxs
      .filter((tx) => tx.type === 'SALE')
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [filteredTxs]);

  const totalSalesReturns = useMemo(() => {
    return filteredTxs
      .filter((tx) => tx.type === 'CREDIT_NOTE')
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [filteredTxs]);

  const totalSalesCash = useMemo(() => {
    return filteredTxs
      .filter((tx) => tx.type === 'SALE' && tx.paymentMode === 'CASH')
      .reduce((sum, tx) => sum + (tx.paidAmount !== undefined ? tx.paidAmount : tx.amount), 0);
  }, [filteredTxs]);

  const totalSalesBank = useMemo(() => {
    return filteredTxs
      .filter((tx) => tx.type === 'SALE' && (tx.paymentMode === 'BANK' || tx.paymentMode === 'UPI'))
      .reduce((sum, tx) => sum + (tx.paidAmount !== undefined ? tx.paidAmount : tx.amount), 0);
  }, [filteredTxs]);

  const totalSalesCredit = useMemo(() => {
    return filteredTxs
      .filter((tx) => tx.type === 'SALE')
      .reduce((sum, tx) => sum + (tx.balanceDue || 0), 0);
  }, [filteredTxs]);

  const totalPurchases = useMemo(() => {
    return filteredTxs
      .filter((tx) => tx.type === 'PURCHASE')
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [filteredTxs]);

  const totalPurchaseReturns = useMemo(() => {
    return filteredTxs
      .filter((tx) => tx.type === 'DEBIT_NOTE')
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [filteredTxs]);

  const totalExpenses = useMemo(() => {
    return filteredTxs
      .filter((tx) => tx.type === 'EXPENSE')
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [filteredTxs]);

  const totalPaymentsIn = useMemo(() => {
    return filteredTxs
      .filter((tx) => tx.type === 'PAYMENT_IN')
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [filteredTxs]);

  const totalPaymentsOut = useMemo(() => {
    return filteredTxs
      .filter((tx) => tx.type === 'PAYMENT_OUT')
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [filteredTxs]);

  const grossProfitEstimate = (totalSales - totalSalesReturns) - (totalPurchases - totalPurchaseReturns);
  const netProfit = grossProfitEstimate - totalExpenses;
  const profitMarginPercent = totalSales > 0 ? ((netProfit / totalSales) * 100).toFixed(1) : '0.0';

  // Receivables & Payables
  const debtors = useMemo(() => {
    return parties
      .filter((p) => p.partyType === 'CUSTOMER' && p.currentBalance > 0)
      .sort((a, b) => b.currentBalance - a.currentBalance);
  }, [parties]);

  const totalReceivables = debtors.reduce((sum, p) => sum + p.currentBalance, 0);

  const creditors = useMemo(() => {
    return parties
      .filter((p) => p.partyType === 'SUPPLIER' && p.currentBalance < 0)
      .sort((a, b) => Math.abs(b.currentBalance) - Math.abs(a.currentBalance));
  }, [parties]);

  const totalPayables = creditors.reduce((sum, p) => sum + Math.abs(p.currentBalance), 0);

  // Stock summary
  const totalStockCost = items.reduce((sum, it) => sum + it.stockQuantity * it.purchasePrice, 0);
  const totalStockSaleValue = items.reduce((sum, it) => sum + it.stockQuantity * it.salePrice, 0);
  const lowStockItems = items.filter((it) => it.stockQuantity <= (it.minStockAlert || 5));

  // ----------------------------------------------------
  // BALANCE SHEET CALCULATION
  // ----------------------------------------------------
  // Cash in Hand computed from all transactions
  const cashInHand = useMemo(() => {
    let cash = 0;
    for (const tx of firmFilteredTxs) {
      const amt = tx.paidAmount !== undefined ? tx.paidAmount : tx.amount;
      if (tx.paymentMode === 'CASH') {
        if (tx.type === 'SALE' || tx.type === 'PAYMENT_IN') {
          cash += amt;
        } else if (tx.type === 'PURCHASE' || tx.type === 'PAYMENT_OUT' || tx.type === 'EXPENSE') {
          cash -= amt;
        } else if (tx.type === 'CREDIT_NOTE') {
          cash -= amt; // Refund paid to customer
        } else if (tx.type === 'DEBIT_NOTE') {
          cash += amt; // Refund received from supplier
        }
      } else if (tx.paymentMode === 'SPLIT' && tx.splitPayment?.cashAmount) {
        if (tx.type === 'SALE' || tx.type === 'PAYMENT_IN') {
          cash += tx.splitPayment.cashAmount;
        } else if (tx.type === 'PURCHASE' || tx.type === 'PAYMENT_OUT') {
          cash -= tx.splitPayment.cashAmount;
        }
      }

      // Contra transfers
      if (tx.type === 'CONTRA') {
        if (tx.contraType === 'BANK_TO_CASH') {
          cash += tx.amount; // Cash increased
        } else if (tx.contraType === 'CASH_TO_BANK') {
          cash -= tx.amount; // Cash decreased
        }
      }
    }
    return cash;
  }, [firmFilteredTxs]);

  // Bank Balances total
  const totalBankBalance = useMemo(() => {
    return bankAccounts.reduce((sum, b) => sum + (b.currentBalance || 0), 0);
  }, [bankAccounts]);

  // Total Assets
  const totalAssets = Math.max(0, cashInHand) + totalBankBalance + totalStockCost + totalReceivables;

  // Liabilities & Equity
  const totalSundryCreditors = totalPayables;
  const balanceSheetNetProfit = netProfit;
  // Proprietor Capital balances the sheet: Assets = Liabilities + Capital + NetProfit
  const proprietorCapital = totalAssets - totalSundryCreditors - balanceSheetNetProfit;
  const totalLiabilitiesAndEquity = totalSundryCreditors + proprietorCapital + balanceSheetNetProfit;

  // ----------------------------------------------------
  // CASH FLOW STATEMENT (DIRECT METHOD) CALCULATION
  // ----------------------------------------------------
  const cashflowStats = useMemo(() => {
    let operatingInflows = 0;
    let operatingOutflows = 0;
    let contraCashToBank = 0;
    let contraBankToCash = 0;
    let contraBankToBank = 0;

    for (const tx of filteredTxs) {
      const amt = tx.paidAmount !== undefined ? tx.paidAmount : tx.amount;

      if (tx.type === 'SALE') {
        operatingInflows += amt;
      } else if (tx.type === 'PAYMENT_IN') {
        operatingInflows += tx.amount;
      } else if (tx.type === 'DEBIT_NOTE') {
        operatingInflows += amt;
      } else if (tx.type === 'PURCHASE') {
        operatingOutflows += amt;
      } else if (tx.type === 'PAYMENT_OUT') {
        operatingOutflows += tx.amount;
      } else if (tx.type === 'EXPENSE') {
        operatingOutflows += tx.amount;
      } else if (tx.type === 'CREDIT_NOTE') {
        operatingOutflows += amt;
      } else if (tx.type === 'CONTRA') {
        if (tx.contraType === 'CASH_TO_BANK') contraCashToBank += tx.amount;
        if (tx.contraType === 'BANK_TO_CASH') contraBankToCash += tx.amount;
        if (tx.contraType === 'BANK_TO_BANK') contraBankToBank += tx.amount;
      }
    }

    const netOperatingCashflow = operatingInflows - operatingOutflows;
    const totalContraVolume = contraCashToBank + contraBankToCash + contraBankToBank;

    return {
      operatingInflows,
      operatingOutflows,
      netOperatingCashflow,
      contraCashToBank,
      contraBankToCash,
      contraBankToBank,
      totalContraVolume,
      netChangeInLiquidity: netOperatingCashflow
    };
  }, [filteredTxs]);

  // ----------------------------------------------------
  // AGING ANALYSIS CALCULATION (0-30, 31-60, 61-90, 90+ DAYS)
  // ----------------------------------------------------
  const calculatePartyAging = (party: Party, isCustomer: boolean) => {
    const rawBalance = isCustomer ? party.currentBalance : Math.abs(party.currentBalance);
    let remaining = rawBalance;

    const buckets = {
      current: 0,    // 0-30 days
      days31_60: 0,  // 31-60 days
      days61_90: 0,  // 61-90 days
      days90Plus: 0, // 90+ days
    };

    if (remaining <= 0) {
      return { buckets, totalDue: 0, riskLevel: 'LOW' as const };
    }

    const targetType = isCustomer ? 'SALE' : 'PURCHASE';
    const partyTxs = firmFilteredTxs
      .filter((tx) => (tx.partyId === party.id || tx.partyName === party.name) && tx.type === targetType)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const now = new Date().getTime();

    for (const tx of partyTxs) {
      if (remaining <= 0) break;
      const txDue = tx.balanceDue !== undefined && tx.balanceDue > 0 ? tx.balanceDue : tx.amount;
      const alloc = Math.min(remaining, txDue);
      if (alloc <= 0) continue;

      const txTime = new Date(tx.date).getTime();
      const ageDays = Math.max(0, Math.floor((now - txTime) / (1000 * 60 * 60 * 24)));

      if (ageDays <= 30) {
        buckets.current += alloc;
      } else if (ageDays <= 60) {
        buckets.days31_60 += alloc;
      } else if (ageDays <= 90) {
        buckets.days61_90 += alloc;
      } else {
        buckets.days90Plus += alloc;
      }

      remaining -= alloc;
    }

    // Any remaining balance older than available invoices goes to 90+ days bucket
    if (remaining > 0) {
      buckets.days90Plus += remaining;
    }

    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    if (buckets.days90Plus > 0.4 * rawBalance || buckets.days90Plus >= 10000) {
      riskLevel = 'CRITICAL';
    } else if (buckets.days61_90 > 0.3 * rawBalance || buckets.days61_90 >= 5000) {
      riskLevel = 'HIGH';
    } else if (buckets.days31_60 > 0) {
      riskLevel = 'MEDIUM';
    }

    return { buckets, totalDue: rawBalance, riskLevel };
  };

  const debtorsAging = useMemo(() => {
    return debtors.map((p) => {
      const { buckets, totalDue, riskLevel } = calculatePartyAging(p, true);
      return { party: p, totalDue, buckets, riskLevel };
    });
  }, [debtors, firmFilteredTxs]);

  const creditorsAging = useMemo(() => {
    return creditors.map((p) => {
      const { buckets, totalDue, riskLevel } = calculatePartyAging(p, false);
      return { party: p, totalDue, buckets, riskLevel };
    });
  }, [creditors, firmFilteredTxs]);

  const activeAgingList = agingPartyType === 'CUSTOMERS' ? debtorsAging : creditorsAging;

  const filteredAgingList = useMemo(() => {
    if (!agingSearchQuery.trim()) return activeAgingList;
    const q = agingSearchQuery.toLowerCase();
    return activeAgingList.filter(
      (item) =>
        item.party.name.toLowerCase().includes(q) ||
        (item.party.phone && item.party.phone.includes(q)) ||
        (item.party.accountCode && item.party.accountCode.toLowerCase().includes(q))
    );
  }, [activeAgingList, agingSearchQuery]);

  const activeAgingTotals = useMemo(() => {
    return filteredAgingList.reduce(
      (acc, item) => {
        acc.total += item.totalDue;
        acc.current += item.buckets.current;
        acc.days31_60 += item.buckets.days31_60;
        acc.days61_90 += item.buckets.days61_90;
        acc.days90Plus += item.buckets.days90Plus;
        return acc;
      },
      { total: 0, current: 0, days31_60: 0, days61_90: 0, days90Plus: 0 }
    );
  }, [filteredAgingList]);

  // ----------------------------------------------------
  // CSV EXPORTERS
  // ----------------------------------------------------
  const handleExportBalanceSheetCsv = () => {
    const headers = ['Head / Category', 'Account Particulars', 'Amount (₹)'];
    const rows = [
      ['ASSETS', 'Cash-in-Hand', Math.max(0, cashInHand)],
      ['ASSETS', 'Bank Accounts Total', totalBankBalance],
      ...bankAccounts.map((b) => ['ASSETS (Bank)', `${b.bankName} - ${b.accountName} (•••${b.accountNumber.slice(-4)})`, b.currentBalance]),
      ['ASSETS', 'Closing Stock Valuation (at cost)', totalStockCost],
      ['ASSETS', 'Sundry Debtors (Customer Receivables)', totalReceivables],
      ['TOTAL ASSETS', 'Total Assets', totalAssets],
      ['LIABILITIES', 'Sundry Creditors (Supplier Payables)', totalSundryCreditors],
      ['EQUITY', "Proprietor's Capital Account", proprietorCapital],
      ['EQUITY', 'Net Profit / Retained Earnings', balanceSheetNetProfit],
      ['TOTAL LIABILITIES & EQUITY', 'Total Liabilities & Equity', totalLiabilitiesAndEquity],
    ];
    exportToCsv(`Balance_Sheet_${activeFirm ? activeFirm.name : 'Consolidated'}`, headers, rows);
  };

  const handleExportCashflowCsv = () => {
    const headers = ['Category / Step', 'Particulars', 'Amount (₹)'];
    const rows = [
      ['A. Operating Cash Inflows', 'Cash Sales Collected', totalSalesCash + totalSalesBank],
      ['A. Operating Cash Inflows', 'Customer Payment In Collections', totalPaymentsIn],
      ['A. Operating Cash Inflows', 'Total Operating Inflows (+)', cashflowStats.operatingInflows],
      ['B. Operating Cash Outflows', 'Cash Purchases Paid', totalPurchases],
      ['B. Operating Cash Outflows', 'Supplier Payment Out Disbursed', totalPaymentsOut],
      ['B. Operating Cash Outflows', 'Operating Expenses Paid', totalExpenses],
      ['B. Operating Cash Outflows', 'Total Operating Outflows (-)', cashflowStats.operatingOutflows],
      ['C. Net Operating Cash Flow', 'Net Operating Cash Flow', cashflowStats.netOperatingCashflow],
      ['D. Contra Internal Transfers', 'Cash Deposited to Bank (Contra)', cashflowStats.contraCashToBank],
      ['D. Contra Internal Transfers', 'Cash Withdrawn from Bank (Contra)', cashflowStats.contraBankToCash],
      ['D. Contra Internal Transfers', 'Bank to Bank Transfers (Contra)', cashflowStats.contraBankToBank],
      ['E. Net Period Liquidity Change', 'Net Change in Cash & Bank Position', cashflowStats.netChangeInLiquidity],
    ];
    exportToCsv(`Cash_Flow_Statement_${activeFirm ? activeFirm.name : 'Consolidated'}`, headers, rows);
  };

  const handleExportAgingCsv = () => {
    const headers = [
      'Party Name',
      'Type',
      'Account Code',
      'Phone',
      'Total Outstanding (₹)',
      '0-30 Days Current (₹)',
      '31-60 Days (₹)',
      '61-90 Days (₹)',
      '90+ Days Critical (₹)',
      'Risk Classification'
    ];
    const rows = filteredAgingList.map((item) => [
      item.party.name,
      item.party.partyType,
      item.party.accountCode,
      item.party.phone || 'N/A',
      item.totalDue,
      item.buckets.current,
      item.buckets.days31_60,
      item.buckets.days61_90,
      item.buckets.days90Plus,
      item.riskLevel
    ]);
    exportToCsv(`Aging_Analysis_${agingPartyType}`, headers, rows);
  };

  const handleExportSalesCsv = () => {
    const sales = filteredTxs.filter((tx) => tx.type === 'SALE' || tx.type === 'CREDIT_NOTE');
    const headers = ['Voucher No', 'Type', 'Date', 'Party Name', 'Total Amount', 'Paid Amount', 'Balance Due', 'Payment Status', 'Payment Mode', 'Firm'];
    const rows = sales.map((tx) => [
      tx.voucherNumber,
      tx.type,
      tx.date,
      tx.partyName || 'Cash Sale',
      tx.amount,
      tx.paidAmount ?? tx.amount,
      tx.balanceDue ?? 0,
      tx.paymentStatus ?? 'PAID',
      tx.paymentMode,
      tx.firmName || 'Default Firm'
    ]);
    exportToCsv(`Sales_Register_${activeFirm ? activeFirm.name : 'Consolidated'}`, headers, rows);
  };

  const handleExportPurchasesCsv = () => {
    const purchases = filteredTxs.filter((tx) => tx.type === 'PURCHASE' || tx.type === 'DEBIT_NOTE');
    const headers = ['Bill No', 'Type', 'Date', 'Supplier Name', 'Total Amount', 'Paid Amount', 'Balance Due', 'Payment Status', 'Payment Mode', 'Firm'];
    const rows = purchases.map((tx) => [
      tx.voucherNumber,
      tx.type,
      tx.date,
      tx.partyName || 'Cash Supplier',
      tx.amount,
      tx.paidAmount ?? tx.amount,
      tx.balanceDue ?? 0,
      tx.paymentStatus ?? 'PAID',
      tx.paymentMode,
      tx.firmName || 'Default Firm'
    ]);
    exportToCsv(`Purchases_Register_${activeFirm ? activeFirm.name : 'Consolidated'}`, headers, rows);
  };

  const handleExportStockCsv = () => {
    const headers = ['Item Name', 'Item Code / Barcode', 'Category', 'Current Stock', 'Unit', 'Purchase Rate (₹)', 'Sale Rate (₹)', 'Total Valuation (₹)', 'Low Stock Alert'];
    const rows = items.map((it) => [
      it.name,
      it.code || it.barcode || '',
      it.category || 'General',
      it.stockQuantity,
      it.unit,
      it.purchasePrice,
      it.salePrice,
      it.stockQuantity * it.purchasePrice,
      it.stockQuantity <= (it.minStockAlert || 5) ? 'LOW STOCK' : 'IN STOCK'
    ]);
    exportToCsv(`Inventory_Stock_Report`, headers, rows);
  };

  return (
    <div className="space-y-5 pb-16 md:pb-6">
      {/* Top Header & Firm Filter */}
      <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">Reports & Business Analytics</h2>
            {activeFirm && (
              <span className="bg-indigo-100 text-indigo-800 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase flex items-center gap-1">
                <Building className="w-3 h-3" /> {activeFirm.name}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">Comprehensive audit, balance sheet, cashflow, and inventory intelligence for {activeFirm ? activeFirm.name : profile.businessName}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {firms && firms.length > 0 && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl shadow-2xs">
              <Building className="w-4 h-4 text-indigo-600" />
              <select
                value={selectedFirmId}
                onChange={(e) => setSelectedFirmId(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
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

          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-colors cursor-pointer"
            title="Print Current Report"
          >
            <Printer className="w-4 h-4 text-slate-600" />
            <span className="hidden sm:inline">Print</span>
          </button>
        </div>
      </div>

      {/* Report Categories Tab Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {[
          { id: 'pnl', label: 'Profit & Loss (P&L)', icon: BarChart3 },
          { id: 'balance_sheet', label: 'Balance Sheet', icon: Scale },
          { id: 'cashflow', label: 'Cash Flow Statement', icon: Wallet },
          { id: 'aging', label: 'Party Aging Analysis', icon: Users, badge: debtors.length },
          { id: 'sales', label: 'Sales Register', icon: TrendingUp },
          { id: 'purchases', label: 'Purchase Summary', icon: ArrowDownLeft },
          { id: 'stock', label: 'Stock & Inventory', icon: Package, alertBadge: lowStockItems.length },
          { id: 'denomination', label: 'Cash Note Retally', icon: Calculator },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = reportTab === tab.id || (tab.id === 'aging' && reportTab === 'receivables');
          return (
            <button
              key={tab.id}
              onClick={() => setReportTab(tab.id as ReportTab)}
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  isActive ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {tab.badge}
                </span>
              )}
              {tab.alertBadge !== undefined && tab.alertBadge > 0 && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  isActive ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-800'
                }`}>
                  {tab.alertBadge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Date Filters Bar (Shown for appropriate date-filtered tabs) */}
      {reportTab !== 'denomination' && reportTab !== 'aging' && reportTab !== 'receivables' && (
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-slate-500 mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Date:
            </span>
            {(['TODAY', 'THIS_WEEK', 'THIS_MONTH', 'THIS_YEAR', 'ALL', 'CUSTOM'] as DateFilter[]).map((d) => (
              <button
                key={d}
                onClick={() => setDateFilter(d)}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  dateFilter === d
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {d === 'TODAY' ? 'Today' :
                 d === 'THIS_WEEK' ? 'This Week' :
                 d === 'THIS_MONTH' ? 'This Month' :
                 d === 'THIS_YEAR' ? 'This Year' :
                 d === 'ALL' ? 'All Time' : 'Custom'}
              </button>
            ))}
          </div>

          {dateFilter === 'CUSTOM' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-2 py-1 border border-slate-300 rounded-lg text-xs outline-none"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-2 py-1 border border-slate-300 rounded-lg text-xs outline-none"
              />
            </div>
          )}

          <div className="text-[11px] font-semibold text-slate-400">
            {filteredTxs.length} Transactions in period
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB CONTENT: CASH DENOMINATION                       */}
      {/* ==================================================== */}
      {reportTab === 'denomination' && (
        <DenominationReport 
          transactions={transactions} 
          profile={profile} 
          firms={firms}
          initialFirmId={selectedFirmId}
          onSelectFirm={(fId) => setSelectedFirmId(fId)}
        />
      )}

      {/* ==================================================== */}
      {/* TAB CONTENT: PROFIT & LOSS                           */}
      {/* ==================================================== */}
      {reportTab === 'pnl' && (
        <div className="space-y-5">
          {/* Hero Banner */}
          <div className="bg-gradient-to-tr from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-2xl text-white shadow-md border border-indigo-900/50">
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                  Net Profit Estimate ({dateFilter.replace('_', ' ')})
                </span>
                <div className={`text-3xl md:text-4xl font-black mt-1 ${netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {formatCurrency(netProfit)}
                </div>
              </div>
              <div className="bg-white/10 backdrop-blur-xs px-3.5 py-2 rounded-xl text-right">
                <span className="text-[10px] text-indigo-200 block uppercase font-bold">Net Profit Margin</span>
                <span className="text-lg font-black text-white">{profitMarginPercent}%</span>
              </div>
            </div>
            <p className="text-xs text-indigo-200/80 mt-3 pt-3 border-t border-indigo-800/40">
              Calculation: Revenue (₹{totalSales.toLocaleString()}) - Purchases (₹{totalPurchases.toLocaleString()}) - Operating Expenses (₹{totalExpenses.toLocaleString()})
            </p>
          </div>

          {/* Breakdown Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-bold text-slate-400 uppercase">Gross Revenue / Sales</span>
              <div className="text-2xl font-black text-emerald-600 mt-2">{formatCurrency(totalSales)}</div>
              <div className="mt-3 pt-3 border-t border-slate-100 text-xs space-y-1 text-slate-600">
                <div className="flex justify-between">
                  <span>Cash Collections:</span>
                  <span className="font-bold">{formatCurrency(totalSalesCash)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Bank & UPI:</span>
                  <span className="font-bold">{formatCurrency(totalSalesBank)}</span>
                </div>
                <div className="flex justify-between text-amber-700">
                  <span>Pending Due (Udhar):</span>
                  <span className="font-bold">{formatCurrency(totalSalesCredit)}</span>
                </div>
                {totalSalesReturns > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>Sale Returns:</span>
                    <span className="font-bold">-{formatCurrency(totalSalesReturns)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-bold text-slate-400 uppercase">Goods Cost / Purchases</span>
              <div className="text-2xl font-black text-amber-600 mt-2">{formatCurrency(totalPurchases)}</div>
              <div className="mt-3 pt-3 border-t border-slate-100 text-xs space-y-1 text-slate-600">
                <div className="flex justify-between">
                  <span>Total Inward Bills:</span>
                  <span className="font-bold">{filteredTxs.filter((t) => t.type === 'PURCHASE').length} Bills</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Current Inventory Value:</span>
                  <span className="font-bold text-slate-800">{formatCurrency(totalStockCost)}</span>
                </div>
                {totalPurchaseReturns > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Purchase Returns:</span>
                    <span className="font-bold">-{formatCurrency(totalPurchaseReturns)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-bold text-slate-400 uppercase">Operating Expenses</span>
              <div className="text-2xl font-black text-rose-600 mt-2">{formatCurrency(totalExpenses)}</div>
              <div className="mt-3 pt-3 border-t border-slate-100 text-xs space-y-1 text-slate-600">
                <div className="flex justify-between">
                  <span>Expense Records:</span>
                  <span className="font-bold">{filteredTxs.filter((t) => t.type === 'EXPENSE').length} Entries</span>
                </div>
                <div className="flex justify-between text-indigo-700">
                  <span>Gross Margin:</span>
                  <span className="font-bold">{formatCurrency(grossProfitEstimate)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB CONTENT: BALANCE SHEET                          */}
      {/* ==================================================== */}
      {reportTab === 'balance_sheet' && (
        <div className="space-y-5">
          {/* Header Action & Status Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
                <Scale className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-slate-800 text-sm tracking-tight">Statement of Financial Position (Balance Sheet)</h3>
                <p className="text-xs text-slate-400">As on {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} • Standard Dual-Column Accounting</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold shadow-2xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Balanced
              </span>
              <button
                type="button"
                onClick={handleExportBalanceSheetCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel / CSV
              </button>
            </div>
          </div>

          {/* Dual Column Layout: Assets vs Liabilities & Equity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* LEFT COLUMN: ASSETS */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col justify-between">
              <div>
                <div className="p-4 bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    <h4 className="font-black text-sm uppercase tracking-wide">Assets (Resources Owned)</h4>
                  </div>
                  <span className="text-xs font-bold bg-white/20 px-2 py-0.5 rounded-full">Current & Liquid</span>
                </div>

                <div className="p-5 space-y-4">
                  {/* Cash in Hand */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
                        <Wallet className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-xs text-slate-800">Cash-in-Hand</div>
                        <div className="text-[11px] text-slate-400">Physical drawer & till float</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-sm text-slate-900">{formatCurrency(Math.max(0, cashInHand))}</div>
                      {cashInHand < 0 && (
                        <div className="text-[10px] text-rose-500 font-bold">Negative till alert</div>
                      )}
                    </div>
                  </div>

                  {/* Bank Accounts */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 text-blue-800 rounded-lg">
                          <Landmark className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-xs text-slate-800">Bank Accounts & UPI Balances</div>
                          <div className="text-[11px] text-slate-400">{bankAccounts.length} Connected accounts</div>
                        </div>
                      </div>
                      <div className="font-black text-sm text-blue-600">{formatCurrency(totalBankBalance)}</div>
                    </div>

                    {bankAccounts.length > 0 && (
                      <div className="pt-2 border-t border-slate-200/60 space-y-1.5">
                        {bankAccounts.map((b) => (
                          <div key={b.id} className="flex items-center justify-between text-xs text-slate-600 pl-4 border-l-2 border-blue-300">
                            <div>
                              <span className="font-semibold">{b.bankName}</span> - {b.accountName}
                              <span className="text-[10px] text-slate-400 font-mono ml-1.5">(•••{b.accountNumber.slice(-4)})</span>
                            </div>
                            <span className="font-bold text-slate-800">{formatCurrency(b.currentBalance)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Closing Stock Inventory */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-amber-100 text-amber-800 rounded-lg">
                        <Package className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-xs text-slate-800">Closing Stock Inventory (At Cost)</div>
                        <div className="text-[11px] text-slate-400">{items.length} Products catalogued</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-sm text-slate-900">{formatCurrency(totalStockCost)}</div>
                      <div className="text-[10px] text-slate-400">Retail: {formatCurrency(totalStockSaleValue)}</div>
                    </div>
                  </div>

                  {/* Sundry Debtors (Receivables) */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 text-indigo-800 rounded-lg">
                          <Users className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-xs text-slate-800">Sundry Debtors (Customer Receivables)</div>
                          <div className="text-[11px] text-slate-400">{debtors.length} Customers with pending dues</div>
                        </div>
                      </div>
                      <div className="font-black text-sm text-indigo-600">{formatCurrency(totalReceivables)}</div>
                    </div>

                    {debtors.slice(0, 3).length > 0 && (
                      <div className="pt-2 border-t border-slate-200/60 space-y-1">
                        {debtors.slice(0, 3).map((d) => (
                          <div key={d.id} className="flex items-center justify-between text-[11px] text-slate-500 pl-4 border-l-2 border-indigo-300">
                            <span>{d.name}</span>
                            <span className="font-semibold text-slate-700">{formatCurrency(d.currentBalance)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Total Assets Footer */}
              <div className="p-4 bg-emerald-50 border-t border-emerald-200 flex items-center justify-between">
                <div className="font-black text-xs uppercase tracking-wider text-emerald-900">Total Assets</div>
                <div className="text-xl font-black text-emerald-700">{formatCurrency(totalAssets)}</div>
              </div>
            </div>

            {/* RIGHT COLUMN: LIABILITIES & EQUITY */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col justify-between">
              <div>
                <div className="p-4 bg-gradient-to-r from-slate-900 to-indigo-900 text-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Scale className="w-5 h-5 text-indigo-300" />
                    <h4 className="font-black text-sm uppercase tracking-wide">Liabilities & Capital (Claims)</h4>
                  </div>
                  <span className="text-xs font-bold bg-white/20 px-2 py-0.5 rounded-full">Equities & Dues</span>
                </div>

                <div className="p-5 space-y-4">
                  {/* Sundry Creditors (Payables) */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-rose-100 text-rose-800 rounded-lg">
                          <Users className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-xs text-slate-800">Sundry Creditors (Supplier Payables)</div>
                          <div className="text-[11px] text-slate-400">{creditors.length} Suppliers with pending balance</div>
                        </div>
                      </div>
                      <div className="font-black text-sm text-rose-600">{formatCurrency(totalSundryCreditors)}</div>
                    </div>

                    {creditors.slice(0, 3).length > 0 && (
                      <div className="pt-2 border-t border-slate-200/60 space-y-1">
                        {creditors.slice(0, 3).map((c) => (
                          <div key={c.id} className="flex items-center justify-between text-[11px] text-slate-500 pl-4 border-l-2 border-rose-300">
                            <span>{c.name}</span>
                            <span className="font-semibold text-slate-700">{formatCurrency(Math.abs(c.currentBalance))}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Capital Account */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-100 text-purple-800 rounded-lg">
                        <Building className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-xs text-slate-800">Proprietor's Capital Account</div>
                        <div className="text-[11px] text-slate-400">Owner equity & business net worth</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-sm text-slate-900">{formatCurrency(proprietorCapital)}</div>
                    </div>
                  </div>

                  {/* Retained Earnings / Net Profit */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-100 text-indigo-800 rounded-lg">
                        <BarChart3 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-xs text-slate-800">Retained Earnings / Net Profit</div>
                        <div className="text-[11px] text-slate-400">Net operating surplus from P&L</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-black text-sm ${balanceSheetNetProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {formatCurrency(balanceSheetNetProfit)}
                      </div>
                    </div>
                  </div>

                  {/* Equity Verification Note */}
                  <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl text-[11px] text-indigo-900 space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-indigo-600" /> Double-Entry Equity Equation:
                    </div>
                    <p className="text-indigo-800/80">
                      Assets ({formatCurrency(totalAssets)}) = Liabilities ({formatCurrency(totalSundryCreditors)}) + Owner's Equity ({formatCurrency(proprietorCapital + balanceSheetNetProfit)})
                    </p>
                  </div>
                </div>
              </div>

              {/* Total Liabilities & Equity Footer */}
              <div className="p-4 bg-slate-900 border-t border-slate-800 text-white flex items-center justify-between">
                <div className="font-black text-xs uppercase tracking-wider text-slate-300">Total Liabilities & Equity</div>
                <div className="text-xl font-black text-indigo-400">{formatCurrency(totalLiabilitiesAndEquity)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB CONTENT: CASH FLOW STATEMENT (DIRECT METHOD)     */}
      {/* ==================================================== */}
      {reportTab === 'cashflow' && (
        <div className="space-y-5">
          {/* Header Action Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-black text-slate-800 text-sm">Formal Cash Flow Statement (Direct Method)</h3>
              <p className="text-xs text-slate-400">Tracking operating cash receipts, payments, and internal bank contra shifts</p>
            </div>
            <button
              onClick={handleExportCashflowCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" /> Export Cash Flow CSV
            </button>
          </div>

          {/* Key Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Operating Cash Inflows</span>
              <div className="text-2xl font-black text-emerald-600 mt-1">+{formatCurrency(cashflowStats.operatingInflows)}</div>
              <span className="text-[10px] text-slate-400 mt-1 block">Sales & Customer receipts</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Operating Cash Outflows</span>
              <div className="text-2xl font-black text-rose-600 mt-1">-{formatCurrency(cashflowStats.operatingOutflows)}</div>
              <span className="text-[10px] text-slate-400 mt-1 block">Purchases, Suppliers & Expenses</span>
            </div>

            <div className={`p-4 rounded-2xl border shadow-xs ${
              cashflowStats.netOperatingCashflow >= 0 ? 'bg-emerald-50/70 border-emerald-200' : 'bg-rose-50/70 border-rose-200'
            }`}>
              <span className={`text-[11px] font-bold uppercase tracking-wide ${
                cashflowStats.netOperatingCashflow >= 0 ? 'text-emerald-800' : 'text-rose-800'
              }`}>
                Net Operating Cash Flow
              </span>
              <div className={`text-2xl font-black mt-1 ${
                cashflowStats.netOperatingCashflow >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}>
                {cashflowStats.netOperatingCashflow >= 0 ? '+' : ''}{formatCurrency(cashflowStats.netOperatingCashflow)}
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">Inflows minus Outflows</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Contra Transfer Volume</span>
              <div className="text-2xl font-black text-indigo-600 mt-1">{formatCurrency(cashflowStats.totalContraVolume)}</div>
              <span className="text-[10px] text-slate-400 mt-1 block">Cash ⇄ Bank movements</span>
            </div>
          </div>

          {/* Structured Formal Cash Flow Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-xs uppercase tracking-wide">Cash Flow Statement for Period</span>
              </div>
              <span className="text-xs text-slate-300 font-mono">Date: {dateFilter.replace('_', ' ')}</span>
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              {/* SECTION A: OPERATING INFLOWS */}
              <div className="p-4 bg-slate-50/60 font-black text-slate-800 uppercase tracking-wide flex justify-between">
                <span>A. Cash Flows from Operating Activities</span>
                <span className="text-slate-400 font-normal lowercase">(direct method)</span>
              </div>

              <div className="px-4 py-2.5 flex justify-between hover:bg-slate-50">
                <span className="text-slate-600 pl-4">• Cash & Bank Collections from Sales Invoices</span>
                <span className="font-bold text-emerald-600">+{formatCurrency(totalSalesCash + totalSalesBank)}</span>
              </div>

              <div className="px-4 py-2.5 flex justify-between hover:bg-slate-50">
                <span className="text-slate-600 pl-4">• Payment-In Receipts from Debtors / Customers</span>
                <span className="font-bold text-emerald-600">+{formatCurrency(totalPaymentsIn)}</span>
              </div>

              {totalPurchaseReturns > 0 && (
                <div className="px-4 py-2.5 flex justify-between hover:bg-slate-50">
                  <span className="text-slate-600 pl-4">• Purchase Return Refunds from Suppliers (Debit Notes)</span>
                  <span className="font-bold text-emerald-600">+{formatCurrency(totalPurchaseReturns)}</span>
                </div>
              )}

              <div className="px-4 py-2.5 flex justify-between bg-emerald-50/30 font-bold text-emerald-900">
                <span className="pl-4">Subtotal: Total Operating Cash Receipts</span>
                <span>+{formatCurrency(cashflowStats.operatingInflows)}</span>
              </div>

              {/* OPERATING OUTFLOWS */}
              <div className="px-4 py-2.5 flex justify-between hover:bg-slate-50">
                <span className="text-slate-600 pl-4">• Cash & Bank Paid for Purchase Invoices</span>
                <span className="font-bold text-rose-600">-{formatCurrency(totalPurchases)}</span>
              </div>

              <div className="px-4 py-2.5 flex justify-between hover:bg-slate-50">
                <span className="text-slate-600 pl-4">• Payment-Out Disbursed to Suppliers / Creditors</span>
                <span className="font-bold text-rose-600">-{formatCurrency(totalPaymentsOut)}</span>
              </div>

              <div className="px-4 py-2.5 flex justify-between hover:bg-slate-50">
                <span className="text-slate-600 pl-4">• Operating Business Expenses Paid</span>
                <span className="font-bold text-rose-600">-{formatCurrency(totalExpenses)}</span>
              </div>

              {totalSalesReturns > 0 && (
                <div className="px-4 py-2.5 flex justify-between hover:bg-slate-50">
                  <span className="text-slate-600 pl-4">• Sale Return Refunds to Customers (Credit Notes)</span>
                  <span className="font-bold text-rose-600">-{formatCurrency(totalSalesReturns)}</span>
                </div>
              )}

              <div className="px-4 py-2.5 flex justify-between bg-rose-50/30 font-bold text-rose-900">
                <span className="pl-4">Subtotal: Total Operating Cash Disbursed</span>
                <span>-{formatCurrency(cashflowStats.operatingOutflows)}</span>
              </div>

              <div className="p-4 bg-slate-100 flex justify-between font-black text-slate-900 text-sm">
                <span>Net Cash from Operating Activities</span>
                <span className={cashflowStats.netOperatingCashflow >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                  {cashflowStats.netOperatingCashflow >= 0 ? '+' : ''}{formatCurrency(cashflowStats.netOperatingCashflow)}
                </span>
              </div>

              {/* SECTION B: CONTRA & INTERNAL SHIFTS */}
              <div className="p-4 bg-slate-50/60 font-black text-slate-800 uppercase tracking-wide flex justify-between">
                <span>B. Financing & Internal Contra Transfers</span>
                <span className="text-slate-400 font-normal lowercase">(liquidity reallocations)</span>
              </div>

              <div className="px-4 py-2.5 flex justify-between hover:bg-slate-50">
                <span className="text-slate-600 pl-4">• Cash Deposited to Bank (Cash Out, Bank In)</span>
                <span className="font-semibold text-slate-800">{formatCurrency(cashflowStats.contraCashToBank)}</span>
              </div>

              <div className="px-4 py-2.5 flex justify-between hover:bg-slate-50">
                <span className="text-slate-600 pl-4">• Cash Withdrawn from Bank (Bank Out, Cash In)</span>
                <span className="font-semibold text-slate-800">{formatCurrency(cashflowStats.contraBankToCash)}</span>
              </div>

              <div className="px-4 py-2.5 flex justify-between hover:bg-slate-50">
                <span className="text-slate-600 pl-4">• Inter-Bank Account Transfers</span>
                <span className="font-semibold text-slate-800">{formatCurrency(cashflowStats.contraBankToBank)}</span>
              </div>

              {/* SUMMARY: NET PERIOD CHANGE */}
              <div className="p-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex justify-between items-center text-sm font-black">
                <span>Net Period Change in Liquidity (Cash & Bank)</span>
                <span className="text-lg text-emerald-400">
                  {cashflowStats.netChangeInLiquidity >= 0 ? '+' : ''}{formatCurrency(cashflowStats.netChangeInLiquidity)}
                </span>
              </div>
            </div>
          </div>

          {/* Transaction Ledger & Daybook Audit Trail */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-3 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wide">Cash & Bank Transaction Audit Trail</h4>
              
              <div className="flex items-center gap-1.5 flex-wrap text-xs">
                {(['ALL', 'IN', 'OUT', 'CONTRA'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setCashflowTableFilter(filter)}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      cashflowTableFilter === filter
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {filter === 'ALL' ? 'All Movements' :
                     filter === 'IN' ? 'Money In (+)' :
                     filter === 'OUT' ? 'Money Out (-)' : 'Contra Transfers (⇄)'}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Voucher #</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Particulars / Party</th>
                    <th className="p-3">Mode</th>
                    <th className="p-3 text-right">Inflow (+)</th>
                    <th className="p-3 text-right">Outflow (-)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredTxs.filter((tx) => {
                    const isMoneyIn = tx.type === 'SALE' || tx.type === 'PAYMENT_IN' || tx.type === 'DEBIT_NOTE';
                    const isContra = tx.type === 'CONTRA';
                    if (cashflowTableFilter === 'IN') return isMoneyIn && !isContra;
                    if (cashflowTableFilter === 'OUT') return !isMoneyIn && !isContra;
                    if (cashflowTableFilter === 'CONTRA') return isContra;
                    return true;
                  }).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">
                        No transactions recorded matching the selected filter.
                      </td>
                    </tr>
                  ) : (
                    filteredTxs
                      .filter((tx) => {
                        const isMoneyIn = tx.type === 'SALE' || tx.type === 'PAYMENT_IN' || tx.type === 'DEBIT_NOTE';
                        const isContra = tx.type === 'CONTRA';
                        if (cashflowTableFilter === 'IN') return isMoneyIn && !isContra;
                        if (cashflowTableFilter === 'OUT') return !isMoneyIn && !isContra;
                        if (cashflowTableFilter === 'CONTRA') return isContra;
                        return true;
                      })
                      .map((tx) => {
                        const isMoneyIn = tx.type === 'SALE' || tx.type === 'PAYMENT_IN' || tx.type === 'DEBIT_NOTE';
                        const isContra = tx.type === 'CONTRA';
                        return (
                          <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-3 font-mono font-bold text-slate-800">{tx.voucherNumber}</td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                isContra
                                  ? 'bg-purple-100 text-purple-800'
                                  : isMoneyIn
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}>
                                {tx.type.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="p-3 text-slate-500 whitespace-nowrap">{formatDate(tx.date)}</td>
                            <td className="p-3 font-semibold text-slate-800">
                              {tx.partyName || tx.description || (isContra ? `Contra: ${tx.contraType?.replace(/_/g, ' ')}` : '-')}
                            </td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 uppercase">
                                {tx.paymentMode}
                              </span>
                            </td>
                            <td className="p-3 text-right font-black text-emerald-600">
                              {isMoneyIn ? formatCurrency(tx.amount) : '-'}
                            </td>
                            <td className="p-3 text-right font-black text-rose-600">
                              {!isMoneyIn ? formatCurrency(tx.amount) : '-'}
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB CONTENT: PARTY AGING ANALYSIS (UDHAR & BAAKI)     */}
      {/* ==================================================== */}
      {(reportTab === 'aging' || reportTab === 'receivables') && (
        <div className="space-y-5">
          {/* Header Bar with Sub-Tabs & Export */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setAgingPartyType('CUSTOMERS')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    agingPartyType === 'CUSTOMERS'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Customer Receivables ({debtors.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAgingPartyType('SUPPLIERS')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    agingPartyType === 'SUPPLIERS'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Supplier Payables ({creditors.length})
                </button>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search party or phone..."
                  value={agingSearchQuery}
                  onChange={(e) => setAgingSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-500 focus:bg-white w-44 sm:w-56"
                />
              </div>
            </div>

            <button
              onClick={handleExportAgingCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer self-start md:self-auto"
            >
              <FileSpreadsheet className="w-4 h-4" /> Export Aging CSV
            </button>
          </div>

          {/* Aging Summary Bucket Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="col-span-2 md:col-span-1 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                Total {agingPartyType === 'CUSTOMERS' ? 'Receivables' : 'Payables'}
              </span>
              <div className={`text-2xl font-black mt-1 ${agingPartyType === 'CUSTOMERS' ? 'text-emerald-700' : 'text-rose-700'}`}>
                {formatCurrency(activeAgingTotals.total)}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">{filteredAgingList.length} Parties pending</span>
            </div>

            <div className="bg-emerald-50/70 border border-emerald-200 p-3.5 rounded-2xl">
              <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wide flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" /> 0-30 Days (Current)
              </span>
              <div className="text-lg md:text-xl font-black text-emerald-700 mt-1">
                {formatCurrency(activeAgingTotals.current)}
              </div>
              <span className="text-[10px] text-emerald-600/80 mt-0.5 block">Fresh / Within Terms</span>
            </div>

            <div className="bg-amber-50/70 border border-amber-200 p-3.5 rounded-2xl">
              <span className="text-[10px] font-black text-amber-800 uppercase tracking-wide flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-600" /> 31-60 Days
              </span>
              <div className="text-lg md:text-xl font-black text-amber-700 mt-1">
                {formatCurrency(activeAgingTotals.days31_60)}
              </div>
              <span className="text-[10px] text-amber-700/80 mt-0.5 block">Follow-up Recommended</span>
            </div>

            <div className="bg-orange-50/70 border border-orange-200 p-3.5 rounded-2xl">
              <span className="text-[10px] font-black text-orange-800 uppercase tracking-wide flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-orange-600" /> 61-90 Days
              </span>
              <div className="text-lg md:text-xl font-black text-orange-700 mt-1">
                {formatCurrency(activeAgingTotals.days61_90)}
              </div>
              <span className="text-[10px] text-orange-700/80 mt-0.5 block">Overdue Warning</span>
            </div>

            <div className="bg-rose-50/70 border border-rose-200 p-3.5 rounded-2xl">
              <span className="text-[10px] font-black text-rose-800 uppercase tracking-wide flex items-center gap-1">
                <ShieldAlert className="w-3 h-3 text-rose-600" /> 90+ Days (Critical)
              </span>
              <div className="text-lg md:text-xl font-black text-rose-700 mt-1">
                {formatCurrency(activeAgingTotals.days90Plus)}
              </div>
              <span className="text-[10px] text-rose-700/80 mt-0.5 block">High Default Risk</span>
            </div>
          </div>

          {/* Aging Detailed Breakdown Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Party Name</th>
                    <th className="p-3">Contact</th>
                    <th className="p-3 text-right">Total Outstanding</th>
                    <th className="p-3 text-right text-emerald-700">0–30 Days</th>
                    <th className="p-3 text-right text-amber-700">31–60 Days</th>
                    <th className="p-3 text-right text-orange-700">61–90 Days</th>
                    <th className="p-3 text-right text-rose-700">90+ Days</th>
                    <th className="p-3 text-center">Risk Status</th>
                    <th className="p-3 text-center">Quick Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredAgingList.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-400">
                        🎉 Great! No outstanding {agingPartyType.toLowerCase()} found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredAgingList.map((item) => (
                      <tr key={item.party.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3">
                          <div className="font-bold text-slate-800">{item.party.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{item.party.accountCode || '-'}</div>
                        </td>
                        <td className="p-3 text-slate-600">
                          {item.party.phone ? (
                            <a href={`tel:${item.party.phone}`} className="hover:underline flex items-center gap-1 text-slate-700">
                              <PhoneCall className="w-3 h-3 text-slate-400" /> {item.party.phone}
                            </a>
                          ) : (
                            <span className="text-slate-400">No phone</span>
                          )}
                        </td>
                        <td className="p-3 text-right font-black text-slate-900 text-sm">
                          {formatCurrency(item.totalDue)}
                        </td>
                        <td className="p-3 text-right font-semibold text-emerald-700">
                          {item.buckets.current > 0 ? formatCurrency(item.buckets.current) : '-'}
                        </td>
                        <td className="p-3 text-right font-semibold text-amber-700">
                          {item.buckets.days31_60 > 0 ? formatCurrency(item.buckets.days31_60) : '-'}
                        </td>
                        <td className="p-3 text-right font-semibold text-orange-700">
                          {item.buckets.days61_90 > 0 ? formatCurrency(item.buckets.days61_90) : '-'}
                        </td>
                        <td className="p-3 text-right font-bold text-rose-700">
                          {item.buckets.days90Plus > 0 ? formatCurrency(item.buckets.days90Plus) : '-'}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            item.riskLevel === 'CRITICAL' ? 'bg-rose-100 text-rose-800' :
                            item.riskLevel === 'HIGH' ? 'bg-orange-100 text-orange-800' :
                            item.riskLevel === 'MEDIUM' ? 'bg-amber-100 text-amber-800' :
                            'bg-emerald-100 text-emerald-800'
                          }`}>
                            {item.riskLevel === 'CRITICAL' ? 'Critical (90+d)' :
                             item.riskLevel === 'HIGH' ? 'High Risk' :
                             item.riskLevel === 'MEDIUM' ? 'Follow-up' : 'Current'}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          {agingPartyType === 'CUSTOMERS' ? (
                            <button
                              type="button"
                              onClick={() => setPartyToRemind(item.party)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200 transition-colors cursor-pointer shadow-2xs"
                              title="Send WhatsApp Payment Reminder with UPI link"
                            >
                              <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Remind</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400 font-semibold">Vendor Due</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB CONTENT: SALES REGISTER                          */}
      {/* ==================================================== */}
      {reportTab === 'sales' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Detailed Sales Register</h3>
              <p className="text-xs text-slate-400">Total Sales: {formatCurrency(totalSales)}</p>
            </div>
            <button
              onClick={handleExportSalesCsv}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" /> Export Sales to Excel / CSV
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Bill / Voucher</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Payment Mode</th>
                    <th className="p-3 text-right">Bill Total</th>
                    <th className="p-3 text-right">Received</th>
                    <th className="p-3 text-right">Due Balance</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredTxs.filter((t) => t.type === 'SALE' || t.type === 'CREDIT_NOTE').length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400">
                        No sales vouchers recorded in this period.
                      </td>
                    </tr>
                  ) : (
                    filteredTxs.filter((t) => t.type === 'SALE' || t.type === 'CREDIT_NOTE').map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 font-mono font-bold text-blue-600">{tx.voucherNumber}</td>
                        <td className="p-3 text-slate-500 whitespace-nowrap">{formatDate(tx.date)}</td>
                        <td className="p-3 font-semibold text-slate-800">{tx.partyName || 'Cash Sale'}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 uppercase">
                            {tx.paymentMode}
                          </span>
                        </td>
                        <td className="p-3 text-right font-black text-slate-900">{formatCurrency(tx.amount)}</td>
                        <td className="p-3 text-right font-semibold text-emerald-600">
                          {formatCurrency(tx.paidAmount ?? tx.amount)}
                        </td>
                        <td className="p-3 text-right font-semibold text-rose-600">
                          {tx.balanceDue ? formatCurrency(tx.balanceDue) : '-'}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            tx.paymentStatus === 'PAID' ? 'bg-emerald-100 text-emerald-800' :
                            tx.paymentStatus === 'UNPAID' ? 'bg-rose-100 text-rose-800' :
                            'bg-amber-100 text-amber-800'
                          }`}>
                            {tx.paymentStatus || 'PAID'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB CONTENT: PURCHASES REGISTER                      */}
      {/* ==================================================== */}
      {reportTab === 'purchases' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Purchase Bills Register</h3>
              <p className="text-xs text-slate-400">Total Inward: {formatCurrency(totalPurchases)}</p>
            </div>
            <button
              onClick={handleExportPurchasesCsv}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" /> Export Purchases to CSV
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Bill No</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Supplier</th>
                    <th className="p-3">Mode</th>
                    <th className="p-3 text-right">Amount</th>
                    <th className="p-3 text-right">Paid</th>
                    <th className="p-3 text-right">Due</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredTxs.filter((t) => t.type === 'PURCHASE' || t.type === 'DEBIT_NOTE').length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400">
                        No purchase bills recorded in this period.
                      </td>
                    </tr>
                  ) : (
                    filteredTxs.filter((t) => t.type === 'PURCHASE' || t.type === 'DEBIT_NOTE').map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 font-mono font-bold text-purple-600">{tx.voucherNumber}</td>
                        <td className="p-3 text-slate-500 whitespace-nowrap">{formatDate(tx.date)}</td>
                        <td className="p-3 font-semibold text-slate-800">{tx.partyName || 'Cash Supplier'}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 uppercase">
                            {tx.paymentMode}
                          </span>
                        </td>
                        <td className="p-3 text-right font-black text-slate-900">{formatCurrency(tx.amount)}</td>
                        <td className="p-3 text-right font-semibold text-emerald-600">
                          {formatCurrency(tx.paidAmount ?? tx.amount)}
                        </td>
                        <td className="p-3 text-right font-semibold text-rose-600">
                          {tx.balanceDue ? formatCurrency(tx.balanceDue) : '-'}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            tx.paymentStatus === 'PAID' ? 'bg-emerald-100 text-emerald-800' :
                            tx.paymentStatus === 'UNPAID' ? 'bg-rose-100 text-rose-800' :
                            'bg-amber-100 text-amber-800'
                          }`}>
                            {tx.paymentStatus || 'PAID'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB CONTENT: STOCK & LOW STOCK ALERTS               */}
      {/* ==================================================== */}
      {reportTab === 'stock' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-bold text-slate-400 uppercase">Inventory Cost Valuation</span>
              <div className="text-2xl font-black text-slate-800 mt-1">{formatCurrency(totalStockCost)}</div>
              <span className="text-[11px] text-slate-500 mt-1 block">Based on purchase prices</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-bold text-slate-400 uppercase">Retail / Sales Valuation</span>
              <div className="text-2xl font-black text-blue-600 mt-1">{formatCurrency(totalStockSaleValue)}</div>
              <span className="text-[11px] text-slate-500 mt-1 block">Expected revenue when fully sold</span>
            </div>

            <div className={`p-5 rounded-2xl border shadow-xs ${
              lowStockItems.length > 0 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'
            }`}>
              <span className={`text-xs font-bold uppercase ${lowStockItems.length > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                Low Stock Warning
              </span>
              <div className={`text-2xl font-black mt-1 ${lowStockItems.length > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                {lowStockItems.length} Items Below Reorder Level
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">Requires inventory restocking</span>
            </div>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="font-bold text-slate-800 text-sm">Inventory Catalogue & Stock Status</h3>
            <button
              onClick={handleExportStockCsv}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" /> Export Stock to Excel / CSV
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Item Name</th>
                    <th className="p-3">Code / Barcode</th>
                    <th className="p-3">Category</th>
                    <th className="p-3 text-right">Current Stock</th>
                    <th className="p-3 text-right">Purchase Rate</th>
                    <th className="p-3 text-right">Sale Rate</th>
                    <th className="p-3 text-right">Total Valuation</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {items.map((it) => {
                    const isLow = it.stockQuantity <= (it.minStockAlert || 5);
                    return (
                      <tr key={it.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 font-bold text-slate-800">{it.name}</td>
                        <td className="p-3 font-mono text-slate-500">{it.code || it.barcode || '-'}</td>
                        <td className="p-3 text-slate-600">{it.category || 'General'}</td>
                        <td className="p-3 text-right font-black text-slate-900">
                          {it.stockQuantity} {it.unit}
                        </td>
                        <td className="p-3 text-right text-slate-600">{formatCurrency(it.purchasePrice)}</td>
                        <td className="p-3 text-right text-blue-600 font-semibold">{formatCurrency(it.salePrice)}</td>
                        <td className="p-3 text-right font-black text-slate-900">
                          {formatCurrency(it.stockQuantity * it.purchasePrice)}
                        </td>
                        <td className="p-3 text-center">
                          {isLow ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 inline-flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Low Stock
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              ✓ In Stock
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Reminder Modal for Debtors in Report */}
      {partyToRemind && (
        <PaymentReminderModal
          isOpen={Boolean(partyToRemind)}
          onClose={() => setPartyToRemind(null)}
          party={partyToRemind}
          profile={profile}
          bankAccounts={bankAccounts}
        />
      )}
    </div>
  );
};
