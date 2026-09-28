import React, { useState } from 'react';
import { 
  Search, 
  UserPlus, 
  ArrowDownLeft, 
  ArrowUpRight, 
  ChevronRight, 
  Phone,
  MessageCircle,
  Trash2
} from 'lucide-react';
import { Party, PartyType, BusinessProfile, BankAccount, UserRole } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { PaymentReminderModal } from '../reminders/PaymentReminderModal';
import { canViewSupplierFinances } from '../../utils/userSession';

interface PartyListProps {
  parties: Party[];
  profile?: BusinessProfile;
  bankAccounts?: BankAccount[];
  currentRole?: 'Owner' | UserRole;
  initialFilter?: 'CUSTOMER' | 'SUPPLIER' | 'ALL' | 'RECEIVABLE' | 'PAYABLE';
  onSelectParty: (party: Party) => void;
  onOpenAddModal: (type: PartyType) => void;
  onDeleteParty?: (id: number) => Promise<void> | void;
}

export const PartyList: React.FC<PartyListProps> = ({
  parties,
  profile,
  bankAccounts = [],
  currentRole = 'Owner',
  initialFilter = 'CUSTOMER',
  onSelectParty,
  onOpenAddModal,
  onDeleteParty,
}) => {
  const isSupplierFinancesAllowed = canViewSupplierFinances(currentRole);
  const [filterType, setFilterType] = useState<string>(
    initialFilter === 'RECEIVABLE' ? 'RECEIVABLE' : initialFilter === 'PAYABLE' ? 'PAYABLE' : initialFilter
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [partyToRemind, setPartyToRemind] = useState<Party | null>(null);

  const filteredParties = parties
    .filter((p) => {
      let matchesType = true;
      if (filterType === 'CUSTOMER') matchesType = p.partyType === 'CUSTOMER';
      else if (filterType === 'SUPPLIER') matchesType = p.partyType === 'SUPPLIER';
      else if (filterType === 'RECEIVABLE') matchesType = p.partyType === 'CUSTOMER' && p.currentBalance > 0;
      else if (filterType === 'PAYABLE') matchesType = p.partyType === 'SUPPLIER' && p.currentBalance < 0;

      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.phone?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.accountCode?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesType && matchesSearch;
    })
    .sort((a, b) => {
      if (filterType === 'CUSTOMER' || filterType === 'RECEIVABLE') {
        // High receivable first (> 0), then 0 / settled, then negative
        return b.currentBalance - a.currentBalance;
      } else if (filterType === 'SUPPLIER' || filterType === 'PAYABLE') {
        // High payable first (< 0 -> highest absolute value), then 0, then positive
        return Math.abs(b.currentBalance) - Math.abs(a.currentBalance);
      }
      return Math.abs(b.currentBalance) - Math.abs(a.currentBalance);
    });

  const totalReceivables = parties
    .filter((p) => p.partyType === 'CUSTOMER' && p.currentBalance > 0)
    .reduce((sum, p) => sum + p.currentBalance, 0);

  const totalPayables = parties
    .filter((p) => p.partyType === 'SUPPLIER' && p.currentBalance < 0)
    .reduce((sum, p) => sum + Math.abs(p.currentBalance), 0);

  return (
    <div className="space-y-2.5 sm:space-y-3.5 pb-16 md:pb-6">
      <div className="bg-white p-3 sm:p-4 md:p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-800">Parties & Ledgers</h2>
          <p className="text-[11px] sm:text-xs text-slate-500">Sorted by highest dues first (Vyapar ledger standard)</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpenAddModal('CUSTOMER')}
            className="flex-1 md:flex-none px-3.5 py-1.5 sm:px-4 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs md:text-sm font-bold rounded-lg shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4" /> + Customer
          </button>
          {isSupplierFinancesAllowed && (
            <button
              onClick={() => onOpenAddModal('SUPPLIER')}
              className="flex-1 md:flex-none px-3.5 py-1.5 sm:px-4 sm:py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs md:text-sm font-bold rounded-lg shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <UserPlus className="w-4 h-4" /> + Supplier
            </button>
          )}
        </div>
      </div>

      <div className={`grid gap-2 sm:gap-3 ${isSupplierFinancesAllowed ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div 
          onClick={() => setFilterType('RECEIVABLE')}
          className={`border rounded-xl p-2.5 sm:p-3.5 flex items-center justify-between cursor-pointer transition-all ${
            filterType === 'RECEIVABLE' ? 'bg-emerald-100 border-emerald-500 shadow-sm ring-2 ring-emerald-300' : 'bg-emerald-50/70 border-emerald-200/60 hover:bg-emerald-100/70'
          }`}
        >
          <div>
            <span className="text-[11px] sm:text-xs font-bold text-emerald-800 uppercase flex items-center gap-1">
              Total Customer Receivables {filterType === 'RECEIVABLE' && '✓ Active'}
            </span>
            <div className="text-base sm:text-lg md:text-xl font-black text-emerald-700">{formatCurrency(totalReceivables)}</div>
            <span className="text-[9px] sm:text-[10px] text-emerald-800/80 font-medium">Click to filter high dues</span>
          </div>
          <ArrowDownLeft className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600 shrink-0" />
        </div>

        {isSupplierFinancesAllowed && (
          <div 
            onClick={() => setFilterType('PAYABLE')}
            className={`border rounded-xl p-2.5 sm:p-3.5 flex items-center justify-between cursor-pointer transition-all ${
              filterType === 'PAYABLE' ? 'bg-rose-100 border-rose-500 shadow-sm ring-2 ring-rose-300' : 'bg-rose-50/70 border-rose-200/60 hover:bg-rose-100/70'
            }`}
          >
            <div>
              <span className="text-[11px] sm:text-xs font-bold text-rose-800 uppercase flex items-center gap-1">
                Total Payables {filterType === 'PAYABLE' && '✓ Active'}
              </span>
              <div className="text-base sm:text-lg md:text-xl font-black text-rose-700">{formatCurrency(totalPayables)}</div>
              <span className="text-[9px] sm:text-[10px] text-rose-800/80 font-medium">Click to filter high payables</span>
            </div>
            <ArrowUpRight className="w-5 h-5 sm:w-6 sm:h-6 text-rose-600 shrink-0" />
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <div className="flex flex-wrap bg-slate-100 p-1 rounded-xl gap-1">
          <button
            onClick={() => setFilterType('CUSTOMER')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              filterType === 'CUSTOMER' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600'
            }`}
          >
            All Customers ({parties.filter((p) => p.partyType === 'CUSTOMER').length})
          </button>
          <button
            onClick={() => setFilterType('RECEIVABLE')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              filterType === 'RECEIVABLE' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600'
            }`}
          >
            Receivables Only ({parties.filter((p) => p.partyType === 'CUSTOMER' && p.currentBalance > 0).length})
          </button>
          {isSupplierFinancesAllowed && (
            <>
              <button
                onClick={() => setFilterType('SUPPLIER')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  filterType === 'SUPPLIER' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600'
                }`}
              >
                Suppliers ({parties.filter((p) => p.partyType === 'SUPPLIER').length})
              </button>
              <button
                onClick={() => setFilterType('PAYABLE')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  filterType === 'PAYABLE' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600'
                }`}
              >
                Payables Only ({parties.filter((p) => p.partyType === 'SUPPLIER' && p.currentBalance < 0).length})
              </button>
            </>
          )}
          <button
            onClick={() => setFilterType('ALL')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              filterType === 'ALL' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600'
            }`}
          >
            All ({parties.length})
          </button>
        </div>

        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search party by name, phone, code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none shadow-xs"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs divide-y divide-slate-100 overflow-hidden">
        {filteredParties.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            No parties found matching your search.
          </div>
        ) : (
          filteredParties.map((p) => {
            const isReceivable = p.currentBalance > 0;
            const isPayable = p.currentBalance < 0;

            return (
              <div
                key={p.id}
                onClick={() => onSelectParty(p)}
                className="p-3.5 md:p-4 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${
                    p.partyType === 'CUSTOMER' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                  }`}>
                    {p.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-bold text-slate-800 text-sm flex items-center gap-2">
                      {p.name}
                      <span className="text-[10px] text-slate-400 font-mono font-normal">#{p.accountCode}</span>
                    </div>
                    <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                      <Phone className="w-3 h-3" />
                      <span>{p.phone || 'No phone'}</span>
                      {p.address && (
                        <>
                          <span>&bull;</span>
                          <span className="truncate max-w-xs">{p.address}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className={`font-black text-sm md:text-base ${
                      isReceivable ? 'text-emerald-600' : isPayable ? 'text-rose-600' : 'text-slate-700'
                    }`}>
                      {formatCurrency(Math.abs(p.currentBalance))}
                    </div>
                    <div className="text-[10px] font-semibold text-slate-400">
                      {isReceivable ? "You'll Receive" : isPayable ? "You'll Give" : 'Settled (0.00)'}
                    </div>
                  </div>

                  {isReceivable && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPartyToRemind(p);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-lg border border-emerald-200 transition-colors shadow-2xs"
                      title="Send WhatsApp Payment Reminder with UPI link"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="hidden sm:inline">Remind</span>
                    </button>
                  )}

                  {onDeleteParty && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteParty(p.id!);
                      }}
                      className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title={`Delete ${p.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}

                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
              </div>
            );
          })
        )}
      </div>

      {partyToRemind && profile && (
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
