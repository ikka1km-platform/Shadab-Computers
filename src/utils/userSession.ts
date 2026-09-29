import { UserRole, CoWorker, TransactionType } from '../types';
import { NavTab } from '../components/layout/Sidebar';

export interface UserSession {
  type: 'OWNER' | 'COWORKER';
  id?: number;
  name: string;
  phone?: string;
  role: 'Owner' | UserRole;
  pin?: string;
  isRemote?: boolean;
}

const STORAGE_KEY = 'vyapar_active_session';

export const getStoredSession = (): UserSession => {
  if (typeof window === 'undefined') {
    return { type: 'OWNER', name: 'Owner (Admin)', role: 'Owner' };
  }

  // Check URL query parameters for direct remote login
  // e.g. ?workerId=2&pin=1234 or ?coworker=2&pin=1234
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const workerIdParam = urlParams.get('workerId') || urlParams.get('coworker');
    const pinParam = urlParams.get('pin');

    if (workerIdParam) {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as UserSession;
          if (parsed.id === Number(workerIdParam)) {
            return parsed;
          }
        } catch {
          // ignore error
        }
      }
    }

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (err) {
    console.error('Error reading session:', err);
  }

  return {
    type: 'OWNER',
    name: 'Owner (Admin)',
    role: 'Owner',
  };
};

export const saveUserSession = (session: UserSession): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }
};

export const clearUserSession = (): void => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
};

const MOBILE_LOGIN_KEY = 'vyapar_mobile_auth_verified';

export const isUserMobileLoggedIn = (): boolean => {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(MOBILE_LOGIN_KEY) === 'true';
};

export const setMobileLoggedIn = (status: boolean): void => {
  if (typeof window !== 'undefined') {
    if (status) {
      localStorage.setItem(MOBILE_LOGIN_KEY, 'true');
    } else {
      localStorage.removeItem(MOBILE_LOGIN_KEY);
    }
  }
};

// ==========================================
// ROLE PERMISSION CHECKS & DATA SCOPING
// ==========================================

export const canViewPurchasePrice = (role: 'Owner' | UserRole): boolean => {
  return role === 'Owner' || role === 'Secondary Admin';
};

export const canViewSupplierFinances = (role: 'Owner' | UserRole): boolean => {
  return role === 'Owner' || role === 'Secondary Admin';
};

export const canViewBusinessReports = (role: 'Owner' | UserRole): boolean => {
  return role === 'Owner' || role === 'Secondary Admin';
};

export const canViewCashTally = (role: 'Owner' | UserRole): boolean => {
  return role === 'Owner' || role === 'Secondary Admin' || role === 'Biller';
};

export const canManageSettings = (role: 'Owner' | UserRole): boolean => {
  return role === 'Owner';
};

export const canManageCoWorkers = (role: 'Owner' | UserRole): boolean => {
  return role === 'Owner' || role === 'Secondary Admin';
};

export const canDeleteTransactions = (role: 'Owner' | UserRole): boolean => {
  return role === 'Owner' || role === 'Secondary Admin';
};

export const canManageInventoryItems = (role: 'Owner' | UserRole): boolean => {
  return role === 'Owner' || role === 'Secondary Admin';
};

export const getAllowedTransactionTypes = (role: 'Owner' | UserRole): TransactionType[] => {
  if (role === 'Salesman') {
    return ['SALE', 'ESTIMATE', 'CREDIT_NOTE', 'PAYMENT_IN'];
  }
  if (role === 'Biller') {
    return ['SALE', 'ESTIMATE', 'CREDIT_NOTE', 'PAYMENT_IN'];
  }
  if (role === 'Other') {
    return ['ESTIMATE', 'SALE'];
  }
  // Owner and Secondary Admin have full transaction access
  return ['PAYMENT_IN', 'SALE', 'CREDIT_NOTE', 'PAYMENT_OUT', 'PURCHASE', 'DEBIT_NOTE', 'ESTIMATE', 'EXPENSE', 'CONTRA'];
};

export const getFilteredNavTabs = (role: 'Owner' | UserRole): NavTab[] => {
  if (role === 'Salesman') {
    // Salesman sees: Dashboard (Sales KPI), Catalogue & Stock, Customers & Ledgers
    return ['dashboard', 'items', 'parties'];
  }
  if (role === 'Biller') {
    // Biller sees: Dashboard, POS/Daily Cashbook, Cash Note Retally, Items, Parties
    return ['dashboard', 'daybook', 'cash_tally', 'items', 'parties'];
  }
  if (role === 'Other') {
    // Warehouse / Dispatch / Helper: Catalog stock & Dashboard
    return ['dashboard', 'items'];
  }
  // Owner & Secondary Admin see all tabs
  return ['dashboard', 'parties', 'cash_tally', 'daybook', 'items', 'reports', 'team'];
};
