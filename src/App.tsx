import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, initializeDatabase, updatePartyBalance, updateBankAccountBalances, resetToNewCompany, enqueueSyncItem } from './db/db';
import { Party, Transaction, Item, BusinessProfile, TransactionType, PartyType, Firm, BankAccount, InvoiceItemEntry, CoWorker, ConflictRecord } from './types';
import { Navbar } from './components/layout/Navbar';
import { Sidebar, MobileTabBar, NavTab } from './components/layout/Sidebar';
import { Dashboard } from './components/dashboard/Dashboard';
import { PartyList } from './components/parties/PartyList';
import { PartyDetail } from './components/parties/PartyDetail';
import { PartyModal } from './components/parties/PartyModal';
import { TransactionModal } from './components/transactions/TransactionModal';
import { ItemList } from './components/items/ItemList';
import { ItemModal } from './components/items/ItemModal';
import { Daybook } from './components/daybook/Daybook';
import { Reports } from './components/reports/Reports';
import { DenominationReport } from './components/reports/DenominationReport';
import { SettingsModal } from './components/settings/SettingsModal';
import { BankingModal } from './components/banking/BankingModal';
import { PinLockScreen } from './components/common/PinLockScreen';
import { ThermalSlipModal } from './components/transactions/ThermalSlipModal';
import { ThermalPrinterManagerModal } from './components/printer/ThermalPrinterManagerModal';
import { CoWorkerSync } from './components/team/CoWorkerSync';
import { 
  getStoredSession, 
  saveUserSession, 
  UserSession, 
  isUserMobileLoggedIn, 
  setMobileLoggedIn,
  canManageCoWorkers,
  canViewBusinessReports
} from './utils/userSession';
import { UserSwitcherModal } from './components/team/UserSwitcherModal';
import { ShowroomExitModal } from './components/items/ShowroomExitModal';
import { MobileLoginScreen } from './components/auth/MobileLoginScreen';
import { NewCompanyModal } from './components/common/NewCompanyModal';
import { ConflictReviewModal } from './components/common/ConflictReviewModal';
import { performDailyAutoBackup } from './utils/backupRestore';
import { syncFirmCloudVault, acceptWorkerCloudInvitation } from './utils/googleDriveSync';
import { authenticateFirmOnCloud, downloadCloudVault, hydrateDexieWithCloudVault, getCloudServerUrl } from './utils/cloudSync';
import { useBackNavigation, BackGestureFeedbackOverlay } from './utils/backNavigation';
import { FloatingActionBar } from './components/common/FloatingActionBar';
import { DailyDebtorsPdfModal } from './components/importer/DailyDebtorsPdfModal';
import { SplitScreenRecoveryQueueModal } from './components/reminders/SplitScreenRecoveryQueueModal';
import { Lock, Tablet } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [partyListFilter, setPartyListFilter] = useState<'CUSTOMER' | 'SUPPLIER' | 'ALL' | 'RECEIVABLE' | 'PAYABLE'>('CUSTOMER');
  
  // One-Time Mobile Login Verification State (Vyapar Style)
  const [isMobileLoggedIn, setIsMobileLoggedIn] = useState<boolean>(() => {
    return isUserMobileLoggedIn();
  });

  const [isAppLocked, setIsAppLocked] = useState<boolean>(() => {
    return sessionStorage.getItem('vyapar_unlocked') !== 'true';
  });

  // Customer Tablet Showroom Kiosk Mode
  const [isCustomerKioskMode, setIsCustomerKioskMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('vyapar_customer_kiosk_mode') === 'true';
    }
    return false;
  });
  const [isExitPinModalOpen, setIsExitPinModalOpen] = useState(false);
  const [pendingInvoiceItems, setPendingInvoiceItems] = useState<InvoiceItemEntry[] | null>(null);

  // Active User & Scoped Role Session
  const [activeSession, setActiveSession] = useState<UserSession>(() => getStoredSession());
  const [isUserSwitcherOpen, setIsUserSwitcherOpen] = useState(false);

  // Multi-Firm & Banking Modal State
  const [isBankingModalOpen, setIsBankingModalOpen] = useState(false);
  const [selectedFirmId, setSelectedFirmId] = useState<number | 'ALL'>('ALL');

  // Thermal Printer Device Manager & Slip Modal
  const [isPrinterManagerOpen, setIsPrinterManagerOpen] = useState(false);
  const [txForThermal, setTxForThermal] = useState<Transaction | null>(null);

  // Party Modal
  const [isPartyModalOpen, setIsPartyModalOpen] = useState(false);
  const [partyToEdit, setPartyToEdit] = useState<Party | null>(null);
  const [defaultPartyType, setDefaultPartyType] = useState<PartyType>('CUSTOMER');

  // Transaction Modal
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [txInitialType, setTxInitialType] = useState<TransactionType>('PAYMENT_IN');
  const [txInitialPartyId, setTxInitialPartyId] = useState<number | undefined>(undefined);
  const [txInitialItems, setTxInitialItems] = useState<InvoiceItemEntry[]>([]);
  const [txToEdit, setTxToEdit] = useState<Transaction | null>(null);

  // Item Modal
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<Item | null>(null);

  // Settings & New Company Modal
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNewCompanyModalOpen, setIsNewCompanyModalOpen] = useState(false);
  const [isDailyDebtorsPdfOpen, setIsDailyDebtorsPdfOpen] = useState(false);
  const [isRecoveryQueueOpen, setIsRecoveryQueueOpen] = useState(false);

  // Cloud Sync & Conflict State
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [syncToastMessage, setSyncToastMessage] = useState<string | null>(null);

  // Floating Action Switches Visibility on Scroll (Vyapar Mobile Pattern)
  const [isQuickActionsVisible, setIsQuickActionsVisible] = useState(true);
  const lastScrollTopRef = useRef(0);

  const handleMainScroll = (e: React.UIEvent<HTMLElement>) => {
    const currentScrollTop = e.currentTarget.scrollTop;
    if (currentScrollTop <= 35) {
      setIsQuickActionsVisible(true);
    } else if (currentScrollTop > lastScrollTopRef.current + 10) {
      // Scrolled down -> hide switches
      setIsQuickActionsVisible(false);
    } else if (currentScrollTop < lastScrollTopRef.current - 10) {
      // Scrolled up -> show switches
      setIsQuickActionsVisible(true);
    }
    lastScrollTopRef.current = currentScrollTop;
  };

  // Registered open modals for the Back System stack (highest priority to close)
  const openModals = [
    isExitPinModalOpen && { id: 'exitPin', close: () => setIsExitPinModalOpen(false) },
    Boolean(txForThermal) && { id: 'thermalSlip', close: () => setTxForThermal(null) },
    isPrinterManagerOpen && { id: 'printerManager', close: () => setIsPrinterManagerOpen(false) },
    isNewCompanyModalOpen && { id: 'newCompany', close: () => setIsNewCompanyModalOpen(false) },
    isConflictModalOpen && { id: 'conflict', close: () => setIsConflictModalOpen(false) },
    isDailyDebtorsPdfOpen && { id: 'dailyPdf', close: () => setIsDailyDebtorsPdfOpen(false) },
    isRecoveryQueueOpen && { id: 'recoveryQueue', close: () => setIsRecoveryQueueOpen(false) },
    isSettingsOpen && { id: 'settings', close: () => setIsSettingsOpen(false) },
    isBankingModalOpen && { id: 'banking', close: () => setIsBankingModalOpen(false) },
    isItemModalOpen && { id: 'item', close: () => setIsItemModalOpen(false) },
    isTxModalOpen && { id: 'tx', close: () => setIsTxModalOpen(false) },
    isPartyModalOpen && { id: 'party', close: () => setIsPartyModalOpen(false) },
    isUserSwitcherOpen && { id: 'userSwitcher', close: () => setIsUserSwitcherOpen(false) },
  ].filter(Boolean) as { id: string; close: () => void }[];

  const {
    handleGoBack,
    navigateToTab,
    canGoBack,
    gestureFeedback,
    exitToastVisible,
  } = useBackNavigation({
    activeTab,
    setActiveTab,
    selectedParty,
    setSelectedParty,
    isKioskMode: isCustomerKioskMode,
    openModals,
  });

  // Live Queries from Dexie DB
  const parties = useLiveQuery(() => db.parties.toArray(), []) || [];
  const transactions = useLiveQuery(() => db.transactions.toArray(), []) || [];
  const items = useLiveQuery(() => db.items.toArray(), []) || [];
  const firms = useLiveQuery(() => db.firms.toArray(), []) || [];
  const bankAccounts = useLiveQuery(() => db.bankAccounts.toArray(), []) || [];
  const coWorkers = useLiveQuery(() => db.coWorkers.toArray(), []) || [];
  const conflictRecords = useLiveQuery(() => db.conflictRecords.toArray(), []) || [];
  const unresolvedConflicts = conflictRecords.filter((c) => c.status === 'UNRESOLVED');
  const syncQueueItems = useLiveQuery(() => db.syncQueue.where('status').equals('PENDING').toArray(), []) || [];
  const profileList = useLiveQuery(() => db.businessProfile.toArray(), []) || [];
  const profile = profileList[0] || {
    businessName: 'Apex Traders & Distributors',
    ownerName: 'Sunil Verma',
    phone: '+91 98765 43210',
    email: 'contact@apextraders.in',
    address: 'Shop #12, Commercial Market, Main Road, New Delhi',
    gstin: '07AAAAA0000A1Z5',
    upiId: 'sunil.verma@upi',
    currencySymbol: '₹',
  };

  useEffect(() => {
    initializeDatabase().catch(console.error);
  }, []);

  const handleManualSync = async () => {
    if (!profile) return;
    setIsSyncingCloud(true);
    let hostName = 'shadab-computers.onrender.com';
    try {
      hostName = new URL(getCloudServerUrl()).hostname;
    } catch {}
    setSyncToastMessage(`🔄 Syncing with Cloud (${hostName})...`);
    try {
      await syncFirmCloudVault(profile, handleSaveProfile);
      setSyncToastMessage('✓ Cloud Synced! Latest bills & parties up to date.');
      setTimeout(() => setSyncToastMessage(null), 3500);
    } catch (e: any) {
      console.error('Manual sync error:', e);
      setSyncToastMessage(`⚠ Sync: ${e.message || 'Updated'}`);
      setTimeout(() => setSyncToastMessage(null), 4000);
    } finally {
      setIsSyncingCloud(false);
    }
  };

  // Auto Cloud Sync & Online Reconnect Worker
  useEffect(() => {
    if (!profile?.firmCloudAccount || profile.firmCloudAccount.cloudConnectionStatus === 'DISCONNECTED') {
      return;
    }

    const runSync = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      try {
        setIsSyncingCloud(true);
        await syncFirmCloudVault(profile, handleSaveProfile);
      } catch (err) {
        console.error('Auto cloud sync error:', err);
      } finally {
        setIsSyncingCloud(false);
      }
    };

    const handleOnline = () => {
      console.log('Internet reconnected. Syncing queue...');
      runSync();
    };

    window.addEventListener('online', handleOnline);

    const interval = setInterval(() => {
      if (profile.firmCloudAccount?.autoSyncEnabled !== false) {
        runSync();
      }
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      clearInterval(interval);
    };
  }, [profile?.firmCloudAccount?.cloudConnectionStatus, profile?.firmCloudAccount?.autoSyncEnabled, profile?.firmId]);

  // Background Daily Auto-Backup Worker
  useEffect(() => {
    if (!profile?.isDailyAutoBackupEnabled) return;
    performDailyAutoBackup(profile, handleSaveProfile)
      .then((res) => {
        if (res.ran) {
          console.log('Daily auto-backup ran successfully:', res.message);
        }
      })
      .catch((err) => console.error('Daily auto-backup check error:', err));
  }, [profile?.isDailyAutoBackupEnabled, profile?.lastAutoBackupDate]);

  // Detect URL parameter co-worker invitation link or Cloud Invite & authenticate
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const cloudInvite = urlParams.get('cloudInvite');
      const directFirmParam = urlParams.get('joinFirm') || urlParams.get('firmId');

      if (directFirmParam && (!profile?.firmId || profile.firmId !== directFirmParam.toUpperCase())) {
        const firmKey = `firm_joined_${directFirmParam.toUpperCase()}`;
        if (!sessionStorage.getItem(firmKey)) {
          sessionStorage.setItem(firmKey, 'true');
          try {
            if (window.history && window.history.replaceState) {
              window.history.replaceState({}, document.title, window.location.pathname);
            }
          } catch {}
          const pinParam = urlParams.get('pin') || '1234';
          authenticateFirmOnCloud(directFirmParam.toUpperCase(), pinParam)
            .then(async (res) => {
              const vault = res.vault || (await downloadCloudVault(directFirmParam.toUpperCase()));
              if (vault) {
                await hydrateDexieWithCloudVault(vault, { clearExisting: true, forceReload: true });
              }
            })
            .catch((err) => console.log('Direct firm param auth notice:', err));
        }
      }

      if (cloudInvite) {
        const inviteKey = `cloud_invite_done_${cloudInvite.slice(0, 20)}`;
        if (!sessionStorage.getItem(inviteKey)) {
          sessionStorage.setItem(inviteKey, 'true');
          try {
            if (window.history && window.history.replaceState) {
              window.history.replaceState({}, document.title, window.location.pathname);
            }
          } catch {}
          acceptWorkerCloudInvitation(cloudInvite, handleSaveProfile)
            .then((res) => {
              if (res.success) {
                const newSession: UserSession = {
                  type: 'COWORKER',
                  name: res.workerName,
                  phone: '',
                  role: (res as any).role || 'Salesman',
                  isRemote: true,
                };
                setActiveSession(newSession);
                saveUserSession(newSession);
                setSyncToastMessage(`✓ Welcome to ${res.firmName}! Authenticated as ${res.workerName}.`);
                setTimeout(() => setSyncToastMessage(null), 5000);
              }
            })
            .catch((err) => console.error('Cloud invite error:', err));
        }
      }

      const workerIdParam = urlParams.get('workerId') || urlParams.get('coworker');
      const pinParam = urlParams.get('pin');
      if (workerIdParam && coWorkers.length > 0) {
        const found = coWorkers.find((w) => w.id === Number(workerIdParam));
        if (found) {
          if (!pinParam || found.pin === pinParam) {
            const newSession: UserSession = {
              type: 'COWORKER',
              id: found.id,
              name: found.name,
              phone: found.phone,
              role: found.role,
              pin: found.pin,
              isRemote: true,
            };
            setActiveSession(newSession);
            saveUserSession(newSession);
          }
        }
      }
    } catch (e) {
      console.error('Failed reading URL auth params:', e);
    }
  }, [coWorkers]);

  useEffect(() => {
    if (selectedParty) {
      const refreshed = parties.find((p) => p.id === selectedParty.id);
      if (refreshed) setSelectedParty(refreshed);
    }
  }, [parties]);

  // Party handlers
  const handleOpenAddParty = (type: PartyType) => {
    setPartyToEdit(null);
    setDefaultPartyType(type);
    setIsPartyModalOpen(true);
  };

  const handleOpenEditParty = (party: Party) => {
    setPartyToEdit(party);
    setIsPartyModalOpen(true);
  };

  const handleSaveParty = async (data: Partial<Party>) => {
    if (partyToEdit && partyToEdit.id) {
      await db.parties.update(partyToEdit.id, {
        ...data,
        firmId: data.firmId !== undefined ? data.firmId : partyToEdit.firmId,
        firmName: data.firmName !== undefined ? data.firmName : partyToEdit.firmName,
        updatedAt: new Date().toISOString(),
      });
      await updatePartyBalance(partyToEdit.id);
      await enqueueSyncItem({
        entityType: 'party',
        entityId: partyToEdit.name,
        action: 'UPDATE',
        payload: { ...partyToEdit, ...data },
        firmId: profile?.firmId,
      });
    } else {
      const newPartyRecord: Party = {
        name: data.name || '',
        accountCode: data.accountCode || `ACC-${Date.now().toString().slice(-4)}`,
        phone: data.phone || '',
        email: data.email || '',
        address: data.address || '',
        gstin: data.gstin || '',
        partyType: data.partyType || 'CUSTOMER',
        openingBalance: data.openingBalance || 0,
        currentBalance: data.openingBalance || 0,
        firmId: data.firmId,
        firmName: data.firmName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const newId = await db.parties.add(newPartyRecord);
      await updatePartyBalance(newId);
      await enqueueSyncItem({
        entityType: 'party',
        entityId: data.name || '',
        action: 'CREATE',
        payload: { ...newPartyRecord, id: newId },
        firmId: profile?.firmId,
      });
    }
  };

  const handleDeleteParty = async (id: number) => {
    const p = await db.parties.get(id);
    if (!p) return;
    const txCount = await db.transactions.where('partyId').equals(id).count();
    let message = `Are you sure you want to delete "${p.name}"?`;
    if (txCount > 0) {
      message = `"${p.name}" has ${txCount} transaction(s) recorded in the ledger.\n\nDeleting this party will remove the party record. Historical transaction records in the Daybook will remain preserved.\n\nDo you want to proceed with deleting "${p.name}"?`;
    }
    if (!window.confirm(message)) {
      return;
    }
    await db.parties.delete(id);
    await enqueueSyncItem({
      entityType: 'party',
      entityId: p.name,
      action: 'DELETE',
      payload: p,
      firmId: profile?.firmId,
    });
    if (selectedParty && selectedParty.id === id) {
      setSelectedParty(null);
    }
  };

  // Transaction handlers
  const handleOpenAddTx = (type: TransactionType = 'PAYMENT_IN', partyId?: number) => {
    setTxToEdit(null);
    setTxInitialType(type);
    setTxInitialPartyId(partyId);
    setTxInitialItems([]);
    setIsTxModalOpen(true);
  };

  const handleOpenEditTx = (tx: Transaction) => {
    setTxToEdit(tx);
    setTxInitialType(tx.type);
    setTxInitialPartyId(tx.partyId);
    setTxInitialItems([]);
    setIsTxModalOpen(true);
  };

  const handleQuickBillFromStore = (itemsToBill: InvoiceItemEntry[]) => {
    setTxToEdit(null);
    setTxInitialType('SALE');
    setTxInitialPartyId(undefined);
    setTxInitialItems(itemsToBill);
    setIsTxModalOpen(true);
  };

  const handleDeleteTx = async (id: number) => {
    const existing = await db.transactions.get(id);
    if (!existing) return;

    // Reverse item stocks if items were attached
    if (existing.items && existing.items.length > 0) {
      for (const itemLine of existing.items) {
        if (itemLine.itemId) {
          const it = await db.items.get(itemLine.itemId);
          if (it) {
            let restoredStock = it.stockQuantity;
            if (existing.type === 'SALE') {
              restoredStock += itemLine.quantity;
            } else if (existing.type === 'PURCHASE') {
              restoredStock -= itemLine.quantity;
            } else if (existing.type === 'CREDIT_NOTE') {
              restoredStock -= itemLine.quantity;
            } else if (existing.type === 'DEBIT_NOTE') {
              restoredStock += itemLine.quantity;
            }
            await db.items.update(itemLine.itemId, { stockQuantity: restoredStock });
          }
        }
      }
    }

    await db.transactions.delete(id);
    await enqueueSyncItem({
      entityType: 'transaction',
      entityId: existing.voucherNumber,
      action: 'DELETE',
      payload: existing,
      firmId: profile?.firmId,
    });
    if (existing.partyId) {
      await updatePartyBalance(existing.partyId);
    }
    await updateBankAccountBalances();
  };

  const handleSaveTx = async (data: Partial<Transaction>, shouldPrint = false) => {
    let savedTx: Transaction | undefined = undefined;

    if (txToEdit && txToEdit.id) {
      // If updating, reverse old stocks first
      if (txToEdit.items && txToEdit.items.length > 0) {
        for (const oldLine of txToEdit.items) {
          if (oldLine.itemId) {
            const it = await db.items.get(oldLine.itemId);
            if (it) {
              let stock = it.stockQuantity;
              if (txToEdit.type === 'SALE') stock += oldLine.quantity;
              else if (txToEdit.type === 'PURCHASE') stock -= oldLine.quantity;
              else if (txToEdit.type === 'CREDIT_NOTE') stock -= oldLine.quantity;
              else if (txToEdit.type === 'DEBIT_NOTE') stock += oldLine.quantity;
              await db.items.update(oldLine.itemId, { stockQuantity: stock });
            }
          }
        }
      }

      await db.transactions.update(txToEdit.id, {
        ...data,
      });

      if (data.partyId) await updatePartyBalance(data.partyId);
      if (txToEdit.partyId && txToEdit.partyId !== data.partyId) {
        await updatePartyBalance(txToEdit.partyId);
      }

      const refreshed = await db.transactions.get(txToEdit.id);
      savedTx = refreshed || ({ ...txToEdit, ...data } as Transaction);
    } else {
      const newTx: any = {
        voucherNumber: data.voucherNumber || `VCH-${Date.now()}`,
        type: data.type || 'PAYMENT_IN',
        partyId: data.partyId,
        partyName: data.partyName,
        date: data.date || new Date().toISOString().split('T')[0],
        amount: data.amount || 0,
        paidAmount: data.paidAmount,
        balanceDue: data.balanceDue,
        paymentStatus: data.paymentStatus,
        paymentMode: data.paymentMode || 'CASH',
        splitPayment: data.splitPayment,
        firmId: data.firmId,
        firmName: data.firmName,
        bankAccountId: data.bankAccountId,
        bankAccountName: data.bankAccountName,
        contraType: data.contraType,
        fromBankAccountId: data.fromBankAccountId,
        fromBankAccountName: data.fromBankAccountName,
        toBankAccountId: data.toBankAccountId,
        toBankAccountName: data.toBankAccountName,
        originalVoucherNumber: data.originalVoucherNumber,
        returnReason: data.returnReason,
        items: data.items,
        description: data.description,
        cashDenominations: data.cashDenominations,
        attachments: data.attachments || [],
        createdAt: new Date().toISOString(),
      };

      const newId = await db.transactions.add(newTx);
      newTx.id = Number(newId);
      savedTx = newTx as Transaction;

      if (data.partyId) {
        await updatePartyBalance(data.partyId);
      }
    }

    await updateBankAccountBalances();

    // Apply new stock quantities
    if (data.items && data.items.length > 0) {
      for (const itemLine of data.items) {
        if (itemLine.itemId) {
          const itemRecord = await db.items.get(itemLine.itemId);
          if (itemRecord) {
            let newStock = itemRecord.stockQuantity;
            if (data.type === 'SALE') {
              newStock -= itemLine.quantity;
            } else if (data.type === 'PURCHASE') {
              newStock += itemLine.quantity;
            } else if (data.type === 'CREDIT_NOTE') {
              newStock += itemLine.quantity;
            } else if (data.type === 'DEBIT_NOTE') {
              newStock -= itemLine.quantity;
            }
            await db.items.update(itemLine.itemId, { stockQuantity: newStock });
          }
        }
      }
    }

    if (savedTx) {
      await enqueueSyncItem({
        entityType: 'transaction',
        entityId: savedTx.voucherNumber,
        action: txToEdit ? 'UPDATE' : 'CREATE',
        payload: savedTx,
        firmId: profile?.firmId,
      });
    }

    // Instantly launch thermal print slip if requested
    if (shouldPrint && savedTx) {
      setTxForThermal(savedTx);
    }

    return savedTx;
  };

  // Banking & Firm Handlers
  const handleAddBankAccount = async (bank: Omit<BankAccount, 'id' | 'createdAt'>) => {
    await db.bankAccounts.add({
      ...bank,
      createdAt: new Date().toISOString(),
    });
    await updateBankAccountBalances();
  };

  const handleUpdateBankAccount = async (id: number, bank: Partial<BankAccount>) => {
    await db.bankAccounts.update(id, bank);
    await updateBankAccountBalances();
  };

  const handleDeleteBankAccount = async (id: number) => {
    await db.bankAccounts.delete(id);
  };

  const handleAddFirm = async (firm: Omit<Firm, 'id' | 'createdAt'>) => {
    await db.firms.add({
      ...firm,
      createdAt: new Date().toISOString(),
    });
  };

  const handleUpdateFirm = async (id: number, firm: Partial<Firm>) => {
    await db.firms.update(id, firm);
  };

  const handleDeleteFirm = async (id: number) => {
    await db.firms.delete(id);
  };

  // Item handlers
  const handleOpenAddItem = () => {
    setItemToEdit(null);
    setIsItemModalOpen(true);
  };

  const handleOpenEditItem = (item: Item) => {
    setItemToEdit(item);
    setIsItemModalOpen(true);
  };

  const handleDeleteItem = async (id: number) => {
    const it = await db.items.get(id);
    await db.items.delete(id);
    if (it) {
      await enqueueSyncItem({
        entityType: 'item',
        entityId: it.code || it.name,
        action: 'DELETE',
        payload: it,
        firmId: profile?.firmId,
      });
    }
  };

  const handleSaveItem = async (data: Partial<Item>) => {
    if (itemToEdit && itemToEdit.id) {
      await db.items.update(itemToEdit.id, {
        ...data,
      });
      await enqueueSyncItem({
        entityType: 'item',
        entityId: itemToEdit.code || itemToEdit.name,
        action: 'UPDATE',
        payload: { ...itemToEdit, ...data },
        firmId: profile?.firmId,
      });
    } else {
      await db.items.add({
        name: data.name || '',
        code: data.code || `ITM-${Date.now().toString().slice(-4)}`,
        barcode: data.barcode,
        hsnCode: data.hsnCode,
        category: data.category || '',
        brand: data.brand || '',
        size: data.size || '',
        color: data.color || '',
        colors: data.colors || [],
        images: data.images || [],
        salePrice: data.salePrice || 0,
        purchasePrice: data.purchasePrice || 0,
        taxRate: data.taxRate || 0,
        unit: data.unit || 'Pcs',
        stockQuantity: data.stockQuantity || 0,
        minStockAlert: data.minStockAlert || 5,
        createdAt: new Date().toISOString(),
      });
      await enqueueSyncItem({
        entityType: 'item',
        entityId: data.name || '',
        action: 'CREATE',
        payload: data,
        firmId: profile?.firmId,
      });
    }
  };

  const handleSaveProfile = async (data: Partial<BusinessProfile>) => {
    // Security Requirement 15: Ensure Google access token is never persisted to Dexie DB or storage
    if (data.firmCloudAccount && 'accessToken' in data.firmCloudAccount) {
      delete data.firmCloudAccount.accessToken;
    }
    if (profile && profile.id) {
      await db.businessProfile.update(profile.id, data);
    } else {
      await db.businessProfile.add(data as BusinessProfile);
    }
    if (data.isPinLockEnabled === false) {
      setIsAppLocked(false);
      sessionStorage.setItem('vyapar_unlocked', 'true');
    }
  };

  const handleSaveCoWorker = async (data: Partial<CoWorker>) => {
    let savedWorker: CoWorker | undefined;
    if (data.id) {
      await db.coWorkers.update(data.id, data);
      savedWorker = await db.coWorkers.get(data.id);
    } else {
      const id = await db.coWorkers.add(data as CoWorker);
      savedWorker = await db.coWorkers.get(id as number);
    }

    if (savedWorker) {
      await enqueueSyncItem({
        entityType: 'coWorker',
        entityId: String(savedWorker.id),
        action: data.id ? 'UPDATE' : 'CREATE',
        payload: savedWorker,
        firmId: profile?.firmId,
      });
      if (profile) {
        syncFirmCloudVault(profile, handleSaveProfile).catch(() => {});
      }
    }
  };

  const handleDeleteCoWorker = async (id: number) => {
    const existing = await db.coWorkers.get(id);
    await db.coWorkers.delete(id);
    if (existing) {
      await enqueueSyncItem({
        entityType: 'coWorker',
        entityId: String(id),
        action: 'DELETE',
        payload: existing,
        firmId: profile?.firmId,
      });
      if (profile) {
        syncFirmCloudVault(profile, handleSaveProfile).catch(() => {});
      }
    }
  };

  const handleResetDemo = async () => {
    if (window.confirm('Are you sure you want to reset all data back to initial demo state?')) {
      await db.parties.clear();
      await db.transactions.clear();
      await db.items.clear();
      await db.firms.clear();
      await db.bankAccounts.clear();
      await db.businessProfile.clear();
      await initializeDatabase();
      setSelectedParty(null);
      setIsSettingsOpen(false);
    }
  };

  const handleCreateNewCompany = async (data: {
    businessName: string;
    ownerName: string;
    phone: string;
    tagline?: string;
    address?: string;
    gstin?: string;
    upiId?: string;
  }) => {
    await resetToNewCompany(data);
    const updatedSession: UserSession = {
      type: 'OWNER',
      name: data.ownerName || 'Owner (Admin)',
      phone: data.phone,
      role: 'Owner',
    };
    saveUserSession(updatedSession);
    setActiveSession(updatedSession);
    setMobileLoggedIn(true);
    setIsMobileLoggedIn(true);
    setSelectedParty(null);
    setSelectedFirmId('ALL');
    setIsSettingsOpen(false);
    setActiveTab('items');
  };

  // Customer Tablet Kiosk Showroom Handlers
  const handleEnterKioskMode = () => {
    setIsCustomerKioskMode(true);
    localStorage.setItem('vyapar_customer_kiosk_mode', 'true');
    setActiveTab('items');
    setSelectedParty(null);
  };

  const handleRequestExitKiosk = (itemsToBill?: InvoiceItemEntry[]) => {
    if (itemsToBill && itemsToBill.length > 0) {
      setPendingInvoiceItems(itemsToBill);
    } else {
      setPendingInvoiceItems(null);
    }
    setIsExitPinModalOpen(true);
  };

  const handleConfirmExitKiosk = () => {
    setIsCustomerKioskMode(false);
    localStorage.setItem('vyapar_customer_kiosk_mode', 'false');
    setIsExitPinModalOpen(false);

    // If customer selected items in showroom cart, open sale transaction to bill them immediately!
    if (pendingInvoiceItems && pendingInvoiceItems.length > 0) {
      setTxInitialType('SALE');
      setTxInitialItems(pendingInvoiceItems);
      setTxToEdit(null);
      setIsTxModalOpen(true);
      setPendingInvoiceItems(null);
    }
  };

  // 1. One-Time Mobile Login Verification (Vyapar Style)
  if (!isMobileLoggedIn) {
    return (
      <MobileLoginScreen
        profile={profile}
        coWorkers={coWorkers}
        onLoginSuccess={async (session, updatedBusinessName, phone) => {
          setActiveSession(session);
          saveUserSession(session);
          setMobileLoggedIn(true);
          setIsMobileLoggedIn(true);
          if (updatedBusinessName || phone) {
            await handleSaveProfile({
              ...(updatedBusinessName ? { businessName: updatedBusinessName } : {}),
              ...(phone ? { phone } : {}),
            });
          }
        }}
      />
    );
  }

  const isLocked = Boolean(profile?.isPinLockEnabled && profile?.securityPin && isAppLocked);

  if (isLocked) {
    return (
      <PinLockScreen
        correctPin={profile.securityPin!}
        businessName={profile.businessName}
        onUnlock={() => {
          sessionStorage.setItem('vyapar_unlocked', 'true');
          setIsAppLocked(false);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans w-full max-w-full overflow-x-hidden">
      {isCustomerKioskMode ? (
        <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-30 px-4 lg:px-6 py-3 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center font-black text-white text-lg shadow-sm">
              {profile?.businessName ? profile.businessName.charAt(0) : 'S'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-base text-white leading-tight">
                  {profile?.businessName || 'Store Showroom'}
                </h1>
                <span className="bg-purple-900/60 text-purple-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-purple-700/50">
                  DIGITAL SHOWROOM
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                <span>{profile?.phone || 'Digital Catalogue'}</span>
                <span>&bull;</span>
                <span className="text-slate-300">Tap items to view sizes, colours & photos</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleRequestExitKiosk()}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
            title="Exit Showroom Mode (Requires Staff PIN)"
          >
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            <span>Staff Exit</span>
          </button>
        </header>
      ) : (
        <Navbar
          profile={profile}
          activeSession={activeSession}
          canGoBack={canGoBack}
          onGoBack={() => handleGoBack('ui_button')}
          onOpenUserSwitcher={() => setIsUserSwitcherOpen(true)}
          onOpenQuickTx={() => handleOpenAddTx('PAYMENT_IN')}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenNewCompany={() => setIsNewCompanyModalOpen(true)}
          onOpenBanking={() => setIsBankingModalOpen(true)}
          onOpenPrinterSettings={() => setIsPrinterManagerOpen(true)}
          onOpenTeamSync={() => navigateToTab('team')}
          onEnterShowroomMode={handleEnterKioskMode}
          isPinEnabled={Boolean(profile?.isPinLockEnabled && profile?.securityPin)}
          onLockApp={() => {
            sessionStorage.removeItem('vyapar_unlocked');
            setIsAppLocked(true);
          }}
          onOpenCloudSync={() => setIsSettingsOpen(true)}
          unresolvedConflictsCount={unresolvedConflicts.length}
          onOpenConflictReview={() => setIsConflictModalOpen(true)}
          onTriggerSyncNow={handleManualSync}
          isSyncing={isSyncingCloud}
          pendingQueueCount={syncQueueItems.length}
        />
      )}

      <div className="flex-1 flex overflow-hidden">
        {!isCustomerKioskMode && (
          <Sidebar
            activeTab={activeTab}
            currentRole={activeSession.role}
            onSelectTab={(tab) => navigateToTab(tab)}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenBanking={() => setIsBankingModalOpen(true)}
          />
        )}

        <main onScroll={handleMainScroll} className={`flex-1 p-2.5 sm:p-4 md:p-6 lg:p-8 overflow-y-auto max-w-7xl mx-auto w-full ${isCustomerKioskMode ? 'pb-8' : 'pb-28 md:pb-12'}`}>
          {isCustomerKioskMode ? (
            <ItemList
              items={items}
              profile={profile}
              currentRole="Other"
              isKioskMode={true}
              onExitKioskMode={handleRequestExitKiosk}
              onOpenAddModal={() => {}}
              onEditItem={() => {}}
              onQuickBill={() => {}}
            />
          ) : selectedParty ? (
            <PartyDetail
              party={selectedParty}
              transactions={transactions}
              profile={profile}
              bankAccounts={bankAccounts}
              firms={firms}
              onBack={() => handleGoBack('ui_button')}
              onEditParty={handleOpenEditParty}
              onDeleteParty={handleDeleteParty}
              onOpenTxModal={(t, pId) => handleOpenAddTx(t, pId || selectedParty.id)}
              onEditTx={handleOpenEditTx}
              onDeleteTx={handleDeleteTx}
            />
          ) : activeTab === 'dashboard' ? (
            <Dashboard
              parties={parties}
              transactions={transactions}
              firms={firms}
              bankAccounts={bankAccounts}
              profile={profile}
              currentRole={activeSession.role}
              currentUserName={activeSession.name}
              selectedFirmId={selectedFirmId}
              onChangeFirmFilter={(fId) => setSelectedFirmId(fId)}
              onOpenTxModal={(t) => handleOpenAddTx(t)}
              onSelectParty={(p) => setSelectedParty(p)}
              onViewAllTxs={() => navigateToTab('daybook')}
              onNavigateToParties={(filter) => {
                setPartyListFilter(filter);
                navigateToTab('parties');
              }}
              onNavigateToDaybook={() => navigateToTab('daybook')}
              onOpenBankingModal={() => setIsBankingModalOpen(true)}
              onOpenDailyPdfSync={() => setIsDailyDebtorsPdfOpen(true)}
              onOpenRecoveryQueue={() => setIsRecoveryQueueOpen(true)}
            />
          ) : activeTab === 'parties' ? (
            <PartyList
              parties={parties}
              profile={profile}
              bankAccounts={bankAccounts}
              firms={firms}
              currentRole={activeSession.role}
              initialFilter={partyListFilter}
              onSelectParty={(p) => setSelectedParty(p)}
              onOpenAddModal={handleOpenAddParty}
              onEditParty={handleOpenEditParty}
              onDeleteParty={handleDeleteParty}
              onOpenDailyPdfSync={() => setIsDailyDebtorsPdfOpen(true)}
              onOpenRecoveryQueue={() => setIsRecoveryQueueOpen(true)}
            />
          ) : activeTab === 'cash_tally' ? (
            <DenominationReport
              transactions={transactions}
              profile={profile}
              firms={firms}
              initialFirmId={selectedFirmId}
              onSelectFirm={(fId) => setSelectedFirmId(fId)}
            />
          ) : activeTab === 'items' ? (
            <ItemList
              items={items}
              profile={profile}
              currentRole={activeSession.role}
              isKioskMode={false}
              onEnterKioskMode={handleEnterKioskMode}
              onOpenAddModal={handleOpenAddItem}
              onEditItem={handleOpenEditItem}
              onQuickBill={handleQuickBillFromStore}
            />
          ) : activeTab === 'daybook' ? (
            <Daybook
              transactions={transactions}
              parties={parties}
              profile={profile}
              firms={firms}
              bankAccounts={bankAccounts}
              initialFirmId={selectedFirmId}
              onOpenTxModal={(t) => handleOpenAddTx(t)}
              onEditTx={handleOpenEditTx}
              onDeleteTx={handleDeleteTx}
            />
          ) : activeTab === 'team' ? (
            canManageCoWorkers(activeSession.role) ? (
              <CoWorkerSync
                coWorkers={coWorkers}
                profile={profile}
                activeSession={activeSession}
                onSelectUser={(s) => {
                  setActiveSession(s);
                  saveUserSession(s);
                }}
                onSaveCoWorker={handleSaveCoWorker}
                onDeleteCoWorker={handleDeleteCoWorker}
              />
            ) : (
              <div className="p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 shadow-xs">
                <p className="font-bold text-slate-700">Access Restricted</p>
                <p className="text-xs text-slate-500 mt-1">Staff management is only accessible by Business Owners and Administrators.</p>
              </div>
            )
          ) : (
            canViewBusinessReports(activeSession.role) ? (
              <Reports
                parties={parties}
                transactions={transactions}
                items={items}
                profile={profile}
                firms={firms}
                bankAccounts={bankAccounts}
                initialFirmId={selectedFirmId}
              />
            ) : (
              <div className="p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 shadow-xs">
                <p className="font-bold text-slate-700">Access Restricted</p>
                <p className="text-xs text-slate-500 mt-1">Financial reports and company profits are reserved for Business Owners.</p>
              </div>
            )
          )}
        </main>

        {/* Floating Vyapar-style Quick Action Switches (Take Payment, (+), Add Sale) */}
        {!isCustomerKioskMode && (activeTab === 'dashboard' || (!selectedParty && (activeTab === 'parties' || activeTab === 'daybook'))) && (
          <FloatingActionBar
            isVisible={true}
            onTakePayment={() => handleOpenAddTx('PAYMENT_IN')}
            onAddSale={() => handleOpenAddTx('SALE')}
            onOpenTxModal={(type) => handleOpenAddTx(type)}
            onOpenAddParty={() => handleOpenAddParty('CUSTOMER')}
            onOpenAddItem={() => {
              setItemToEdit(null);
              setIsItemModalOpen(true);
            }}
          />
        )}
      </div>

      {!isCustomerKioskMode && (
        <MobileTabBar
          activeTab={activeTab}
          currentRole={activeSession.role}
          onSelectTab={(tab) => navigateToTab(tab)}
        />
      )}

      <PartyModal
        isOpen={isPartyModalOpen}
        onClose={() => setIsPartyModalOpen(false)}
        onSave={handleSaveParty}
        onDelete={handleDeleteParty}
        partyToEdit={partyToEdit}
        defaultType={defaultPartyType}
        firms={firms}
      />

      <TransactionModal
        isOpen={isTxModalOpen}
        onClose={() => setIsTxModalOpen(false)}
        onSave={handleSaveTx}
        onDelete={handleDeleteTx}
        onPrintTx={(tx) => setTxForThermal(tx)}
        parties={parties}
        items={items}
        firms={firms}
        bankAccounts={bankAccounts}
        initialType={txInitialType}
        initialPartyId={txInitialPartyId}
        initialItems={txInitialItems}
        txToEdit={txToEdit}
        profile={profile}
        currentRole={activeSession.role}
        onAddBankAccount={handleAddBankAccount}
        onOpenPrinterSettings={() => setIsPrinterManagerOpen(true)}
      />

      {/* User Switcher & Remote Authentication Modal */}
      <UserSwitcherModal
        isOpen={isUserSwitcherOpen}
        onClose={() => setIsUserSwitcherOpen(false)}
        activeSession={activeSession}
        coWorkers={coWorkers}
        ownerPin={profile?.securityPin || '1234'}
        onSelectUser={(s) => {
          setActiveSession(s);
          saveUserSession(s);
        }}
        onLogoutMobile={() => {
          setMobileLoggedIn(false);
          setIsMobileLoggedIn(false);
        }}
      />

      <BankingModal
        isOpen={isBankingModalOpen}
        onClose={() => setIsBankingModalOpen(false)}
        bankAccounts={bankAccounts}
        firms={firms}
        onAddBankAccount={handleAddBankAccount}
        onUpdateBankAccount={handleUpdateBankAccount}
        onDeleteBankAccount={handleDeleteBankAccount}
        onAddFirm={handleAddFirm}
        onUpdateFirm={handleUpdateFirm}
        onDeleteFirm={handleDeleteFirm}
      />

      <ItemModal
        isOpen={isItemModalOpen}
        onClose={() => setIsItemModalOpen(false)}
        onSave={handleSaveItem}
        onDelete={handleDeleteItem}
        itemToEdit={itemToEdit}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        profile={profile}
        onSaveProfile={handleSaveProfile}
        onResetDemo={handleResetDemo}
        onOpenNewCompany={() => setIsNewCompanyModalOpen(true)}
        onOpenPrinterSettings={() => setIsPrinterManagerOpen(true)}
      />

      {/* Accounting Conflict Review Modal */}
      <ConflictReviewModal
        isOpen={isConflictModalOpen}
        onClose={() => setIsConflictModalOpen(false)}
        conflicts={conflictRecords}
        onConflictResolved={handleManualSync}
      />

      {/* New Company Initialization & Clean Slate Modal */}
      <NewCompanyModal
        isOpen={isNewCompanyModalOpen}
        onClose={() => setIsNewCompanyModalOpen(false)}
        onConfirm={handleCreateNewCompany}
      />

      {/* 58mm / 80mm ESC/POS Thermal Slip Modal */}
      {txForThermal && (
        <ThermalSlipModal
          isOpen={Boolean(txForThermal)}
          onClose={() => setTxForThermal(null)}
          transaction={txForThermal}
          party={parties.find((p) => p.id === txForThermal.partyId)}
          profile={profile}
          onOpenPrinterManager={() => setIsPrinterManagerOpen(true)}
        />
      )}

      {/* Bluetooth / USB / WiFi Thermal Printer Manager Modal (Matching Screenshot 2) */}
      <ThermalPrinterManagerModal
        isOpen={isPrinterManagerOpen}
        onClose={() => setIsPrinterManagerOpen(false)}
      />

      {/* Daily Sundry Debtors PDF Reconciliation Modal */}
      {isDailyDebtorsPdfOpen && (
        <DailyDebtorsPdfModal
          isOpen={isDailyDebtorsPdfOpen}
          onClose={() => setIsDailyDebtorsPdfOpen(false)}
          parties={parties}
          firms={firms}
          bankAccounts={bankAccounts}
          onSuccess={(stats) => {
            setSyncToastMessage(`✓ Synced ${stats.salesCreated} sales (+₹${stats.totalSalesAmount.toLocaleString()}) from Daily PDF`);
            setTimeout(() => setSyncToastMessage(null), 4000);
          }}
          onOpenManualPayment={(partyName, suggestedAmt) => {
            setIsDailyDebtorsPdfOpen(false);
            const matched = parties.find((p) => p?.name && p.name.toLowerCase().includes(partyName.toLowerCase()));
            handleOpenAddTx('PAYMENT_IN', matched?.id);
          }}
        />
      )}

      {/* Jio WhatsApp Recovery Queue (Split-Screen Optimized) */}
      {isRecoveryQueueOpen && (
        <SplitScreenRecoveryQueueModal
          isOpen={isRecoveryQueueOpen}
          onClose={() => setIsRecoveryQueueOpen(false)}
          parties={parties}
          firms={firms}
          bankAccounts={bankAccounts}
          profile={profile}
          onUpdateParty={(updated) => handleSaveParty(updated)}
        />
      )}

      {/* Customer Showroom Exit PIN Modal */}
      <ShowroomExitModal
        isOpen={isExitPinModalOpen}
        onClose={() => setIsExitPinModalOpen(false)}
        correctPin={profile?.securityPin || '1234'}
        onSuccess={handleConfirmExitKiosk}
      />

      {/* Floating Cloud Sync Toast Notification */}
      {syncToastMessage && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white px-4 py-2 rounded-full shadow-2xl text-xs font-bold backdrop-blur-md border border-slate-700/80 flex items-center gap-2 pointer-events-none transition-all animate-bounce">
          <span>{syncToastMessage}</span>
        </div>
      )}

      {/* Floating Swipe/Back Gesture Cue & Android Double-Back Toast */}
      <BackGestureFeedbackOverlay
        gestureFeedback={gestureFeedback}
        exitToastVisible={exitToastVisible}
      />
    </div>
  );
};

export default App;
