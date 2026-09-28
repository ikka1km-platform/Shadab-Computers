import React, { useState } from 'react';
import { Lock, ShieldAlert, X, Delete } from 'lucide-react';

interface ShowroomExitModalProps {
  isOpen: boolean;
  onClose: () => void;
  correctPin: string;
  onSuccess: () => void;
}

export const ShowroomExitModal: React.FC<ShowroomExitModalProps> = ({
  isOpen,
  onClose,
  correctPin,
  onSuccess,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDigit = (digit: string) => {
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setError(null);

      if (nextPin.length === 4) {
        if (nextPin === correctPin) {
          setPin('');
          setError(null);
          onSuccess();
        } else {
          setError('Incorrect PIN. Staff authorization required.');
          setTimeout(() => {
            setPin('');
          }, 500);
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
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xs p-6 text-white text-center shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-full bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-white mx-auto mb-3 shadow-lg shadow-amber-500/20">
          <Lock className="w-7 h-7" />
        </div>

        <h3 className="text-lg font-black text-white">Exit Showroom Mode</h3>
        <p className="text-xs text-slate-400 mt-1 mb-5">
          Enter 4-digit Staff / Owner PIN to return to accounting
        </p>

        {/* 4 PIN Dots */}
        <div className="flex items-center justify-center gap-3.5 mb-4">
          {[0, 1, 2, 3].map((idx) => {
            const isFilled = pin.length > idx;
            return (
              <div
                key={idx}
                className={`w-3.5 h-3.5 rounded-full transition-all duration-200 ${
                  isFilled
                    ? 'bg-amber-400 scale-125 shadow-md shadow-amber-400/50'
                    : 'bg-slate-800 border border-slate-700'
                }`}
              />
            );
          })}
        </div>

        {/* Error message */}
        <div className="h-5 mb-3">
          {error && (
            <span className="text-[11px] text-rose-400 font-bold flex items-center justify-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </span>
          )}
        </div>

        {/* Numeric Keypad Grid */}
        <div className="grid grid-cols-3 gap-2.5 w-full max-w-[240px] mx-auto">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="h-13 rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-lg font-bold text-white border border-slate-700/60 flex items-center justify-center transition-all cursor-pointer shadow-xs"
            >
              {digit}
            </button>
          ))}

          <button
            type="button"
            onClick={handleClear}
            className="h-13 rounded-2xl bg-slate-800/40 hover:bg-slate-800 active:scale-95 text-[11px] font-bold text-slate-400 border border-slate-800 flex items-center justify-center transition-all cursor-pointer"
          >
            Clear
          </button>

          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-13 rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-lg font-bold text-white border border-slate-700/60 flex items-center justify-center transition-all cursor-pointer shadow-xs"
          >
            0
          </button>

          <button
            type="button"
            onClick={handleBackspace}
            className="h-13 rounded-2xl bg-slate-800/40 hover:bg-slate-800 active:scale-95 text-slate-400 hover:text-white border border-slate-800 flex items-center justify-center transition-all cursor-pointer"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-800/80 text-[10px] text-slate-500">
          {correctPin === '1234' ? (
            <span>Default Owner PIN is <b className="text-slate-400">1234</b> (Change in Settings)</span>
          ) : (
            <span>Protected by your <b className="text-slate-300">Custom Master Security PIN</b></span>
          )}
        </div>
      </div>
    </div>
  );
};
