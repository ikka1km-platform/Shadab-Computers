import React, { useState } from 'react';
import { X, AlertTriangle, CheckCircle2, Copy, RefreshCw, FileText, ArrowRight, ShieldCheck } from 'lucide-react';
import { ConflictRecord } from '../../types';
import { resolveConflict } from '../../utils/cloudConflictResolver';

interface ConflictReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  conflicts: ConflictRecord[];
  onConflictResolved?: () => void;
}

export const ConflictReviewModal: React.FC<ConflictReviewModalProps> = ({
  isOpen,
  onClose,
  conflicts,
  onConflictResolved,
}) => {
  const [selectedConflict, setSelectedConflict] = useState<ConflictRecord | null>(conflicts[0] || null);
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  if (!isOpen) return null;

  const unresolved = conflicts.filter((c) => c.status === 'UNRESOLVED');
  const activeConflict = selectedConflict || unresolved[0];

  const handleResolve = async (
    conflictId: number,
    choice: 'KEEP_LOCAL' | 'KEEP_REMOTE' | 'KEEP_BOTH'
  ) => {
    setResolvingId(conflictId);
    try {
      await resolveConflict(conflictId, choice);
      if (onConflictResolved) onConflictResolved();
      // Select next unresolved
      const remaining = unresolved.filter((c) => c.id !== conflictId);
      if (remaining.length > 0) {
        setSelectedConflict(remaining[0]);
      } else {
        onClose();
      }
    } catch (err: any) {
      alert(`Failed to resolve conflict: ${err.message}`);
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-500 to-orange-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center font-bold">
              <AlertTriangle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black leading-tight">Review Accounting Conflict</h3>
              <p className="text-xs text-amber-100">
                {unresolved.length} record{unresolved.length === 1 ? '' : 's'} modified simultaneously on multiple devices
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {unresolved.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <h4 className="text-sm font-bold text-slate-800">All Conflicts Resolved</h4>
              <p className="text-xs text-slate-500">Your local database and cloud records are 100% harmonized.</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-3 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
              >
                Close Window
              </button>
            </div>
          ) : activeConflict ? (
            <div className="space-y-4">
              {/* Conflict identifier badge */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-black text-amber-900">{activeConflict.entityIdentifier}</span>
                </div>
                <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full">
                  Firm: {activeConflict.firmId}
                </span>
              </div>

              <p className="text-xs text-slate-600 font-medium">
                {activeConflict.details}
              </p>

              {/* Side-by-Side Comparison */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Local Terminal Record */}
                <div className="p-3.5 bg-slate-50 border-2 border-slate-300 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      Local Device Version
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">Current Terminal</span>
                  </div>

                  <div className="text-xs space-y-1 text-slate-700 bg-white p-2.5 rounded-xl border border-slate-200">
                    <div>
                      <span className="font-semibold text-slate-500">Amount: </span>
                      <b className="text-slate-900 text-sm">₹{activeConflict.localData?.amount || 0}</b>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500">Payment: </span>
                      <b>{activeConflict.localData?.paymentMode || 'CASH'}</b> ({activeConflict.localData?.paymentStatus || 'PAID'})
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500">Items: </span>
                      <b>{activeConflict.localData?.items?.length || 0} line items</b>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500">Date: </span>
                      <b>{activeConflict.localData?.date || 'Today'}</b>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleResolve(activeConflict.id!, 'KEEP_LOCAL')}
                    disabled={resolvingId === activeConflict.id}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs active:scale-98"
                  >
                    Keep Local Record
                  </button>
                </div>

                {/* Cloud / Remote Record */}
                <div className="p-3.5 bg-emerald-50/60 border-2 border-emerald-300 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-emerald-900 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      Cloud / Remote Version
                    </span>
                    <span className="text-[10px] font-bold text-emerald-700">Remote Co-Worker</span>
                  </div>

                  <div className="text-xs space-y-1 text-slate-700 bg-white p-2.5 rounded-xl border border-emerald-200">
                    <div>
                      <span className="font-semibold text-slate-500">Amount: </span>
                      <b className="text-emerald-700 text-sm">₹{activeConflict.remoteData?.amount || 0}</b>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500">Payment: </span>
                      <b>{activeConflict.remoteData?.paymentMode || 'CASH'}</b> ({activeConflict.remoteData?.paymentStatus || 'PAID'})
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500">Items: </span>
                      <b>{activeConflict.remoteData?.items?.length || 0} line items</b>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500">Date: </span>
                      <b>{activeConflict.remoteData?.date || 'Today'}</b>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleResolve(activeConflict.id!, 'KEEP_REMOTE')}
                    disabled={resolvingId === activeConflict.id}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs active:scale-98"
                  >
                    Accept Cloud Version
                  </button>
                </div>
              </div>

              {/* Keep Both Option */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleResolve(activeConflict.id!, 'KEEP_BOTH')}
                  disabled={resolvingId === activeConflict.id}
                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Preserve Both (Save Remote Copy as New Bill {activeConflict.remoteData?.voucherNumber}-B)</span>
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Financial records & ledger balances are automatically safeguarded.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
