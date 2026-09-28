import React, { useEffect, useState, useRef } from 'react';
import { X, Camera, Barcode, Volume2, VolumeX, AlertCircle, Keyboard } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
  title?: string;
}

// Synthesize pleasant scan beep using Web Audio API
const playBeep = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch (err) {
    // Audio might be blocked by autoplay policies
  }
};

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
  title = 'Scan Item Barcode / QR Code',
}) => {
  const [manualCode, setManualCode] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    let html5QrCode: Html5Qrcode | null = null;
    const readerElementId = 'vyapar-barcode-scanner-box';

    const startScanner = async () => {
      try {
        setCameraError(null);
        html5QrCode = new Html5Qrcode(readerElementId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
          verbose: false,
        });
        scannerRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: 'environment' },
          {
            fps: 15,
            qrbox: { width: 260, height: 180 },
            aspectRatio: 1.33,
          },
          (decodedText) => {
            if (soundEnabled) playBeep();
            if (navigator.vibrate) navigator.vibrate(80);
            onScan(decodedText.trim());
            handleClose();
          },
          () => {
            // Frame scan failure (common when no barcode in view, ignore)
          }
        );
        setIsScanning(true);
      } catch (err: any) {
        console.warn('Barcode camera error:', err);
        setCameraError(
          err?.message?.includes('Permission')
            ? 'Camera permission denied. You can enter or scan using the barcode gun box below.'
            : 'Could not access camera. Please enter barcode manually below.'
        );
      }
    };

    // Small delay to ensure DOM element is mounted
    const timer = setTimeout(() => {
      startScanner();
    }, 200);

    return () => {
      clearTimeout(timer);
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current
          .stop()
          .catch(() => {})
          .finally(() => {
            scannerRef.current?.clear();
          });
      }
    };
  }, [isOpen]);

  const handleClose = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (e) {
        // ignore cleanup error
      }
    }
    onClose();
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    if (soundEnabled) playBeep();
    onScan(manualCode.trim());
    handleClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl flex flex-col text-white">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Barcode className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-sm">{title}</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              title={soundEnabled ? 'Mute beep' : 'Enable beep'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Camera Viewfinder */}
        <div className="relative bg-black flex flex-col items-center justify-center overflow-hidden min-h-[260px]">
          <div id="vyapar-barcode-scanner-box" className="w-full h-full max-h-[320px] overflow-hidden" />

          {cameraError && (
            <div className="absolute inset-0 p-6 flex flex-col items-center justify-center text-center bg-slate-900/95 space-y-2">
              <AlertCircle className="w-10 h-10 text-amber-400" />
              <p className="text-xs text-slate-300 max-w-xs">{cameraError}</p>
            </div>
          )}

          {/* Aim Overlay Guideline */}
          {isScanning && !cameraError && (
            <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-28 border-2 border-dashed border-blue-400/80 rounded-xl pointer-events-none flex items-center justify-center animate-pulse">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-300 bg-slate-900/80 px-2 py-0.5 rounded">
                Align Barcode Here
              </span>
            </div>
          )}
        </div>

        {/* Manual Barcode / USB Gun Input */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-3">
          <form onSubmit={handleManualSubmit} className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <label className="flex items-center gap-1.5 font-medium">
                <Keyboard className="w-3.5 h-3.5 text-blue-400" />
                <span>USB Scanner Gun or Enter Number:</span>
              </label>
            </div>
            <div className="flex gap-2">
              <input
                ref={manualInputRef}
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="e.g. 8901030887309"
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Apply
              </button>
            </div>
          </form>
          <p className="text-[10px] text-slate-500 text-center">
            Supports EAN-13, EAN-8, Code-128, Code-39, UPC, and QR Codes
          </p>
        </div>
      </div>
    </div>
  );
};
