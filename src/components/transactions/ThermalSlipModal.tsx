import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Printer, 
  Bluetooth, 
  Usb,
  Wifi,
  Settings2, 
  CheckCircle, 
  AlertCircle,
  FileText
} from 'lucide-react';
import QRCode from 'qrcode';
import { Transaction, Party, BusinessProfile } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { useThermalPrinters, runtimeDeviceCache } from '../../utils/printerStorage';
import { 
  buildTransactionEscPos, 
  sendEscPosToBluetoothDevice,
  sendEscPosToSerialPort,
  sendEscPosToNetworkDevice,
  printThermalSlipViaBrowser
} from '../../utils/escpos';
import { isNativeAndroidApp, NativeBluetoothPrinter, uint8ArrayToBase64 } from '../../utils/nativeBluetoothPrinter';

interface ThermalSlipModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction;
  party?: Party;
  profile: BusinessProfile;
  onOpenPrinterManager?: () => void;
}

export const ThermalSlipModal: React.FC<ThermalSlipModalProps> = ({
  isOpen,
  onClose,
  transaction,
  party,
  profile,
  onOpenPrinterManager,
}) => {
  const { defaultPrinter, options } = useThermalPrinters();
  const [paperWidth, setPaperWidth] = useState<'58mm' | '80mm'>(
    defaultPrinter?.paperWidth || options.defaultPaperWidth || '58mm'
  );
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const isPaymentIn = transaction.type === 'PAYMENT_IN';
  const isEstimate = transaction.type === 'ESTIMATE';
  const isPaymentOut = transaction.type === 'PAYMENT_OUT';
  const dueAmount = transaction.balanceDue !== undefined ? transaction.balanceDue : 0;

  useEffect(() => {
    if (defaultPrinter?.paperWidth) {
      setPaperWidth(defaultPrinter.paperWidth);
    }
  }, [defaultPrinter]);

  useEffect(() => {
    if (profile.upiId && dueAmount > 0) {
      const upiUrl = `upi://pay?pa=${encodeURIComponent(profile.upiId)}&pn=${encodeURIComponent(profile.businessName)}&cu=INR`;
      QRCode.toDataURL(upiUrl, { margin: 1, width: 140 })
        .then(setQrDataUrl)
        .catch(console.error);
    } else {
      setQrDataUrl('');
    }
  }, [profile.upiId, profile.businessName, dueAmount]);

  if (!isOpen) return null;

  // Browser print fallback
  const handleBrowserPrint = () => {
    window.print();
  };

  // Direct Print via Default Thermal Device (Bluetooth / USB / WiFi)
  const handlePrintToDevice = async () => {
    setIsPrinting(true);
    setStatusMsg(null);

    try {
      const rawEscPos = buildTransactionEscPos(transaction, party, profile, paperWidth, {
        autoCut: options.autoCut,
        feedLines: options.feedLines,
        cashDrawerKick: options.cashDrawerKick,
      });

      const printer = defaultPrinter;
      const printerType = printer?.type || 'bluetooth';

      // 1. Bluetooth Printing
      if (printerType === 'bluetooth') {
        if (isNativeAndroidApp()) {
          let address = printer?.address;
          if (!address) {
            const paired = await NativeBluetoothPrinter.listPairedDevices();
            if (paired.devices && paired.devices.length > 0) {
              address = paired.devices[0].address;
            }
          }
          if (address) {
            setStatusMsg(`Printing receipt on ${printer?.name || 'Bluetooth Printer'}...`);
            const base64Data = uint8ArrayToBase64(rawEscPos);
            const res = await NativeBluetoothPrinter.printRaw({
              address: address,
              data: base64Data
            });
            if (res.success) {
              setStatusMsg(`✓ Receipt printed on ${printer?.name || 'Bluetooth Printer'}!`);
              return;
            }
          }
        }

        const cachedDevice = printer ? runtimeDeviceCache.bluetoothDevices.get(printer.id) : null;
        if (cachedDevice && cachedDevice.gatt) {
          setStatusMsg(`Sending receipt to ${printer?.name || 'Bluetooth Printer'}...`);
          await sendEscPosToBluetoothDevice(cachedDevice, rawEscPos);
          setStatusMsg(`✓ Receipt printed on ${printer?.name || 'Bluetooth Printer'}!`);
          return;
        }

        if ((navigator as any).bluetooth) {
          setStatusMsg(`Connecting to ${printer?.name || 'Bluetooth Thermal Printer'}...`);
          const device = await (navigator as any).bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [
              '000018f0-0000-1000-8000-00805f9b34fb',
              'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
              '49535343-fe7d-4ae5-8fa9-9fafd205e455',
              '0000fff0-0000-1000-8000-00805f9b34fb',
              '0000ff00-0000-1000-8000-00805f9b34fb',
            ],
          });
          if (device) {
            if (printer) runtimeDeviceCache.bluetoothDevices.set(printer.id, device);
            await sendEscPosToBluetoothDevice(device, rawEscPos);
            setStatusMsg(`✓ Receipt printed on ${device.name || printer?.name || 'MPT-II'}!`);
            return;
          }
        }
      }

      // 2. USB Serial Printing
      if (printerType === 'usb') {
        const cachedPort = printer ? runtimeDeviceCache.serialPorts.get(printer.id) : null;
        if (cachedPort) {
          setStatusMsg(`Transmitting receipt to USB printer...`);
          await sendEscPosToSerialPort(cachedPort, rawEscPos, printer?.baudRate || 9600);
          setStatusMsg(`✓ Receipt printed via USB Serial (${printer?.name})!`);
          return;
        }
      }

      // 3. WiFi / Network Printing
      if (printerType === 'wifi' && printer?.ipAddress) {
        setStatusMsg(`Sending receipt over WiFi to ${printer.ipAddress}...`);
        await sendEscPosToNetworkDevice(printer.ipAddress, printer.port || 9100, rawEscPos);
        setStatusMsg(`✓ Receipt sent to network printer (${printer.name})!`);
        return;
      }

      // 4. Fallback: Browser System Print
      window.print();
      setStatusMsg(`Sent to print queue for ${printer?.name || 'Thermal Printer'}`);
    } catch (err: any) {
      console.warn('Direct device print attempt warning:', err);
      // If hardware communication prompt was dismissed, trigger browser roll print
      window.print();
      setStatusMsg(`Sent to system printer dialog`);
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Modal Top Bar */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between text-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600/30 rounded-xl border border-indigo-500/30">
              <Printer className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h3 className="font-bold text-sm">
                {isPaymentIn ? 'Payment Receipt Slip' : 'POS Thermal Slip'}
              </h3>
              <p className="text-[11px] text-slate-400">
                {defaultPrinter ? `${defaultPrinter.name} (${defaultPrinter.type.toUpperCase()})` : 'Thermal ESC/POS'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Paper Size Switcher */}
            <div className="flex bg-slate-800 rounded-lg p-0.5 text-xs font-bold">
              <button
                type="button"
                onClick={() => setPaperWidth('58mm')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  paperWidth === '58mm' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                58mm (2")
              </button>
              <button
                type="button"
                onClick={() => setPaperWidth('80mm')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  paperWidth === '80mm' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                80mm (3")
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printer Device Bar */}
        <div className="bg-slate-800/80 px-4 py-2 border-b border-slate-700/60 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-300">
              Default Printer: <strong className="text-white">{defaultPrinter?.name || 'MPT-II (Bluetooth)'}</strong>
            </span>
            {defaultPrinter?.address && (
              <span className="text-[10px] font-mono text-slate-400 bg-slate-700 px-1.5 py-0.2 rounded">
                {defaultPrinter.address}
              </span>
            )}
          </div>
          {onOpenPrinterManager && (
            <button
              type="button"
              onClick={onOpenPrinterManager}
              className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>Change</span>
            </button>
          )}
        </div>

        {/* Status Msg Banner */}
        {statusMsg && (
          <div className="bg-indigo-950/80 border-b border-indigo-800/50 px-4 py-1.5 text-xs text-indigo-200 flex items-center justify-between">
            <span>{statusMsg}</span>
            <button onClick={() => setStatusMsg(null)} className="text-indigo-400 hover:text-white font-bold ml-2">✕</button>
          </div>
        )}

        {/* Receipt Preview Canvas */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-950 flex justify-center">
          <div
            id="thermal-slip-content"
            ref={printRef}
            style={{ width: paperWidth === '58mm' ? '58mm' : '80mm' }}
            className="bg-white text-black p-3.5 rounded-lg shadow-xl font-mono text-[11px] leading-tight select-none my-2 transition-all border border-slate-200"
          >
            {/* Store Header */}
            <div className="text-center pb-2 border-b border-dashed border-black/40 space-y-0.5">
              <div className="font-black text-sm uppercase tracking-wide">{profile.businessName}</div>
              {profile.tagline && <div className="text-[10px] italic text-black/80">{profile.tagline}</div>}
              {profile.address && <div className="text-[10px]">{profile.address}</div>}
              {profile.phone && <div className="text-[10px]">Ph: {profile.phone}</div>}
              {profile.gstin && <div className="text-[10px] font-bold">GSTIN: {profile.gstin}</div>}
            </div>

            {/* Receipt / Invoice Title & Meta */}
            <div className="py-2 border-b border-dashed border-black/40 text-[10px] space-y-1">
              <div className="text-center font-black text-xs uppercase bg-black/5 py-0.5 rounded">
                {isPaymentIn ? '*** PAYMENT RECEIPT ***' :
                 isPaymentOut ? '*** PAYMENT VOUCHER ***' :
                 isEstimate ? '*** ESTIMATE / KACHHA ***' :
                 (profile.invoiceTitle || 'TAX INVOICE')}
              </div>
              <div className="flex justify-between font-bold pt-1">
                <span>Receipt No: #{transaction.voucherNumber}</span>
                <span>Date: {formatDate(transaction.date)}</span>
              </div>
              <div className="flex justify-between text-black/70">
                <span>Mode: {transaction.paymentMode}</span>
                <span>Firm: {transaction.firmName || 'Main Firm'}</span>
              </div>
              {party && (
                <div className="pt-1 border-t border-dashed border-black/20">
                  <div className="font-bold">
                    {isPaymentIn ? 'Received From:' : isPaymentOut ? 'Paid To:' : 'Customer:'} {party.name}
                  </div>
                  {party.phone && <div>Ph: {party.phone}</div>}
                  {party.gstin && <div>GST: {party.gstin}</div>}
                </div>
              )}
            </div>

            {/* SPECIAL BODY FOR PAYMENT_IN (Receipt Voucher) */}
            {isPaymentIn ? (
              <div className="py-2.5 border-b border-dashed border-black/40 space-y-2">
                <div className="p-2 border-2 border-black rounded text-center space-y-0.5 bg-black/[0.02]">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-black/80">
                    Amount Received
                  </div>
                  <div className="text-base font-black">
                    {formatCurrency(transaction.amount)}
                  </div>
                </div>

                <div className="space-y-1 text-[10px]">
                  <div className="flex justify-between">
                    <span>Payment Mode:</span>
                    <span className="font-bold">{transaction.paymentMode}</span>
                  </div>

                  {transaction.paymentMode === 'SPLIT' && transaction.splitPayment && (
                    <div className="pl-2 border-l border-black/30 space-y-0.5 text-[9px]">
                      <div className="flex justify-between">
                        <span>• Cash Part:</span>
                        <span className="font-bold">₹{transaction.splitPayment.cashAmount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>• {transaction.splitPayment.onlineMode} Part:</span>
                        <span className="font-bold">₹{transaction.splitPayment.onlineAmount}</span>
                      </div>
                      {transaction.splitPayment.onlineRef && (
                        <div>Ref/UTR: {transaction.splitPayment.onlineRef}</div>
                      )}
                    </div>
                  )}

                  {transaction.cashDenominations && transaction.cashDenominations.totalNotes ? (
                    <div className="flex justify-between text-[9px] text-emerald-800">
                      <span>Notes Count:</span>
                      <span className="font-bold">{transaction.cashDenominations.totalNotes} notes tallied</span>
                    </div>
                  ) : null}

                  {transaction.description && (
                    <div className="pt-1 text-[9px] italic border-t border-dotted border-black/20">
                      Note: {transaction.description}
                    </div>
                  )}
                </div>

                {party && party.currentBalance !== undefined && (
                  <div className="pt-1.5 border-t border-dashed border-black/30 flex justify-between font-bold text-[10px]">
                    <span>Current Outstanding:</span>
                    <span>{formatCurrency(party.currentBalance)}</span>
                  </div>
                )}
              </div>
            ) : (
              /* ITEM BASED SALE / PURCHASE / ESTIMATE */
              <>
                {transaction.items && transaction.items.length > 0 && (
                  <div className="py-2 border-b border-dashed border-black/40">
                    <table className="w-full text-left text-[10px]">
                      <thead>
                        <tr className="border-b border-black font-bold">
                          <th className="pb-1">Item</th>
                          <th className="pb-1 text-center">Qty</th>
                          <th className="pb-1 text-right">Rate</th>
                          <th className="pb-1 text-right">Amt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-dashed divide-black/20">
                        {transaction.items.map((it, idx) => (
                          <tr key={idx}>
                            <td className="py-1 pr-1 font-medium">{it.name}</td>
                            <td className="py-1 text-center">{it.quantity}</td>
                            <td className="py-1 text-right">{it.rate}</td>
                            <td className="py-1 text-right font-bold">{it.total}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Totals & Net Due */}
                <div className="py-2 border-b border-dashed border-black/40 space-y-1 text-[11px]">
                  <div className="flex justify-between font-black text-xs">
                    <span>GRAND TOTAL:</span>
                    <span>{formatCurrency(transaction.amount)}</span>
                  </div>

                  {transaction.paidAmount !== undefined && (
                    <div className="flex justify-between text-[10px]">
                      <span>Paid / Received:</span>
                      <span className="font-bold">{formatCurrency(transaction.paidAmount)}</span>
                    </div>
                  )}

                  {transaction.balanceDue !== undefined && transaction.balanceDue > 0 && (
                    <div className="flex justify-between font-bold text-[11px] text-black">
                      <span>BALANCE DUE (Udhar):</span>
                      <span>{formatCurrency(transaction.balanceDue)}</span>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* UPI QR Code if pending due & UPI available */}
            {qrDataUrl && (profile.showQrOnInvoice !== false) && (
              <div className="py-2 border-b border-dashed border-black/40 flex flex-col items-center text-center">
                <div className="text-[10px] font-bold uppercase mb-1">Scan & Pay via UPI</div>
                <img src={qrDataUrl} alt="UPI QR" className="w-24 h-24 my-0.5" />
                <div className="text-[9px] text-black/70">Google Pay / PhonePe / Paytm / BHIM</div>
                <div className="text-[9px] font-mono mt-0.5">{profile.upiId}</div>
              </div>
            )}

            {/* Authorized Signatory Line */}
            <div className="pt-3 pb-1 flex justify-between items-end text-[9px]">
              <div className="italic">Customer Ack.</div>
              <div className="text-right">
                <div className="h-6 border-b border-dotted border-black/40 w-24 mb-1"></div>
                <div className="font-bold">{profile.signatureText || 'Authorized Signatory'}</div>
              </div>
            </div>

            {/* Footer Note */}
            <div className="pt-2 text-center text-[10px] space-y-0.5 border-t border-dashed border-black/40">
              <div>{profile.invoiceFooterNote || 'Thank you for your visit!'}</div>
              <div className="text-[9px] text-black/60">*** Powered by Vyapar Plus ***</div>
            </div>
          </div>
        </div>

        {/* Modal Bottom Print Buttons */}
        <div className="p-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            {defaultPrinter?.type === 'usb' ? (
              <Usb className="w-3.5 h-3.5 text-emerald-400" />
            ) : defaultPrinter?.type === 'wifi' ? (
              <Wifi className="w-3.5 h-3.5 text-teal-400" />
            ) : (
              <Bluetooth className="w-3.5 h-3.5 text-blue-400" />
            )}
            <span>
              {defaultPrinter ? `${defaultPrinter.name} (${paperWidth})` : `Thermal Roll (${paperWidth})`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {onOpenPrinterManager && (
              <button
                type="button"
                onClick={onOpenPrinterManager}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
                title="Change or Manage Thermal Printers"
              >
                <Settings2 className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleBrowserPrint}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-slate-700"
            >
              <Printer className="w-4 h-4" /> System Print
            </button>
            <button
              type="button"
              onClick={handlePrintToDevice}
              disabled={isPrinting}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {defaultPrinter?.type === 'usb' ? (
                <Usb className="w-4 h-4" />
              ) : defaultPrinter?.type === 'wifi' ? (
                <Wifi className="w-4 h-4" />
              ) : (
                <Bluetooth className="w-4 h-4" />
              )}
              {isPrinting
                ? 'Printing...'
                : defaultPrinter
                  ? `Print via ${defaultPrinter.name}`
                  : 'Print Thermal Receipt'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
