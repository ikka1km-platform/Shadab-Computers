import Dexie, { type Table } from 'dexie';
import { Party, Transaction, Item, BusinessProfile, Firm, BankAccount, CoWorker, SyncQueueItem, ConflictRecord } from '../types';

export class VyaparDatabase extends Dexie {
  parties!: Table<Party, number>;
  transactions!: Table<Transaction, number>;
  items!: Table<Item, number>;
  businessProfile!: Table<BusinessProfile, number>;
  firms!: Table<Firm, number>;
  bankAccounts!: Table<BankAccount, number>;
  coWorkers!: Table<CoWorker, number>;
  syncQueue!: Table<SyncQueueItem, number>;
  conflictRecords!: Table<ConflictRecord, number>;

  constructor() {
    super('VyaparBusinessDB');
    this.version(3).stores({
      parties: '++id, name, accountCode, phone, partyType, currentBalance',
      transactions: '++id, voucherNumber, type, partyId, date, paymentMode, firmId, bankAccountId, importBatchId, createdAt',
      items: '++id, name, code, category, stockQuantity',
      businessProfile: '++id',
      firms: '++id, name, isDefault',
      bankAccounts: '++id, accountName, bankName, firmId',
      coWorkers: '++id, name, phone, role, status, createdAt',
    });

    this.version(4).stores({
      parties: '++id, name, accountCode, phone, partyType, currentBalance',
      transactions: '++id, voucherNumber, type, partyId, date, paymentMode, firmId, bankAccountId, importBatchId, createdAt',
      items: '++id, name, code, category, stockQuantity',
      businessProfile: '++id',
      firms: '++id, name, isDefault, firmId',
      bankAccounts: '++id, accountName, bankName, firmId',
      coWorkers: '++id, name, phone, role, status, createdAt',
      syncQueue: '++id, entityType, entityId, action, status, timestamp, firmId',
      conflictRecords: '++id, entityType, entityIdentifier, status, detectedAt, firmId',
    });
  }
}

export const db = new VyaparDatabase();

export function generateFirmId(): string {
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `FIRM_${Date.now().toString(36).toUpperCase()}_${rand}`;
}

export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'DEV_SERVER';
  let devId = localStorage.getItem('vyapar_device_id');
  if (!devId) {
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const platform = isMobile ? 'MOB' : 'DESK';
    devId = `DEV_${platform}_${Date.now().toString(36).toUpperCase()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    localStorage.setItem('vyapar_device_id', devId);
  }
  return devId;
}

export async function enqueueSyncItem(item: {
  entityType: 'transaction' | 'party' | 'item' | 'firm' | 'bankAccount' | 'profile' | 'coWorker';
  entityId: string | number;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: any;
  firmId?: string;
}) {
  try {
    const profiles = await db.businessProfile.toArray();
    const firmId = item.firmId || profiles[0]?.firmId || 'FIRM_DEFAULT';
    const deviceId = getOrCreateDeviceId();
    await db.syncQueue.add({
      entityType: item.entityType,
      entityId: item.entityId,
      action: item.action,
      payload: item.payload,
      timestamp: new Date().toISOString(),
      deviceId,
      firmId,
      status: 'PENDING',
      retryCount: 0,
    });
  } catch (err) {
    console.error('Failed to enqueue sync item:', err);
  }
}

export async function initializeDatabase() {
  const profiles = await db.businessProfile.toArray();
  if (profiles.length > 0) {
    const cur = profiles[0];
    if (!cur.firmId) {
      const generated = generateFirmId();
      await db.businessProfile.update(cur.id!, {
        firmId: generated,
        firmCloudAccount: cur.firmCloudAccount || {
          firmId: generated,
          cloudProvider: 'GOOGLE_DRIVE',
          cloudAccountEmail: cur.backupEmail || cur.email || '',
          cloudConnectionStatus: 'DISCONNECTED',
          cloudSyncCursor: Date.now(),
          cloudSyncVersion: 1,
          cloudDeviceId: getOrCreateDeviceId(),
          cloudOwnerDeviceId: getOrCreateDeviceId(),
          activeDevices: [
            {
              deviceId: getOrCreateDeviceId(),
              deviceName: 'Owner Primary Device',
              role: 'Owner',
              lastSyncAt: new Date().toISOString(),
              isActive: true,
            },
          ],
          autoSyncEnabled: true,
        },
      });
    }
  }

  if (localStorage.getItem('vyapar_initialized') === 'clean_user_company') {
    return;
  }
  const profileCount = await db.businessProfile.count();
  if (profileCount === 0) {
    const initialFirmId = generateFirmId();
    await db.businessProfile.add({
      businessName: 'Apex Traders & Distributors',
      tagline: 'Wholesale & Retail General Merchant',
      ownerName: 'Sunil Verma',
      phone: '+91 98765 43210',
      email: 'contact@apextraders.in',
      address: 'Shop #12, Commercial Market, Main Road, New Delhi',
      gstin: '07AAAAA0000A1Z5',
      upiId: 'sunil.verma@upi',
      currencySymbol: '₹',
      firmId: initialFirmId,
      securityPin: '1234',
      isPinLockEnabled: false,
      firmCloudAccount: {
        firmId: initialFirmId,
        cloudProvider: 'GOOGLE_DRIVE',
        cloudAccountEmail: 'contact@apextraders.in',
        cloudConnectionStatus: 'DISCONNECTED',
        cloudSyncCursor: Date.now(),
        cloudSyncVersion: 1,
        cloudDeviceId: getOrCreateDeviceId(),
        cloudOwnerDeviceId: getOrCreateDeviceId(),
        activeDevices: [
          {
            deviceId: getOrCreateDeviceId(),
            deviceName: 'Owner Primary Device',
            role: 'Owner',
            lastSyncAt: new Date().toISOString(),
            isActive: true,
          },
        ],
        autoSyncEnabled: true,
      },
    });

    // Seed default firms (Firm A & Firm B)
    const f1 = await db.firms.add({
      name: 'Apex Traders (Firm A)',
      code: 'FIRM-A',
      isDefault: true,
      phone: '+91 98765 43210',
      address: 'Shop #12, Main Market, New Delhi',
      gstin: '07AAAAA0000A1Z5',
      createdAt: new Date().toISOString(),
    });

    const f2 = await db.firms.add({
      name: 'Apex Enterprises (Firm B)',
      code: 'FIRM-B',
      isDefault: false,
      phone: '+91 98111 88990',
      address: 'Sector 18, Commercial Hub, Noida',
      gstin: '09BBBCC9988D1Z2',
      createdAt: new Date().toISOString(),
    });

    // Seed default bank accounts
    const b1 = await db.bankAccounts.add({
      accountName: 'HDFC Current Account',
      bankName: 'HDFC Bank',
      accountNumber: '50200012345678',
      ifscCode: 'HDFC0001234',
      upiId: 'apextraders@hdfcbank',
      openingBalance: 45000,
      currentBalance: 45000,
      firmId: f1,
      firmName: 'Apex Traders (Firm A)',
      createdAt: new Date().toISOString(),
    });

    const b2 = await db.bankAccounts.add({
      accountName: 'SBI Business Account',
      bankName: 'State Bank of India',
      accountNumber: '30998877665',
      ifscCode: 'SBIN0004567',
      upiId: 'apexent@sbi',
      openingBalance: 20000,
      currentBalance: 20000,
      firmId: f2,
      firmName: 'Apex Enterprises (Firm B)',
      createdAt: new Date().toISOString(),
    });

    const p1 = await db.parties.add({
      name: 'Sharma General Store',
      accountCode: 'CUST-101',
      phone: '9811122233',
      email: 'sharma.store@gmail.com',
      address: 'Sector 14, Noida',
      gstin: '09AAACS1234F1Z8',
      partyType: 'CUSTOMER',
      openingBalance: 12500,
      currentBalance: 12500,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const p2 = await db.parties.add({
      name: 'Royal Supermart',
      accountCode: 'CUST-102',
      phone: '9822233344',
      address: 'Indirapuram, Ghaziabad',
      partyType: 'CUSTOMER',
      openingBalance: 4200,
      currentBalance: 4200,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const p3 = await db.parties.add({
      name: 'Gupta Wholesale Suppliers',
      accountCode: 'SUPP-201',
      phone: '9833344455',
      address: 'Chandni Chowk, Delhi',
      gstin: '07AAACG9876Q1Z2',
      partyType: 'SUPPLIER',
      openingBalance: -18000,
      currentBalance: -18000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await db.items.bulkAdd([
      {
        name: 'Basmati Rice Premium (5kg)',
        code: 'ITEM-01',
        category: 'Grocery',
        brand: 'India Gate',
        size: '5kg',
        color: 'White',
        salePrice: 450,
        purchasePrice: 380,
        unit: 'Bag',
        stockQuantity: 45,
        minStockAlert: 10,
        createdAt: new Date().toISOString(),
      },
      {
        name: 'Cotton Sports Polo T-Shirt',
        code: 'ITEM-02',
        category: 'Apparel',
        brand: 'Nike',
        size: 'L',
        color: 'Navy Blue',
        salePrice: 1299,
        purchasePrice: 850,
        unit: 'Pcs',
        stockQuantity: 30,
        minStockAlert: 5,
        createdAt: new Date().toISOString(),
      },
      {
        name: 'Air Speed Running Shoes',
        code: 'ITEM-03',
        category: 'Footwear',
        brand: 'Nike',
        size: '42',
        color: 'Black',
        salePrice: 3499,
        purchasePrice: 2200,
        unit: 'Pair',
        stockQuantity: 18,
        minStockAlert: 4,
        createdAt: new Date().toISOString(),
      },
      {
        name: 'Refined Cooking Oil (1L)',
        code: 'ITEM-04',
        category: 'Grocery',
        brand: 'Fortune',
        size: '1 Litre',
        color: 'Golden',
        salePrice: 140,
        purchasePrice: 120,
        unit: 'Pcs',
        stockQuantity: 120,
        minStockAlert: 20,
        createdAt: new Date().toISOString(),
      },
      {
        name: 'Whole Wheat Flour (10kg)',
        code: 'ITEM-05',
        category: 'Grocery',
        brand: 'Aashirvaad',
        size: '10kg',
        color: 'Wheat',
        salePrice: 380,
        purchasePrice: 330,
        unit: 'Bag',
        stockQuantity: 8,
        minStockAlert: 15,
        createdAt: new Date().toISOString(),
      },
    ]);

    const today = new Date().toISOString().split('T')[0];
    await db.transactions.bulkAdd([
      {
        voucherNumber: 'PAY-IN-001',
        type: 'PAYMENT_IN',
        partyId: p1,
        partyName: 'Sharma General Store',
        date: today,
        amount: 5000,
        paidAmount: 5000,
        balanceDue: 0,
        paymentStatus: 'PAID',
        paymentMode: 'CASH',
        firmId: f1,
        firmName: 'Apex Traders (Firm A)',
        cashDenominations: { c500: 10, totalNotes: 10, totalAmount: 5000 },
        description: 'Received cash towards partial invoice clearance',
        createdAt: new Date().toISOString(),
      },
      {
        voucherNumber: 'PAY-OUT-001',
        type: 'PAYMENT_OUT',
        partyId: p3,
        partyName: 'Gupta Wholesale Suppliers',
        date: today,
        amount: 8000,
        paidAmount: 8000,
        balanceDue: 0,
        paymentStatus: 'PAID',
        paymentMode: 'BANK',
        firmId: f1,
        firmName: 'Apex Traders (Firm A)',
        bankAccountId: b1,
        bankAccountName: 'HDFC Current Account',
        description: 'Bank transfer NEFT ref #998811',
        createdAt: new Date().toISOString(),
      },
    ]);

    await updatePartyBalance(p1);
    await updatePartyBalance(p2);
    await updatePartyBalance(p3);
    await updateBankAccountBalances();
  }

  const coWorkerCount = await db.coWorkers.count();
  if (coWorkerCount === 0) {
    await db.coWorkers.bulkAdd([
      {
        name: 'Sunil Verma (Owner)',
        phone: '+91 98765 43210',
        email: 'sunil.verma@apextraders.in',
        role: 'Secondary Admin',
        pin: '1234',
        status: 'ACTIVE',
        permissions: ['ALL_PERMISSIONS'],
        createdAt: new Date().toISOString(),
      },
      {
        name: 'Rahul Sharma',
        phone: '+91 98111 22334',
        email: 'rahul.sales@apextraders.in',
        role: 'Salesman',
        pin: '2233',
        status: 'ACTIVE',
        permissions: ['CREATE_SALES', 'VIEW_CATALOGUE', 'CUSTOMER_DUES'],
        createdAt: new Date().toISOString(),
      },
      {
        name: 'Pooja Mehra',
        phone: '+91 98222 55667',
        email: 'pooja.billing@apextraders.in',
        role: 'Biller',
        pin: '5566',
        status: 'ACTIVE',
        permissions: ['CREATE_BILLS', 'PRINT_THERMAL', 'VIEW_INVENTORY'],
        createdAt: new Date().toISOString(),
      },
    ]);
  }
}

export async function updatePartyBalance(partyId: number) {
  const party = await db.parties.get(partyId);
  if (!party) return;

  const txs = await db.transactions.where('partyId').equals(partyId).toArray();
  let balance = party.openingBalance;

  for (const tx of txs) {
    if (party.partyType === 'CUSTOMER') {
      if (tx.type === 'SALE') {
        const netDue = tx.amount - (tx.paidAmount !== undefined ? tx.paidAmount : (tx.paymentStatus === 'PAID' ? tx.amount : 0));
        balance += netDue;
      } else if (tx.type === 'PAYMENT_IN') {
        balance -= tx.amount;
      } else if (tx.type === 'CREDIT_NOTE') {
        // Customer return reduces customer's balance due
        balance -= tx.amount;
      }
    } else {
      if (tx.type === 'PURCHASE') {
        const netDue = tx.amount - (tx.paidAmount !== undefined ? tx.paidAmount : (tx.paymentStatus === 'PAID' ? tx.amount : 0));
        balance -= netDue;
      } else if (tx.type === 'PAYMENT_OUT') {
        balance += tx.amount;
      } else if (tx.type === 'DEBIT_NOTE') {
        // Purchase return reduces what we owe the supplier
        balance += tx.amount;
      }
    }
  }

  await db.parties.update(partyId, {
    currentBalance: balance,
    updatedAt: new Date().toISOString(),
  });
}

export async function updateBankAccountBalances() {
  const banks = await db.bankAccounts.toArray();
  const txs = await db.transactions.toArray();

  for (const bank of banks) {
    let balance = bank.openingBalance;
    for (const tx of txs) {
      if (tx.type === 'CONTRA') {
        if (tx.contraType === 'CASH_TO_BANK') {
          if (tx.toBankAccountId === bank.id || tx.bankAccountId === bank.id) {
            balance += tx.amount;
          }
        } else if (tx.contraType === 'BANK_TO_CASH') {
          if (tx.fromBankAccountId === bank.id || tx.bankAccountId === bank.id) {
            balance -= tx.amount;
          }
        } else if (tx.contraType === 'BANK_TO_BANK') {
          if (tx.fromBankAccountId === bank.id) balance -= tx.amount;
          if (tx.toBankAccountId === bank.id) balance += tx.amount;
        }
      } else if (tx.bankAccountId === bank.id) {
        const isPositive = tx.type === 'PAYMENT_IN' || tx.type === 'SALE';
        const isNegative = tx.type === 'PAYMENT_OUT' || tx.type === 'PURCHASE' || tx.type === 'EXPENSE';
        const digitalAmt = tx.paymentMode === 'SPLIT' && tx.splitPayment
          ? tx.splitPayment.onlineAmount
          : (tx.paidAmount !== undefined ? tx.paidAmount : tx.amount);

        if (isPositive) balance += digitalAmt;
        if (isNegative) balance -= digitalAmt;
      }
    }

    if (bank.id) {
      await db.bankAccounts.update(bank.id, { currentBalance: balance });
    }
  }
}

export async function resetToNewCompany(profileData: {
  businessName: string;
  ownerName: string;
  phone: string;
  tagline?: string;
  address?: string;
  gstin?: string;
  upiId?: string;
  securityPin?: string;
}) {
  await db.transaction('rw', [db.parties, db.transactions, db.items, db.firms, db.bankAccounts, db.businessProfile, db.coWorkers, db.syncQueue, db.conflictRecords], async () => {
    await db.transactions.clear();
    await db.items.clear();
    await db.parties.clear();
    await db.bankAccounts.clear();
    await db.coWorkers.clear();
    await db.firms.clear();
    await db.businessProfile.clear();
    await db.syncQueue.clear();
    await db.conflictRecords.clear();

    const companyName = profileData.businessName.trim() || 'My Business';
    const owner = profileData.ownerName.trim() || 'Owner';
    const phone = profileData.phone.trim() || '';
    const newFirmId = generateFirmId();

    await db.businessProfile.add({
      businessName: companyName,
      tagline: profileData.tagline?.trim() || 'Retail & Wholesale',
      ownerName: owner,
      phone: phone,
      email: '',
      address: profileData.address?.trim() || '',
      gstin: profileData.gstin?.trim() || '',
      upiId: profileData.upiId?.trim() || '',
      currencySymbol: '₹',
      termsAndConditions: '1. Goods once sold will not be taken back without original bill.\n2. Subject to local jurisdiction.',
      firmId: newFirmId,
      securityPin: profileData.securityPin?.trim() || '1234',
      isPinLockEnabled: false,
      firmCloudAccount: {
        firmId: newFirmId,
        cloudProvider: 'GOOGLE_DRIVE',
        cloudAccountEmail: '',
        cloudConnectionStatus: 'DISCONNECTED',
        cloudSyncCursor: Date.now(),
        cloudSyncVersion: 1,
        cloudDeviceId: getOrCreateDeviceId(),
        cloudOwnerDeviceId: getOrCreateDeviceId(),
        activeDevices: [
          {
            deviceId: getOrCreateDeviceId(),
            deviceName: 'Owner Primary Device',
            role: 'Owner',
            lastSyncAt: new Date().toISOString(),
            isActive: true,
          },
        ],
        autoSyncEnabled: true,
      },
    });

    const f1 = await db.firms.add({
      name: companyName,
      code: 'MAIN',
      isDefault: true,
      phone: phone,
      address: profileData.address?.trim() || '',
      gstin: profileData.gstin?.trim() || '',
      createdAt: new Date().toISOString(),
      firmId: newFirmId,
    });

    await db.bankAccounts.add({
      accountName: 'Cash in Hand',
      bankName: 'Cash Account',
      accountNumber: 'CASH-01',
      openingBalance: 0,
      currentBalance: 0,
      firmId: f1,
      firmName: companyName,
      createdAt: new Date().toISOString(),
    });
  });

  localStorage.setItem('vyapar_initialized', 'clean_user_company');
  localStorage.removeItem('vyapar_active_firm');
}

