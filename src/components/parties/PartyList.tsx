import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  UserPlus, 
  ArrowDownLeft, 
  ArrowUpRight, 
  ChevronRight, 
  ChevronLeft,
  Phone,
  MessageCircle, 
  Trash2,
  Edit3,
  MoreVertical,
  Building2,
  FileText,
  Zap
} from 'lucide-react';
import { Party, PartyType, BusinessProfile, BankAccount, UserRole, Firm } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { PaymentReminderModal } from '../reminders/PaymentReminderModal';
import { canViewSupplierFinances } from '../../utils/userSession';

interface PartyListProps {
  parties: Party[];
  profile?: BusinessProfile;
  bankAccounts?: BankAccount[];
  firms?: Firm[];
  currentRole?: 'Owner' | UserRole;
  initialFilter?: 'CUSTOMER' | 'SUPPLIER' | 'ALL' | 'RECEIVABLE' | 'PAYABLE';
  onSelectParty: (party: Party) => void;
  onOpenAddModal: (type: PartyType) => void;
  onEditParty?: (party: Party) => void;
  onDeleteParty?: (id: number) => Promise<void> | void;
  onOpenDailyPdfSync?: () => void;
  onOpenRecoveryQueue?: () => void;
}

export const PartyList: React.FC<PartyListProps> = ({
  parties,
  profile,
  bankAccounts = [],
  firms = [],
  currentRole = 'Owner',
  initialFilter = 'CUSTOMER',
  onSelectParty,
  onOpenAddModal,
  onEditParty,
  onDeleteParty,
  onOpenDailyPdfSync,
  onOpenRecoveryQueue,
}) => {
  const isSupplierFinancesAllowed = canViewSupplierFinances(currentRole);
  const [filterType, setFilterType] = useState<string>(
    initialFilter === 'RECEIVABLE' ? 'RECEIVABLE' : initialFilter === 'PAYABLE' ? 'PAYABLE' : initialFilter
  );
  const [selectedFirmId, setSelectedFirmId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [partyToRemind, setPartyToRemind] = useState<Party | null>(null);
  const [swipedPartyId, setSwipedPartyId] = useState<number | null>(null);

  const touchStartXRef = useRef<number>(0);
  const touchStartYRef = useRef<number>(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent, partyId: number) => {
    const diffX = e.changedTouches[0].clientX - touchStartXRef.current;
    const diffY = e.changedTouches[0].clientY - touchStartYRef.current;
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 35) {
      if (diffX < 0) {
        // Swiped Left -> reveal actions
        setSwipedPartyId(partyId);
      } else {
        // Swiped Right -> close actions
        if (swipedPartyId === partyId) {
          setSwipedPartyId(null);
        }
      }
    }
  };

  useEffect(() => {
    if (initialFilter) {
      setFilterType(initialFilter);
    }
  }, [initialFilter]);

  const filteredParties = parties
    .filter((p) => {
      let matchesType = true;
      if (filterType === 'CUSTOMER') matchesType = p.partyType === 'CUSTOMER';
      else if (filterType === 'SUPPLIER') matchesType = p.partyType === 'SUPPLIER';
      else if (filterType === 'RECEIVABLE') matchesType = p.partyType === 'CUSTOMER' && p.currentBalance > 0;
      else if (filterType === 'PAYABLE') matchesType = p.partyType === 'SUPPLIER' && p.currentBalance < 0;

      let matchesFirm = true;
      if (selectedFirmId !== 'ALL') {
        matchesFirm = p.firmId === Number(selectedFirmId);
      }

      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.phone?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.accountCode?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesType && matchesFirm && matchesSearch;
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

        <div className="flex items-center gap-2 flex-wrap">
          {onOpenDailyPdfSync && (
            <button
              type="button"
              onClick={onOpenDailyPdfSync}
              className="px-3 py-1.5 sm:px-3.5 sm:py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs md:text-sm font-bold rounded-lg shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-blue-400" /> Daily PDF
            </button>
          )}
          {onOpenRecoveryQueue && (
            <button
              type="button"
              onClick={onOpenRecoveryQueue}
              className="px-3 py-1.5 sm:px-3.5 sm:py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs md:text-sm font-bold rounded-lg shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 text-emerald-200" /> Jio Queue
            </button>
          )}
          <button
            onClick={() => onOpenAddModal('CUSTOMER')}
            className="flex-1 md:flex-none px-3.5 py-1.5 sm:px-4 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs md:text-sm font-bold rounded-lg shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4" /> + Customer
          </button>
          {isSupplierFinancesAllowed && (
            <button
              onClick={() => onOpenAddModal('SUPPLIER')}
              className="flex-1 md:flex-none px-3.5 py-1.5 sm:px-4 sm:py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs md:text-sm font-bold rounded-lg shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
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

      {/* Firm Filter Selector (when multiple firms exist) */}
      {firms && firms.length > 1 && (
        <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl overflow-x-auto">
          <span className="text-[11px] font-bold text-slate-500 pl-2 pr-1 flex items-center gap-1 shrink-0">
            <Building2 className="w-3.5 h-3.5 text-slate-500" />
            Firm:
          </span>
          <button
            type="button"
            onClick={() => setSelectedFirmId('ALL')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all shrink-0 cursor-pointer ${
              selectedFirmId === 'ALL' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Firms ({parties.length})
          </button>
          {firms.map((f) => {
            const count = parties.filter((p) => p.firmId === f.id).length;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelectedFirmId(String(f.id))}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all shrink-0 cursor-pointer ${
                  selectedFirmId === String(f.id) ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {f.name} ({count})
              </button>
            );
          })}
        </div>
      )}

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
                className="relative overflow-hidden group border-b border-slate-100 last:border-b-0 bg-slate-100"
              >
                {/* Swipe Action Tray (Underneath front card) */}
                <div className="absolute inset-y-0 right-0 flex items-stretch z-0">
                  {onEditParty && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSwipedPartyId(null);
                        onEditParty(p);
                      }}
                      className="w-16 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white flex flex-col items-center justify-center gap-1 font-bold text-[11px] transition-colors cursor-pointer select-none"
                      title={`Edit ${p.name}`}
                    >
                      <Edit3 className="w-4 h-4 stroke-[2.5]" />
                      <span>Edit</span>
                    </button>
                  )}
                  {onDeleteParty && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSwipedPartyId(null);
                        onDeleteParty(p.id!);
                      }}
                      className="w-16 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white flex flex-col items-center justify-center gap-1 font-bold text-[11px] transition-colors cursor-pointer select-none"
                      title={`Delete ${p.name}`}
                    >
                      <Trash2 className="w-4 h-4 stroke-[2.5]" />
                      <span>Delete</span>
                    </button>
                  )}
                </div>

                {/* Sliding Front Card */}
                <div
                  onTouchStart={handleTouchStart}
                  onTouchEnd={(e) => handleTouchEnd(e, p.id!)}
                  onClick={() => {
                    if (swipedPartyId === p.id) {
                      setSwipedPartyId(null);
                    } else {
                      onSelectParty(p);
                    }
                  }}
                  style={{
                    transform: swipedPartyId === p.id ? 'translateX(-128px)' : 'translateX(0px)',
                  }}
                  className="relative z-10 bg-white p-3 sm:p-4 flex items-center justify-between gap-2.5 transition-transform duration-200 ease-out cursor-pointer hover:bg-slate-50/90 select-none"
                >
                  {/* Left: Avatar & Party Info */}
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                    <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center font-black text-xs sm:text-sm shrink-0 ${
                      p.partyType === 'CUSTOMER' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                    }`}>
                      {p.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-800 text-xs sm:text-sm flex items-center gap-1.5 truncate">
                        <span className="truncate">{p.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono font-normal shrink-0">#{p.accountCode}</span>
                      </div>
                      <div className="text-[11px] sm:text-xs text-slate-500 flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {p.phone ? (
                          <a
                            href={`tel:${p.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-0.5 font-bold text-slate-700 hover:text-emerald-700 hover:bg-emerald-50 px-1.5 py-0.5 rounded-md transition-colors border border-slate-200 hover:border-emerald-300"
                            title={`Click to call ${p.phone} directly`}
                          >
                            <Phone className="w-3 h-3 text-emerald-600" />
                            <span className="underline decoration-slate-300 hover:decoration-emerald-500">{p.phone}</span>
                            <span className="text-[9px] bg-emerald-600 text-white px-1 py-0.2 rounded font-black tracking-wider uppercase ml-0.5">
                              Call
                            </span>
                          </a>
                        ) : (
                          <span className="flex items-center gap-1 text-slate-400">
                            <Phone className="w-3 h-3" />
                            <span>No phone</span>
                          </span>
                        )}
                        {p.firmName && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded shrink-0">
                            🏢 {p.firmName}
                          </span>
                        )}
                        {p.address && (
                          <>
                            <span className="hidden sm:inline">&bull;</span>
                            <span className="truncate max-w-[120px] sm:max-w-xs text-slate-400">{p.address}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Balance & Actions */}
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    <div className="text-right">
                      <div className={`font-black text-xs sm:text-base ${
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
                        className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg border border-emerald-200 transition-colors shadow-2xs cursor-pointer"
                        title="Send WhatsApp Payment Reminder with UPI link"
                      >
                        <MessageCircle className="w-4 h-4 text-emerald-600" />
                      </button>
                    )}

                    {/* Desktop Direct Buttons */}
                    <div className="hidden md:flex items-center gap-1">
                      {onEditParty && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditParty(p);
                          }}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          title={`Edit ${p.name}`}
                        >
                          <Edit3 className="w-4 h-4" />
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

                    {/* Mobile Tap-or-Swipe Toggle Icon */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSwipedPartyId(swipedPartyId === p.id ? null : p.id!);
                      }}
                      className="md:hidden p-1 text-slate-300 hover:text-slate-600 transition-colors cursor-pointer"
                      title={swipedPartyId === p.id ? 'Close' : 'Swipe / Edit & Delete Options'}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
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
          firms={firms}
        />
      )}
    </div>
  );
};
