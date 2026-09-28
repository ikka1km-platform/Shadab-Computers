import React, { useState } from 'react';
import { Lock, Delete, ShieldCheck, KeyRound } from 'lucide-react';

interface PinLockScreenProps {
  correctPin: string;
  businessName?: string;
  onUnlock: () => void;
}

export const PinLockScreen: React.FC<PinLockScreenProps> = ({
  correctPin,
  businessName = 'Vyapar Plus',
  onUnlock,
}) => {
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const handleDigit = (digit: string) => {
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setError(null);

      if (nextPin.length === 4) {
        if (nextPin === correctPin) {
          onUnlock();
        } else {
          setError('Incorrect PIN. Please try again.');
          setTimeout(() => {
            setPin('');
          }, 400);
        }
      }
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  const handleClear = () => {
    setPin('');
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 text-white flex flex-col items-center justify-center p-4 select-none">
      <div className="w-full max-w-xs flex flex-col items-center">
        {/* App Logo / Icon */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-xl mb-4 border border-blue-400/30">
          <Lock className="w-8 h-8" />
        </div>

        <h2 className="text-xl font-black tracking-wide text-white">{businessName}</h2>
        <p className="text-xs text-slate-400 mt-1 mb-8 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>App Locked • Enter 4-Digit PIN</span>
        </p>

        {/* 4 PIN Dots */}
        <div className="flex items-center gap-4 mb-6">
          {[0, 1, 2, 3].map((idx) => {
            const isFilled = pin.length > idx;
            return (
              <div
                key={idx}
                className={`w-4 h-4 rounded-full transition-all duration-200 ${
                  isFilled
                    ? 'bg-blue-500 scale-125 shadow-md shadow-blue-500/50'
                    : 'bg-slate-700 border border-slate-600'
                }`}
              />
            );
          })}
        </div>

        {/* Error message */}
        <div className="h-6 mb-4">
          {error && <span className="text-xs text-rose-400 font-semibold animate-shake">{error}</span>}
        </div>

        {/* Numeric Keypad Grid */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-[260px]">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="h-16 rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 active:scale-95 text-xl font-bold text-white border border-slate-700/50 flex items-center justify-center transition-all cursor-pointer shadow-xs"
            >
              {digit}
            </button>
          ))}

          <button
            type="button"
            onClick={handleClear}
            className="h-16 rounded-2xl bg-slate-800/40 hover:bg-slate-800 active:scale-95 text-xs font-bold text-slate-400 border border-slate-800 flex items-center justify-center transition-all cursor-pointer"
          >
            Clear
          </button>

          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-16 rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 active:scale-95 text-xl font-bold text-white border border-slate-700/50 flex items-center justify-center transition-all cursor-pointer shadow-xs"
          >
            0
          </button>

          <button
            type="button"
            onClick={handleBackspace}
            className="h-16 rounded-2xl bg-slate-800/40 hover:bg-slate-800 active:scale-95 text-white border border-slate-800 flex items-center justify-center transition-all cursor-pointer"
          >
            <Delete className="w-5 h-5 text-slate-400" />
          </button>
        </div>
      </div>
    </div>
  );
};
