import { Transaction, Party, BusinessProfile } from '../types';
import { isNativeAndroidApp, NativeBluetoothPrinter } from './nativeBluetoothPrinter';

// Standard ESC/POS Command Byte Sequences
const ESC = 0x1B;
const GS = 0x1D;

export const ESC_POS_COMMANDS = {
  INIT: new Uint8Array([ESC, 0x40]),
  ALIGN_LEFT: new Uint8Array([ESC, 0x61, 0x00]),
  ALIGN_CENTER: new Uint8Array([ESC, 0x61, 0x01]),
  ALIGN_RIGHT: new Uint8Array([ESC, 0x61, 0x02]),
  BOLD_ON: new Uint8Array([ESC, 0x45, 0x01]),
  BOLD_OFF: new Uint8Array([ESC, 0x45, 0x00]),
  DOUBLE_SIZE_ON: new Uint8Array([GS, 0x21, 0x11]),
  DOUBLE_HEIGHT_ON: new Uint8Array([GS, 0x21, 0x01]),
  NORMAL_SIZE: new Uint8Array([GS, 0x21, 0x00]),
  UNDERLINE_ON: new Uint8Array([ESC, 0x2D, 0x01]),
  UNDERLINE_OFF: new Uint8Array([ESC, 0x2D, 0x00]),
  LINE_FEED: new Uint8Array([0x0A]),
  FEED_3_LINES: new Uint8Array([ESC, 0x64, 0x03]),
  CUT_PAPER: new Uint8Array([GS, 0x56, 0x41, 0x03]), // Partial cut with feed
  CASH_DRAWER_KICK: new Uint8Array([ESC, 0x70, 0x00, 0x19, 0xFA]), // Pulse to open cash drawer pin 2
};

export class EscPosBuilder {
  private chunks: Uint8Array[] = [];
  private encoder = new TextEncoder();
  private maxCharsPerLine: number;

  constructor(paperWidth: '58mm' | '80mm' = '58mm') {
    this.maxCharsPerLine = paperWidth === '58mm' ? 32 : 48;
    this.chunks.push(ESC_POS_COMMANDS.INIT);
  }

  raw(bytes: Uint8Array): this {
    this.chunks.push(bytes);
    return this;
  }

  text(str: string): this {
    this.chunks.push(this.encoder.encode(str));
    return this;
  }

  line(str: string = ''): this {
    this.text(str);
    this.chunks.push(ESC_POS_COMMANDS.LINE_FEED);
    return this;
  }

  center(str: string, doubleSize = false): this {
    this.raw(ESC_POS_COMMANDS.ALIGN_CENTER);
    if (doubleSize) this.raw(ESC_POS_COMMANDS.DOUBLE_HEIGHT_ON);
    this.line(str);
    if (doubleSize) this.raw(ESC_POS_COMMANDS.NORMAL_SIZE);
    this.raw(ESC_POS_COMMANDS.ALIGN_LEFT);
    return this;
  }

  divider(char = '-'): this {
    this.line(char.repeat(this.maxCharsPerLine));
    return this;
  }

  doubleDivider(): this {
    this.line('='.repeat(this.maxCharsPerLine));
    return this;
  }

  twoColumn(left: string, right: string, bold = false): this {
    if (bold) this.raw(ESC_POS_COMMANDS.BOLD_ON);
    const spaceCount = Math.max(1, this.maxCharsPerLine - left.length - right.length);
    this.line(left + ' '.repeat(spaceCount) + right);
    if (bold) this.raw(ESC_POS_COMMANDS.BOLD_OFF);
    return this;
  }

  feedLines(count: number = 3): this {
    for (let i = 0; i < count; i++) {
      this.chunks.push(ESC_POS_COMMANDS.LINE_FEED);
    }
    return this;
  }

  kickDrawer(): this {
    this.raw(ESC_POS_COMMANDS.CASH_DRAWER_KICK);
    return this;
  }

  feedAndCut(feedCount: number = 3, autoCut: boolean = true): this {
    this.feedLines(feedCount);
    if (autoCut) {
      this.raw(ESC_POS_COMMANDS.CUT_PAPER);
    }
    return this;
  }

  build(): Uint8Array {
    let totalLength = 0;
    for (const chunk of this.chunks) {
      totalLength += chunk.length;
    }
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
}

/**
 * Builds ESC/POS bytes for thermal slip printing (Payment Receipts or Sale Invoices)
 */
export const buildTransactionEscPos = (
  transaction: Transaction,
  party?: Party,
  profile?: BusinessProfile,
  paperWidth: '58mm' | '80mm' = '58mm',
  options?: {
    autoCut?: boolean;
    feedLines?: number;
    cashDrawerKick?: boolean;
  }
): Uint8Array => {
  const builder = new EscPosBuilder(paperWidth);
  const isPaymentIn = transaction.type === 'PAYMENT_IN';
  const isEstimate = transaction.type === 'ESTIMATE';
  const title = isPaymentIn 
    ? 'PAYMENT RECEIPT' 
    : isEstimate 
      ? 'ESTIMATE / KACHHA BILL' 
      : transaction.type === 'PAYMENT_OUT'
        ? 'PAYMENT VOUCHER'
        : transaction.type === 'CREDIT_NOTE'
          ? 'SALE RETURN / CREDIT NOTE'
          : transaction.type === 'DEBIT_NOTE'
            ? 'PURCHASE RETURN / DEBIT NOTE'
            : transaction.type === 'CONTRA'
              ? 'CONTRA TRANSFER VOUCHER'
              : transaction.type === 'PURCHASE'
                ? 'PURCHASE BILL'
                : (profile?.invoiceTitle || 'TAX INVOICE');

  if (options?.cashDrawerKick) {
    builder.kickDrawer();
  }

  // 1. Business Header
  builder.raw(ESC_POS_COMMANDS.ALIGN_CENTER);
  builder.raw(ESC_POS_COMMANDS.BOLD_ON);
  builder.line(profile?.businessName?.toUpperCase() || 'VYAPAR PLUS');
  builder.raw(ESC_POS_COMMANDS.BOLD_OFF);

  if (profile?.tagline) builder.line(profile.tagline);
  if (profile?.address) builder.line(profile.address);
  if (profile?.phone) builder.line(`Ph: ${profile.phone}`);
  if (profile?.gstin) builder.line(`GSTIN: ${profile.gstin}`);

  builder.divider('=');

  // 2. Receipt / Invoice Header
  builder.raw(ESC_POS_COMMANDS.ALIGN_CENTER);
  builder.raw(ESC_POS_COMMANDS.BOLD_ON);
  builder.raw(ESC_POS_COMMANDS.DOUBLE_HEIGHT_ON);
  builder.line(`*** ${title} ***`);
  builder.raw(ESC_POS_COMMANDS.NORMAL_SIZE);
  builder.raw(ESC_POS_COMMANDS.BOLD_OFF);
  builder.raw(ESC_POS_COMMANDS.ALIGN_LEFT);

  builder.divider('-');
  builder.twoColumn(`Voucher: #${transaction.voucherNumber}`, `Date: ${transaction.date}`);
  builder.twoColumn(`Mode: ${transaction.paymentMode}`, `Firm: ${transaction.firmName || 'Main'}`);

  if (party) {
    builder.line(`Party: ${party.name}`);
    if (party.phone) builder.line(`Contact: ${party.phone}`);
    if (party.gstin) builder.line(`Party GST: ${party.gstin}`);
  }

  builder.divider('-');

  // 3. Special Format for PAYMENT_IN (Payment Receipt)
  if (isPaymentIn) {
    builder.raw(ESC_POS_COMMANDS.ALIGN_CENTER);
    builder.raw(ESC_POS_COMMANDS.BOLD_ON);
    builder.raw(ESC_POS_COMMANDS.DOUBLE_HEIGHT_ON);
    builder.line(`RECEIVED: Rs. ${transaction.amount.toLocaleString('en-IN')}`);
    builder.raw(ESC_POS_COMMANDS.NORMAL_SIZE);
    builder.raw(ESC_POS_COMMANDS.BOLD_OFF);
    builder.raw(ESC_POS_COMMANDS.ALIGN_LEFT);

    builder.divider('-');
    builder.twoColumn('Amount Received:', `Rs. ${transaction.amount.toFixed(2)}`, true);
    builder.twoColumn('Payment Mode:', transaction.paymentMode);

    if (transaction.paymentMode === 'SPLIT' && transaction.splitPayment) {
      builder.twoColumn('  - Cash:', `Rs. ${transaction.splitPayment.cashAmount}`);
      builder.twoColumn(`  - ${transaction.splitPayment.onlineMode}:`, `Rs. ${transaction.splitPayment.onlineAmount}`);
      if (transaction.splitPayment.onlineRef) {
        builder.line(`    Ref/UTR: ${transaction.splitPayment.onlineRef}`);
      }
    }

    if (transaction.cashDenominations && transaction.cashDenominations.totalNotes) {
      builder.twoColumn('Cash Notes:', `${transaction.cashDenominations.totalNotes} notes tallied`);
    }

    if (transaction.description) {
      builder.line(`Remarks: ${transaction.description}`);
    }

    if (party && party.currentBalance !== undefined) {
      builder.divider('-');
      builder.twoColumn('Current Balance Due:', `Rs. ${Math.abs(party.currentBalance).toFixed(2)}`, true);
    }
  } else {
    // 4. Item Based Invoice / Bill
    if (transaction.items && transaction.items.length > 0) {
      builder.twoColumn('Item / Qty x Rate', 'Amount', true);
      builder.divider('-');
      for (const it of transaction.items) {
        builder.line(it.name);
        const detail = `  ${it.quantity} ${it.unit} x Rs.${it.rate}`;
        builder.twoColumn(detail, `Rs. ${it.total.toFixed(2)}`);
      }
      builder.divider('-');
    }

    builder.twoColumn('GRAND TOTAL:', `Rs. ${transaction.amount.toLocaleString('en-IN')}`, true);
    if (transaction.paidAmount !== undefined) {
      builder.twoColumn('Paid Amount:', `Rs. ${transaction.paidAmount.toLocaleString('en-IN')}`);
    }
    if (transaction.balanceDue !== undefined && transaction.balanceDue > 0) {
      builder.twoColumn('BALANCE DUE (Udhar):', `Rs. ${transaction.balanceDue.toLocaleString('en-IN')}`, true);
    }
  }

  // 5. UPI / Footer
  if (profile?.upiId && (transaction.balanceDue || 0) > 0) {
    builder.divider('-');
    builder.center('Scan UPI QR on bill to pay');
    builder.center(`UPI ID: ${profile.upiId}`);
  }

  builder.divider('=');
  builder.center(profile?.invoiceFooterNote || 'Thank you for your business!');
  builder.center('*** Powered by Vyapar Plus ***');

  builder.feedAndCut(options?.feedLines || 3, options?.autoCut !== false);
  return builder.build();
};

/**
 * Builds ESC/POS bytes for a quick Test Slip
 */
export const buildTestSlipEscPos = (
  printerName: string,
  paperWidth: '58mm' | '80mm' = '58mm',
  connectionType: 'bluetooth' | 'usb' | 'wifi' = 'bluetooth'
): Uint8Array => {
  const builder = new EscPosBuilder(paperWidth);
  const now = new Date();
  const dateStr = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;

  builder.center('VYAPAR PLUS POS', true);
  builder.doubleDivider();
  builder.center('*** TEST PRINT OK ***', true);
  builder.doubleDivider();
  builder.twoColumn('Device:', printerName);
  builder.twoColumn('Interface:', connectionType.toUpperCase());
  builder.twoColumn('Paper Roll:', paperWidth);
  builder.twoColumn('Date & Time:', dateStr);
  builder.divider('-');
  builder.center('ESC/POS Thermal Engine Ready');
  builder.center('Super Fast - Offline Billing');
  builder.center('Receipts, Bills & Daybook');
  builder.divider('=');
  builder.feedAndCut(3, true);

  return builder.build();
};

/**
 * Known Thermal Printer BLE GATT Service UUIDs
 */
export const KNOWN_PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard BLE Printer
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Vendor Thermal BLE
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Transparent Serial
  '0000fff0-0000-1000-8000-00805f9b34fb', // Common POS BLE
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
];

/**
 * Transmits ESC/POS byte sequence over Web Bluetooth GATT characteristic
 */
export const sendEscPosToBluetoothDevice = async (
  device: any,
  data: Uint8Array
): Promise<void> => {
  if (!device || !device.gatt) {
    throw new Error('Invalid Bluetooth Device handle');
  }

  let server = device.gatt.connected ? device.gatt : null;
  if (!server || !server.connected) {
    server = await device.gatt.connect();
  }
  
  let targetCharacteristic: any = null;

  try {
    const services = await server.getPrimaryServices();
    for (const service of services) {
      try {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            targetCharacteristic = char;
            break;
          }
        }
        if (targetCharacteristic) break;
      } catch (err) {
        // continue search
      }
    }
  } catch (err) {
    console.warn('Auto service discovery warning:', err);
  }

  if (!targetCharacteristic) {
    for (const svcId of KNOWN_PRINTER_SERVICES) {
      try {
        const svc = await server.getPrimaryService(svcId);
        const chars = await svc.getCharacteristics();
        for (const char of chars) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            targetCharacteristic = char;
            break;
          }
        }
        if (targetCharacteristic) break;
      } catch (e) {
        // next
      }
    }
  }

  if (!targetCharacteristic) {
    throw new Error('Could not find writable printer characteristic on this Bluetooth device.');
  }

  // Stream data in MTU chunks (usually 64 or 100 bytes for BLE)
  const CHUNK_SIZE = 100;
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.slice(i, i + CHUNK_SIZE);
    if (targetCharacteristic.properties.writeWithoutResponse) {
      await targetCharacteristic.writeValueWithoutResponse(chunk);
    } else {
      await targetCharacteristic.writeValue(chunk);
    }
    await new Promise((r) => setTimeout(r, 25));
  }
};

/**
 * Transmits ESC/POS bytes over WebSerial API (USB Serial POS Printers)
 */
export const sendEscPosToSerialPort = async (
  port: any,
  data: Uint8Array,
  baudRate: number = 9600
): Promise<void> => {
  if (!port) throw new Error('No serial port provided');

  if (!port.readable || !port.writable) {
    await port.open({ baudRate: baudRate || 9600 });
  }

  const writer = port.writable.getWriter();
  try {
    await writer.write(data);
  } finally {
    writer.releaseLock();
  }
};

/**
 * Transmits ESC/POS bytes over WebUSB API (Direct USB POS Printers)
 */
export const sendEscPosToUsbDevice = async (
  device: any,
  data: Uint8Array
): Promise<void> => {
  if (!device) throw new Error('No USB device provided');

  await device.open();
  if (device.configuration === null) {
    await device.selectConfiguration(1);
  }
  await device.claimInterface(0);

  const endpoint = device.configuration?.interfaces?.[0]?.alternates?.[0]?.endpoints?.find(
    (e: any) => e.direction === 'out'
  );
  const endpointNumber = endpoint ? endpoint.endpointNumber : 1;

  await device.transferOut(endpointNumber, data);
};

/**
 * Sends ESC/POS to WiFi Network Printer via LAN HTTP or RAW Port 9100 proxy
 */
export const sendEscPosToNetworkDevice = async (
  ipAddress: string,
  port: number = 9100,
  data: Uint8Array
): Promise<{ success: boolean; message: string }> => {
  const cleanIp = ipAddress.trim().replace(/^http:\/\//, '').replace(/\/.*$/, '');
  const url = `http://${cleanIp}:${port || 9100}/`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    // Attempt direct HTTP POST with raw ESC/POS bytes to network printer / print server
    const response = await fetch(url, {
      method: 'POST',
      body: new Blob([data as any]),
      mode: 'no-cors',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    });

    clearTimeout(timeoutId);
    return { success: true, message: `Raw data transmitted to ${cleanIp}:${port}` };
  } catch (err: any) {
    console.warn('Network print warning:', err);
    throw new Error(`Could not communicate directly with printer at ${cleanIp}:${port}. Note: Browsers require an open HTTP/CORS port or local print proxy for raw network sockets.`);
  }
};

/**
 * Renders and triggers a browser print formatted specifically for 58mm or 80mm roll width
 */
export const printThermalSlipViaBrowser = (
  contentHtml: string,
  paperWidth: '58mm' | '80mm' = '58mm',
  title: string = 'Thermal Receipt'
) => {
  const rollWidth = paperWidth === '80mm' ? '80mm' : '58mm';

  // If running inside Android APK, invoke native PrintManager so Chrome NEVER opens
  if (isNativeAndroidApp()) {
    NativeBluetoothPrinter.printDocument({
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>${title}</title>
            <style>
              @page { size: ${rollWidth} auto; margin: 0; }
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Courier New', monospace;
                font-size: 11px;
                line-height: 1.25;
                color: #000;
                background: #fff;
                margin: 0;
                padding: 6px 8px;
                width: ${rollWidth};
                box-sizing: border-box;
              }
              .center { text-align: center; }
              .bold { font-weight: bold; }
              .divider { border-top: 1px dashed #000; margin: 6px 0; }
              .double-divider { border-top: 2px solid #000; margin: 6px 0; }
              .flex-between { display: flex; justify-content: space-between; align-items: baseline; }
              .item-row { margin: 2px 0; }
            </style>
          </head>
          <body>
            ${contentHtml}
          </body>
        </html>
      `,
      title
    }).catch((err) => console.warn('Native Android print document warning:', err));
    return;
  }

  const printWindow = window.open('', '_blank', 'width=380,height=600');
  if (!printWindow) {
    window.print();
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <style>
          @page {
            size: ${rollWidth} auto;
            margin: 0;
          }
          @media print {
            body {
              width: ${rollWidth};
              margin: 0;
              padding: 6px 8px;
            }
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Courier New', monospace;
            font-size: 11px;
            line-height: 1.25;
            color: #000;
            background: #fff;
            margin: 0;
            padding: 8px;
            width: ${rollWidth};
            box-sizing: border-box;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 6px 0; }
          .double-divider { border-top: 2px solid #000; margin: 6px 0; }
          .flex-between { display: flex; justify-content: space-between; align-items: baseline; }
          .item-row { margin: 2px 0; }
        </style>
      </head>
      <body>
        ${contentHtml}
        <script>
          window.onload = function() {
            window.focus();
            window.print();
            setTimeout(function() {
              window.close();
            }, 800);
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
};
