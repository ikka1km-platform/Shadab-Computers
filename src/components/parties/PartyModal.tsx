import React, { useState, useEffect } from 'react';
import { X, User, Phone, MapPin, Hash, Trash2 } from 'lucide-react';
import { Party, PartyType } from '../../types';

interface PartyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (partyData: Partial<Party>) => Promise<void>;
  onDelete?: (id: number) => Promise<void> | void;
  partyToEdit?: Party | null;
  defaultType?: PartyType;
}

export const PartyModal: React.FC<PartyModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  partyToEdit,
  defaultType = 'CUSTOMER',
}) => {
  const [name, setName] = useState('');
  const [accountCode, setAccountCode] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [gstin, setGstin] = useState('');
  const [partyType, setPartyType] = useState<PartyType>(defaultType);
  const [openingBalance, setOpeningBalance] = useState<number>(0);
  const [balanceType, setBalanceType] = useState<'RECEIVE' | 'PAY'>('RECEIVE');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (partyToEdit) {
      setName(partyToEdit.name);
      setAccountCode(partyToEdit.accountCode);
      setPhone(partyToEdit.phone || '');
      setEmail(partyToEdit.email || '');
      setAddress(partyToEdit.address || '');
      setGstin(partyToEdit.gstin || '');
      setPartyType(partyToEdit.partyType);
      setOpeningBalance(Math.abs(partyToEdit.openingBalance));
      setBalanceType(partyToEdit.openingBalance >= 0 ? 'RECEIVE' : 'PAY');
    } else {
      setName('');
      setAccountCode(`ACC-${Math.floor(1000 + Math.random() * 9000)}`);
      setPhone('');
      setEmail('');
      setAddress('');
      setGstin('');
      setPartyType(defaultType);
      setOpeningBalance(0);
      setBalanceType(defaultType === 'CUSTOMER' ? 'RECEIVE' : 'PAY');
    }
  }, [partyToEdit, defaultType, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      const finalOpeningBalance = balanceType === 'RECEIVE' ? Number(openingBalance) : -Number(openingBalance);
      await onSave({
        name: name.trim(),
        accountCode: accountCode.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        gstin: gstin.trim().toUpperCase(),
        partyType,
        openingBalance: finalOpeningBalance,
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg">{partyToEdit ? 'Edit Party' : 'Add New Party'}</h3>
            <p className="text-xs text-slate-400">Customer or Supplier Ledger Master</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Party Classification
            </label>
            <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setPartyType('CUSTOMER');
                  if (!partyToEdit) setBalanceType('RECEIVE');
                }}
                className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  partyType === 'CUSTOMER' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Customer (Debtor)
              </button>
              <button
                type="button"
                onClick={() => {
                  setPartyType('SUPPLIER');
                  if (!partyToEdit) setBalanceType('PAY');
                }}
                className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  partyType === 'SUPPLIER' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Supplier (Creditor)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Party / Business Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Stores"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Phone Number</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Account Code</label>
              <div className="relative">
                <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="e.g. CUST-105"
                  value={accountCode}
                  onChange={(e) => setAccountCode(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">GSTIN (Optional)</label>
              <input
                type="text"
                placeholder="22AAAAA0000A1Z5"
                value={gstin}
                onChange={(e) => setGstin(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none uppercase font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Billing / Delivery Address</label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Shop number, street, city..."
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {!partyToEdit && (
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                Opening Balance
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-2 text-sm font-bold text-slate-400">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={openingBalance || ''}
                    onChange={(e) => setOpeningBalance(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-3 py-2 text-sm font-semibold border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  />
                </div>
                <div className="flex gap-1 bg-white border border-slate-300 p-0.5 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setBalanceType('RECEIVE')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                      balanceType === 'RECEIVE' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    To Receive
                  </button>
                  <button
                    type="button"
                    onClick={() => setBalanceType('PAY')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                      balanceType === 'PAY' ? 'bg-rose-600 text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    To Pay
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            {partyToEdit && partyToEdit.id && onDelete ? (
              <button
                type="button"
                onClick={async () => {
                  if (partyToEdit.id) {
                    await onDelete(partyToEdit.id);
                    onClose();
                  }
                }}
                className="px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Party
              </button>
            ) : <div />}

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                {loading ? 'Saving...' : partyToEdit ? 'Update Party' : 'Save Party'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
