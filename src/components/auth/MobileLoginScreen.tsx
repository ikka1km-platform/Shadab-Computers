import React, { useState } from 'react';
import { 
  Smartphone, 
  ShieldCheck, 
  CheckCircle2, 
  Lock, 
  ArrowRight, 
  ArrowLeft, 
  RefreshCw, 
  Building2, 
  Store, 
  Sparkles, 
  Users2,
  Cloud,
  LogIn
} from 'lucide-react';
import { BusinessProfile, CoWorker } from '../../types';
import { UserSession } from '../../utils/userSession';
import { authenticateFirmOnCloud, downloadCloudVault, hydrateDexieWithCloudVault } from '../../utils/cloudSync';

interface MobileLoginScreenProps {
  profile?: BusinessProfile;
  coWorkers: CoWorker[];
  onLoginSuccess: (session: UserSession, updatedBusinessName?: string, phone?: string) => void;
}

export const MobileLoginScreen: React.FC<MobileLoginScreenProps> = ({
  profile,
  coWorkers,
  onLoginSuccess,
}) => {
  const [step, setStep] = useState<'PHONE' | 'OTP' | 'STAFF_PIN'>('PHONE');
  const [phone, setPhone] = useState(
    profile?.phone ? profile.phone.replace(/\D/g, '').slice(-10) : '9876543210'
  );
  const [businessName, setBusinessName] = useState(profile?.businessName || 'Apex Traders & Distributors');
  const [otp, setOtp] = useState('');
  const [staffPin, setStaffPin] = useState('');
  const [matchedWorker, setMatchedWorker] = useState<CoWorker | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(30);

  // Cloud Join Direct State
  const [isJoinCloudMode, setIsJoinCloudMode] = useState(false);
  const [cloudFirmId, setCloudFirmId] = useState('FIRM_MUI8HFY6_47UPAJ');
  const [cloudPin, setCloudPin] = useState('1234');
  const [cloudJoinLoading, setCloudJoinLoading] = useState(false);
  const [cloudJoinMsg, setCloudJoinMsg] = useState<string | null>(null);

  const handleCloudFirmJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!cloudFirmId.trim()) {
      setError('Please enter Firm ID (e.g. FIRM_MUI8HFY6_47UPAJ)');
      return;
    }
    if (!cloudPin.trim()) {
      setError('Please enter 4-digit Master or Staff PIN');
      return;
    }
    setCloudJoinLoading(true);
    setCloudJoinMsg('Connecting to cloud server...');
    try {
      const cleanFirmId = cloudFirmId.trim().toUpperCase();
      const res = await authenticateFirmOnCloud(cleanFirmId, cloudPin.trim());
      let vault = res.vault;
      if (!vault) {
        vault = await downloadCloudVault(cleanFirmId);
      }
      if (!vault) {
        throw new Error('Firm authenticated, but could not download firm data.');
      }
      setCloudJoinMsg(`✓ Authenticated with ${res.firmName || cleanFirmId}! Hydrating business data...`);
      await hydrateDexieWithCloudVault(vault, { clearExisting: true, forceReload: true });
    } catch (err: any) {
      console.error('Cloud join error:', err);
      setError(`Failed to join firm: ${err.message || err}`);
      setCloudJoinLoading(false);
      setCloudJoinMsg(null);
    }
  };

  // Handle Phone Submit
  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const clean = phone.replace(/\D/g, '');
    if (clean.length < 10) {
      setError('Please enter a valid 10-digit mobile number');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      // Check if this phone belongs to a registered Co-Worker
      const foundWorker = coWorkers.find(
        (w) => w.phone && w.phone.replace(/\D/g, '').slice(-10) === clean.slice(-10)
      );

      if (foundWorker) {
        setMatchedWorker(foundWorker);
        setStep('STAFF_PIN');
      } else {
        setMatchedWorker(null);
        setStep('OTP');
        setOtp('1234'); // Pre-fill demo OTP for effortless 1-tap testing
      }
    }, 400);
  };

  // Handle Owner OTP Verification
  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (otp.length < 4) {
      setError('Please enter 4-digit verification code');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      const session: UserSession = {
        type: 'OWNER',
        name: businessName || 'Owner (Admin)',
        phone: `+91 ${phone}`,
        role: 'Owner',
      };
      onLoginSuccess(session, businessName, `+91 ${phone}`);
    }, 400);
  };

  // Handle Staff PIN Verification
  const handleVerifyStaffPin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!matchedWorker) return;

    const masterPin = profile?.securityPin || '1234';
    if (staffPin !== matchedWorker.pin && staffPin !== masterPin && staffPin !== '1234') {
      setError(`Incorrect Staff PIN for ${matchedWorker.name}. Please enter your 4-digit PIN.`);
      return;
    }

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      const session: UserSession = {
        type: 'COWORKER',
        id: matchedWorker.id,
        name: matchedWorker.name,
        phone: matchedWorker.phone,
        role: matchedWorker.role,
        pin: matchedWorker.pin,
        isRemote: true,
      };
      onLoginSuccess(session);
    }, 400);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4 selection:bg-blue-500 selection:text-white">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Top Decorative Header */}
        <div className="bg-gradient-to-tr from-blue-700 via-blue-600 to-indigo-700 px-6 pt-8 pb-7 text-white relative">
          <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white mb-4 shadow-lg">
            <Store className="w-7 h-7 text-white" />
          </div>

          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-white">Vyapar Plus</h1>
            <span className="bg-blue-500/40 text-blue-100 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-400/30">
              GST Billing
            </span>
          </div>

          <p className="text-xs text-blue-100/80 mt-1">
            Simple, smart billing, inventory & digital catalogue for your business
          </p>

          <div className="mt-4 flex items-center gap-3 text-[11px] text-blue-200 font-medium">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
              100% Offline & Secure
            </span>
            <span>&bull;</span>
            <span className="flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              One-Time Login
            </span>
          </div>
        </div>

        <div className="p-6 md:p-8">
          {/* Mode Switcher Tabs for Step 1 */}
          {step === 'PHONE' && (
            <div className="flex bg-slate-100 p-1 rounded-xl mb-5">
              <button
                type="button"
                onClick={() => { setIsJoinCloudMode(false); setError(null); }}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  !isJoinCloudMode ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Mobile Login
              </button>
              <button
                type="button"
                onClick={() => { setIsJoinCloudMode(true); setError(null); }}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  isJoinCloudMode ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>Join Cloud Firm</span>
              </button>
            </div>
          )}

          {/* STEP 1A: JOIN CLOUD FIRM DIRECTLY */}
          {step === 'PHONE' && isJoinCloudMode && (
            <form onSubmit={handleCloudFirmJoin} className="space-y-4">
              <div>
                <h2 className="text-lg font-extrabold text-slate-800">Join Existing Cloud Firm</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Enter your Android tablet's Firm ID & PIN to load real business records
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Firm ID
                </label>
                <input
                  type="text"
                  placeholder="e.g. FIRM_MUI8HFY6_47UPAJ"
                  value={cloudFirmId}
                  onChange={(e) => setCloudFirmId(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 text-sm font-mono font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Master or Staff PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="e.g. 1234"
                  value={cloudPin}
                  onChange={(e) => setCloudPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="w-full px-3.5 py-2.5 text-center text-lg font-mono font-black text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none"
                  required
                />
              </div>

              {cloudJoinMsg && (
                <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold">
                  {cloudJoinMsg}
                </div>
              )}

              {error && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-bold">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={cloudJoinLoading || !cloudFirmId || !cloudPin}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-2xl text-sm transition-all shadow-md hover:shadow-lg active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>{cloudJoinLoading ? 'Downloading Firm Data...' : 'Join Firm & Open Business'}</span>
              </button>

              <div className="pt-2 text-[11px] text-slate-500 text-center">
                <span>Default PIN: </span>
                <b className="text-slate-700">1234</b>
                <span> (Owner) or Staff PIN</span>
              </div>
            </form>
          )}

          {/* STEP 1B: PHONE NUMBER INPUT */}
          {step === 'PHONE' && !isJoinCloudMode && (
            <form onSubmit={handlePhoneSubmit} className="space-y-5">
              <div>
                <h2 className="text-lg font-extrabold text-slate-800">Login with Mobile Number</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Enter your 10-digit mobile number to access your business account
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Mobile Number
                </label>
                <div className="flex rounded-2xl border border-slate-300 overflow-hidden focus-within:ring-2 focus-within:ring-blue-600 focus-within:border-blue-600 transition-all bg-slate-50/50">
                  <div className="flex items-center gap-1.5 px-3.5 bg-slate-100 border-r border-slate-300 text-slate-700 font-bold text-sm select-none">
                    <span>🇮🇳</span>
                    <span>+91</span>
                  </div>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="w-full px-3.5 py-3 text-base font-bold tracking-wide text-slate-900 bg-transparent outline-none"
                    autoFocus
                  />
                </div>
              </div>

              {error && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-bold">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || phone.length < 10}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-2xl text-sm transition-all shadow-md hover:shadow-lg active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>{loading ? 'Sending OTP...' : 'Get OTP & Continue'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              {/* Demo Hint & Co-Worker Info */}
              <div className="pt-3 border-t border-slate-100 space-y-2 text-[11px] text-slate-500">
                <div className="flex items-start gap-2 bg-blue-50/60 p-2.5 rounded-xl border border-blue-100 text-blue-900">
                  <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">One-Time Setup:</span> You only log in once per device. The app stays permanently signed in.
                  </div>
                </div>

                {coWorkers.length > 0 && (
                  <div className="text-slate-400">
                    Staff members ({coWorkers.map((w) => w.name).join(', ')}) can also enter their phone numbers here to access their role portal.
                  </div>
                )}
              </div>
            </form>
          )}

          {/* STEP 2A: OTP VERIFICATION (OWNER) */}
          {step === 'OTP' && (
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-800">Verify Mobile Number</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Enter the 4-digit code sent to <b className="text-slate-700">+91 {phone}</b>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('PHONE')}
                  className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Enter 4-Digit OTP
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="• • • •"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="w-full px-4 py-3 text-center text-2xl font-black font-mono tracking-widest text-slate-900 bg-slate-50 border border-slate-300 rounded-2xl focus:ring-2 focus:ring-blue-600 outline-none"
                  autoFocus
                />
                <div className="flex items-center justify-between mt-2 text-[11px]">
                  <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    Auto-Filled Demo OTP: 1234
                  </span>
                  <span className="text-slate-400">Resend in {resendTimer}s</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>Business / Firm Name</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Apex Traders & Distributors"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-bold text-slate-900 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-600 outline-none"
                  required
                />
              </div>

              {error && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-bold">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || otp.length < 4}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-2xl text-sm transition-all shadow-md hover:shadow-lg active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>{loading ? 'Verifying...' : 'Verify & Open App'}</span>
                <CheckCircle2 className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* STEP 2B: STAFF PIN VERIFICATION (CO-WORKER) */}
          {step === 'STAFF_PIN' && matchedWorker && (
            <form onSubmit={handleVerifyStaffPin} className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="bg-purple-100 text-purple-700 font-black text-[10px] px-2 py-0.5 rounded uppercase">
                      {matchedWorker.role}
                    </span>
                  </div>
                  <h2 className="text-lg font-extrabold text-slate-800 mt-1">Welcome, {matchedWorker.name}</h2>
                  <p className="text-xs text-slate-500">
                    Enter your 4-digit staff PIN to access your assigned role
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('PHONE')}
                  className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Switch</span>
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Staff 4-Digit PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="• • • •"
                  value={staffPin}
                  onChange={(e) => setStaffPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="w-full px-4 py-3 text-center text-2xl font-black font-mono tracking-widest text-slate-900 bg-slate-50 border border-slate-300 rounded-2xl focus:ring-2 focus:ring-purple-600 outline-none"
                  autoFocus
                />
                <span className="block text-[11px] text-slate-400 mt-1.5 text-center">
                  Staff PIN is <b className="text-slate-600">{matchedWorker.pin || '1234'}</b>
                </span>
              </div>

              {error && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-bold">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || staffPin.length < 4}
                className="w-full py-3.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold rounded-2xl text-sm transition-all shadow-md hover:shadow-lg active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>{loading ? 'Authenticating...' : 'Enter Staff Portal'}</span>
                <CheckCircle2 className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
