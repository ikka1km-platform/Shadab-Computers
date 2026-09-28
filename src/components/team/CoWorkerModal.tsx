import React, { useState, useEffect } from 'react';
import { 
  X, 
  Trash2, 
  User, 
  Phone, 
  Mail, 
  ShieldCheck, 
  Lock, 
  CheckCircle2, 
  AlertCircle,
  Sparkles,
  Users2
} from 'lucide-react';
import { CoWorker, UserRole } from '../../types';

interface CoWorkerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (workerData: Partial<CoWorker>) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
  workerToEdit?: CoWorker | null;
}

export const CoWorkerModal: React.FC<CoWorkerModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  workerToEdit,
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('Salesman');
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'INVITED' | 'INACTIVE'>('ACTIVE');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (workerToEdit) {
      setName(workerToEdit.name || '');
      setPhone(workerToEdit.phone || '');
      setEmail(workerToEdit.email || '');
      setRole(workerToEdit.role || 'Salesman');
      setPin(workerToEdit.pin || '');
      setStatus(workerToEdit.status || 'ACTIVE');
    } else {
      setName('');
      setPhone('');
      setEmail('');
      setRole('Salesman');
      setPin(Math.floor(1000 + Math.random() * 9000).toString());
      setStatus('ACTIVE');
    }
  }, [isOpen, workerToEdit]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      alert('Please enter Name and Mobile Number for the co-worker.');
      return;
    }

    setLoading(true);
    try {
      await onSave({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        role,
        pin: pin.trim() || undefined,
        status,
        createdAt: workerToEdit?.createdAt || new Date().toISOString(),
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!workerToEdit?.id || !onDelete) return;
    if (window.confirm(`Are you sure you want to remove co-worker ${workerToEdit.name}?`)) {
      setLoading(true);
      try {
        await onDelete(workerToEdit.id);
        onClose();
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600 rounded-xl">
              <Users2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-lg">
                {workerToEdit ? 'Edit Co-Worker / Staff' : 'Add New Co-Worker'}
              </h3>
              <p className="text-xs text-slate-400">Multi-User Sync, Roles & Permissions</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* 1. Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Co-Worker Full Name <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                required
                placeholder="e.g. Rahul Sharma, Amit Verma"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm font-semibold border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {/* 2. Mobile No & Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Mobile Number <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="tel"
                  required
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm font-semibold border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Email (Optional)</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="email"
                  placeholder="rahul@company.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* 3. User Role Selection */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>User Role & App Privileges</span>
              <span className="text-rose-500">*</span>
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['Secondary Admin', 'Salesman', 'Biller', 'Other'] as UserRole[]).map((r) => {
                const isSelected = role === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all text-center cursor-pointer border ${
                      isSelected
                        ? r === 'Secondary Admin'
                          ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                          : r === 'Salesman'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                          : r === 'Biller'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                          : 'bg-slate-800 text-white border-slate-800 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {r}
                  </button>
                );
              })}
            </div>

            {/* Dynamic Role Description Preview */}
            <div className="p-3 bg-white rounded-lg border border-slate-200/80 text-xs text-slate-600 leading-relaxed">
              {role === 'Secondary Admin' && (
                <div className="space-y-1">
                  <div className="font-bold text-purple-700 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" /> High Management Privilege
                  </div>
                  <p>Can create/edit all sales, purchases, daybook vouchers, manage customer credit/udhar, view reports, balance sheets, and inventory. Cannot delete business profile.</p>
                </div>
              )}
              {role === 'Salesman' && (
                <div className="space-y-1">
                  <div className="font-bold text-blue-700 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" /> Field & Counter Sales Access
                  </div>
                  <p>Can create Sales Invoices, Estimates / Quotations, browse visual E-Commerce Storefront, and view customer receivables (Udhar). Cannot see supplier purchase costs or company P&L.</p>
                </div>
              )}
              {role === 'Biller' && (
                <div className="space-y-1">
                  <div className="font-bold text-emerald-700 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" /> Fast Counter POS & Receipts
                  </div>
                  <p>Can quickly generate sales bills, collect cash / UPI payments, print 58mm/80mm thermal receipts, and check inventory stock. Cannot modify company banking or reports.</p>
                </div>
              )}
              {role === 'Other' && (
                <div className="space-y-1">
                  <div className="font-bold text-slate-700 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" /> Custom / Read-Only Helper
                  </div>
                  <p>Assigned for general staff, catalog viewers, or store assistants with customized permissions.</p>
                </div>
              )}
            </div>
          </div>

          {/* 4. PIN / Security Passcode & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-slate-500" />
                <span>Login PIN / Passcode</span>
              </label>
              <input
                type="text"
                maxLength={6}
                placeholder="4-digit PIN (e.g. 1234)"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono font-bold tracking-widest border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-center"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block text-center">
                Used to quickly switch profile on shared counter
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Sync Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3 py-2 text-sm font-semibold border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                <option value="ACTIVE">Active (Full Sync Enabled)</option>
                <option value="INVITED">Invited (Waiting to Connect)</option>
                <option value="INACTIVE">Inactive (Access Paused)</option>
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            {workerToEdit && onDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading}
                className="px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors cursor-pointer flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> Remove
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {loading ? 'Saving...' : workerToEdit ? 'Update Co-Worker' : 'Save & Share Link'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
