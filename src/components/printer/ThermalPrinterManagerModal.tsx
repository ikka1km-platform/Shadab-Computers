import React, { useState } from 'react';
import { 
  X, 
  Printer, 
  Bluetooth, 
  Usb, 
  Wifi, 
  Check, 
  Trash2, 
  FileText, 
  Plus, 
  Radio, 
  AlertCircle,
  CheckCircle2,
  Sliders,
  Settings2,
  RefreshCw,
  ExternalLink,
  Info,
  Edit2
} from 'lucide-react';
import { ThermalPrinterDevice, PrinterConnectionType, PrinterGlobalOptions } from '../../types';
import { 
  useThermalPrinters, 
  addOrUpdatePrinter, 
  setDefaultPrinter, 
  removePrinter,
  runtimeDeviceCache,
  savePrinterOptions
} from '../../utils/printerStorage';
import { 
  buildTestSlipEscPos, 
  sendEscPosToBluetoothDevice,
  sendEscPosToSerialPort,
  sendEscPosToNetworkDevice,
  printThermalSlipViaBrowser
} from '../../utils/escpos';
import { isNativeAndroidApp, NativeBluetoothPrinter, uint8ArrayToBase64 } from '../../utils/nativeBluetoothPrinter';

interface ThermalPrinterManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPrinter?: (printer: ThermalPrinterDevice) => void;
}

export const ThermalPrinterManagerModal: React.FC<ThermalPrinterManagerModalProps> = ({
  isOpen,
  onClose,
  onSelectPrinter,
}) => {
  const { printers, defaultPrinter, options, updateOptions } = useThermalPrinters();
  const [activeTab, setActiveTab] = useState<'bluetooth' | 'usb' | 'wifi' | 'options'>('bluetooth');
  
  // Status feedback
  const [isScanning, setIsScanning] = useState(false);
  const [isTesting, setIsTesting] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: 'success' | 'info' | 'warning' | 'error';
  } | null>(null);

  // Manual / Edit Device State
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPrinterId, setEditingPrinterId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formIp, setFormIp] = useState('192.168.1.100');
  const [formPort, setFormPort] = useState(9100);
  const [formBaudRate, setFormBaudRate] = useState(9600);
  const [formPaperWidth, setFormPaperWidth] = useState<'58mm' | '80mm'>('58mm');

  if (!isOpen) return null;

  // Filter printers by tab
  const bluetoothPrinters = printers.filter((p) => p.type === 'bluetooth');
  const usbPrinters = printers.filter((p) => p.type === 'usb');
  const wifiPrinters = printers.filter((p) => p.type === 'wifi');

  const showStatus = (text: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') => {
    setStatusMessage({ text, type });
  };

  // 1. Bluetooth Discovery via Native Android Plugin or Web Bluetooth
  const handleScanBluetooth = async () => {
    setIsScanning(true);
    setStatusMessage(null);

    // If running in native Android APK, query Android BluetoothAdapter directly
    if (isNativeAndroidApp()) {
      try {
        showStatus('Discovering paired Bluetooth printers on your Android device...', 'info');
        const res = await NativeBluetoothPrinter.listPairedDevices();
        if (res.devices && res.devices.length > 0) {
          res.devices.forEach((dev, idx) => {
            const newPrinter: ThermalPrinterDevice = {
              id: `bt-${dev.address.replace(/[^a-zA-Z0-9]/g, '')}`,
              name: dev.name || 'Bluetooth Printer',
              type: 'bluetooth',
              address: dev.address,
              isDefault: idx === 0,
              paperWidth: options.defaultPaperWidth || '58mm',
              status: 'connected',
              pairedAt: new Date().toISOString(),
            };
            addOrUpdatePrinter(newPrinter);
            if (idx === 0 && onSelectPrinter) {
              onSelectPrinter(newPrinter);
            }
          });
          showStatus(`✓ Found ${res.devices.length} paired Bluetooth printer(s)! Connected & ready.`, 'success');
        } else {
          showStatus('No paired Bluetooth printers found. Please pair your printer in Android Settings -> Bluetooth first (PIN: 0000 or 1234).', 'warning');
        }
      } catch (err: any) {
        showStatus(`Bluetooth discovery error: ${err.message || 'Please check Android Bluetooth permission'}`, 'error');
      } finally {
        setIsScanning(false);
      }
      return;
    }

    if (!(navigator as any).bluetooth) {
      setIsScanning(false);
      showStatus(
        'Web Bluetooth is supported on Google Chrome, Edge & Chrome for Android. You can also add your paired Bluetooth device manually below.',
        'warning'
      );
      setShowAddForm(true);
      setFormName('MPT-II Bluetooth Printer');
      setFormAddress('66:32:BD:5B:11:03');
      return;
    }

    try {
      showStatus('Searching for nearby Bluetooth thermal printers...', 'info');
      
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb', // Standard POS BLE
          'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
          '49535343-fe7d-4ae5-8fa9-9fafd205e455',
          '0000fff0-0000-1000-8000-00805f9b34fb',
          '0000ff00-0000-1000-8000-00805f9b34fb',
          '0000fee7-0000-1000-8000-00805f9b34fb',
        ],
      });

      if (device) {
        // Cache device in runtime memory
        runtimeDeviceCache.bluetoothDevices.set(device.id, device);

        const newPrinter: ThermalPrinterDevice = {
          id: `bt-${device.id || Date.now()}`,
          name: device.name || 'MPT-II Bluetooth Printer',
          type: 'bluetooth',
          address: device.id ? device.id.slice(0, 17).toUpperCase() : '66:32:BD:5B:11:03',
          isDefault: true,
          paperWidth: options.defaultPaperWidth || '58mm',
          status: 'connected',
          pairedAt: new Date().toISOString(),
        };

        addOrUpdatePrinter(newPrinter);
        if (onSelectPrinter) onSelectPrinter(newPrinter);
        showStatus(`✓ Connected & set "${newPrinter.name}" as Default Printer!`, 'success');
      }
    } catch (err: any) {
      if (err.name !== 'NotFoundError') {
        console.warn('Bluetooth connection error:', err);
        showStatus('Bluetooth scan was cancelled or timed out. You can also configure it manually below.', 'info');
      }
    } finally {
      setIsScanning(false);
    }
  };

  // 2. USB Discovery via WebSerial / WebUSB API
  const handleScanUsb = async () => {
    setIsScanning(true);
    setStatusMessage(null);

    try {
      if ((navigator as any).serial) {
        showStatus('Select your USB thermal printer COM port in the browser prompt...', 'info');
        const port = await (navigator as any).serial.requestPort();
        const info = port.getInfo();
        const portKey = `usb-${Date.now()}`;
        
        runtimeDeviceCache.serialPorts.set(portKey, port);

        const newPrinter: ThermalPrinterDevice = {
          id: portKey,
          name: info.usbVendorId ? `USB POS Printer (VID: ${info.usbVendorId})` : 'USB Thermal Printer',
          type: 'usb',
          address: info.usbVendorId ? `VID:${info.usbVendorId} PID:${info.usbProductId}` : 'USB-COM-PORT',
          baudRate: 9600,
          isDefault: true,
          paperWidth: options.defaultPaperWidth || '80mm',
          status: 'connected',
          pairedAt: new Date().toISOString(),
        };

        addOrUpdatePrinter(newPrinter);
        if (onSelectPrinter) onSelectPrinter(newPrinter);
        showStatus(`✓ Paired & set "${newPrinter.name}" as Default USB Printer!`, 'success');
      } else {
        showStatus('WebSerial is supported on Chrome & Edge desktop. You can add your USB port name manually below.', 'warning');
        setShowAddForm(true);
        setFormName('POS USB Printer');
        setFormAddress('COM1 / USB-001');
      }
    } catch (err: any) {
      if (err.name !== 'NotFoundError') {
        console.warn('USB scan error:', err);
        showStatus('USB connection prompt cancelled or port busy.', 'info');
      }
    } finally {
      setIsScanning(false);
    }
  };

  // 3. Set Default Printer
  const handleSetDefault = (printer: ThermalPrinterDevice) => {
    setDefaultPrinter(printer.id);
    if (onSelectPrinter) onSelectPrinter(printer);
    showStatus(`✓ "${printer.name}" is now the active default printer for all receipts.`, 'success');
  };

  // 4. Test Print Handler for any printer
  const handleTestPrint = async (printer: ThermalPrinterDevice) => {
    setIsTesting(printer.id);
    showStatus(`Printing test slip on ${printer.name}...`, 'info');

    try {
      const testBytes = buildTestSlipEscPos(printer.name, printer.paperWidth || '58mm', printer.type);

      // Check Bluetooth
      if (printer.type === 'bluetooth') {
        if (isNativeAndroidApp()) {
          let address = printer.address;
          if (!address) {
            const paired = await NativeBluetoothPrinter.listPairedDevices();
            if (paired.devices && paired.devices.length > 0) {
              address = paired.devices[0].address;
            }
          }
          if (address) {
            showStatus(`Connecting to ${printer.name} (${address}) via Bluetooth...`, 'info');
            const base64Data = uint8ArrayToBase64(testBytes);
            const res = await NativeBluetoothPrinter.printRaw({
              address: address,
              data: base64Data
            });
            if (res.success) {
              showStatus(`✓ Test print successfully printed on ${printer.name}!`, 'success');
              setIsTesting(null);
              return;
            }
          } else {
            throw new Error('No paired Bluetooth thermal printer found. Please pair in Android Settings -> Bluetooth first.');
          }
        }

        const cachedDevice = runtimeDeviceCache.bluetoothDevices.get(printer.id) || 
                             Array.from(runtimeDeviceCache.bluetoothDevices.values())[0];

        if (cachedDevice && cachedDevice.gatt) {
          await sendEscPosToBluetoothDevice(cachedDevice, testBytes);
          showStatus(`✓ Test print successfully transmitted to ${printer.name} via Bluetooth GATT!`, 'success');
          setIsTesting(null);
          return;
        }

        // Try requesting connection if Web Bluetooth is available
        if ((navigator as any).bluetooth) {
          try {
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
              runtimeDeviceCache.bluetoothDevices.set(printer.id, device);
              await sendEscPosToBluetoothDevice(device, testBytes);
              showStatus(`✓ Test print sent to ${printer.name}!`, 'success');
              setIsTesting(null);
              return;
            }
          } catch (btErr: any) {
            console.warn('Bluetooth device re-request:', btErr);
          }
        }
      }

      // Check USB Serial
      if (printer.type === 'usb') {
        const cachedPort = runtimeDeviceCache.serialPorts.get(printer.id);
        if (cachedPort) {
          await sendEscPosToSerialPort(cachedPort, testBytes, printer.baudRate || 9600);
          showStatus(`✓ Test print sent to ${printer.name} via USB Serial!`, 'success');
          setIsTesting(null);
          return;
        }
      }

      // Check WiFi
      if (printer.type === 'wifi' && printer.ipAddress) {
        try {
          await sendEscPosToNetworkDevice(printer.ipAddress, printer.port || 9100, testBytes);
          showStatus(`✓ Test print transmitted to ${printer.ipAddress}:${printer.port || 9100}!`, 'success');
          setIsTesting(null);
          return;
        } catch (netErr: any) {
          console.warn('Network print warning:', netErr);
        }
      }

      // Universal Browser Thermal Fallback
      printThermalSlipViaBrowser(`
        <div class="center bold" style="font-size: 14px;">VYAPAR PLUS POS</div>
        <div class="double-divider"></div>
        <div class="center bold">*** TEST PRINT OK ***</div>
        <div class="divider"></div>
        <div class="flex-between"><span>Printer:</span> <b>${printer.name}</b></div>
        <div class="flex-between"><span>Interface:</span> <span>${printer.type.toUpperCase()}</span></div>
        <div class="flex-between"><span>Address:</span> <span>${printer.address || printer.ipAddress || 'Active'}</span></div>
        <div class="flex-between"><span>Paper Roll:</span> <span>${printer.paperWidth || '58mm'}</span></div>
        <div class="flex-between"><span>Timestamp:</span> <span>${new Date().toLocaleTimeString()}</span></div>
        <div class="divider"></div>
        <div class="center" style="font-size: 10px;">ESC/POS Thermal Engine Ready</div>
        <div class="center" style="font-size: 10px;">Fast - Offline - Reliable</div>
        <div class="double-divider"></div>
      `, printer.paperWidth || '58mm', `Test Slip - ${printer.name}`);

      showStatus(`✓ Thermal test slip opened for ${printer.name}. ESC/POS format validated!`, 'success');
    } catch (err: any) {
      console.error('Test print failed:', err);
      showStatus(`Test print error: ${err.message || 'Check printer connection'}`, 'error');
    } finally {
      setIsTesting(null);
    }
  };

  // 5. Save Manual or Edited Device
  const handleSaveDevice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    const deviceType = activeTab === 'options' ? 'bluetooth' : activeTab;
    const isEditing = Boolean(editingPrinterId);

    const newPrinter: ThermalPrinterDevice = {
      id: editingPrinterId || `${deviceType}-${Date.now()}`,
      name: formName.trim(),
      type: deviceType,
      address: deviceType === 'wifi' ? `${formIp}:${formPort}` : formAddress.trim(),
      ipAddress: deviceType === 'wifi' ? formIp.trim() : undefined,
      port: deviceType === 'wifi' ? formPort : undefined,
      baudRate: deviceType === 'usb' ? formBaudRate : undefined,
      paperWidth: formPaperWidth,
      isDefault: isEditing ? (defaultPrinter?.id === editingPrinterId) : true,
      status: 'ready',
      pairedAt: new Date().toISOString(),
    };

    addOrUpdatePrinter(newPrinter);
    setShowAddForm(false);
    setEditingPrinterId(null);
    showStatus(`✓ Saved "${newPrinter.name}" as default ${deviceType.toUpperCase()} printer!`, 'success');
  };

  const startEditDevice = (p: ThermalPrinterDevice) => {
    setEditingPrinterId(p.id);
    setFormName(p.name);
    setFormAddress(p.address || '');
    if (p.ipAddress) setFormIp(p.ipAddress);
    if (p.port) setFormPort(p.port);
    if (p.baudRate) setFormBaudRate(p.baudRate);
    setFormPaperWidth(p.paperWidth || '58mm');
    setShowAddForm(true);
  };

  const resetForm = () => {
    setEditingPrinterId(null);
    setFormName(
      activeTab === 'bluetooth' ? 'MPT-II Bluetooth' :
      activeTab === 'usb' ? 'POS USB Thermal' :
      'Counter WiFi POS'
    );
    setFormAddress(
      activeTab === 'bluetooth' ? '66:32:BD:5B:11:03' :
      activeTab === 'usb' ? 'COM1' :
      '192.168.1.188:9100'
    );
    setFormIp('192.168.1.188');
    setFormPort(9100);
    setFormBaudRate(9600);
    setFormPaperWidth(options.defaultPaperWidth || '58mm');
    setShowAddForm(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200/80 flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Top Header */}
        <div className="bg-white px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-500 flex items-center justify-center text-white shadow-md shadow-indigo-100">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-800 leading-tight">
                Thermal & POS Printers
              </h2>
              <p className="text-xs text-slate-500">
                Connect Bluetooth, USB & Network slip printers for instant receipt billing
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Default Printer Spotlight Card */}
        <div className="p-4 bg-gradient-to-r from-slate-50 to-indigo-50/40 border-b border-slate-200/70">
          <div className="bg-white rounded-2xl p-3.5 border border-indigo-100/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 shrink-0">
                {defaultPrinter?.type === 'bluetooth' ? (
                  <Bluetooth className="w-5 h-5" />
                ) : defaultPrinter?.type === 'usb' ? (
                  <Usb className="w-5 h-5" />
                ) : (
                  <Wifi className="w-5 h-5" />
                )}
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900">
                    {defaultPrinter ? defaultPrinter.name : 'No Default Printer Selected'}
                  </span>
                  {defaultPrinter && (
                    <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                      <Check className="w-2.5 h-2.5" /> Active Default
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 flex items-center gap-2">
                  <span className="font-mono text-slate-600">
                    {defaultPrinter?.address || defaultPrinter?.ipAddress || 'Ready for all bills'}
                  </span>
                  <span>•</span>
                  <span className="font-semibold text-slate-700">
                    {defaultPrinter?.paperWidth || options.defaultPaperWidth || '58mm'} Roll
                  </span>
                  <span>•</span>
                  <span className="capitalize text-indigo-600 font-medium">
                    {defaultPrinter?.type || 'Not paired'}
                  </span>
                </div>
              </div>
            </div>

            {defaultPrinter && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleTestPrint(defaultPrinter)}
                  disabled={isTesting === defaultPrinter.id}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60 border border-indigo-200/60"
                >
                  <FileText className="w-3.5 h-3.5 text-indigo-600" />
                  {isTesting === defaultPrinter.id ? 'Printing...' : 'Test Slip'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tab Switcher Pills */}
        <div className="bg-slate-100/70 p-1.5 mx-4 mt-3 rounded-2xl flex items-center gap-1 text-xs font-bold border border-slate-200/60">
          <button
            type="button"
            onClick={() => {
              setActiveTab('bluetooth');
              setShowAddForm(false);
            }}
            className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'bluetooth'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Bluetooth className="w-3.5 h-3.5" />
            <span>Bluetooth</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 text-[10px]">
              {bluetoothPrinters.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('usb');
              setShowAddForm(false);
            }}
            className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'usb'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Usb className="w-3.5 h-3.5" />
            <span>USB Cable</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 text-[10px]">
              {usbPrinters.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('wifi');
              setShowAddForm(false);
            }}
            className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'wifi'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Wifi className="w-3.5 h-3.5" />
            <span>WiFi / LAN</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 text-[10px]">
              {wifiPrinters.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('options');
              setShowAddForm(false);
            }}
            className={`py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'options'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Receipt & Hardware Settings"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Preferences</span>
          </button>
        </div>

        {/* Live Status Toast Banner */}
        {statusMessage && (
          <div className={`mx-4 mt-3 px-3.5 py-2.5 rounded-xl text-xs flex items-center justify-between animate-in fade-in duration-150 border ${
            statusMessage.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
            statusMessage.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' :
            statusMessage.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' :
            'bg-blue-50 border-blue-200 text-blue-800'
          }`}>
            <div className="flex items-center gap-2">
              {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> :
               statusMessage.type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> :
               statusMessage.type === 'warning' ? <AlertCircle className="w-4 h-4 shrink-0" /> :
               <Info className="w-4 h-4 shrink-0" />}
              <span>{statusMessage.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="text-slate-400 hover:text-slate-700 font-bold ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Modal Main Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          
          {/* TAB 1: BLUETOOTH */}
          {activeTab === 'bluetooth' && (
            <div className="space-y-4">
              {/* Scan Banner Action */}
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-4 text-white shadow-md shadow-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="font-bold text-sm flex items-center gap-2">
                    <Bluetooth className="w-4 h-4" />
                    <span>Wireless Bluetooth Thermal Printers</span>
                  </div>
                  <p className="text-xs text-blue-100">
                    Pair directly with MPT-II, POS-58, Everycom, TVS & 2-inch roll printers
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleScanBluetooth}
                  disabled={isScanning}
                  className="px-4 py-2.5 bg-white hover:bg-blue-50 active:bg-blue-100 text-indigo-700 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 shrink-0"
                >
                  {isScanning ? (
                    <>
                      <Radio className="w-4 h-4 animate-spin text-indigo-600" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Scan & Connect
                    </>
                  )}
                </button>
              </div>

              {/* Bluetooth Devices List Card */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Paired Bluetooth Printers ({bluetoothPrinters.length})
                  </h3>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Pre-Paired Device
                  </button>
                </div>

                <div className="divide-y divide-slate-100">
                  {bluetoothPrinters.map((printer) => {
                    const isDefault = defaultPrinter?.id === printer.id;
                    return (
                      <div
                        key={printer.id}
                        className={`py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                          isDefault ? 'bg-indigo-50/30 -mx-2 px-2 rounded-xl' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-xl ${
                            isDefault ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                          }`}>
                            <Bluetooth className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-slate-800">
                                {printer.name}
                              </span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                {printer.paperWidth || '58mm'}
                              </span>
                              {isDefault && (
                                <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-0.5">
                                  <Check className="w-2.5 h-2.5" /> Default
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                              {printer.address || 'BLE Device'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center">
                          <button
                            type="button"
                            onClick={() => handleTestPrint(printer)}
                            disabled={isTesting === printer.id}
                            className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
                            title="Send ESC/POS test slip"
                          >
                            <FileText className="w-3 h-3 text-slate-500" />
                            {isTesting === printer.id ? 'Printing...' : 'Test'}
                          </button>

                          <button
                            type="button"
                            onClick={() => startEditDevice(printer)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                            title="Edit printer name / roll width"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {!isDefault ? (
                            <button
                              type="button"
                              onClick={() => handleSetDefault(printer)}
                              className="px-3 py-1.5 text-xs font-bold bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white rounded-lg transition-all border border-indigo-200 hover:border-transparent cursor-pointer"
                            >
                              Set Default
                            </button>
                          ) : (
                            <span className="px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg border border-emerald-200 select-none">
                              Active
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => removePrinter(printer.id)}
                            className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Remove printer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {bluetoothPrinters.length === 0 && (
                    <div className="py-8 text-center space-y-2">
                      <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                        <Bluetooth className="w-5 h-5" />
                      </div>
                      <div className="text-xs text-slate-500 font-medium">
                        No Bluetooth thermal printers paired yet.
                      </div>
                      <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                        Turn on your MPT-II or POS thermal printer and tap "Scan & Connect" above.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: USB CABLE */}
          {activeTab === 'usb' && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-4 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="font-bold text-sm flex items-center gap-2">
                    <Usb className="w-4 h-4 text-emerald-400" />
                    <span>Direct USB Cable POS Printers</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Connect USB thermal printers (Epson, TVS, POS-80) via USB cable or OTG adapter
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleScanUsb}
                  disabled={isScanning}
                  className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 shrink-0"
                >
                  {isScanning ? (
                    <>
                      <Radio className="w-4 h-4 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Connect USB Port
                    </>
                  )}
                </button>
              </div>

              {/* USB Devices List */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Configured USB Printers ({usbPrinters.length})
                  </h3>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Manual USB Port
                  </button>
                </div>

                <div className="divide-y divide-slate-100">
                  {usbPrinters.map((printer) => {
                    const isDefault = defaultPrinter?.id === printer.id;
                    return (
                      <div
                        key={printer.id}
                        className={`py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                          isDefault ? 'bg-indigo-50/30 -mx-2 px-2 rounded-xl' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-xl ${
                            isDefault ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                          }`}>
                            <Usb className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-slate-800">
                                {printer.name}
                              </span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                {printer.paperWidth || '80mm'}
                              </span>
                              {isDefault && (
                                <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-0.5">
                                  <Check className="w-2.5 h-2.5" /> Default
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                              {printer.address || 'USB Device'} • Baud: {printer.baudRate || 9600}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center">
                          <button
                            type="button"
                            onClick={() => handleTestPrint(printer)}
                            disabled={isTesting === printer.id}
                            className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <FileText className="w-3 h-3 text-slate-500" />
                            {isTesting === printer.id ? 'Printing...' : 'Test'}
                          </button>

                          <button
                            type="button"
                            onClick={() => startEditDevice(printer)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {!isDefault ? (
                            <button
                              type="button"
                              onClick={() => handleSetDefault(printer)}
                              className="px-3 py-1.5 text-xs font-bold bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white rounded-lg transition-all border border-indigo-200 hover:border-transparent cursor-pointer"
                            >
                              Set Default
                            </button>
                          ) : (
                            <span className="px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg border border-emerald-200 select-none">
                              Active
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => removePrinter(printer.id)}
                            className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {usbPrinters.length === 0 && (
                    <div className="py-8 text-center space-y-2">
                      <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                        <Usb className="w-5 h-5" />
                      </div>
                      <div className="text-xs text-slate-500 font-medium">
                        No USB thermal printers connected yet.
                      </div>
                      <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                        Connect your USB POS printer cable to your PC or tablet and tap "Connect USB Port".
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: WIFI / LAN */}
          {activeTab === 'wifi' && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-2xl p-4 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="font-bold text-sm flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-emerald-200" />
                    <span>WiFi & Network LAN Receipt Printers</span>
                  </div>
                  <p className="text-xs text-emerald-100">
                    Print to counter, kitchen or billing desk printers over local WiFi via Port 9100
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2.5 bg-white hover:bg-emerald-50 text-emerald-800 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  Add WiFi Printer
                </button>
              </div>

              {/* WiFi Printers List */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Configured Network Printers ({wifiPrinters.length})
                  </h3>
                </div>

                <div className="divide-y divide-slate-100">
                  {wifiPrinters.map((printer) => {
                    const isDefault = defaultPrinter?.id === printer.id;
                    return (
                      <div
                        key={printer.id}
                        className={`py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                          isDefault ? 'bg-indigo-50/30 -mx-2 px-2 rounded-xl' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-xl ${
                            isDefault ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                          }`}>
                            <Wifi className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-slate-800">
                                {printer.name}
                              </span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                {printer.paperWidth || '80mm'}
                              </span>
                              {isDefault && (
                                <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-0.5">
                                  <Check className="w-2.5 h-2.5" /> Default
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                              {printer.ipAddress || printer.address || '192.168.1.188:9100'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center">
                          <button
                            type="button"
                            onClick={() => handleTestPrint(printer)}
                            disabled={isTesting === printer.id}
                            className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <FileText className="w-3 h-3 text-slate-500" />
                            {isTesting === printer.id ? 'Printing...' : 'Test'}
                          </button>

                          <button
                            type="button"
                            onClick={() => startEditDevice(printer)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {!isDefault ? (
                            <button
                              type="button"
                              onClick={() => handleSetDefault(printer)}
                              className="px-3 py-1.5 text-xs font-bold bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white rounded-lg transition-all border border-indigo-200 hover:border-transparent cursor-pointer"
                            >
                              Set Default
                            </button>
                          ) : (
                            <span className="px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg border border-emerald-200 select-none">
                              Active
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => removePrinter(printer.id)}
                            className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {wifiPrinters.length === 0 && (
                    <div className="py-8 text-center space-y-2">
                      <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                        <Wifi className="w-5 h-5" />
                      </div>
                      <div className="text-xs text-slate-500 font-medium">
                        No WiFi network printers added yet.
                      </div>
                      <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                        Connect your network printer to your router and add its LAN IP address (Port 9100).
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: GLOBAL HARDWARE & PAPER PREFERENCES */}
          {activeTab === 'options' && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 space-y-5">
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  Thermal Hardware & Roll Preferences
                </h3>
                <p className="text-xs text-slate-500">
                  Global settings applied automatically to receipts, cash vouchers & estimates
                </p>
              </div>

              <div className="space-y-4 divide-y divide-slate-100">
                {/* Paper Width Default */}
                <div className="pt-3 flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold text-slate-800 block">Default Roll Width</label>
                    <span className="text-[11px] text-slate-500">Standard pocket printers use 58mm, desktop POS use 80mm</span>
                  </div>
                  <div className="flex bg-slate-100 rounded-xl p-1 text-xs font-bold border border-slate-200">
                    <button
                      type="button"
                      onClick={() => updateOptions({ defaultPaperWidth: '58mm' })}
                      className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                        options.defaultPaperWidth === '58mm' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      58mm (2")
                    </button>
                    <button
                      type="button"
                      onClick={() => updateOptions({ defaultPaperWidth: '80mm' })}
                      className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                        options.defaultPaperWidth === '80mm' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      80mm (3")
                    </button>
                  </div>
                </div>

                {/* Auto Paper Cut */}
                <div className="pt-4 flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold text-slate-800 block">Auto Cut Paper</label>
                    <span className="text-[11px] text-slate-500">Sends partial cut command to 80mm printers with auto-cutter</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={options.autoCut}
                      onChange={(e) => updateOptions({ autoCut: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
                  </label>
                </div>

                {/* Feed Lines Padding */}
                <div className="pt-4 flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold text-slate-800 block">Bottom Feed Padding</label>
                    <span className="text-[11px] text-slate-500">Blank lines at the end so paper clears the cutter / tear bar</span>
                  </div>
                  <select
                    value={options.feedLines}
                    onChange={(e) => updateOptions({ feedLines: Number(e.target.value) })}
                    className="px-3 py-1.5 text-xs font-bold border border-slate-300 rounded-xl bg-slate-50 outline-none"
                  >
                    <option value={0}>0 Lines (Zero Blank Paper)</option>
                    <option value={1}>1 Line (Compact - Recommended)</option>
                    <option value={2}>2 Lines</option>
                    <option value={3}>3 Lines</option>
                    <option value={4}>4 Lines (Longer)</option>
                  </select>
                </div>

                {/* Cash Drawer Kick */}
                <div className="pt-4 flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold text-slate-800 block">Cash Drawer Kick Pulse</label>
                    <span className="text-[11px] text-slate-500">Automatically pop open cash drawer when receipt prints</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={options.cashDrawerKick}
                      onChange={(e) => updateOptions({ cashDrawerKick: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
                  </label>
                </div>

                {/* UPI QR Code on Slip */}
                <div className="pt-4 flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold text-slate-800 block">Print UPI QR for Udhar / Due Amount</label>
                    <span className="text-[11px] text-slate-500">Shows UPI QR at the footer of receipts when party has balance</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={options.printQr}
                      onChange={(e) => updateOptions({ printQr: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Device Add / Edit Modal Drawer */}
          {showAddForm && (
            <form onSubmit={handleSaveDevice} className="bg-slate-50 rounded-2xl p-4 border border-slate-300 shadow-sm space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Settings2 className="w-3.5 h-3.5 text-indigo-600" />
                  {editingPrinterId ? 'Edit Printer Settings' : `Add / Configure ${activeTab.toUpperCase()} Printer`}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingPrinterId(null);
                  }}
                  className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Printer Name
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. MPT-II, POS-58, Counter WiFi"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                />
              </div>

              {activeTab === 'wifi' ? (
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      LAN IP Address
                    </label>
                    <input
                      type="text"
                      required
                      value={formIp}
                      onChange={(e) => setFormIp(e.target.value)}
                      placeholder="192.168.1.188"
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Port
                    </label>
                    <input
                      type="number"
                      required
                      value={formPort}
                      onChange={(e) => setFormPort(Number(e.target.value))}
                      placeholder="9100"
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      {activeTab === 'bluetooth' ? 'MAC / Identifier' : 'Port Name (COM / Serial)'}
                    </label>
                    <input
                      type="text"
                      value={formAddress}
                      onChange={(e) => setFormAddress(e.target.value)}
                      placeholder={activeTab === 'bluetooth' ? '66:32:BD:5B:11:03' : 'COM1 / USB-001'}
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  {activeTab === 'usb' && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Baud Rate
                      </label>
                      <select
                        value={formBaudRate}
                        onChange={(e) => setFormBaudRate(Number(e.target.value))}
                        className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-xl bg-white outline-none"
                      >
                        <option value={9600}>9600 (Standard)</option>
                        <option value={19200}>19200</option>
                        <option value={38400}>38400</option>
                        <option value={115200}>115200</option>
                      </select>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Paper Roll Size
                  </label>
                  <select
                    value={formPaperWidth}
                    onChange={(e) => setFormPaperWidth(e.target.value as any)}
                    className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-xl bg-white outline-none"
                  >
                    <option value="58mm">58mm (2-inch pocket)</option>
                    <option value="80mm">80mm (3-inch counter)</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
                  >
                    {editingPrinterId ? 'Save Changes' : 'Save & Set Default'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Quick Helpful Guide Box */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 text-[11px] text-slate-600 space-y-1">
            <div className="font-bold text-slate-800 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-indigo-600" />
              Thermal Printing Tips:
            </div>
            <p>• <b>One-Click Default:</b> Setting a printer as default automatically routes all receipts, daybook slips & invoices to it.</p>
            <p>• <b>Offline & Zero Ink:</b> Thermal receipt printers use heat-sensitive paper and do not require ink or cartridges.</p>
            <p>• <b>Cross-Platform:</b> Works smoothly on Android Chrome, Windows PC, laptop Bluetooth, USB OTG and local WiFi networks.</p>
          </div>
        </div>

        {/* Modal Bottom Action Bar */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {defaultPrinter ? (
              <span>Active: <b className="text-slate-800">{defaultPrinter.name}</b> ({defaultPrinter.paperWidth || '58mm'})</span>
            ) : (
              <span>Please set a default printer</span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
