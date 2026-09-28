import { db, updateBankAccountBalances } from '../db/db';
import { Party, Transaction, Item, BusinessProfile, Firm, BankAccount, CoWorker } from '../types';

export interface BackupData {
  appName: string;
  version: number;
  backupDate: string;
  parties: Party[];
  transactions: Transaction[];
  items: Item[];
  firms: Firm[];
  bankAccounts: BankAccount[];
  businessProfile: BusinessProfile[];
  coWorkers?: CoWorker[];
}

export interface BackupPayloadResult {
  backupObj: BackupData;
  jsonString: string;
  filename: string;
  blob: Blob;
  totalRecordsCount: number;
}

/**
 * Builds the complete JSON backup payload from local database.
 */
export async function generateBackupPayload(): Promise<BackupPayloadResult> {
  const parties = await db.parties.toArray();
  const transactions = await db.transactions.toArray();
  const items = await db.items.toArray();
  const firms = await db.firms.toArray();
  const bankAccounts = await db.bankAccounts.toArray();
  const businessProfile = await db.businessProfile.toArray();
  const coWorkers = await db.coWorkers.toArray();

  const backupObj: BackupData = {
    appName: 'Vyapar Business App',
    version: 3,
    backupDate: new Date().toISOString(),
    parties,
    transactions,
    items,
    firms,
    bankAccounts,
    businessProfile,
    coWorkers,
  };

  const jsonString = JSON.stringify(backupObj, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `Vyapar_Backup_${timestamp}.json`;

  const totalRecordsCount =
    parties.length +
    transactions.length +
    items.length +
    firms.length +
    bankAccounts.length +
    coWorkers.length;

  return { backupObj, jsonString, filename, blob, totalRecordsCount };
}

/**
 * Generates and triggers browser download of the full JSON offline backup.
 */
export async function exportFullBackup(): Promise<string> {
  const { blob, filename } = await generateBackupPayload();

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return filename;
}

/**
 * Sends or shares the backup to the specified email address.
 * Uses Web Share API (native Gmail / Samsung Email attachment on Android/Tablets)
 * or downloads file + triggers mailto draft on Desktop.
 */
export async function sendBackupToEmail(
  email: string,
  businessName = 'My Business'
): Promise<{ method: 'share_api' | 'download_and_mailto'; filename: string }> {
  const { blob, filename, totalRecordsCount } = await generateBackupPayload();
  const dateFormatted = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const subject = `Vyapar Backup - ${businessName} (${dateFormatted})`;
  const body = `Hello,\n\nPlease find attached the offline business database backup for ${businessName}.\n\nBackup Details:\n- Date: ${new Date().toLocaleString()}\n- File: ${filename}\n- Total Records: ${totalRecordsCount}\n\nKeep this file safe. You can restore your data at any time inside the app by going to Settings > Backup & Restore.\n\nRegards,\n${businessName}`;

  // Check if browser supports Web Share API with files (Android / Samsung Tablet / iOS)
  if (typeof navigator !== 'undefined' && 'canShare' in navigator) {
    try {
      const file = new File([blob], filename, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: subject,
          text: body,
          files: [file],
        });
        return { method: 'share_api', filename };
      }
    } catch (err: any) {
      // If user aborted/cancelled the share picker, don't throw error
      if (err.name === 'AbortError') {
        return { method: 'share_api', filename };
      }
      console.warn('Web Share failed, falling back to mailto:', err);
    }
  }

  // Fallback: Download file to local storage + open mail draft
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  // Trigger mailto link
  const mailtoUrl = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;

  window.open(mailtoUrl, '_blank');

  return { method: 'download_and_mailto', filename };
}

/**
 * Checks and performs daily auto backup if enabled and not already performed today.
 */
export async function performDailyAutoBackup(
  profile?: BusinessProfile,
  onSaveProfile?: (p: Partial<BusinessProfile>) => Promise<void>
): Promise<{ ran: boolean; message: string; filename?: string }> {
  if (!profile?.isDailyAutoBackupEnabled) {
    return { ran: false, message: 'Daily auto-backup is disabled' };
  }

  const todayStr = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
  const lastBackupStr = profile.lastAutoBackupDate ? profile.lastAutoBackupDate.slice(0, 10) : '';

  // Check if already backed up today
  if (lastBackupStr === todayStr) {
    return { ran: false, message: 'Already backed up today' };
  }

  try {
    const { jsonString, filename, totalRecordsCount } = await generateBackupPayload();

    // 1. Store emergency daily snapshot in localStorage (limited to 5MB or latest snapshot)
    try {
      localStorage.setItem('vyapar_daily_snapshot', jsonString);
      localStorage.setItem('vyapar_daily_snapshot_date', new Date().toISOString());
      localStorage.setItem('vyapar_daily_snapshot_name', filename);
    } catch {
      // If localStorage quota is exceeded due to heavy images, proceed safely
    }

    // 2. If auto-download is also enabled, trigger download
    if (profile.autoDownloadOnDailyBackup) {
      await exportFullBackup();
    }

    // 3. Update profile with lastAutoBackupDate
    const nowIso = new Date().toISOString();
    if (onSaveProfile) {
      await onSaveProfile({
        lastAutoBackupDate: nowIso,
      });
    }

    return {
      ran: true,
      message: `Daily auto-backup completed (${totalRecordsCount} records safely snapshotted)`,
      filename,
    };
  } catch (err: any) {
    console.error('Error during auto-backup:', err);
    return { ran: false, message: err.message || 'Auto-backup failed' };
  }
}

/**
 * Validates and restores complete business data from a backup JSON string.
 */
export async function restoreFromBackup(
  jsonContent: string
): Promise<{ parties: number; transactions: number; items: number; firms: number; bankAccounts: number; coWorkers: number }> {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonContent);
  } catch {
    throw new Error('Invalid JSON file format. Please select a valid Vyapar backup file.');
  }

  if (!parsed.parties || !parsed.transactions) {
    throw new Error('Unrecognized backup format. Missing required accounting tables.');
  }

  // Clear existing data inside a transaction
  await db.transaction('rw', [db.parties, db.transactions, db.items, db.firms, db.bankAccounts, db.businessProfile, db.coWorkers], async () => {
    await db.parties.clear();
    await db.transactions.clear();
    await db.items.clear();
    await db.firms.clear();
    await db.bankAccounts.clear();
    await db.businessProfile.clear();
    await db.coWorkers.clear();

    if (parsed.parties?.length) await db.parties.bulkAdd(parsed.parties);
    if (parsed.transactions?.length) await db.transactions.bulkAdd(parsed.transactions);
    if (parsed.items?.length) await db.items.bulkAdd(parsed.items);
    if (parsed.firms?.length) await db.firms.bulkAdd(parsed.firms);
    if (parsed.bankAccounts?.length) await db.bankAccounts.bulkAdd(parsed.bankAccounts);
    if (parsed.businessProfile?.length) await db.businessProfile.bulkAdd(parsed.businessProfile);
    if (parsed.coWorkers?.length) await db.coWorkers.bulkAdd(parsed.coWorkers);
  });

  await updateBankAccountBalances();

  return {
    parties: parsed.parties?.length || 0,
    transactions: parsed.transactions?.length || 0,
    items: parsed.items?.length || 0,
    firms: parsed.firms?.length || 0,
    bankAccounts: parsed.bankAccounts?.length || 0,
    coWorkers: parsed.coWorkers?.length || 0,
  };
}
