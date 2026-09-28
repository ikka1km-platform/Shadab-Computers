import React, { useState } from 'react';
import { 
  X, 
  Building2, 
  Landmark, 
  Plus, 
  Trash2, 
  Edit3, 
  Wallet, 
  CheckCircle2, 
  Store
} from 'lucide-react';
import { BankAccount, Firm } from '../../types';
import { formatCurrency } from '../../utils/formatters';

interface BankingModalProps {
  isOpen: boolean;
  onClose: () => void;
  bankAccounts: BankAccount[];
  firms: Firm[];
  onAddBankAccount: (bank: Omit<BankAccount, 'id' | 'createdAt'>) => Promise<void>;
  onUpdateBankAccount: (id: number, bank: Partial<BankAccount>) => Promise<void>;
  onDeleteBankAccount: (id: number) => Promise<void>;
  onAddFirm: (firm: Omit<Firm, 'id' | 'createdAt'>) => Promise<void>;
  onUpdateFirm: (id: number, firm: Partial<Firm>) => Promise<void>;
  onDeleteFirm: (id: number) => Promise<void>;
}

export const BankingModal: React.FC<BankingModalProps> = ({
  isOpen,
  onClose,
  bankAccounts,
  firms,
  onAddBankAccount,
  onUpdateBankAccount,
  onDeleteBankAccount,
  onAddFirm,
  onUpdateFirm,
  onDeleteFirm,
}) => {
  const [activeTab, setActiveTab] = useState<'BANKS' | 'FIRMS'>('BANKS');
  
  // Bank Form State
  const [isAddingBank, setIsAddingBank] = useState(false);
  const [editingBankId, setEditingBankId] = useState<number | null>(null);
  const [accountName, setAccountName] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [upiId, setUpiId] = useState('');
  const [openingBalance, setOpeningBalance] = useState<number>(0);
  const [selectedFirmId, setSelectedFirmId] = useState<number | undefined>(firms[0]?.id);

  // Firm Form State
  const [isAddingFirm, setIsAddingFirm] = useState(false);
  const [editingFirmId, setEditingFirmId] = useState<number | null>(null);
  const [firmName, setFirmName] = useState('');
  const [firmCode, setFirmCode] = useState('');
  const [firmPhone, setFirmPhone] = useState('');
  const [firmAddress, setFirmAddress] = useState('');
  const [firmGstin, setFirmGstin] = useState('');
  const [isDefaultFirm, setIsDefaultFirm] = useState(false);

  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSaveBank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountName || !bankName) return;

    setLoading(true);
    try {
      const targetFirm = firms.find((f) => f.id === Number(selectedFirmId));
      if (editingBankId) {
        await onUpdateBankAccount(editingBankId, {
          accountName,
          bankName,
          accountNumber,
          ifscCode: ifscCode.toUpperCase().trim() || undefined,
          upiId: upiId.trim() || undefined,
          openingBalance: Number(openingBalance),
          firmId: targetFirm?.id,
          firmName: targetFirm?.name,
        });
      } else {
        await onAddBankAccount({
          accountName,
          bankName,
          accountNumber,
          ifscCode: ifscCode.toUpperCase().trim() || undefined,
          upiId: upiId.trim() || undefined,
          openingBalance: Number(openingBalance),
          currentBalance: Number(openingBalance),
          firmId: targetFirm?.id,
          firmName: targetFirm?.name,
        });
      }
      setIsAddingBank(false);
      setEditingBankId(null);
      resetBankForm();
    } finally {
      setLoading(false);
    }
  };

  const handleEditBank = (b: BankAccount) => {
    setEditingBankId(b.id || null);
    setAccountName(b.accountName);
    setBankName(b.bankName);
    setAccountNumber(b.accountNumber);
    setIfscCode(b.ifscCode || '');
    setUpiId(b.upiId || '');
    setOpeningBalance(b.openingBalance);
    setSelectedFirmId(b.firmId);
    setIsAddingBank(true);
  };

  const resetBankForm = () => {
    setAccountName('');
    setBankName('');
    setAccountNumber('');
    setIfscCode('');
    setUpiId('');
    setOpeningBalance(0);
    setSelectedFirmId(firms[0]?.id);
    setEditingBankId(null);
  };

  const handleSaveFirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firmName) return;

    setLoading(true);
    try {
      if (editingFirmId) {
        await onUpdateFirm(editingFirmId, {
          name: firmName,
          code: firmCode || undefined,
          phone: firmPhone || undefined,
          address: firmAddress || undefined,
          gstin: firmGstin || undefined,
          isDefault: isDefaultFirm,
        });
      } else {
        await onAddFirm({
          name: firmName,
          code: firmCode || `FIRM-${firms.length + 1}`,
          phone: firmPhone || undefined,
          address: firmAddress || undefined,
          gstin: firmGstin || undefined,
          isDefault: isDefaultFirm,
        });
      }
      setIsAddingFirm(false);
      setEditingFirmId(null);
      resetFirmForm();
    } finally {
      setLoading(false);
    }
  };

  const handleEditFirm = (f: Firm) => {
    setEditingFirmId(f.id || null);
    setFirmName(f.name);
    setFirmCode(f.code || '');
    setFirmPhone(f.phone || '');
    setFirmAddress(f.address || '');
    setFirmGstin(f.gstin || '');
    setIsDefaultFirm(!!f.isDefault);
    setIsAddingFirm(true);
  };

  const resetFirmForm = () => {
    setFirmName('');
    setFirmCode('');
    setFirmPhone('');
    setFirmAddress('');
    setFirmGstin('');
    setIsDefaultFirm(false);
    setEditingFirmId(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Landmark className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Bank Accounts & Multiple Firms</h3>
              <p className="text-xs text-slate-400">Manage bank ledgers & multiple business firms</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="bg-slate-100 p-2 border-b border-slate-200 flex gap-2">
          <button
            onClick={() => { setActiveTab('BANKS'); setIsAddingBank(false); }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'BANKS'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Landmark className="w-4 h-4" /> Bank & UPI Accounts ({bankAccounts.length})
          </button>
          <button
            onClick={() => { setActiveTab('FIRMS'); setIsAddingFirm(false); }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'FIRMS'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Store className="w-4 h-4" /> Multiple Firms / Cash Desks ({firms.length})
          </button>
        </div>

        <div className="p-5 md:p-6 max-h-[75vh] overflow-y-auto space-y-4">
          {/* TAB 1: BANK ACCOUNTS */}
          {activeTab === 'BANKS' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Linked Bank Accounts</h4>
                  <p className="text-xs text-slate-500">Track digital collections, UPI QR, and bank deposits</p>
                </div>
                {!isAddingBank && (
                  <button
                    onClick={() => { resetBankForm(); setIsAddingBank(true); }}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> + Add Bank Account
                  </button>
                )}
              </div>

              {isAddingBank && (
                <form onSubmit={handleSaveBank} className="bg-blue-50/60 p-4 rounded-xl border border-blue-200 space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between border-b border-blue-200 pb-2">
                    <span className="text-xs font-bold text-blue-900 uppercase">
                      {editingBankId ? 'Edit Bank Account' : 'New Bank Account Details'}
                    </span>
                    <button
                      type="button"
                      onClick={() => { setIsAddingBank(false); resetBankForm(); }}
                      className="text-xs text-slate-500 hover:text-slate-800 underline"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Account Nickname <span className="text-rose-500">*</span></label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. HDFC Current A/c"
                        value={accountName}
                        onChange={(e) => setAccountName(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Bank Name <span className="text-rose-500">*</span></label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. HDFC Bank, SBI, ICICI"
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Account Number <span className="text-rose-500">*</span></label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. 50200012345678"
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none font-mono"
                      />
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700 mb-1">IFSC Code</label>
                      <input
                        type="text"
                        placeholder="e.g. HDFC0001234"
                        value={ifscCode}
                        onChange={(e) => setIfscCode(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none font-mono uppercase"
                      />
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700 mb-1">UPI ID (VPA)</label>
                      <input
                        type="text"
                        placeholder="e.g. merchant@hdfcbank"
                        value={upiId}
                        onChange={(e) => setUpiId(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none font-mono"
                      />
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Opening Balance (₹)</label>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={openingBalance || ''}
                        onChange={(e) => setOpeningBalance(parseFloat(e.target.value) || 0)}
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none font-bold text-slate-800"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block font-medium text-slate-700 mb-1">Associated Firm</label>
                      <select
                        value={selectedFirmId || ''}
                        onChange={(e) => setSelectedFirmId(Number(e.target.value) || undefined)}
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none font-medium"
                      >
                        {firms.map((f) => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => { setIsAddingBank(false); resetBankForm(); }}
                      className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer"
                    >
                      {loading ? 'Saving...' : editingBankId ? 'Update Bank' : 'Save Bank Account'}
                    </button>
                  </div>
                </form>
              )}

              {/* Bank Accounts List */}
              <div className="space-y-2.5">
                {bankAccounts.map((b) => (
                  <div
                    key={b.id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-blue-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                        <Landmark className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h5 className="font-bold text-slate-800 text-sm">{b.accountName}</h5>
                          {b.firmName && (
                            <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                              {b.firmName}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 font-mono">
                          {b.bankName} &bull; A/c: {b.accountNumber} {b.ifscCode ? `&bull; IFSC: ${b.ifscCode}` : ''}
                        </p>
                        {b.upiId && (
                          <p className="text-[11px] text-blue-600 font-mono mt-0.5">UPI: {b.upiId}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                      <div className="text-right">
                        <div className="text-sm font-black text-slate-900">{formatCurrency(b.currentBalance)}</div>
                        <div className="text-[10px] text-slate-400">Live Balance</div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEditBank(b)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                          title="Edit Bank"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        {bankAccounts.length > 1 && (
                          <button
                            onClick={() => {
                              if (b.id && window.confirm(`Are you sure you want to remove bank account ${b.accountName}?`)) {
                                onDeleteBankAccount(b.id);
                              }
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                            title="Delete Bank"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: MULTIPLE FIRMS / BUSINESSES */}
          {activeTab === 'FIRMS' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Multiple Business Firms</h4>
                  <p className="text-xs text-slate-500">Manage Firm A, Firm B, branches, and separate cash counters</p>
                </div>
                {!isAddingFirm && (
                  <button
                    onClick={() => { resetFirmForm(); setIsAddingFirm(true); }}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> + Add New Firm
                  </button>
                )}
              </div>

              {isAddingFirm && (
                <form onSubmit={handleSaveFirm} className="bg-indigo-50/60 p-4 rounded-xl border border-indigo-200 space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between border-b border-indigo-200 pb-2">
                    <span className="text-xs font-bold text-indigo-900 uppercase">
                      {editingFirmId ? 'Edit Firm Details' : 'New Business Firm / Counter'}
                    </span>
                    <button
                      type="button"
                      onClick={() => { setIsAddingFirm(false); resetFirmForm(); }}
                      className="text-xs text-slate-500 hover:text-slate-800 underline"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Firm Name <span className="text-rose-500">*</span></label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Apex Enterprises (Firm B)"
                        value={firmName}
                        onChange={(e) => setFirmName(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Firm Code / Branch Tag</label>
                      <input
                        type="text"
                        placeholder="e.g. FIRM-B, SHOP-2"
                        value={firmCode}
                        onChange={(e) => setFirmCode(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none uppercase font-mono"
                      />
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Phone Number</label>
                      <input
                        type="text"
                        placeholder="e.g. +91 98111 22334"
                        value={firmPhone}
                        onChange={(e) => setFirmPhone(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none"
                      />
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700 mb-1">GSTIN</label>
                      <input
                        type="text"
                        placeholder="e.g. 07AAAAA0000A1Z5"
                        value={firmGstin}
                        onChange={(e) => setFirmGstin(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none uppercase font-mono"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block font-medium text-slate-700 mb-1">Firm Address</label>
                      <input
                        type="text"
                        placeholder="e.g. Sector 18, Commercial Market, Noida"
                        value={firmAddress}
                        onChange={(e) => setFirmAddress(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="isDefaultFirm"
                      checked={isDefaultFirm}
                      onChange={(e) => setIsDefaultFirm(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded"
                    />
                    <label htmlFor="isDefaultFirm" className="text-xs font-semibold text-slate-700 cursor-pointer">
                      Set as primary default firm
                    </label>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => { setIsAddingFirm(false); resetFirmForm(); }}
                      className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer"
                    >
                      {loading ? 'Saving...' : editingFirmId ? 'Update Firm' : 'Save Firm'}
                    </button>
                  </div>
                </form>
              )}

              {/* Firms List */}
              <div className="space-y-2.5">
                {firms.map((f) => (
                  <div
                    key={f.id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 transition-all flex items-center justify-between gap-3 shadow-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                        <Store className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h5 className="font-bold text-slate-800 text-sm">{f.name}</h5>
                          {f.isDefault && (
                            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                              Default Primary
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 font-mono">
                          Code: {f.code || 'N/A'} {f.gstin ? `&bull; GST: ${f.gstin}` : ''}
                        </p>
                        {f.address && (
                          <p className="text-[11px] text-slate-400 mt-0.5">{f.address}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEditFirm(f)}
                        className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                        title="Edit Firm"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      {firms.length > 1 && (
                        <button
                          onClick={() => {
                            if (f.id && window.confirm(`Are you sure you want to remove firm ${f.name}?`)) {
                              onDeleteFirm(f.id);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                          title="Delete Firm"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
