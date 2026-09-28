import { db, updatePartyBalance, updateBankAccountBalances } from '../db/db';
import { Transaction, Party, Item, BankAccount, Firm, ConflictRecord, SyncQueueItem } from '../types';

export interface MergeResult {
  addedTransactions: number;
  updatedTransactions: number;
  conflictedTransactions: number;
  addedParties: number;
  updatedParties: number;
  addedItems: number;
  updatedItems: number;
  conflicts: ConflictRecord[];
}

/**
 * Data-type-specific conflict resolution and merge engine.
 * Never performs naive "last write wins" on financial records.
 */
export async function mergeRemoteFirmVaultData(
  remoteVault: {
    firmId: string;
    transactions?: Transaction[];
    parties?: Party[];
    items?: Item[];
    bankAccounts?: BankAccount[];
    firms?: Firm[];
    lastUpdatedByDevice?: string;
  },
  localDeviceId: string
): Promise<MergeResult> {
  const result: MergeResult = {
    addedTransactions: 0,
    updatedTransactions: 0,
    conflictedTransactions: 0,
    addedParties: 0,
    updatedParties: 0,
    addedItems: 0,
    updatedItems: 0,
    conflicts: [],
  };

  const remoteTxList = remoteVault.transactions || [];
  const remotePartyList = remoteVault.parties || [];
  const remoteItemList = remoteVault.items || [];
  const remoteBankList = remoteVault.bankAccounts || [];
  const remoteFirmList = remoteVault.firms || [];

  // 1. MERGE PARTIES
  for (const rParty of remotePartyList) {
    // Match by accountCode or name
    const existing = await db.parties
      .filter((p) => Boolean((rParty.accountCode && p.accountCode === rParty.accountCode) || p.name.trim().toLowerCase() === rParty.name.trim().toLowerCase()))
      .first();

    if (!existing) {
      const { id, ...dataToInsert } = rParty;
      await db.parties.add({
        ...dataToInsert,
        createdAt: dataToInsert.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      result.addedParties++;
    } else {
      // Party exists - update metadata if remote updatedAt is newer, but preserve ledger integrity
      const remoteTime = new Date(rParty.updatedAt || rParty.createdAt || 0).getTime();
      const localTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();

      if (remoteTime > localTime) {
        await db.parties.update(existing.id!, {
          phone: rParty.phone || existing.phone,
          email: rParty.email || existing.email,
          address: rParty.address || existing.address,
          gstin: rParty.gstin || existing.gstin,
          updatedAt: new Date().toISOString(),
        });
        result.updatedParties++;
      }
    }
  }

  // 2. MERGE ITEMS (STOCK-AWARE RECONCILIATION)
  for (const rItem of remoteItemList) {
    const existing = await db.items
      .filter((i) => Boolean((rItem.code && i.code === rItem.code) || i.name.trim().toLowerCase() === rItem.name.trim().toLowerCase()))
      .first();

    if (!existing) {
      const { id, ...itemToInsert } = rItem;
      await db.items.add({
        ...itemToInsert,
        createdAt: itemToInsert.createdAt || new Date().toISOString(),
      });
      result.addedItems++;
    } else {
      // Stock conflict protection: Never blindly overwrite stockQuantity if local changes were made
      // If salePrice, purchasePrice, or metadata changed remotely, update them
      await db.items.update(existing.id!, {
        salePrice: rItem.salePrice ?? existing.salePrice,
        purchasePrice: rItem.purchasePrice ?? existing.purchasePrice,
        taxRate: rItem.taxRate ?? existing.taxRate,
        category: rItem.category || existing.category,
        brand: rItem.brand || existing.brand,
        color: rItem.color || existing.color,
        colors: rItem.colors || existing.colors,
        images: (rItem.images && rItem.images.length > 0) ? rItem.images : existing.images,
      });
      result.updatedItems++;
    }
  }

  // 3. MERGE TRANSACTIONS / INVOICES (IMMUTABLE EVENT LOG & CONFLICT DETECTOR)
  for (const rTx of remoteTxList) {
    const existing = await db.transactions
      .filter((t) => t.voucherNumber === rTx.voucherNumber)
      .first();

    if (!existing) {
      // New transaction from remote worker/device -> insert as immutable record
      const { id, ...txToInsert } = rTx;
      
      // Map partyId to local party if possible
      if (txToInsert.partyName) {
        const localParty = await db.parties.filter(p => Boolean(txToInsert.partyName && p.name.trim().toLowerCase() === txToInsert.partyName.trim().toLowerCase())).first();
        if (localParty) {
          txToInsert.partyId = localParty.id;
        }
      }

      await db.transactions.add(txToInsert as any);
      result.addedTransactions++;

      // Adjust stock according to new remote transaction items
      if (txToInsert.items && txToInsert.items.length > 0) {
        for (const line of txToInsert.items) {
          const matchedItem = await db.items
            .filter((i) => Boolean(line.name && i.name.trim().toLowerCase() === line.name.trim().toLowerCase()))
            .first();

          if (matchedItem && matchedItem.id) {
            let newStock = matchedItem.stockQuantity;
            if (txToInsert.type === 'SALE') newStock -= line.quantity;
            else if (txToInsert.type === 'PURCHASE') newStock += line.quantity;
            else if (txToInsert.type === 'CREDIT_NOTE') newStock += line.quantity;
            else if (txToInsert.type === 'DEBIT_NOTE') newStock -= line.quantity;
            await db.items.update(matchedItem.id, { stockQuantity: newStock });
          }
        }
      }
    } else {
      // Transaction with same voucherNumber exists locally!
      // Check if both devices modified this voucher with conflicting data
      const isAmountDiff = Math.abs((existing.amount || 0) - (rTx.amount || 0)) > 0.01;
      const isPaidDiff = Math.abs((existing.paidAmount || 0) - (rTx.paidAmount || 0)) > 0.01;
      const isTypeDiff = existing.type !== rTx.type;
      const isItemsDiff = JSON.stringify(existing.items || []) !== JSON.stringify(rTx.items || []);

      if (isAmountDiff || isPaidDiff || isTypeDiff || isItemsDiff) {
        // True conflict detected! Check if conflict was already logged
        const existingConflict = await db.conflictRecords
          .filter((c) => c.entityIdentifier === `Voucher ${rTx.voucherNumber}` && c.status === 'UNRESOLVED')
          .first();

        if (!existingConflict) {
          const conflictEntry: ConflictRecord = {
            entityType: 'transaction',
            entityIdentifier: `Voucher ${rTx.voucherNumber}`,
            firmId: remoteVault.firmId,
            localData: existing,
            remoteData: rTx,
            detectedAt: new Date().toISOString(),
            status: 'UNRESOLVED',
            details: `Voucher ${rTx.voucherNumber} was modified differently. Local amount: ₹${existing.amount}, Remote amount: ₹${rTx.amount}.`,
          };
          const cid = await db.conflictRecords.add(conflictEntry);
          conflictEntry.id = Number(cid);
          result.conflicts.push(conflictEntry);
          result.conflictedTransactions++;
        }
      }
    }
  }

  // 4. MERGE FIRMS (Preserve Android Tablet Multi-Firm Structure)
  for (const rFirm of remoteFirmList) {
    let existing = await db.firms.get(rFirm.id || -1);
    if (!existing && rFirm.name) {
      existing = await db.firms.filter((f) => f.name.trim().toLowerCase() === rFirm.name.trim().toLowerCase()).first();
    }

    if (!existing) {
      await db.firms.put(rFirm);
    } else {
      await db.firms.update(existing.id!, {
        name: rFirm.name,
        code: rFirm.code || existing.code,
        phone: rFirm.phone || existing.phone,
        address: rFirm.address || existing.address,
        gstin: rFirm.gstin || existing.gstin,
        isDefault: rFirm.isDefault ?? existing.isDefault,
        firmId: rFirm.firmId || existing.firmId,
        upiId: rFirm.upiId || existing.upiId,
      });
    }
  }

  // 5. MERGE BANK ACCOUNTS
  for (const rBank of remoteBankList) {
    let existing = await db.bankAccounts.get(rBank.id || -1);
    if (!existing && rBank.accountName) {
      existing = await db.bankAccounts.filter((b) => b.accountName.trim().toLowerCase() === rBank.accountName.trim().toLowerCase()).first();
    }

    if (!existing) {
      await db.bankAccounts.put(rBank);
    } else {
      await db.bankAccounts.update(existing.id!, {
        accountName: rBank.accountName,
        bankName: rBank.bankName,
        accountNumber: rBank.accountNumber,
        ifscCode: rBank.ifscCode || existing.ifscCode,
        upiId: rBank.upiId || existing.upiId,
        currentBalance: rBank.currentBalance ?? existing.currentBalance,
        firmId: rBank.firmId || existing.firmId,
        firmName: rBank.firmName || existing.firmName,
      });
    }
  }

  // 6. RECOMPUTE ALL PARTY BALANCES FROM MERGED TRANSACTIONS (Guarantees 100% mathematical integrity)
  const allParties = await db.parties.toArray();
  for (const party of allParties) {
    if (party.id) {
      await updatePartyBalance(party.id);
    }
  }

  // 7. RECOMPUTE BANK BALANCES
  await updateBankAccountBalances();

  return result;
}

/**
 * Resolves a flagged conflict record according to user decision.
 */
export async function resolveConflict(
  conflictId: number,
  resolution: 'KEEP_LOCAL' | 'KEEP_REMOTE' | 'KEEP_BOTH',
  remoteTxNewVoucher?: string
): Promise<void> {
  const conflict = await db.conflictRecords.get(conflictId);
  if (!conflict) return;

  if (conflict.entityType === 'transaction') {
    const localTx = conflict.localData as Transaction;
    const remoteTx = conflict.remoteData as Transaction;

    if (resolution === 'KEEP_REMOTE') {
      const existing = await db.transactions
        .filter((t) => t.voucherNumber === localTx.voucherNumber)
        .first();

      if (existing && existing.id) {
        await db.transactions.update(existing.id, {
          amount: remoteTx.amount,
          paidAmount: remoteTx.paidAmount,
          balanceDue: remoteTx.balanceDue,
          paymentStatus: remoteTx.paymentStatus,
          paymentMode: remoteTx.paymentMode,
          items: remoteTx.items,
          date: remoteTx.date,
          description: remoteTx.description,
        });
      }
    } else if (resolution === 'KEEP_BOTH') {
      // Save remote as duplicate voucher with suffix
      const altVoucher = remoteTxNewVoucher || `${remoteTx.voucherNumber}-REMOTE`;
      const { id, ...copyRemote } = remoteTx;
      await db.transactions.add({
        ...copyRemote,
        voucherNumber: altVoucher,
      } as any);
    }
    // If KEEP_LOCAL, do nothing to transaction table, keep existing
  }

  await db.conflictRecords.update(conflictId, {
    status: 'RESOLVED',
    resolvedAt: new Date().toISOString(),
    resolutionChoice: resolution === 'KEEP_LOCAL' ? 'KEEP_LOCAL' : resolution === 'KEEP_REMOTE' ? 'KEEP_REMOTE' : 'MERGED',
  });

  // Re-verify balances
  const allParties = await db.parties.toArray();
  for (const party of allParties) {
    if (party.id) await updatePartyBalance(party.id);
  }
  await updateBankAccountBalances();
}
