import React, { useState } from 'react';
import { 
  Plus, 
  ShoppingCart, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Package, 
  Receipt, 
  FileText, 
  RotateCcw, 
  Undo2, 
  Landmark, 
  UserPlus, 
  Tag, 
  X 
} from 'lucide-react';
import { TransactionType } from '../../types';

export interface FloatingActionBarProps {
  isVisible: boolean;
  onTakePayment: () => void;
  onAddSale: () => void;
  onOpenTxModal: (type: TransactionType) => void;
  onOpenAddParty?: () => void;
  onOpenAddItem?: () => void;
}

export const FloatingActionBar: React.FC<FloatingActionBarProps> = ({
  isVisible,
  onTakePayment,
  onAddSale,
  onOpenTxModal,
  onOpenAddParty,
  onOpenAddItem,
}) => {
  const [isVoucherPickerOpen, setIsVoucherPickerOpen] = useState(false);

  const handleSelectVoucher = (type: TransactionType) => {
    setIsVoucherPickerOpen(false);
    onOpenTxModal(type);
  };

  const handleSelectParty = () => {
    setIsVoucherPickerOpen(false);
    if (onOpenAddParty) onOpenAddParty();
  };

  const handleSelectItem = () => {
    setIsVoucherPickerOpen(false);
    if (onOpenAddItem) onOpenAddItem();
  };

  return (
    <>
      {/* 3 Floating Action Switches (Matching Vyapar Mobile Layout) */}
      <div
        className={`fixed left-1/2 -translate-x-1/2 z-40 flex items-center justify-center gap-2 sm:gap-3 transition-all duration-300 ease-in-out ${
          isVisible
            ? 'bottom-20 md:bottom-6 opacity-100 translate-y-0 pointer-events-auto'
            : 'bottom-20 md:bottom-6 opacity-0 translate-y-28 pointer-events-none'
        }`}
      >
        {/* Left Switch: Take Payment (Receipt) */}
        <button
          type="button"
          onClick={onTakePayment}
          className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs sm:text-sm px-4 sm:px-6 py-2.5 sm:py-3 rounded-full shadow-xl hover:shadow-2xl flex items-center gap-1.5 transition-all cursor-pointer border border-blue-500/30 whitespace-nowrap"
          title="Take Payment (Receipt)"
        >
          <ArrowDownLeft className="w-4 h-4 sm:w-4.5 sm:h-4.5 stroke-[2.5]" />
          <span>Take Payment</span>
        </button>

        {/* Center Switch: Circular (+) Button for Multiple Available Vouchers */}
        <button
          type="button"
          onClick={() => setIsVoucherPickerOpen(true)}
          className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white hover:bg-blue-50 text-blue-600 border-2 border-blue-600 shadow-xl hover:shadow-2xl flex items-center justify-center active:scale-90 transition-all cursor-pointer shrink-0"
          title="Open Voucher Menu (All Available Transactions)"
        >
          <Plus className="w-6 h-6 sm:w-7 sm:h-7 stroke-[2.8]" />
        </button>

        {/* Right Switch: Add Sale */}
        <button
          type="button"
          onClick={onAddSale}
          className="bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-xs sm:text-sm px-4 sm:px-6 py-2.5 sm:py-3 rounded-full shadow-xl hover:shadow-2xl flex items-center gap-1.5 transition-all cursor-pointer border border-rose-500/30 whitespace-nowrap"
          title="Add Sale (Invoice)"
        >
          <ShoppingCart className="w-4 h-4 sm:w-4.5 sm:h-4.5 stroke-[2.5]" />
          <span>Add Sale</span>
        </button>
      </div>

      {/* Center (+) Voucher Menu Bottom Sheet / Popup */}
      {isVoucherPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div
            className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[85vh] flex flex-col animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/80">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">Select Voucher to Create</h3>
                <p className="text-xs text-slate-500">Pick from all available business transaction types</p>
              </div>
              <button
                type="button"
                onClick={() => setIsVoucherPickerOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-4 overflow-y-auto space-y-4">
              {/* Sales & Inflows */}
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 px-1">
                  Sales & Money In
                </span>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  <button
                    type="button"
                    onClick={() => handleSelectVoucher('SALE')}
                    className="flex items-center gap-2.5 p-3 rounded-xl border border-emerald-100 bg-emerald-50/50 hover:bg-emerald-100 text-left transition-all cursor-pointer active:scale-98"
                  >
                    <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <ShoppingCart className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">Sale / Invoice</div>
                      <div className="text-[10px] text-slate-500 truncate">Customer Billing</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectVoucher('PAYMENT_IN')}
                    className="flex items-center gap-2.5 p-3 rounded-xl border border-blue-100 bg-blue-50/50 hover:bg-blue-100 text-left transition-all cursor-pointer active:scale-98"
                  >
                    <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <ArrowDownLeft className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">Take Payment</div>
                      <div className="text-[10px] text-slate-500 truncate">Receipt Money In</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectVoucher('ESTIMATE')}
                    className="flex items-center gap-2.5 p-3 rounded-xl border border-purple-100 bg-purple-50/50 hover:bg-purple-100 text-left transition-all cursor-pointer active:scale-98"
                  >
                    <div className="w-9 h-9 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">Estimate / Quote</div>
                      <div className="text-[10px] text-slate-500 truncate">Price Quotation</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectVoucher('CREDIT_NOTE')}
                    className="flex items-center gap-2.5 p-3 rounded-xl border border-indigo-100 bg-indigo-50/50 hover:bg-indigo-100 text-left transition-all cursor-pointer active:scale-98"
                  >
                    <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <RotateCcw className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">Sales Return</div>
                      <div className="text-[10px] text-slate-500 truncate">Credit Note</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Purchases & Outflows */}
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700 px-1">
                  Purchases & Expenses
                </span>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  <button
                    type="button"
                    onClick={() => handleSelectVoucher('PURCHASE')}
                    className="flex items-center gap-2.5 p-3 rounded-xl border border-amber-100 bg-amber-50/50 hover:bg-amber-100 text-left transition-all cursor-pointer active:scale-98"
                  >
                    <div className="w-9 h-9 rounded-lg bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Package className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">Purchase Bill</div>
                      <div className="text-[10px] text-slate-500 truncate">Supplier Inward</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectVoucher('PAYMENT_OUT')}
                    className="flex items-center gap-2.5 p-3 rounded-xl border border-rose-100 bg-rose-50/50 hover:bg-rose-100 text-left transition-all cursor-pointer active:scale-98"
                  >
                    <div className="w-9 h-9 rounded-lg bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <ArrowUpRight className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">Pay Money</div>
                      <div className="text-[10px] text-slate-500 truncate">Payment Out</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectVoucher('EXPENSE')}
                    className="flex items-center gap-2.5 p-3 rounded-xl border border-orange-100 bg-orange-50/50 hover:bg-orange-100 text-left transition-all cursor-pointer active:scale-98"
                  >
                    <div className="w-9 h-9 rounded-lg bg-orange-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Receipt className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">Add Expense</div>
                      <div className="text-[10px] text-slate-500 truncate">Shop / Utility bill</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectVoucher('DEBIT_NOTE')}
                    className="flex items-center gap-2.5 p-3 rounded-xl border border-cyan-100 bg-cyan-50/50 hover:bg-cyan-100 text-left transition-all cursor-pointer active:scale-98"
                  >
                    <div className="w-9 h-9 rounded-lg bg-cyan-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Undo2 className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">Purchase Return</div>
                      <div className="text-[10px] text-slate-500 truncate">Debit Note</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Banking & Master Records */}
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 px-1">
                  Banking & Master Data
                </span>
                <div className="grid grid-cols-3 gap-2 mt-1.5">
                  <button
                    type="button"
                    onClick={() => handleSelectVoucher('CONTRA')}
                    className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-center transition-all cursor-pointer active:scale-95"
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-700 text-white flex items-center justify-center mb-1 shadow-xs">
                      <Landmark className="w-4 h-4" />
                    </div>
                    <span className="text-[11px] font-bold text-slate-800">Contra</span>
                    <span className="text-[9px] text-slate-400">Cash ⇄ Bank</span>
                  </button>

                  {onOpenAddParty && (
                    <button
                      type="button"
                      onClick={handleSelectParty}
                      className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-sky-200 bg-sky-50/60 hover:bg-sky-100 text-center transition-all cursor-pointer active:scale-95"
                    >
                      <div className="w-8 h-8 rounded-lg bg-sky-600 text-white flex items-center justify-center mb-1 shadow-xs">
                        <UserPlus className="w-4 h-4" />
                      </div>
                      <span className="text-[11px] font-bold text-slate-800">+ Party</span>
                      <span className="text-[9px] text-slate-400">Customer/Dealer</span>
                    </button>
                  )}

                  {onOpenAddItem && (
                    <button
                      type="button"
                      onClick={handleSelectItem}
                      className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-violet-200 bg-violet-50/60 hover:bg-violet-100 text-center transition-all cursor-pointer active:scale-95"
                    >
                      <div className="w-8 h-8 rounded-lg bg-violet-600 text-white flex items-center justify-center mb-1 shadow-xs">
                        <Tag className="w-4 h-4" />
                      </div>
                      <span className="text-[11px] font-bold text-slate-800">+ Item</span>
                      <span className="text-[9px] text-slate-400">Stock product</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
