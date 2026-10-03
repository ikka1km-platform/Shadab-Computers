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

    this.version(5).stores({
      parties: '++id, name, accountCode, phone, partyType, currentBalance, firmId',
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

  // Proactively purge any stale demo coworkers, firms, or parties from earlier development
  try {
    const demoProfiles = await db.businessProfile.where('businessName').equals('Apex Traders & Distributors').toArray();
    for (const dp of demoProfiles) {
      if (dp.id) {
        await db.businessProfile.update(dp.id, {
          businessName: 'MS Shopping',
          ownerName: 'Owner',
          phone: '7470661004',
          address: 'Rajgarh',
          firmId: 'FIRM_MUJUM8RS_6MVUTM',
        });
      }
    }
    await db.coWorkers.where('name').anyOf(['Sunil Verma (Owner)', 'Rahul Sharma', 'Pooja Mehra']).delete();
    await db.coWorkers.where('email').anyOf(['sunil.verma@apextraders.in', 'rahul.sales@apextraders.in', 'pooja.billing@apextraders.in']).delete();
    await db.firms.where('name').anyOf(['Apex Traders (Firm A)', 'Apex Enterprises (Firm B)']).delete();
    await db.parties.where('name').anyOf(['Sharma General Store', 'Royal Supermart', 'Gupta Wholesale Suppliers']).delete();
    await db.transactions.where('voucherNumber').anyOf(['INV-001', 'INV-002', 'PUR-001', 'REC-001', 'EXP-001']).delete();

    // Check localStorage session - if it contains stale demo staff, clear it immediately!
    if (typeof window !== 'undefined') {
      const savedSession = localStorage.getItem('vyapar_active_session');
      if (savedSession) {
        try {
          const s = JSON.parse(savedSession);
          if (s && s.name && (s.name.includes('Sunil Verma') || s.name.includes('Rahul Sharma') || s.name.includes('Pooja Mehra') || s.name.includes('Apex Traders'))) {
            localStorage.removeItem('vyapar_active_session');
          }
        } catch {}
      }
    }
  } catch (cleanErr) {
    console.warn('Demo cleanup notice:', cleanErr);
  }

  if (localStorage.getItem('vyapar_initialized') === 'clean_user_company') {
    return;
  }
  const profileCount = await db.businessProfile.count();
  if (profileCount === 0) {
    const initialFirmId = 'FIRM_MUJUM8RS_6MVUTM';
    await db.businessProfile.add({
      businessName: 'MS Shopping',
      tagline: 'Wholesale & Retail General Merchant',
      ownerName: 'Owner',
      phone: '7470661004',
      email: '',
      address: 'Rajgarh',
      gstin: '',
      upiId: '',
      currencySymbol: '₹',
      firmId: initialFirmId,
      securityPin: '1234',
      isPinLockEnabled: false,
      firmCloudAccount: {
        firmId: initialFirmId,
        cloudProvider: 'GOOGLE_DRIVE',
        cloudAccountEmail: 'firm_mujum8rs_6mvutm@vyapaar-cloud.internal',
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

    // Seed default firm
    const firmCount = await db.firms.count();
    if (firmCount === 0) {
      await db.firms.add({
        name: 'MS Shopping',
        code: 'MAIN',
        isDefault: true,
        phone: '7470661004',
        address: 'Rajgarh',
        gstin: '',
        firmId: initialFirmId,
        createdAt: new Date().toISOString(),
      });
    }

    // Seed default Cash in Hand account
    const bankCount = await db.bankAccounts.count();
    if (bankCount === 0) {
      await db.bankAccounts.add({
        accountName: 'Cash in Hand',
        bankName: 'Cash Account',
        accountNumber: 'CASH-01',
        ifscCode: '',
        upiId: '',
        openingBalance: 0,
        currentBalance: 0,
        firmName: 'MS Shopping',
        createdAt: new Date().toISOString(),
      });
    }
    return;
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

