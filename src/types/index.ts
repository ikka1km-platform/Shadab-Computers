export type PartyType = 'CUSTOMER' | 'SUPPLIER';

export type ReminderFrequency = 'DAILY' | 'FIXED_DAYS' | 'MANUAL';

export interface ReminderRule {
  frequency: ReminderFrequency;
  daysOfWeek: number[]; // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  minAmount?: number;
}

export interface Party {
  id?: number;
  name: string;
  accountCode: string;
  phone: string;
  email?: string;
  address?: string;
  gstin?: string;
  partyType: PartyType;
  openingBalance: number;
  currentBalance: number;
  firmId?: number;
  firmName?: string;
  reminderRule?: ReminderRule;
  lastReminderSentAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type TransactionType = 
  | 'SALE' 
  | 'PURCHASE' 
  | 'PAYMENT_IN' 
  | 'PAYMENT_OUT' 
  | 'EXPENSE' 
  | 'ESTIMATE' 
  | 'CREDIT_NOTE' 
  | 'DEBIT_NOTE' 
  | 'CONTRA';

export type PaymentMode = 'CASH' | 'UPI' | 'BANK' | 'CHEQUE' | 'SPLIT';
export type PaymentStatus = 'PAID' | 'UNPAID' | 'PARTIAL';

export interface SplitPaymentDetail {
  cashAmount: number;
  onlineAmount: number;
  onlineMode: 'UPI' | 'BANK' | 'CHEQUE';
  onlineRef?: string;
}

export interface InvoiceItemEntry {
  itemId?: number;
  name: string;
  quantity: number;
  unit: string;
  rate: number;
  taxRate: number;
  discount: number;
  total: number;
}

export interface DenominationBreakdown {
  c500?: number;
  c200?: number;
  c100?: number;
  c50?: number;
  c20?: number;
  c10?: number;
  c5?: number;
  coins?: number;
  totalNotes?: number;
  totalAmount?: number;
}

export interface Firm {
  id?: number;
  name: string;
  code?: string;
  isDefault?: boolean;
  phone?: string;
  address?: string;
  gstin?: string;
  firmId?: string;
  upiId?: string;
  bankAccountId?: number;
  createdAt: string;
}

export interface BankAccount {
  id?: number;
  accountName: string;
  bankName: string;
  accountNumber: string;
  ifscCode?: string;
  upiId?: string;
  isDefault?: boolean;
  openingBalance: number;
  currentBalance: number;
  firmId?: number;
  firmName?: string;
  createdAt?: string;
}

export interface Transaction {
  id?: number;
  voucherNumber: string;
  type: TransactionType;
  partyId?: number;
  partyName?: string;
  date: string;
  amount: number;
  paidAmount?: number;
  balanceDue?: number;
  paymentStatus?: PaymentStatus;
  paymentMode: PaymentMode;
  splitPayment?: SplitPaymentDetail;
  items?: InvoiceItemEntry[];
  description?: string;
  cashDenominations?: DenominationBreakdown;
  firmId?: number;
  firmName?: string;
  bankAccountId?: number;
  bankAccountName?: string;
  // Contra & Return fields
  contraType?: 'CASH_TO_BANK' | 'BANK_TO_CASH' | 'BANK_TO_BANK';
  fromBankAccountId?: number;
  fromBankAccountName?: string;
  toBankAccountId?: number;
  toBankAccountName?: string;
  originalVoucherNumber?: string;
  returnReason?: string;
  attachments?: string[];
  importBatchId?: number;
  createdAt: string;
}

export interface Item {
  id?: number;
  name: string;
  code: string;
  barcode?: string;
  hsnCode?: string;
  category?: string;
  brand?: string;
  size?: string;
  color?: string;
  colors?: string[];
  images?: string[];
  salePrice: number;
  purchasePrice: number;
  taxRate?: number;
  unit: string;
  stockQuantity: number;
  minStockAlert?: number;
  createdAt: string;
}

export interface BusinessProfile {
  id?: number;
  businessName: string;
  tagline?: string;
  ownerName: string;
  phone: string;
  email: string;
  address: string;
  state?: string;
  gstin?: string;
  upiId?: string;
  currencySymbol: string;
  securityPin?: string;
  isPinLockEnabled?: boolean;
  logoUrl?: string;
  invoiceTitle?: string;
  termsAndConditions?: string;
  invoiceFooterNote?: string;
  showBankDetailsOnInvoice?: boolean;
  showQrOnInvoice?: boolean;
  defaultGstRate?: number;
  signatureText?: string;
  isDailyAutoBackupEnabled?: boolean;
  backupEmail?: string;
  lastAutoBackupDate?: string;
  autoDownloadOnDailyBackup?: boolean;
  firmId?: string;
  firmCloudAccount?: FirmCloudAccount;
  reminderTemplates?: ReminderTemplates;
}

export interface ReminderTemplates {
  polite?: string;
  standard?: string;
  urgent?: string;
  recoveryQueue?: string;
}

export type PrinterConnectionType = 'bluetooth' | 'usb' | 'wifi';

export interface ThermalPrinterDevice {
  id: string;
  name: string;
  type: PrinterConnectionType;
  address?: string;
  ipAddress?: string;
  port?: number;
  baudRate?: number;
  isDefault: boolean;
  paperWidth?: '58mm' | '80mm';
  feedLines?: number;
  autoCut?: boolean;
  cashDrawerKick?: boolean;
  pairedAt?: string;
  status?: 'ready' | 'connected' | 'offline';
}

export interface PrinterGlobalOptions {
  defaultPaperWidth: '58mm' | '80mm';
  autoCut: boolean;
  feedLines: number;
  cashDrawerKick: boolean;
  printLogo: boolean;
  printQr: boolean;
}

export type UserRole = 'Secondary Admin' | 'Salesman' | 'Biller' | 'Other';

export interface CoWorker {
  id?: number;
  name: string;
  phone: string;
  email?: string;
  role: UserRole;
  pin?: string;
  status: 'ACTIVE' | 'INVITED' | 'INACTIVE';
  permissions?: string[];
  invitedAt?: string;
  lastActiveAt?: string;
  createdAt: string;
}

export type CloudConnectionStatus = 
  | 'CONNECTED' 
  | 'SYNCING' 
  | 'PENDING' 
  | 'ERROR' 
  | 'OFFLINE' 
  | 'DISCONNECTED';

export interface RegisteredDevice {
  deviceId: string;
  deviceName: string;
  role: string;
  workerName?: string;
  workerId?: number;
  lastSyncAt: string;
  isActive: boolean;
  appVersion?: string;
  ipOrNetwork?: string;
}

export interface FirmCloudAccount {
  firmId: string;
  cloudProvider: 'GOOGLE_DRIVE';
  cloudAccountEmail: string; // e.g. abc.traders@gmail.com
  cloudConnectionStatus: CloudConnectionStatus;
  cloudConnectedAt?: string;
  cloudLastSyncAt?: string;
  cloudSyncCursor: number;
  cloudSyncVersion: number;
  cloudDeviceId: string;
  cloudOwnerDeviceId: string;
  accessToken?: string;
  tokenExpiry?: number;
  cloudFileId?: string;
  activeDevices: RegisteredDevice[];
  autoSyncEnabled: boolean;
  errorMessage?: string;
  googleClientId?: string;
}

export interface SyncQueueItem {
  id?: number;
  entityType: 'transaction' | 'party' | 'item' | 'firm' | 'bankAccount' | 'profile' | 'coWorker';
  entityId: string | number;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: any;
  timestamp: string;
  deviceId: string;
  firmId: string;
  status: 'PENDING' | 'PROCESSING' | 'FAILED' | 'SYNCED';
  retryCount: number;
  errorMessage?: string;
}

export interface ConflictRecord {
  id?: number;
  entityType: 'transaction' | 'party' | 'item' | 'bankAccount';
  entityIdentifier: string; // e.g. "Invoice INV-1024"
  firmId: string;
  localData: any;
  remoteData: any;
  detectedAt: string;
  resolvedAt?: string;
  status: 'UNRESOLVED' | 'RESOLVED';
  resolutionChoice?: 'KEEP_LOCAL' | 'KEEP_REMOTE' | 'MERGED';
  details: string;
}




