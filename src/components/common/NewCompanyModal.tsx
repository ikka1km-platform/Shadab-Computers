import React, { useState } from 'react';
import { X, Building2, User, Phone, MapPin, FileText, QrCode, AlertTriangle, Sparkles, CheckCircle2 } from 'lucide-react';

interface NewCompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: {
    businessName: string;
    ownerName: string;
    phone: string;
    tagline?: string;
    address?: string;
    gstin?: string;
    upiId?: string;
  }) => Promise<void>;
}

export const NewCompanyModal: React.FC<NewCompanyModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [tagline, setTagline] = useState('Retail & Wholesale Merchant');
  const [address, setAddress] = useState('');
  const [gstin, setGstin] = useState('');
  const [upiId, setUpiId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedWipe, setConfirmedWipe] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim()) {
      alert('Please enter your Business / Company Name.');
      return;
    }
    if (!ownerName.trim()) {
      alert('Please enter Owner / Proprietor Name.');
      return;
    }
    if (!phone.trim()) {
      alert('Please enter your Contact Phone Number.');
      return;
    }
    if (!confirmedWipe) {
      alert('Please check the confirmation box to verify you want to clear old records.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm({
        businessName: businessName.trim(),
        ownerName: ownerName.trim(),
        phone: phone.trim(),
        tagline: tagline.trim(),
        address: address.trim(),
        gstin: gstin.trim(),
        upiId: upiId.trim(),
      });
      onClose();
    } catch (err: any) {
      alert('Failed to reset and create company: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/20 rounded-2xl backdrop-blur-md">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-black text-lg tracking-tight">Create Your New Company</h3>
              <p className="text-xs text-emerald-100 mt-0.5">
                Wipe demo records & launch your personalized business workspace
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Warning Banner */}
          <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-950">
              <strong className="block font-black">Clean Slate & Data Wipe</strong>
              This will permanently clear all demo products, dummy parties, bills, and test vouchers. Your database will be reset cleanly for your own company.
            </div>
          </div>

          <div className="space-y-3">
            {/* Business Name */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Company / Business Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Balaji Textiles & Readymade"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm font-semibold border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Owner & Phone Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Owner / Proprietor <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Kumar"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs font-semibold border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Mobile / Phone <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required
                    placeholder="e.g. 9876543210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs font-semibold border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Tagline */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Business Tagline / Sub-title
              </label>
              <input
                type="text"
                placeholder="e.g. Wholesale & Retail General Merchant"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Address */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Shop / Office Address
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <textarea
                  rows={2}
                  placeholder="e.g. Shop #12, Market Yard, Surat, Gujarat"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* GSTIN & UPI Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  GSTIN (Optional)
                </label>
                <div className="relative">
                  <FileText className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="e.g. 24AAAAA0000A1Z5"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value.toUpperCase())}
                    className="w-full pl-9 pr-3 py-1.5 text-xs font-mono border border-slate-300 rounded-xl outline-none uppercase focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  UPI ID for QR Code (Optional)
                </label>
                <div className="relative">
                  <QrCode className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="e.g. yourname@upi"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value.toLowerCase())}
                    className="w-full pl-9 pr-3 py-1.5 text-xs font-mono border border-slate-300 rounded-xl outline-none lowercase focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Confirmation Checkbox */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-3">
            <input
              type="checkbox"
              id="confirm-wipe-cb"
              checked={confirmedWipe}
              onChange={(e) => setConfirmedWipe(e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
            />
            <label htmlFor="confirm-wipe-cb" className="text-xs font-bold text-slate-800 cursor-pointer select-none">
              I confirm: Delete all demo products & invoices, and launch my fresh company.
            </label>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !confirmedWipe || !businessName.trim()}
              className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-2 cursor-pointer transition-all active:scale-95"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isSubmitting ? 'Setting up Company...' : 'Wipe Demo Data & Launch Company'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
