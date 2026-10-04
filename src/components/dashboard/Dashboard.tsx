import React from 'react';
import { 
  ArrowDownLeft, 
  ArrowUpRight, 
  Wallet, 
  Building,
  Building2, 
  ShoppingCart, 
  Sparkles
} from 'lucide-react';
import { Party, Transaction, BusinessProfile, Firm, BankAccount, UserRole } from '../../types';
import { formatCurrency, formatDate, compareTransactionsDesc } from '../../utils/formatters';
import { canViewSupplierFinances, canViewCashTally } from '../../utils/userSession';

interface DashboardProps {
  parties: Party[];
  transactions: Transaction[];
  firms?: Firm[];
  bankAccounts?: BankAccount[];
  profile?: BusinessProfile;
  currentRole?: 'Owner' | UserRole;
  currentUserName?: string;
  selectedFirmId?: number | 'ALL';
  onChangeFirmFilter?: (firmId: number | 'ALL') => void;
  onOpenTxModal: (type?: any) => void;
  onSelectParty: (party: Party) => void;
  onViewAllTxs: () => void;
  onNavigateToParties?: (filter: 'RECEIVABLE' | 'PAYABLE' | 'CUSTOMER' | 'SUPPLIER') => void;
  onNavigateToDaybook?: (mode?: string) => void;
  onOpenBankingModal?: () => void;
  onOpenDailyPdfSync?: () => void;
  onOpenRecoveryQueue?: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  parties,
  transactions,
  firms = [],
  bankAccounts = [],
  profile,
  currentRole = 'Owner',
  currentUserName,
  selectedFirmId = 'ALL',
  onChangeFirmFilter,
  onOpenTxModal,
  onSelectParty,
  onViewAllTxs,
  onNavigateToParties,
  onNavigateToDaybook,
  onOpenBankingModal,
  onOpenDailyPdfSync,
  onOpenRecoveryQueue,
}) => {
  const isSupplierFinancesAllowed = canViewSupplierFinances(currentRole);
  const isCashTallyAllowed = canViewCashTally(currentRole);
  // Filter transactions by selected firm if not 'ALL'
  const firmTxs = selectedFirmId === 'ALL'
    ? transactions
    : transactions.filter((t) => t.firmId === Number(selectedFirmId));

  const firmParties = selectedFirmId === 'ALL'
    ? parties
    : parties.filter((p) => !p.firmId || p.firmId === Number(selectedFirmId));

  const totalReceivable = firmParties
    .filter((p) => p.partyType === 'CUSTOMER' && p.currentBalance > 0)
    .reduce((acc, p) => acc + p.currentBalance, 0);

  const totalPayable = firmParties
    .filter((p) => p.partyType === 'SUPPLIER' && p.currentBalance < 0)
    .reduce((acc, p) => acc + Math.abs(p.currentBalance), 0);

  let cashInHand = 0;
  let bankBalance = 0;

  firmTxs.forEach((tx) => {
    const isPositive = tx.type === 'PAYMENT_IN' || tx.type === 'SALE';
    const isNegative = tx.type === 'PAYMENT_OUT' || tx.type === 'PURCHASE' || tx.type === 'EXPENSE';

    // For sales & purchases, only the amount actually paid/received impacts cash drawer
    const effectiveAmount = (tx.type === 'SALE' || tx.type === 'PURCHASE')
      ? (tx.paidAmount !== undefined ? tx.paidAmount : (tx.paymentStatus === 'UNPAID' ? 0 : tx.amount))
      : tx.amount;

    if (effectiveAmount <= 0) return;

    if (tx.paymentMode === 'SPLIT' && tx.splitPayment) {
      if (isPositive) {
        cashInHand += tx.splitPayment.cashAmount;
        bankBalance += tx.splitPayment.onlineAmount;
      } else if (isNegative) {
        cashInHand -= tx.splitPayment.cashAmount;
        bankBalance -= tx.splitPayment.onlineAmount;
      }
    } else {
      const isCash = tx.paymentMode === 'CASH';
      const isBank = tx.paymentMode === 'BANK' || tx.paymentMode === 'UPI' || tx.paymentMode === 'CHEQUE';

      if (isPositive) {
        if (isCash) cashInHand += effectiveAmount;
        if (isBank) bankBalance += effectiveAmount;
      } else if (isNegative) {
        if (isCash) cashInHand -= effectiveAmount;
        if (isBank) bankBalance -= effectiveAmount;
      }
    }
  });

  const recentTransactions = [...firmTxs]
    .sort(compareTransactionsDesc)
    .slice(0, 5);

  const topDebtors = parties
    .filter((p) => p.currentBalance > 0)
    .sort((a, b) => b.currentBalance - a.currentBalance)
    .slice(0, 4);

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6 pb-16 md:pb-6">
      {/* Sleek Compact Firm & Role Header Bar (Replaces bulky hero banner) */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-white p-2.5 sm:p-3 rounded-xl border border-slate-200/90 shadow-2xs">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Building2 className="w-4.5 h-4.5" />
          </div>
          {firms.length > 0 ? (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs text-slate-500 font-semibold shrink-0">Active Firm:</span>
              <select
                value={selectedFirmId}
                onChange={(e) => onChangeFirmFilter && onChangeFirmFilter(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
                className="bg-slate-50 hover:bg-slate-100 text-slate-900 font-bold border border-slate-300 rounded-lg px-2.5 py-1 outline-none cursor-pointer text-xs truncate max-w-[210px] sm:max-w-xs transition-colors"
              >
                <option value="ALL">All Firms (Consolidated)</option>
                {firms.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <span className="text-xs font-bold text-slate-900 truncate">
              {profile?.businessName || 'Shadab Computers'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 text-xs text-slate-500">
          <span>Welcome, <b className="text-slate-800">{currentUserName || profile?.ownerName || 'Admin'}</b></span>
          {currentRole !== 'Owner' && (
            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[11px] font-extrabold border border-blue-200">
              {currentRole} View
            </span>
          )}
        </div>
      </div>

      {/* Quick Recovery Actions Bar */}
      <div className="bg-gradient-to-r from-slate-900 to-blue-950 p-3 sm:p-4 rounded-2xl text-white shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h3 className="text-sm font-black tracking-tight">Recovery & Debtors Center</h3>
          </div>
          <p className="text-[11px] text-slate-300 mt-0.5">
            Upload daily Tally PDF balances & send 1-tap split-screen Jio reminders
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {onOpenDailyPdfSync && (
            <button
              type="button"
              onClick={onOpenDailyPdfSync}
              className="flex-1 sm:flex-none px-3 py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              📄 Upload Debtors PDF
            </button>
          )}

          {onOpenRecoveryQueue && (
            <button
              type="button"
              onClick={onOpenRecoveryQueue}
              className="flex-1 sm:flex-none px-3 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              ⚡ Jio WhatsApp Queue
            </button>
          )}
        </div>
      </div>

      {/* 4 Interactive KPI Tiles (Clickable & Role-Scoped) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
        {/* TILE 1: YOU'LL GET (Receivables) */}
        <div 
          onClick={() => onNavigateToParties && onNavigateToParties('RECEIVABLE')}
          className="bg-white rounded-xl p-3 sm:p-4 md:p-5 border border-emerald-100 hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group relative overflow-hidden"
          title="Click to view all Customers with pending balances"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider group-hover:underline flex items-center gap-1">
              You'll Get &rarr;
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 group-hover:bg-emerald-600 group-hover:text-white flex items-center justify-center text-emerald-600 transition-colors">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-lg md:text-2xl font-black text-emerald-700">{formatCurrency(totalReceivable)}</div>
            <p className="text-[11px] text-slate-500 mt-0.5 group-hover:text-emerald-800 font-medium">
              👉 Customer Debtors
            </p>
          </div>
        </div>

        {/* TILE 2: YOU'LL GIVE (Payables) for Admin, or TOTAL SALES for Salesman */}
        {isSupplierFinancesAllowed ? (
          <div 
            onClick={() => onNavigateToParties && onNavigateToParties('PAYABLE')}
            className="bg-white rounded-xl p-3 sm:p-4 md:p-5 border border-rose-100 hover:border-rose-400 hover:shadow-md transition-all cursor-pointer group relative overflow-hidden"
            title="Click to view all Suppliers you need to pay"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-700 uppercase tracking-wider group-hover:underline flex items-center gap-1">
                You'll Give &rarr;
              </span>
              <div className="w-8 h-8 rounded-lg bg-rose-50 group-hover:bg-rose-600 group-hover:text-white flex items-center justify-center text-rose-600 transition-colors">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 sm:mt-3">
              <div className="text-base sm:text-lg md:text-2xl font-black text-rose-700">{formatCurrency(totalPayable)}</div>
              <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 group-hover:text-rose-800 font-medium">
                👉 Supplier Payables
              </p>
            </div>
          </div>
        ) : (
          <div 
            onClick={() => onViewAllTxs()}
            className="bg-white rounded-xl p-3 sm:p-4 md:p-5 border border-blue-100 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group relative overflow-hidden"
            title="Total sales orders and invoices created"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-700 uppercase tracking-wider group-hover:underline flex items-center gap-1">
                Sales Volume &rarr;
              </span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 group-hover:bg-blue-600 group-hover:text-white flex items-center justify-center text-blue-600 transition-colors">
                <ShoppingCart className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 sm:mt-3">
              <div className="text-base sm:text-lg md:text-2xl font-black text-blue-700">
                {formatCurrency(firmTxs.filter((t) => t.type === 'SALE').reduce((s, t) => s + t.amount, 0))}
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 group-hover:text-blue-800 font-medium">
                👉 Recorded Sales Orders
              </p>
            </div>
          </div>
        )}

        {/* TILE 3: CASH IN HAND or COMPLETED BILLS */}
        {isCashTallyAllowed ? (
          <div 
            onClick={() => onNavigateToDaybook ? onNavigateToDaybook('CASH') : onViewAllTxs()}
            className="bg-white rounded-xl p-3 sm:p-4 md:p-5 border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group relative overflow-hidden"
            title="Click to view Cashbook & Cash Transactions"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider group-hover:underline flex items-center gap-1">
                Cash in Hand &rarr;
              </span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 group-hover:bg-blue-600 group-hover:text-white flex items-center justify-center text-blue-600 transition-colors">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 sm:mt-3">
              <div className="text-base sm:text-lg md:text-2xl font-black text-slate-800">{formatCurrency(cashInHand)}</div>
              <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 group-hover:text-blue-700 font-medium">
                👉 Counter Cashbook
              </p>
            </div>
          </div>
        ) : (
          <div 
            onClick={() => onViewAllTxs()}
            className="bg-white rounded-xl p-3 sm:p-4 md:p-5 border border-slate-200 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group relative overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider group-hover:underline flex items-center gap-1">
                Orders Billed &rarr;
              </span>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 group-hover:bg-indigo-600 group-hover:text-white flex items-center justify-center text-indigo-600 transition-colors">
                <Sparkles className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 sm:mt-3">
              <div className="text-base sm:text-lg md:text-2xl font-black text-indigo-700">
                {firmTxs.filter((t) => t.type === 'SALE').length} Invoices
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 group-hover:text-indigo-800 font-medium">
                👉 View Transactions
              </p>
            </div>
          </div>
        )}

        {/* TILE 4: BANK & UPI or REGISTERED CUSTOMERS */}
        {isSupplierFinancesAllowed ? (
          <div 
            onClick={() => onOpenBankingModal ? onOpenBankingModal() : onViewAllTxs()}
            className="bg-white rounded-xl p-3 sm:p-4 md:p-5 border border-slate-200 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group relative overflow-hidden"
            title="Click to manage Bank Accounts & UPI VPAs"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider group-hover:underline flex items-center gap-1">
                Bank & UPI &rarr;
              </span>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 group-hover:bg-indigo-600 group-hover:text-white flex items-center justify-center text-indigo-600 transition-colors">
                <Building className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 sm:mt-3">
              <div className="text-base sm:text-lg md:text-2xl font-black text-slate-800">{formatCurrency(bankBalance)}</div>
              <p className="text-[10px] sm:text-[11px] text-indigo-600 mt-0.5 font-bold flex items-center justify-between">
                <span>{bankAccounts.length} Banks Linked</span>
                <span className="text-[9px] bg-indigo-50 px-1 py-0.2 rounded group-hover:bg-indigo-100">Manage ⚙️</span>
              </p>
            </div>
          </div>
        ) : (
          <div 
            onClick={() => onNavigateToParties && onNavigateToParties('CUSTOMER')}
            className="bg-white rounded-xl p-3 sm:p-4 md:p-5 border border-slate-200 hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group relative overflow-hidden"
            title="Click to view Customer Accounts Directory"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider group-hover:underline flex items-center gap-1">
                Customers &rarr;
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 group-hover:bg-emerald-600 group-hover:text-white flex items-center justify-center text-emerald-600 transition-colors">
                <Building className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 sm:mt-3">
              <div className="text-base sm:text-lg md:text-2xl font-black text-emerald-700">
                {parties.filter((p) => p.partyType === 'CUSTOMER').length} Customers
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 group-hover:text-emerald-800 font-medium">
                👉 Contact & Bill
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs p-3.5 sm:p-4 md:p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-800 text-base">Recent Transactions & Receipts</h3>
              <p className="text-xs text-slate-500">Includes split payments & cash denomination notes</p>
            </div>
            <button
              onClick={onViewAllTxs}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
            >
              View Daybook &rarr;
            </button>
          </div>

          {recentTransactions.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              No transactions recorded yet. Click above to record your first transaction!
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentTransactions.map((tx) => {
                const isPositive = tx.type === 'PAYMENT_IN' || tx.type === 'SALE';
                return (
                  <div key={tx.id} className="py-3 flex items-center justify-between gap-3 hover:bg-slate-50/70 px-2 rounded-lg transition-colors">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold ${
                          tx.type === 'PAYMENT_IN'
                            ? 'bg-emerald-100 text-emerald-700'
                            : tx.type === 'SALE'
                            ? 'bg-blue-100 text-blue-700'
                            : tx.type === 'PAYMENT_OUT'
                            ? 'bg-rose-100 text-rose-700'
                            : tx.type === 'PURCHASE'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-purple-100 text-purple-700'
                        }`}
                      >
                        {tx.type === 'PAYMENT_IN' ? 'IN' : tx.type === 'SALE' ? 'SALE' : tx.type === 'PAYMENT_OUT' ? 'OUT' : 'BILL'}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-800 text-sm">
                          {tx.partyName || tx.description || 'General Transaction'}
                        </div>
                        <div className="text-xs text-slate-400 flex items-center gap-2">
                          <span>{tx.voucherNumber}</span>
                          <span>&bull;</span>
                          <span>{formatDate(tx.date)}</span>
                          <span>&bull;</span>
                          <span className="uppercase text-[10px] font-semibold bg-slate-100 px-1.5 py-0.2 rounded text-slate-600">
                            {tx.paymentMode === 'SPLIT' ? 'Split (Cash+UPI)' : tx.paymentMode}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div
                        className={`font-bold text-sm ${
                          isPositive ? 'text-emerald-600' : 'text-slate-800'
                        }`}
                      >
                        {isPositive ? '+' : '-'} {formatCurrency(tx.amount)}
                      </div>
                      {tx.cashDenominations && (
                        <div className="text-[10px] text-emerald-600 font-medium">
                          ✓ Notes Attached
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 md:p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-800 text-base">Top Customer Dues</h3>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                Receivables
              </span>
            </div>

            <div className="space-y-2.5 mt-2">
              {topDebtors.map((p) => (
                <div
                  key={p.id}
                  onClick={() => onSelectParty(p)}
                  className="p-2.5 rounded-lg border border-slate-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all cursor-pointer flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold text-slate-800 text-sm">{p.name}</div>
                    <div className="text-[11px] text-slate-400">{p.phone || p.accountCode}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-sm text-emerald-600">{formatCurrency(p.currentBalance)}</div>
                    <div className="text-[10px] text-slate-400">Due to collect</div>
                  </div>
                </div>
              ))}

              {topDebtors.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-6">All customer dues are clear!</p>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100">
            <button
              onClick={() => onOpenTxModal('PAYMENT_IN')}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
            >
              + Quick Customer Receipt (Split / Cash)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
