import { registerPlugin, Capacitor } from '@capacitor/core';

export interface PairedDevice {
  name: string;
  address: string;
  type: string;
}

export interface BluetoothPrinterPluginInterface {
  listPairedDevices(): Promise<{ devices: PairedDevice[] }>;
  printRaw(options: { address: string; data: string }): Promise<{ success: boolean; message?: string }>;
  printDocument(options: { html: string; title?: string }): Promise<{ success: boolean }>;
}

export const NativeBluetoothPrinter = registerPlugin<BluetoothPrinterPluginInterface>('BluetoothPrinter');

export const isNativeAndroidApp = (): boolean => {
  return Capacitor.isNativePlatform();
};

export const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};
