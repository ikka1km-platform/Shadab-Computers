import { useState, useEffect, useCallback } from 'react';
import { ThermalPrinterDevice } from '../types';

const STORAGE_KEY = 'vyapar_thermal_printers';

// Pre-seeded matching Screenshot 2 (MPT-II 66:32:BD:5B:11:03 as default)
const INITIAL_PRINTERS: ThermalPrinterDevice[] = [
  {
    id: 'mpt-ii-bt-1',
    name: 'MPT-II',
    type: 'bluetooth',
    address: '66:32:BD:5B:11:03',
    isDefault: true,
    paperWidth: '58mm',
    pairedAt: new Date().toISOString(),
  },
  {
    id: 'pos58-bt-2',
    name: 'POS-58 Bluetooth',
    type: 'bluetooth',
    address: 'DC:0D:30:4A:21:8F',
    isDefault: false,
    paperWidth: '58mm',
    pairedAt: new Date().toISOString(),
  },
  {
    id: 'rp80-bt-3',
    name: 'RP-80 Thermal',
    type: 'bluetooth',
    address: '88:25:83:F1:0B:44',
    isDefault: false,
    paperWidth: '80mm',
    pairedAt: new Date().toISOString(),
  },
  {
    id: 'inner-printer-4',
    name: 'InnerPrinter',
    type: 'bluetooth',
    address: '00:11:22:33:44:55',
    isDefault: false,
    paperWidth: '58mm',
    pairedAt: new Date().toISOString(),
  },
  {
    id: 'epson-usb-1',
    name: 'Epson TM-T82',
    type: 'usb',
    address: 'USB//VID_04B8&PID_0202',
    isDefault: false,
    paperWidth: '80mm',
    pairedAt: new Date().toISOString(),
  },
  {
    id: 'kitchen-wifi-1',
    name: 'Counter & Kitchen WiFi',
    type: 'wifi',
    address: '192.168.1.188:9100',
    isDefault: false,
    paperWidth: '80mm',
    pairedAt: new Date().toISOString(),
  },
];

export const getStoredPrinters = (): ThermalPrinterDevice[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_PRINTERS));
      return INITIAL_PRINTERS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return INITIAL_PRINTERS;
  } catch (err) {
    console.error('Error reading stored printers:', err);
    return INITIAL_PRINTERS;
  }
};

export const getDefaultPrinter = (): ThermalPrinterDevice | null => {
  const printers = getStoredPrinters();
  return printers.find((p) => p.isDefault) || (printers.length > 0 ? printers[0] : null);
};

export const setDefaultPrinter = (id: string): void => {
  const printers = getStoredPrinters();
  const updated = printers.map((p) => ({
    ...p,
    isDefault: p.id === id,
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent('vyapar_printers_changed'));
};

export const addOrUpdatePrinter = (printer: ThermalPrinterDevice): void => {
  const printers = getStoredPrinters();
  const existingIdx = printers.findIndex((p) => p.id === printer.id || (printer.address && p.address === printer.address));
  
  let updated: ThermalPrinterDevice[];
  if (existingIdx >= 0) {
    updated = [...printers];
    updated[existingIdx] = {
      ...updated[existingIdx],
      ...printer,
      isDefault: printer.isDefault ? true : updated[existingIdx].isDefault,
    };
  } else {
    // If setting as default or if first device, mark as default
    const shouldBeDefault = printer.isDefault || printers.length === 0;
    updated = [
      ...printers.map((p) => (shouldBeDefault ? { ...p, isDefault: false } : p)),
      { ...printer, isDefault: shouldBeDefault },
    ];
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent('vyapar_printers_changed'));
};

export const removePrinter = (id: string): void => {
  const printers = getStoredPrinters();
  const filtered = printers.filter((p) => p.id !== id);
  if (filtered.length > 0 && !filtered.some((p) => p.isDefault)) {
    filtered[0].isDefault = true;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  window.dispatchEvent(new CustomEvent('vyapar_printers_changed'));
};

const OPTIONS_STORAGE_KEY = 'vyapar_printer_options';

export const DEFAULT_PRINTER_OPTIONS: import('../types').PrinterGlobalOptions = {
  defaultPaperWidth: '58mm',
  autoCut: true,
  feedLines: 3,
  cashDrawerKick: false,
  printLogo: true,
  printQr: true,
};

export const getPrinterOptions = (): import('../types').PrinterGlobalOptions => {
  try {
    const raw = localStorage.getItem(OPTIONS_STORAGE_KEY);
    if (!raw) return DEFAULT_PRINTER_OPTIONS;
    return { ...DEFAULT_PRINTER_OPTIONS, ...JSON.parse(raw) };
  } catch (e) {
    return DEFAULT_PRINTER_OPTIONS;
  }
};

export const savePrinterOptions = (newOptions: Partial<import('../types').PrinterGlobalOptions>): import('../types').PrinterGlobalOptions => {
  const current = getPrinterOptions();
  const merged = { ...current, ...newOptions };
  localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(merged));
  window.dispatchEvent(new CustomEvent('vyapar_printer_options_changed'));
  return merged;
};

// Global in-memory cache for live browser device handles (Bluetooth Device & Serial Ports)
export const runtimeDeviceCache = {
  bluetoothDevices: new Map<string, any>(),
  serialPorts: new Map<string, any>(),
};

export const useThermalPrinters = () => {
  const [printers, setPrinters] = useState<ThermalPrinterDevice[]>(getStoredPrinters);
  const [options, setOptions] = useState<import('../types').PrinterGlobalOptions>(getPrinterOptions);

  const refresh = useCallback(() => {
    setPrinters(getStoredPrinters());
    setOptions(getPrinterOptions());
  }, []);

  useEffect(() => {
    const handleStorageChange = () => refresh();
    window.addEventListener('vyapar_printers_changed', handleStorageChange);
    window.addEventListener('vyapar_printer_options_changed', handleStorageChange);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('vyapar_printers_changed', handleStorageChange);
      window.removeEventListener('vyapar_printer_options_changed', handleStorageChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [refresh]);

  const defaultPrinter = printers.find((p) => p.isDefault) || (printers.length > 0 ? printers[0] : null);

  const updateOptions = (opts: Partial<import('../types').PrinterGlobalOptions>) => {
    const saved = savePrinterOptions(opts);
    setOptions(saved);
  };

  return {
    printers,
    defaultPrinter,
    options,
    updateOptions,
    setDefaultPrinter,
    addOrUpdatePrinter,
    removePrinter,
    refresh,
  };
};
