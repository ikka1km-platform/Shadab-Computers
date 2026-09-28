import React, { useState, useEffect } from 'react';
import { 
  X, 
  Calendar, 
  User, 
  Plus, 
  Trash2, 
  Calculator,
  CheckCircle2,
  AlertCircle,
  Split,
  Camera,
  Paperclip,
  Eye,
  Barcode,
  Printer,
  ArrowLeft,
  MoreVertical,
  Share2,
  Settings,
  CreditCard,
  Check,
  ChevronDown,
  RotateCcw,
  ArrowRightCircle,
  ArrowLeftRight,
  Zap
} from 'lucide-react';
import { 
  Party, 
  Item, 
  Transaction, 
  TransactionType, 
  PaymentMode, 
  PaymentStatus,
  InvoiceItemEntry,
  DenominationBreakdown,
  SplitPaymentDetail,
  Firm,
  BankAccount,
  BusinessProfile,
  UserRole,
  PartyType
} from '../../types';
import { db, updatePartyBalance, enqueueSyncItem } from '../../db/db';
import { formatCurrency, numberToWordsINR, formatDate } from '../../utils/formatters';
import { compressImage } from '../../utils/imageCompressor';
import { AttachmentViewerModal } from '../common/AttachmentViewerModal';
import { BarcodeScannerModal } from '../common/BarcodeScannerModal';
import { getAllowedTransactionTypes } from '../../utils/userSession';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (txData: Partial<Transaction>, shouldPrint?: boolean) => Promise<any>;
  onDelete?: (id: number) => Promise<void>;
  onPrintTx?: (tx: Transaction) => void;
  parties: Party[];
  items: Item[];
  firms?: Firm[];
  bankAccounts?: BankAccount[];
  initialType?: TransactionType;
  initialPartyId?: number;
  initialItems?: InvoiceItemEntry[];
  txToEdit?: Transaction | null;
  profile?: BusinessProfile;
  currentRole?: 'Owner' | UserRole;
  onAddBankAccount?: (bank: Omit<BankAccount, 'id' | 'createdAt'>) => Promise<void>;
  onOpenPrinterSettings?: () => void;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  onPrintTx,
  parties,
  items,
  firms = [],
  bankAccounts = [],
  currentRole = 'Owner',
  initialType = 'PAYMENT_IN',
  initialPartyId,
  initialItems,
  txToEdit,
  profile,
  onAddBankAccount,
  onOpenPrinterSettings,
}) => {
  const [type, setType] = useState<TransactionType>(initialType);
  const [partyId, setPartyId] = useState<number | undefined>(initialPartyId);
  const [firmId, setFirmId] = useState<number | undefined>(firms[0]?.id);
  const [bankAccountId, setBankAccountId] = useState<number | undefined>(bankAccounts[0]?.id);
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [voucherNumber, setVoucherNumber] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState<string>('');
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItemEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // More Options (Three-Dots menu: Share via WhatsApp & Thermal Print)
  const [isMoreOptionsSheetOpen, setIsMoreOptionsSheetOpen] = useState(false);

  // Payment Settlement Status for Sale/Purchase (Default: UNPAID / Credit until payment done selected)
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('UNPAID');
  const [paidAmount, setPaidAmount] = useState<number>(0);

  // Split state
  const [cashPart, setCashPart] = useState<number>(0);
  const [onlinePart, setOnlinePart] = useState<number>(0);
  const [onlineMode, setOnlineMode] = useState<'UPI' | 'BANK' | 'CHEQUE'>('UPI');
  const [onlineRef, setOnlineRef] = useState<string>('');

  // Note Denomination state
  const [denoms, setDenoms] = useState<DenominationBreakdown>({
    c500: 0,
    c200: 0,
    c100: 0,
    c50: 0,
    c20: 0,
    c10: 0,
    c5: 0,
    coins: 0,
  });
  const [autoSyncFromDenom, setAutoSyncFromDenom] = useState<boolean>(true);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [viewingAttachment, setViewingAttachment] = useState<string | null>(null);
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState<boolean>(false);
  const [showDenomCounter, setShowDenomCounter] = useState<boolean>(false);

  // Contra & Return states
  const [contraType, setContraType] = useState<'CASH_TO_BANK' | 'BANK_TO_CASH' | 'BANK_TO_BANK'>('CASH_TO_BANK');
  const [fromBankAccountId, setFromBankAccountId] = useState<number | undefined>(bankAccounts[0]?.id);
  const [toBankAccountId, setToBankAccountId] = useState<number | undefined>(bankAccounts[1]?.id || bankAccounts[0]?.id);
  const [originalVoucherNumber, setOriginalVoucherNumber] = useState<string>('');
  const [returnReason, setReturnReason] = useState<string>('Damaged / Defective');

  // Quick Add Party Switch & State in Customer/Party column
  const [isQuickAddParty, setIsQuickAddParty] = useState<boolean>(false);
  const [quickPartyName, setQuickPartyName] = useState<string>('');
  const [quickPartyPhone, setQuickPartyPhone] = useState<string>('');
  const [isQuickAddingParty, setIsQuickAddingParty] = useState<boolean>(false);

  const handleQuickCreateParty = async () => {
    if (!quickPartyName.trim()) return;
    setIsQuickAddingParty(true);
    try {
      const selectedFirmObj = firms.find((f) => f.id === firmId) || firms[0];
      const targetPartyType: PartyType =
        type === 'PAYMENT_IN' || type === 'SALE' || type === 'CREDIT_NOTE' || type === 'ESTIMATE'
          ? 'CUSTOMER'
          : 'SUPPLIER';

      const newPartyRecord: Party = {
        name: quickPartyName.trim(),
        accountCode: `ACC-${Math.floor(1000 + Math.random() * 9000)}`,
        phone: quickPartyPhone.trim(),
        partyType: targetPartyType,
        openingBalance: 0,
        currentBalance: 0,
        firmId: firmId,
        firmName: selectedFirmObj?.name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const newId = await db.parties.add(newPartyRecord);
      await updatePartyBalance(newId);
      await enqueueSyncItem({
        entityType: 'party',
        entityId: newPartyRecord.name,
        action: 'CREATE',
        payload: { ...newPartyRecord, id: newId },
        firmId: profile?.firmId,
      });

      // Immediately select newly created party
      setPartyId(newId);
      setQuickPartyName('');
      setQuickPartyPhone('');
      setIsQuickAddParty(false);
    } catch (err: any) {
      console.error('Failed to quick add party:', err);
      alert('Failed to add party: ' + (err?.message || err));
    } finally {
      setIsQuickAddingParty(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    if (txToEdit) {
      setType(txToEdit.type);
      setPartyId(txToEdit.partyId);
      setDate(txToEdit.date);
      setVoucherNumber(txToEdit.voucherNumber);
      setPaymentMode(txToEdit.paymentMode);
      setAmount(txToEdit.amount);
      setDescription(txToEdit.description || '');
      setInvoiceItems(txToEdit.items || []);
      setAttachments(txToEdit.attachments || []);
      setContraType(txToEdit.contraType || 'CASH_TO_BANK');
      setFromBankAccountId(txToEdit.fromBankAccountId || bankAccounts[0]?.id);
      setToBankAccountId(txToEdit.toBankAccountId || bankAccounts[1]?.id || bankAccounts[0]?.id);
      setOriginalVoucherNumber(txToEdit.originalVoucherNumber || '');
      setReturnReason(txToEdit.returnReason || 'Damaged / Defective');
      
      const pStatus = txToEdit.paymentStatus || 'PAID';
      setPaymentStatus(pStatus);
      const pAmt = txToEdit.paidAmount !== undefined ? txToEdit.paidAmount : (pStatus === 'UNPAID' ? 0 : txToEdit.amount);
      setPaidAmount(pAmt);
      setFirmId(txToEdit.firmId || firms[0]?.id);
      setBankAccountId(txToEdit.bankAccountId || bankAccounts[0]?.id);

      if (txToEdit.splitPayment) {
        setCashPart(txToEdit.splitPayment.cashAmount);
        setOnlinePart(txToEdit.splitPayment.onlineAmount);
        setOnlineMode(txToEdit.splitPayment.onlineMode);
        setOnlineRef(txToEdit.splitPayment.onlineRef || '');
      } else {
        setCashPart(txToEdit.paymentMode === 'CASH' ? pAmt : 0);
        setOnlinePart(0);
        setOnlineMode('UPI');
        setOnlineRef('');
      }

      if (txToEdit.cashDenominations) {
        setDenoms({
          c500: txToEdit.cashDenominations.c500 || 0,
          c200: txToEdit.cashDenominations.c200 || 0,
          c100: txToEdit.cashDenominations.c100 || 0,
          c50: txToEdit.cashDenominations.c50 || 0,
          c20: txToEdit.cashDenominations.c20 || 0,
          c10: txToEdit.cashDenominations.c10 || 0,
          c5: txToEdit.cashDenominations.c5 || 0,
          coins: txToEdit.cashDenominations.coins || 0,
        });
      } else {
        setDenoms({ c500: 0, c200: 0, c100: 0, c50: 0, c20: 0, c10: 0, c5: 0, coins: 0 });
      }
      setAutoSyncFromDenom(false);
    } else {
      setType(initialType);
      setPartyId(initialPartyId);
      setFirmId(firms[0]?.id);
      setBankAccountId(bankAccounts[0]?.id);
      setContraType('CASH_TO_BANK');
      setFromBankAccountId(bankAccounts[0]?.id);
      setToBankAccountId(bankAccounts[1]?.id || bankAccounts[0]?.id);
      setOriginalVoucherNumber('');
      setReturnReason('Damaged / Defective');
      setDate(new Date().toISOString().split('T')[0]);
      setPaymentMode('CASH');
      const itemsToSet = initialItems && initialItems.length > 0 ? initialItems : [];
      setInvoiceItems(itemsToSet);

      // Default: Whenever a Sale (or Purchase) is created, it automatically defaults to CREDIT (UNPAID / Udhar)
      // until the user explicitly selects Paid/Cash or Partial Paid
      const isCreditDefault = initialType === 'SALE' || initialType === 'PURCHASE';
      const defaultStatus: PaymentStatus = isCreditDefault ? 'UNPAID' : 'PAID';
      setPaymentStatus(defaultStatus);

      if (itemsToSet.length > 0) {
        const sum = itemsToSet.reduce((acc, row) => acc + (row.total || 0), 0);
        setAmount(sum);
        setPaidAmount(defaultStatus === 'UNPAID' ? 0 : sum);
      } else {
        setAmount(0);
        setPaidAmount(0);
      }
      setCashPart(0);
      setOnlinePart(0);
      setOnlineMode('UPI');
      setOnlineRef('');
      setDescription('');
      setAttachments([]);
      setDenoms({ c500: 0, c200: 0, c100: 0, c50: 0, c20: 0, c10: 0, c5: 0, coins: 0 });
      setAutoSyncFromDenom(false);

      const prefix =
        initialType === 'PAYMENT_IN' ? 'REC' :
        initialType === 'PAYMENT_OUT' ? 'PAY' :
        initialType === 'SALE' ? 'INV' :
        initialType === 'PURCHASE' ? 'BILL' : 'EXP';
      setVoucherNumber(`${prefix}-${Math.floor(1000 + Math.random() * 9000)}`);
      setIsQuickAddParty(false);
      setQuickPartyName('');
      setQuickPartyPhone('');
    }
  }, [isOpen, initialType, initialPartyId, txToEdit]);

  const handleAddAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      const compressedList: string[] = [];
      for (const file of files) {
        try {
          const compressed = await compressImage(file);
          compressedList.push(compressed);
        } catch (err) {
          console.error('Failed to compress image:', err);
        }
      }
      setAttachments((prev) => [...prev, ...compressedList]);
      e.target.value = '';
    }
  };

  const handleRemoveAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  if (!isOpen) return null;

  const isItemBased = type === 'SALE' || type === 'PURCHASE' || type === 'ESTIMATE' || type === 'CREDIT_NOTE' || type === 'DEBIT_NOTE';
  const selectedParty = parties.find((p) => p.id === Number(partyId));

  // Determine actual received/paid cash based on settlement status
  const effectivePaidAmount = isItemBased
    ? (paymentStatus === 'UNPAID' ? 0 : paymentStatus === 'PAID' ? amount : paidAmount)
    : amount;
  const balanceDue = Math.max(0, amount - effectivePaidAmount);

  const targetCashAmount = paymentStatus === 'UNPAID' && isItemBased 
    ? 0 
    : paymentMode === 'CASH' 
      ? Number(effectivePaidAmount) 
      : paymentMode === 'SPLIT' 
        ? Number(cashPart) 
        : 0;
  const isCashModeActive =
    (paymentMode === 'CASH' || paymentMode === 'SPLIT') &&
    (paymentStatus !== 'UNPAID' || !isItemBased);
  const isCashRequired = isCashModeActive;

  const handleAddItemRow = () => {
    setInvoiceItems([
      ...invoiceItems,
      { name: '', quantity: 1, unit: 'Pcs', rate: 0, taxRate: 0, discount: 0, total: 0 },
    ]);
  };

  const handleUpdateItemRow = (index: number, field: keyof InvoiceItemEntry, val: any) => {
    const updated = [...invoiceItems];
    const row = { ...updated[index], [field]: val };

    if (field === 'itemId') {
      const found = items.find((it) => it.id === Number(val));
      if (found) {
        row.name = found.name;
        row.unit = found.unit;
        row.rate = (type === 'SALE' || type === 'ESTIMATE' || type === 'CREDIT_NOTE') ? found.salePrice : found.purchasePrice;
      }
    }

    const baseAmount = Number(row.quantity || 0) * Number(row.rate || 0);
    const taxAmount = (baseAmount * Number(row.taxRate || 0)) / 100;
    const finalTotal = Math.max(0, baseAmount + taxAmount - Number(row.discount || 0));
    row.total = finalTotal;

    updated[index] = row;
    setInvoiceItems(updated);

    const grandTotal = updated.reduce((sum, item) => sum + item.total, 0);
    setAmount(grandTotal);
    if (paymentStatus === 'PAID') {
      setPaidAmount(grandTotal);
      if (paymentMode === 'SPLIT') {
        setCashPart(Math.floor(grandTotal / 2));
        setOnlinePart(grandTotal - Math.floor(grandTotal / 2));
      }
    } else if (paymentStatus === 'PARTIAL') {
      const clamped = Math.min(paidAmount, grandTotal);
      setPaidAmount(clamped);
      if (paymentMode === 'SPLIT') {
        const half = Math.floor(clamped / 2);
        setCashPart(half);
        setOnlinePart(clamped - half);
      }
    } else {
      setPaidAmount(0);
      setCashPart(0);
      setOnlinePart(0);
    }
  };

  const handleRemoveItemRow = (index: number) => {
    const updated = invoiceItems.filter((_, i) => i !== index);
    setInvoiceItems(updated);
    const grandTotal = updated.reduce((sum, item) => sum + item.total, 0);
    setAmount(grandTotal);
    if (paymentStatus === 'PAID') {
      setPaidAmount(grandTotal);
      if (paymentMode === 'SPLIT') {
        setCashPart(Math.floor(grandTotal / 2));
        setOnlinePart(grandTotal - Math.floor(grandTotal / 2));
      }
    } else if (paymentStatus === 'PARTIAL') {
      const clamped = Math.min(paidAmount, grandTotal);
      setPaidAmount(clamped);
      if (paymentMode === 'SPLIT') {
        const half = Math.floor(clamped / 2);
        setCashPart(half);
        setOnlinePart(clamped - half);
      }
    } else {
      setPaidAmount(0);
      setCashPart(0);
      setOnlinePart(0);
    }
  };

  const handleBarcodeScan = (scannedCode: string) => {
    const trimmed = scannedCode.trim().toLowerCase();
    const found = items.find(
      (it) => it.code?.toLowerCase() === trimmed || it.barcode?.toLowerCase() === trimmed
    );

    if (found) {
      const existingIdx = invoiceItems.findIndex((it) => it.itemId === found.id);
      if (existingIdx !== -1) {
        const currentQty = Number(invoiceItems[existingIdx].quantity || 1);
        handleUpdateItemRow(existingIdx, 'quantity', currentQty + 1);
      } else {
        const baseRate = type === 'SALE' ? found.salePrice : found.purchasePrice;
        const taxRate = found.taxRate || 0;
        const total = baseRate + (baseRate * taxRate) / 100;
        const newRow: InvoiceItemEntry = {
          itemId: found.id,
          name: found.name,
          quantity: 1,
          unit: found.unit,
          rate: baseRate,
          taxRate: taxRate,
          discount: 0,
          total: total,
        };
        const nextList =
          invoiceItems.length === 1 && !invoiceItems[0].name && invoiceItems[0].total === 0
            ? [newRow]
            : [...invoiceItems, newRow];
        setInvoiceItems(nextList);
        const grandTotal = nextList.reduce((sum, it) => sum + it.total, 0);
        setAmount(grandTotal);
        if (paymentStatus === 'PAID') {
          setPaidAmount(grandTotal);
          if (paymentMode === 'SPLIT') {
            setCashPart(Math.floor(grandTotal / 2));
            setOnlinePart(grandTotal - Math.floor(grandTotal / 2));
          }
        } else if (paymentStatus === 'PARTIAL') {
          const clamped = Math.min(paidAmount, grandTotal);
          setPaidAmount(clamped);
          if (paymentMode === 'SPLIT') {
            const half = Math.floor(clamped / 2);
            setCashPart(half);
            setOnlinePart(clamped - half);
          }
        } else {
          setPaidAmount(0);
          setCashPart(0);
          setOnlinePart(0);
        }
      }
    } else {
      alert(`Item with barcode/code "${scannedCode.trim()}" not found in catalogue.`);
    }
  };

  const totalDenomNotes =
    (denoms.c500 || 0) +
    (denoms.c200 || 0) +
    (denoms.c100 || 0) +
    (denoms.c50 || 0) +
    (denoms.c20 || 0) +
    (denoms.c10 || 0) +
    (denoms.c5 || 0);

  const totalDenomAmount =
    (denoms.c500 || 0) * 500 +
    (denoms.c200 || 0) * 200 +
    (denoms.c100 || 0) * 100 +
    (denoms.c50 || 0) * 50 +
    (denoms.c20 || 0) * 20 +
    (denoms.c10 || 0) * 10 +
    (denoms.c5 || 0) * 5 +
    (denoms.coins || 0);

  const denomDiff = targetCashAmount - totalDenomAmount;
  const isDenomMatched = targetCashAmount > 0 && denomDiff === 0;

  const applyDenomTotalToVoucher = (newTotal: number) => {
    if (paymentMode === 'CASH') {
      if (!isItemBased) {
        setAmount(newTotal);
        setPaidAmount(newTotal);
        setCashPart(newTotal);
      } else {
        if (amount === 0) {
          setAmount(newTotal);
          setPaidAmount(newTotal);
          setPaymentStatus('PAID');
        } else {
          setPaidAmount(newTotal);
          if (newTotal >= amount) {
            setPaymentStatus('PAID');
          } else if (newTotal > 0) {
            setPaymentStatus('PARTIAL');
          } else {
            setPaymentStatus('UNPAID');
          }
        }
      }
    } else if (paymentMode === 'SPLIT') {
      setCashPart(newTotal);
      if (!isItemBased) {
        const newTotalAmount = newTotal + (onlinePart || 0);
        setAmount(newTotalAmount);
        setPaidAmount(newTotalAmount);
      } else {
        if (amount === 0) {
          const newTotalAmount = newTotal + (onlinePart || 0);
          setAmount(newTotalAmount);
          setPaidAmount(newTotalAmount);
          setPaymentStatus('PAID');
        } else {
          const totalReceived = newTotal + (onlinePart || 0);
          setPaidAmount(Math.min(totalReceived, amount));
          if (totalReceived >= amount) {
            setPaymentStatus('PAID');
          } else if (totalReceived > 0) {
            setPaymentStatus('PARTIAL');
          }
        }
      }
    }
  };

  const handleDenomChange = (key: keyof DenominationBreakdown, val: number) => {
    const nextVal = Math.max(0, val);
    const nextDenoms = { ...denoms, [key]: nextVal };
    setDenoms(nextDenoms);

    const nextTotal =
      (nextDenoms.c500 || 0) * 500 +
      (nextDenoms.c200 || 0) * 200 +
      (nextDenoms.c100 || 0) * 100 +
      (nextDenoms.c50 || 0) * 50 +
      (nextDenoms.c20 || 0) * 20 +
      (nextDenoms.c10 || 0) * 10 +
      (nextDenoms.c5 || 0) * 5 +
      (nextDenoms.coins || 0);

    // In reverse mode (or if target cash is 0), note counts immediately drive the cash amount!
    if (autoSyncFromDenom || targetCashAmount === 0) {
      applyDenomTotalToVoucher(nextTotal);
    }
  };

  const handleApplyCountedCash = () => {
    applyDenomTotalToVoucher(totalDenomAmount);
    setAutoSyncFromDenom(true);
  };

  const handleClearDenoms = () => {
    setDenoms({ c500: 0, c200: 0, c100: 0, c50: 0, c20: 0, c10: 0, c5: 0, coins: 0 });
    if (autoSyncFromDenom) {
      applyDenomTotalToVoucher(0);
    }
  };

  const handleAutoFillNotes = () => {
    let rem = targetCashAmount;
    const c500 = Math.floor(rem / 500); rem %= 500;
    const c200 = Math.floor(rem / 200); rem %= 200;
    const c100 = Math.floor(rem / 100); rem %= 100;
    const c50 = Math.floor(rem / 50); rem %= 50;
    const c20 = Math.floor(rem / 20); rem %= 20;
    const c10 = Math.floor(rem / 10); rem %= 10;
    const c5 = Math.floor(rem / 5); rem %= 5;
    const coins = rem;
    setDenoms({ c500, c200, c100, c50, c20, c10, c5, coins });
  };

  const handleTotalAmountChange = (val: number) => {
    setAutoSyncFromDenom(false);
    setAmount(val);
    if (paymentStatus === 'PAID') {
      setPaidAmount(val);
      if (paymentMode === 'SPLIT') {
        const half = Math.floor(val / 2);
        setCashPart(half);
        setOnlinePart(val - half);
      }
    } else if (paymentStatus === 'PARTIAL') {
      const curPaid = Math.min(paidAmount, val);
      setPaidAmount(curPaid);
      if (paymentMode === 'SPLIT') {
        const half = Math.floor(curPaid / 2);
        setCashPart(half);
        setOnlinePart(curPaid - half);
      }
    } else {
      setPaidAmount(0);
      setCashPart(0);
      setOnlinePart(0);
    }
  };

  const handlePaidAmountChange = (val: number) => {
    const clamped = Math.min(Math.max(0, val), amount);
    setPaidAmount(clamped);
    if (paymentMode === 'SPLIT') {
      const half = Math.floor(clamped / 2);
      setCashPart(half);
      setOnlinePart(clamped - half);
    }
  };

  const handleStatusChange = (status: PaymentStatus) => {
    setPaymentStatus(status);
    if (status === 'PAID') {
      setPaidAmount(amount);
      if (paymentMode === 'SPLIT') {
        const half = Math.floor(amount / 2);
        setCashPart(half);
        setOnlinePart(amount - half);
      }
    } else if (status === 'UNPAID') {
      setPaidAmount(0);
      setCashPart(0);
      setOnlinePart(0);
    } else if (status === 'PARTIAL') {
      const half = Math.floor(amount / 2);
      setPaidAmount(half);
      if (paymentMode === 'SPLIT') {
        const quarter = Math.floor(half / 2);
        setCashPart(quarter);
        setOnlinePart(half - quarter);
      }
    }
  };

  const handleCashPartChange = (cashVal: number) => {
    setAutoSyncFromDenom(false);
    setCashPart(cashVal);
    if (!isItemBased) {
      if (amount === 0 || amount === cashPart + onlinePart) {
        setAmount(cashVal + onlinePart);
        setPaidAmount(cashVal + onlinePart);
      } else {
        setOnlinePart(Math.max(0, amount - cashVal));
      }
    } else {
      const baseTarget = paymentStatus === 'PARTIAL' ? paidAmount : amount;
      setOnlinePart(Math.max(0, baseTarget - cashVal));
    }
  };

  const handleOnlinePartChange = (onlineVal: number) => {
    setOnlinePart(onlineVal);
    if (!isItemBased) {
      if (amount === 0 || amount === cashPart + onlinePart) {
        setAmount(cashPart + onlineVal);
        setPaidAmount(cashPart + onlineVal);
      } else {
        setCashPart(Math.max(0, amount - onlineVal));
      }
    } else {
      const baseTarget = paymentStatus === 'PARTIAL' ? paidAmount : amount;
      setCashPart(Math.max(0, baseTarget - onlineVal));
    }
  };

  const processSubmit = async (shouldPrint = false) => {
    if (amount <= 0 && invoiceItems.length === 0) return;

    const finalPaidAmount = isItemBased
      ? (paymentStatus === 'UNPAID' ? 0 : paymentStatus === 'PAID' ? Number(amount) : Number(paidAmount))
      : Number(amount);
    const finalBalanceDue = Math.max(0, Number(amount) - finalPaidAmount);
    const finalStatus: PaymentStatus = isItemBased ? paymentStatus : 'PAID';

    if (finalStatus !== 'UNPAID' && paymentMode === 'SPLIT' && (cashPart + onlinePart) !== finalPaidAmount) {
      alert(`Split amounts (Cash: ₹${cashPart} + Online: ₹${onlinePart}) must equal the received amount (₹${finalPaidAmount}).`);
      return;
    }

    setLoading(true);
    try {
      let splitData: SplitPaymentDetail | undefined = undefined;
      if (finalStatus !== 'UNPAID' && paymentMode === 'SPLIT') {
        splitData = {
          cashAmount: Number(cashPart),
          onlineAmount: Number(onlinePart),
          onlineMode,
          onlineRef: onlineRef.trim() || undefined,
        };
      }

      const selectedFirm = firms.find((f) => f.id === Number(firmId));
      const selectedBank = bankAccounts.find((b) => b.id === Number(bankAccountId));

      if (type === 'CONTRA') {
        const fromBank = bankAccounts.find((b) => b.id === Number(fromBankAccountId));
        const toBank = bankAccounts.find((b) => b.id === Number(toBankAccountId));
        return await onSave({
          voucherNumber,
          type: 'CONTRA',
          contraType,
          fromBankAccountId: contraType === 'CASH_TO_BANK' ? undefined : fromBank?.id,
          fromBankAccountName: contraType === 'CASH_TO_BANK' ? 'Cash in Hand' : fromBank?.accountName,
          toBankAccountId: contraType === 'BANK_TO_CASH' ? undefined : toBank?.id,
          toBankAccountName: contraType === 'BANK_TO_CASH' ? 'Cash in Hand' : toBank?.accountName,
          firmId: selectedFirm?.id,
          firmName: selectedFirm?.name,
          date,
          amount: Number(amount),
          paymentMode: contraType === 'CASH_TO_BANK' ? 'CASH' : 'BANK',
          description: description.trim(),
          attachments: attachments.length > 0 ? attachments : undefined,
        }, shouldPrint);
      }

      return await onSave({
        voucherNumber,
        type,
        partyId: partyId ? Number(partyId) : undefined,
        partyName: selectedParty ? selectedParty.name : type === 'EXPENSE' ? 'General Expense' : undefined,
        firmId: selectedFirm?.id,
        firmName: selectedFirm?.name,
        bankAccountId: (paymentMode === 'BANK' || paymentMode === 'UPI' || (paymentMode === 'SPLIT' && onlinePart > 0)) ? selectedBank?.id : undefined,
        bankAccountName: (paymentMode === 'BANK' || paymentMode === 'UPI' || (paymentMode === 'SPLIT' && onlinePart > 0)) ? selectedBank?.accountName : undefined,
        originalVoucherNumber: (type === 'CREDIT_NOTE' || type === 'DEBIT_NOTE') ? (originalVoucherNumber.trim() || undefined) : undefined,
        returnReason: (type === 'CREDIT_NOTE' || type === 'DEBIT_NOTE') ? (returnReason.trim() || undefined) : undefined,
        date,
        amount: Number(amount),
        paidAmount: finalPaidAmount,
        balanceDue: finalBalanceDue,
        paymentStatus: finalStatus,
        paymentMode: finalStatus === 'UNPAID' ? 'CASH' : paymentMode,
        splitPayment: splitData,
        items: isItemBased ? invoiceItems : undefined,
        description: description.trim(),
        attachments: attachments.length > 0 ? attachments : undefined,
        cashDenominations: isCashRequired && totalDenomAmount > 0 ? {
          ...denoms,
          totalNotes: totalDenomNotes,
          totalAmount: totalDenomAmount,
        } : undefined,
      }, shouldPrint);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await processSubmit(false);
    onClose();
  };

  const handleSaveAndPrint = async (e: React.MouseEvent) => {
    e.preventDefault();
    await processSubmit(true);
    onClose();
  };

  const getActivePaymentTypeDisplay = () => {
    if (paymentMode === 'CASH') {
      return { icon: '💵', label: 'Cash' };
    }
    if (paymentMode === 'BANK' && onlineMode === 'CHEQUE') {
      return { icon: '🟨', label: 'Cheque' };
    }
    if (paymentMode === 'BANK') {
      const b = bankAccounts.find((acc) => acc.id === Number(bankAccountId));
      return { icon: '💳', label: b?.accountName || 'Bank A/c' };
    }
    if (paymentMode === 'UPI') {
      return { icon: '⚡', label: 'UPI / QR' };
    }
    if (paymentMode === 'SPLIT') {
      return { icon: '🔀', label: `Split (₹${cashPart} + ₹${onlinePart})` };
    }
    return { icon: '💵', label: 'Cash' };
  };



  const handleShareAndSave = async () => {
    if (amount <= 0 && invoiceItems.length === 0) {
      alert('Please enter an amount.');
      return;
    }
    if (!partyId && type !== 'EXPENSE') {
      alert('Please select a customer.');
      return;
    }

    const party = parties.find((p) => p.id === Number(partyId));
    const partyBal = party ? party.currentBalance - Number(amount) : 0;
    const firm = firms.find((f) => f.id === Number(firmId));
    const firmName = firm?.name || profile?.businessName || 'Business';

    const activeDisplay = getActivePaymentTypeDisplay();

    const msg = 
`🧾 *PAYMENT RECEIPT*
*${firmName}*
----------------------------------------
*Receipt No:* ${voucherNumber}
*Date:* ${formatDate(date)}
*Received From:* ${party ? party.name : 'Customer'}
----------------------------------------
*Amount Received:* ₹${Number(amount).toLocaleString('en-IN')}
*Payment Mode:* ${activeDisplay.label}
${description ? `*Note:* ${description}\n` : ''}${party ? `*Current Balance Due:* ₹${Math.max(0, partyBal).toLocaleString('en-IN')}\n` : ''}----------------------------------------
Thank you for your payment!
_${firmName}${profile?.phone ? ` • Ph: ${profile.phone}` : ''}_`;

    await processSubmit(false);
    onClose();

    const cleanPhone = party?.phone?.replace(/[^0-9]/g, '');
    const encoded = encodeURIComponent(msg);
    const waUrl = cleanPhone && cleanPhone.length >= 10
      ? `https://wa.me/${cleanPhone.startsWith('91') ? cleanPhone : '91' + cleanPhone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;

    window.open(waUrl, '_blank');
  };

  const handlePrintAndSave = async () => {
    if (amount <= 0 && invoiceItems.length === 0) {
      alert('Please enter an amount.');
      return;
    }
    if (!partyId && type !== 'EXPENSE') {
      alert('Please select a customer.');
      return;
    }

    await processSubmit(true);
    onClose();
  };

  const handleDelete = async () => {
    if (!txToEdit?.id || !onDelete) return;
    if (window.confirm(`Are you sure you want to delete voucher ${txToEdit.voucherNumber}? This will reverse balances and stock.`)) {
      setLoading(true);
      try {
        await onDelete(txToEdit.id);
        onClose();
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-1 sm:p-3 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[96vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Compact Header */}
        <div className="px-3.5 py-2.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="p-1 sm:p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors cursor-pointer flex items-center gap-1 text-xs font-bold shrink-0 border border-slate-700 shadow-2xs mr-0.5"
              title="Back (Close Modal)"
            >
              <ArrowLeft className="w-4 h-4 text-emerald-400" />
              <span className="hidden xs:inline">Back</span>
            </button>
            <h3 className="font-bold text-sm sm:text-base truncate">
              {txToEdit ? `Edit ${txToEdit.type.replace('_', ' ')}` :
               type === 'PAYMENT_IN' ? 'Receive Money (Receipt)' :
               type === 'PAYMENT_OUT' ? 'Pay Money (Payment Out)' :
               type === 'SALE' ? 'Create Sales Invoice / Bill' :
               type === 'CREDIT_NOTE' ? 'Sale Return (Credit Note)' :
               type === 'PURCHASE' ? 'Record Purchase Bill' :
               type === 'DEBIT_NOTE' ? 'Purchase Return (Debit Note)' :
               type === 'ESTIMATE' ? 'Quotation / Estimate (Kachha)' :
               type === 'CONTRA' ? 'Contra Voucher (Cash ⇄ Bank)' :
               'Record Business Expense'}
            </h3>
            <span className="text-[10px] text-slate-300 font-mono bg-slate-800 px-1.5 py-0.5 rounded shrink-0">
              {voucherNumber}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {type === 'ESTIMATE' && (
              <button
                type="button"
                onClick={() => {
                  setType('SALE');
                  setVoucherNumber(`INV-${Math.floor(1000 + Math.random() * 9000)}`);
                  setPaymentStatus('UNPAID');
                  setPaidAmount(0);
                }}
                className="px-2.5 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                title="Convert this quotation to an active sale invoice"
              >
                <ArrowRightCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Convert to Sale</span>
              </button>
            )}

            {txToEdit && onPrintTx && (
              <button
                type="button"
                onClick={() => onPrintTx(txToEdit)}
                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                title="Print Thermal Receipt Slip"
              >
                <Printer className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Print</span>
              </button>
            )}

            {/* Three Dots More Options (Share & Print) */}
            <button
              type="button"
              onClick={() => setIsMoreOptionsSheetOpen(true)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="More Options (Share via WhatsApp, Thermal Print)"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!txToEdit && (
          <div className="bg-slate-100 px-2 py-1.5 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap no-scrollbar text-xs font-bold shrink-0">
            {[
              { id: 'PAYMENT_IN', label: '+ Receipt', color: 'bg-emerald-600' },
              { id: 'SALE', label: '+ Sale Bill', color: 'bg-blue-600' },
              { id: 'CREDIT_NOTE', label: '↺ Sale Return', color: 'bg-teal-600' },
              { id: 'PAYMENT_OUT', label: '+ Payment Out', color: 'bg-rose-600' },
              { id: 'PURCHASE', label: '+ Purchase Bill', color: 'bg-amber-600' },
              { id: 'DEBIT_NOTE', label: '↺ Purchase Return', color: 'bg-orange-600' },
              { id: 'ESTIMATE', label: '+ Estimate', color: 'bg-indigo-600' },
              { id: 'CONTRA', label: '⇄ Contra', color: 'bg-purple-600' },
              { id: 'EXPENSE', label: '+ Expense', color: 'bg-slate-700' },
            ]
              .filter((tab) => getAllowedTransactionTypes(currentRole).includes(tab.id as TransactionType))
              .map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    const newType = tab.id as TransactionType;
                    setType(newType);
                    const prefix = tab.id === 'PAYMENT_IN' ? 'REC' :
                                   tab.id === 'PAYMENT_OUT' ? 'PAY' :
                                   tab.id === 'SALE' ? 'INV' :
                                   tab.id === 'CREDIT_NOTE' ? 'CRN' :
                                   tab.id === 'PURCHASE' ? 'BILL' :
                                   tab.id === 'DEBIT_NOTE' ? 'DRN' :
                                   tab.id === 'ESTIMATE' ? 'EST' :
                                   tab.id === 'CONTRA' ? 'CNT' : 'EXP';
                    setVoucherNumber(`${prefix}-${Math.floor(1000 + Math.random() * 9000)}`);
                    if (newType === 'SALE' || newType === 'PURCHASE') {
                      setPaymentStatus('UNPAID');
                      setPaidAmount(0);
                      setCashPart(0);
                      setOnlinePart(0);
                    } else {
                      setPaymentStatus('PAID');
                      setPaidAmount(amount);
                    }
                  }}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold shrink-0 transition-all cursor-pointer ${
                    type === tab.id
                      ? `${tab.color} text-white shadow-2xs`
                      : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-2 sm:p-3 space-y-2 overflow-y-auto flex-1 flex flex-col justify-between">
          {/* Contra Mode Selection (for Internal Cash ⇄ Bank Transfers) */}
          {type === 'CONTRA' ? (
            <div className="bg-purple-50/80 p-2 sm:p-2.5 rounded-xl border border-purple-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-purple-900 uppercase flex items-center gap-1.5">
                  <ArrowLeftRight className="w-3.5 h-3.5 text-purple-600" /> Contra Transfer Mode
                </span>
                <span className="text-[10px] text-purple-700 font-semibold bg-purple-100 px-1.5 py-0.5 rounded">
                  Internal Transfer
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => setContraType('CASH_TO_BANK')}
                  className={`p-1.5 rounded-lg border text-center transition-all cursor-pointer ${
                    contraType === 'CASH_TO_BANK'
                      ? 'bg-purple-600 text-white border-purple-700 shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-bold text-[11px]">📥 Cash Deposit</div>
                  <div className="text-[9px] opacity-80">Cash ➔ Bank</div>
                </button>

                <button
                  type="button"
                  onClick={() => setContraType('BANK_TO_CASH')}
                  className={`p-1.5 rounded-lg border text-center transition-all cursor-pointer ${
                    contraType === 'BANK_TO_CASH'
                      ? 'bg-purple-600 text-white border-purple-700 shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-bold text-[11px]">📤 Withdrawal</div>
                  <div className="text-[9px] opacity-80">Bank ➔ Cash</div>
                </button>

                <button
                  type="button"
                  onClick={() => setContraType('BANK_TO_BANK')}
                  className={`p-1.5 rounded-lg border text-center transition-all cursor-pointer ${
                    contraType === 'BANK_TO_BANK'
                      ? 'bg-purple-600 text-white border-purple-700 shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-bold text-[11px]">🔄 Bank to Bank</div>
                  <div className="text-[9px] opacity-80">Transfer Accounts</div>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {contraType === 'CASH_TO_BANK' ? (
                  <>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Debited From</label>
                      <input
                        type="text"
                        disabled
                        value="💵 Cash in Hand"
                        className="w-full px-2.5 py-1 text-xs font-bold bg-slate-100 border border-slate-200 rounded-lg text-slate-700"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Credited To (Bank)</label>
                      <select
                        value={toBankAccountId || ''}
                        onChange={(e) => setToBankAccountId(Number(e.target.value))}
                        className="w-full px-2 py-1 text-xs font-bold bg-white border border-slate-300 rounded-lg outline-none"
                      >
                        {bankAccounts.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.bankName} - {b.accountName} (Bal: {formatCurrency(b.currentBalance)})
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                ) : contraType === 'BANK_TO_CASH' ? (
                  <>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Debited From (Bank)</label>
                      <select
                        value={fromBankAccountId || ''}
                        onChange={(e) => setFromBankAccountId(Number(e.target.value))}
                        className="w-full px-2 py-1 text-xs font-bold bg-white border border-slate-300 rounded-lg outline-none"
                      >
                        {bankAccounts.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.bankName} - {b.accountName} (Bal: {formatCurrency(b.currentBalance)})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Credited To</label>
                      <input
                        type="text"
                        disabled
                        value="💵 Cash in Hand"
                        className="w-full px-2.5 py-1 text-xs font-bold bg-slate-100 border border-slate-200 rounded-lg text-slate-700"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Debited From</label>
                      <select
                        value={fromBankAccountId || ''}
                        onChange={(e) => setFromBankAccountId(Number(e.target.value))}
                        className="w-full px-2 py-1 text-xs font-bold bg-white border border-slate-300 rounded-lg outline-none"
                      >
                        {bankAccounts.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.bankName} - {b.accountName} (Bal: {formatCurrency(b.currentBalance)})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Credited To</label>
                      <select
                        value={toBankAccountId || ''}
                        onChange={(e) => setToBankAccountId(Number(e.target.value))}
                        className="w-full px-2 py-1 text-xs font-bold bg-white border border-slate-300 rounded-lg outline-none"
                      >
                        {bankAccounts.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.bankName} - {b.accountName} (Bal: {formatCurrency(b.currentBalance)})
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 p-2 sm:p-2.5 rounded-xl border border-slate-200 space-y-1.5">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                {type !== 'EXPENSE' ? (
                  <div className={firms.length > 1 ? "sm:col-span-6" : "sm:col-span-8"}>
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-1.5">
                        <label className="text-[11px] font-bold text-slate-700 uppercase tracking-tight flex items-center gap-1">
                          <User className="w-3 h-3 text-blue-600" />
                          {type === 'PAYMENT_IN' || type === 'SALE' || type === 'CREDIT_NOTE' || type === 'ESTIMATE' ? 'Customer' : 'Supplier'}
                          <span className="text-rose-500">*</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setIsQuickAddParty(!isQuickAddParty);
                            if (isQuickAddParty) {
                              setQuickPartyName('');
                              setQuickPartyPhone('');
                            }
                          }}
                          className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-md transition-all cursor-pointer flex items-center gap-0.5 ${
                            isQuickAddParty
                              ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                              : 'bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-300 shadow-2xs'
                          }`}
                          title={isQuickAddParty ? 'Back to party dropdown list' : 'Add new party directly here'}
                        >
                          {isQuickAddParty ? (
                            <>
                              <ArrowLeft className="w-2.5 h-2.5" />
                              <span>Select List</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-2.5 h-2.5" />
                              <span>+ Add Party</span>
                            </>
                          )}
                        </button>
                      </div>

                      {selectedParty && !isQuickAddParty && (
                        <span className={`text-[10px] font-bold ${selectedParty.currentBalance >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                          Bal: {formatCurrency(Math.abs(selectedParty.currentBalance))} {selectedParty.currentBalance >= 0 ? '(Recv)' : '(Pay)'}
                        </span>
                      )}
                    </div>

                    {isQuickAddParty ? (
                      <div className="flex items-center gap-1.5 animate-in fade-in duration-150">
                        <div className="relative flex-1">
                          <input
                            type="text"
                            autoFocus
                            placeholder={`Enter new ${type === 'PAYMENT_IN' || type === 'SALE' || type === 'CREDIT_NOTE' || type === 'ESTIMATE' ? 'customer' : 'supplier'} name...`}
                            value={quickPartyName}
                            onChange={(e) => setQuickPartyName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleQuickCreateParty();
                              }
                            }}
                            className="w-full px-2.5 py-1.5 text-xs font-bold border border-blue-400 rounded-lg outline-none bg-blue-50/40 focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
                          />
                        </div>
                        <input
                          type="tel"
                          placeholder="Phone (opt)"
                          value={quickPartyPhone}
                          onChange={(e) => setQuickPartyPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleQuickCreateParty();
                            }
                          }}
                          className="w-24 sm:w-28 px-2 py-1.5 text-xs border border-slate-300 rounded-lg outline-none bg-white placeholder:text-slate-400"
                        />
                        <button
                          type="button"
                          onClick={handleQuickCreateParty}
                          disabled={!quickPartyName.trim() || isQuickAddingParty}
                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition-all shadow-xs shrink-0 cursor-pointer flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{isQuickAddingParty ? '...' : 'Add'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsQuickAddParty(false);
                            setQuickPartyName('');
                            setQuickPartyPhone('');
                          }}
                          className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer shrink-0"
                          title="Cancel"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <select
                          required
                          value={partyId || ''}
                          onChange={(e) => {
                            if (e.target.value === '__NEW_PARTY__') {
                              setIsQuickAddParty(true);
                            } else {
                              setPartyId(Number(e.target.value) || undefined);
                            }
                          }}
                          className="flex-1 px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg outline-none bg-white focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">-- Select Party / Customer --</option>
                          <option value="__NEW_PARTY__" className="font-bold text-blue-700 bg-blue-50">
                            ➕ + Add New Party / Customer...
                          </option>
                          {parties
                            .filter((p) =>
                              type === 'PAYMENT_IN' || type === 'SALE' || type === 'CREDIT_NOTE' || type === 'ESTIMATE'
                                ? p.partyType === 'CUSTOMER'
                                : p.partyType === 'SUPPLIER'
                            )
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} {p.phone ? `(${p.phone})` : ''} - Bal: {formatCurrency(Math.abs(p.currentBalance))} {p.currentBalance >= 0 ? '(Recv)' : '(Pay)'}
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setIsQuickAddParty(true)}
                          className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs rounded-lg shadow-2xs shrink-0 cursor-pointer flex items-center gap-1 transition-all"
                          title="Add new customer right here"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>+ Add Party</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={firms.length > 1 ? "sm:col-span-6" : "sm:col-span-8"}>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-tight mb-0.5">
                      Expense Title / Category
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Rent, Tea, Electricity"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium"
                    />
                  </div>
                )}

                {/* Firm Selector */}
                {firms.length > 1 && (
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-tight mb-0.5">
                      🏢 Firm
                    </label>
                    <select
                      value={firmId || ''}
                      onChange={(e) => setFirmId(Number(e.target.value) || undefined)}
                      className="w-full px-2 py-1.5 text-xs font-bold border border-slate-300 rounded-lg outline-none bg-white"
                    >
                      {firms.map((f) => (
                        <option key={f.id} value={f.id}>{f.name} ({f.code || 'Main'})</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Date */}
                <div className={firms.length > 1 ? "sm:col-span-3" : "sm:col-span-4"}>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-tight mb-0.5">
                    📅 Date
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs font-bold border border-slate-300 rounded-lg outline-none bg-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Return Reason & Original Invoice Reference for Returns */}
          {(type === 'CREDIT_NOTE' || type === 'DEBIT_NOTE') && (
            <div className="bg-amber-50/70 p-2 rounded-xl border border-amber-200 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div>
                <label className="block font-bold text-amber-900 uppercase text-[10px] mb-0.5">
                  Reason for Return
                </label>
                <select
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full p-1.5 bg-white border border-amber-300 rounded-lg font-semibold outline-none text-xs"
                >
                  <option value="Damaged / Defective">Damaged / Defective Goods</option>
                  <option value="Wrong Item Delivered">Wrong Item Delivered</option>
                  <option value="Quality Unsatisfactory">Quality Unsatisfactory</option>
                  <option value="Customer Cancellation">Customer Cancellation</option>
                  <option value="Excess Quantity Returned">Excess Quantity Returned</option>
                  <option value="Expired Stock">Expired Stock</option>
                  <option value="Other">Other Reason</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-amber-900 uppercase text-[10px] mb-0.5">
                  Original {type === 'CREDIT_NOTE' ? 'Sale Invoice #' : 'Purchase Bill #'} (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. INV-1024"
                  value={originalVoucherNumber}
                  onChange={(e) => setOriginalVoucherNumber(e.target.value)}
                  className="w-full p-1.5 bg-white border border-amber-300 rounded-lg font-mono outline-none text-xs"
                />
              </div>
            </div>
          )}

          {isItemBased ? (
            <div className="bg-slate-50 p-2 sm:p-2.5 rounded-xl border border-slate-200 space-y-1.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Items ({invoiceItems.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-200 flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Add Item
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsBarcodeModalOpen(true)}
                    className="text-[11px] font-bold text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded border border-indigo-200 flex items-center gap-1 cursor-pointer transition-colors"
                    title="Scan Barcode / QR Code"
                  >
                    <Barcode className="w-3 h-3 text-indigo-600" />
                    <span>Scan</span>
                  </button>
                </div>

                {/* Direct Total Bill Amount in same compact row */}
                <div className="flex items-center gap-1.5">
                  <label className="text-[11px] font-bold text-slate-700 uppercase">Total Bill:</label>
                  <div className="relative flex items-center">
                    <span className="absolute left-2 text-sm font-black text-blue-600">₹</span>
                    <input
                      type="number"
                      min="0.01"
                      step="any"
                      required
                      value={amount || ''}
                      onChange={(e) => handleTotalAmountChange(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="w-28 sm:w-36 pl-6 pr-2 py-1 text-sm sm:text-base font-black text-blue-900 bg-white border border-blue-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-right"
                    />
                  </div>
                </div>
              </div>

              {/* Items row list (compact) */}
              {invoiceItems.length > 0 && (
                <div className="max-h-24 overflow-y-auto space-y-1 pt-1 border-t border-slate-200">
                  {invoiceItems.map((row, idx) => (
                    <div key={idx} className="bg-white p-1 rounded-lg border border-slate-200 grid grid-cols-12 gap-1.5 items-center text-xs">
                      <div className="col-span-5">
                        <select
                          value={row.itemId || ''}
                          onChange={(e) => handleUpdateItemRow(idx, 'itemId', Number(e.target.value))}
                          className="w-full p-1 border border-slate-200 rounded font-medium outline-none text-[11px]"
                        >
                          <option value="">-- Choose Item --</option>
                          {items.map((it) => (
                            <option key={it.id} value={it.id}>
                              {it.name} (₹{type === 'SALE' ? it.salePrice : it.purchasePrice})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          min="1"
                          placeholder="Qty"
                          value={row.quantity || ''}
                          onChange={(e) => handleUpdateItemRow(idx, 'quantity', parseFloat(e.target.value) || 0)}
                          className="w-full p-1 border border-slate-200 rounded outline-none text-[11px] text-center"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          placeholder="Rate"
                          value={row.rate || ''}
                          onChange={(e) => handleUpdateItemRow(idx, 'rate', parseFloat(e.target.value) || 0)}
                          className="w-full p-1 border border-slate-200 rounded outline-none text-[11px] font-semibold text-center"
                        />
                      </div>
                      <div className="col-span-2 text-right font-bold text-slate-800 text-[11px]">
                        {formatCurrency(row.total)}
                      </div>
                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItemRow(idx)}
                          className="p-0.5 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Direct Amount for non-item based vouchers (PAYMENT_IN, PAYMENT_OUT, CONTRA, EXPENSE) */
            <div className="bg-blue-50/70 p-2 sm:p-2.5 rounded-xl border border-blue-200/80 flex items-center justify-between gap-3">
              <label className="text-xs font-bold text-blue-900 uppercase tracking-wider shrink-0">
                Amount (₹) <span className="text-rose-500">*</span>
              </label>
              <div className="relative flex-1 max-w-xs">
                <span className="absolute left-3 top-1.5 text-base font-black text-blue-600">₹</span>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  required
                  value={amount || ''}
                  onChange={(e) => handleTotalAmountChange(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full pl-8 pr-3 py-1.5 text-lg font-black text-slate-900 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white text-right"
                />
              </div>
            </div>
          )}

          {/* Settlement / Credit Status for Invoices */}
          {isItemBased && (
            <div className="bg-slate-50 p-2 sm:p-2.5 rounded-xl border border-slate-200 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Payment Settlement Status
                </span>
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                  paymentStatus === 'UNPAID' ? 'bg-rose-100 text-rose-800' :
                  paymentStatus === 'PAID' ? 'bg-emerald-100 text-emerald-800' :
                  'bg-amber-100 text-amber-800'
                }`}>
                  {paymentStatus === 'UNPAID' ? '🔴 100% Credit (Auto-Udhar)' :
                   paymentStatus === 'PAID' ? '🟢 100% Paid / Cash' :
                   `🟡 Partial (Due: ₹${balanceDue})`}
                </span>
              </div>

              {/* Segmented Control */}
              <div className="grid grid-cols-3 gap-1 p-0.5 bg-slate-200/80 rounded-lg text-xs font-bold">
                <button
                  type="button"
                  onClick={() => handleStatusChange('UNPAID')}
                  className={`py-1.5 px-2 rounded-md transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    paymentStatus === 'UNPAID'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-700 hover:bg-white/60'
                  }`}
                >
                  <span>🔴 Credit (Udhar)</span>
                  <span className={`text-[9px] px-1 rounded font-bold uppercase ${
                    paymentStatus === 'UNPAID' ? 'bg-rose-700 text-white' : 'bg-rose-100 text-rose-800'
                  }`}>
                    Default
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleStatusChange('PAID')}
                  className={`py-1.5 px-2 rounded-md transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    paymentStatus === 'PAID'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-700 hover:bg-white/60'
                  }`}
                >
                  <span>🟢 Paid / Cash</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleStatusChange('PARTIAL')}
                  className={`py-1.5 px-2 rounded-md transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    paymentStatus === 'PARTIAL'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'text-slate-700 hover:bg-white/60'
                  }`}
                >
                  <span>🟡 Partial Paid</span>
                </button>
              </div>

              {/* Status summary notice / input row */}
              {paymentStatus === 'UNPAID' && (
                <div className="px-2 py-1 bg-rose-50 border border-rose-200 rounded-lg text-[11px] text-rose-800 flex items-center justify-between">
                  <span className="truncate">
                    Total <b>{formatCurrency(amount)}</b> automatically credited to <b>{selectedParty?.name || 'party'}</b>'s ledger
                  </span>
                  <span className="font-bold text-rose-700 shrink-0 ml-1">Auto-Udhar</span>
                </div>
              )}

              {paymentStatus === 'PARTIAL' && (
                <div className="p-1.5 bg-amber-50 border border-amber-200 rounded-lg grid grid-cols-2 gap-2 text-xs items-center">
                  <div>
                    <label className="block text-[10px] font-bold text-amber-900 uppercase">Received / Advance (₹)</label>
                    <input
                      type="number"
                      min="0"
                      max={amount}
                      step="any"
                      value={paidAmount || ''}
                      onChange={(e) => handlePaidAmountChange(parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="w-full px-2 py-1 text-sm font-black text-emerald-700 bg-white border border-amber-300 rounded outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-rose-900 uppercase">Remaining Due (Udhar)</label>
                    <div className="px-2 py-1 bg-white border border-rose-200 rounded text-sm font-black text-rose-600">
                      {formatCurrency(balanceDue)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Payment Mode Selector - Only if money was actually paid/received */}
          {(!isItemBased || paymentStatus !== 'UNPAID') && (
            <div className="bg-slate-50 p-2 sm:p-2.5 rounded-xl border border-slate-200 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Payment Mode ({formatCurrency(effectivePaidAmount)})
                </label>
                {(paymentMode === 'UPI' || paymentMode === 'BANK') && bankAccounts.length > 0 && (
                  <select
                    value={bankAccountId || ''}
                    onChange={(e) => setBankAccountId(Number(e.target.value) || undefined)}
                    className="p-1 bg-white border border-slate-300 rounded text-[11px] font-semibold text-slate-800 outline-none max-w-xs"
                  >
                    {bankAccounts.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.accountName} ({b.bankName})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { id: 'CASH', label: '💵 Cash' },
                  { id: 'UPI', label: '📱 UPI' },
                  { id: 'BANK', label: '🏦 Bank' },
                  { id: 'SPLIT', label: '⚡ Split' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setPaymentMode(m.id as PaymentMode);
                      if (m.id === 'SPLIT' && effectivePaidAmount > 0) {
                        const half = Math.floor(effectivePaidAmount / 2);
                        setCashPart(half);
                        setOnlinePart(effectivePaidAmount - half);
                      }
                    }}
                    className={`py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                      paymentMode === m.id
                        ? 'bg-blue-600 border-blue-600 text-white shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Split Details (if SPLIT) */}
              {paymentMode === 'SPLIT' && (
                <div className="p-2 bg-amber-50/80 rounded-lg border border-amber-200 space-y-1.5 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 uppercase">💵 Cash Portion (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={cashPart || ''}
                        onChange={(e) => handleCashPartChange(parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full p-1 text-sm font-bold text-emerald-700 bg-white border border-slate-300 rounded outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-700 uppercase">📱 Online / Bank (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={onlinePart || ''}
                        onChange={(e) => handleOnlinePartChange(parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full p-1 text-sm font-bold text-blue-700 bg-white border border-slate-300 rounded outline-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={onlineMode}
                      onChange={(e) => setOnlineMode(e.target.value as any)}
                      className="w-full p-1 text-xs font-semibold border border-slate-300 rounded bg-white outline-none"
                    >
                      <option value="UPI">UPI (GPay / PhonePe)</option>
                      <option value="BANK">Bank Transfer (NEFT/IMPS)</option>
                      <option value="CHEQUE">Cheque</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Ref / UTR / Cheque #"
                      value={onlineRef}
                      onChange={(e) => setOnlineRef(e.target.value)}
                      className="w-full p-1 text-xs border border-slate-300 rounded outline-none font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Note Denomination Collapsible Toggle & Counter */}
              {isCashRequired && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-emerald-950">💵 Cash Counter:</span>
                      <span className="text-[11px] font-bold text-emerald-800">
                        {formatCurrency(totalDenomAmount)}
                      </span>
                      {isDenomMatched && (
                        <span className="bg-emerald-600 text-white text-[9px] px-1.5 py-0.5 rounded font-bold uppercase">
                          ✓ Matched
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowDenomCounter(!showDenomCounter)}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 cursor-pointer"
                    >
                      <span>{showDenomCounter ? 'Hide Note Breakdown ▴' : 'Count Notes (₹500, ₹200...) ▾'}</span>
                    </button>
                  </div>

                  {showDenomCounter && (
                    <div className="border border-emerald-200 rounded-xl p-2 bg-emerald-50/40 space-y-2">
                      <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                        {[
                          { key: 'c500', note: '₹500', val: 500 },
                          { key: 'c200', note: '₹200', val: 200 },
                          { key: 'c100', note: '₹100', val: 100 },
                          { key: 'c50', note: '₹50', val: 50 },
                          { key: 'c20', note: '₹20', val: 20 },
                          { key: 'c10', note: '₹10', val: 10 },
                          { key: 'c5', note: '₹5', val: 5 },
                          { key: 'coins', note: 'Coins', val: 1, isCoin: true },
                        ].map((d) => {
                          const currentCount = (denoms as any)[d.key] || 0;
                          return (
                            <div key={d.key} className="bg-white p-1 rounded-lg border border-slate-200 text-center">
                              <span className="block text-[10px] font-bold text-slate-600">{d.note}</span>
                              <input
                                type="number"
                                min="0"
                                inputMode="numeric"
                                placeholder="0"
                                value={currentCount || ''}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => handleDenomChange(d.key as any, parseInt(e.target.value) || 0)}
                                className="w-full p-1 text-center font-bold text-xs outline-none bg-slate-50 focus:bg-white rounded"
                              />
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center justify-between text-xs pt-1">
                        <span className="text-[11px] font-bold text-emerald-900">
                          Total: {formatCurrency(totalDenomAmount)} ({totalDenomNotes} notes)
                        </span>
                        <div className="flex items-center gap-1.5">
                          {targetCashAmount > 0 && (
                            <button
                              type="button"
                              onClick={handleAutoFillNotes}
                              className="text-[10px] font-bold px-2 py-0.5 bg-white border border-emerald-300 text-emerald-800 rounded hover:bg-emerald-100 cursor-pointer"
                            >
                              Auto-Fill
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={handleClearDenoms}
                            className="text-[10px] font-bold text-slate-500 hover:text-rose-600 px-1.5 py-0.5 cursor-pointer"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Remarks & Quick Attachments in One Line */}
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="Remarks / Voucher note (Optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Quick Camera Snap */}
            <label className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg cursor-pointer transition-colors shrink-0 flex items-center gap-1 text-[11px] font-bold" title="Take Photo with Camera">
              <Camera className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden sm:inline">Camera</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleAddAttachment}
                className="hidden"
              />
            </label>

            {/* Gallery Upload */}
            <label className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg cursor-pointer transition-colors shrink-0 flex items-center gap-1 text-[11px] font-bold" title="Choose from Gallery">
              <Paperclip className="w-3.5 h-3.5 text-slate-600" />
              {attachments.length > 0 && (
                <span className="bg-blue-600 text-white text-[9px] px-1 py-0.2 rounded-full font-bold">
                  {attachments.length}
                </span>
              )}
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleAddAttachment}
                className="hidden"
              />
            </label>
          </div>

          {/* Thumbnails preview strip (if any attached) */}
          {attachments.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pt-0.5 pb-0.5">
              {attachments.map((imgUrl, idx) => (
                <div key={idx} className="relative group shrink-0 w-12 h-12 rounded-lg overflow-hidden border border-slate-300 bg-white">
                  <img
                    src={imgUrl}
                    alt={`Attachment ${idx + 1}`}
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() => setViewingAttachment(imgUrl)}
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1 transition-opacity">
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(idx)}
                      className="p-0.5 bg-rose-600 text-white rounded cursor-pointer"
                      title="Delete attachment"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Compact Single-Row Action Footer */}
          <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsMoreOptionsSheetOpen(true)}
                className="p-1.5 sm:px-2.5 sm:py-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                title="More Options (Share via WhatsApp, Thermal Print)"
              >
                <MoreVertical className="w-3.5 h-3.5 text-slate-600" />
                <span className="hidden sm:inline">Options</span>
              </button>

              {txToEdit && onDelete ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={loading}
                  className="p-1.5 sm:px-2.5 sm:py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Delete</span>
                </button>
              ) : null}

              <button
                type="button"
                onClick={onClose}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Instant Print Button */}
              <button
                type="button"
                onClick={handleSaveAndPrint}
                disabled={loading}
                className="px-3 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-lg shadow-2xs transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1"
                title="Save & Print Thermal Slip"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Save & Print</span>
              </button>

              <button
                type="submit"
                disabled={loading}
                className="px-4 py-1.5 text-xs sm:text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>
                  {loading ? 'Saving...' : 
                   txToEdit ? 'Update' : 
                   type === 'SALE' ? 'Save Bill' :
                   type === 'PAYMENT_IN' ? 'Save Receipt' : 
                   type === 'CREDIT_NOTE' ? 'Save Return' : 
                   type === 'DEBIT_NOTE' ? 'Save Return' : 
                   type === 'CONTRA' ? 'Post Transfer' : 
                   'Save Voucher'}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>



      {/* 2. More Options Bottom Sheet (Screenshot 2: Share & Print) */}
      {isMoreOptionsSheetOpen && (
        <div 
          className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
          onClick={() => setIsMoreOptionsSheetOpen(false)}
        >
          <div 
            className="bg-white rounded-t-3xl sm:rounded-2xl max-w-md w-full shadow-2xl overflow-hidden p-5 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-base text-slate-900">More Options</h3>
              <button
                type="button"
                onClick={() => setIsMoreOptionsSheetOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-3 space-y-2.5">
              {/* Option 1: Share (WhatsApp) */}
              <button
                type="button"
                onClick={() => {
                  setIsMoreOptionsSheetOpen(false);
                  handleShareAndSave();
                }}
                className="w-full flex items-center gap-3.5 p-3.5 rounded-xl hover:bg-emerald-50 text-slate-800 transition-colors cursor-pointer group text-left border border-slate-200 hover:border-emerald-300"
              >
                <div className="w-11 h-11 rounded-full bg-emerald-100 group-hover:bg-emerald-600 text-emerald-600 group-hover:text-white flex items-center justify-center transition-colors shrink-0 shadow-2xs">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900 group-hover:text-emerald-800">Share</div>
                  <div className="text-xs text-slate-500">Auto-saves entry & directly opens WhatsApp with receipt</div>
                </div>
              </button>

              {/* Option 2: Print (Bluetooth Thermal Printer) */}
              <button
                type="button"
                onClick={() => {
                  setIsMoreOptionsSheetOpen(false);
                  handlePrintAndSave();
                }}
                className="w-full flex items-center gap-3.5 p-3.5 rounded-xl hover:bg-indigo-50 text-slate-800 transition-colors cursor-pointer group text-left border border-slate-200 hover:border-indigo-300"
              >
                <div className="w-11 h-11 rounded-full bg-indigo-100 group-hover:bg-indigo-600 text-indigo-600 group-hover:text-white flex items-center justify-center transition-colors shrink-0 shadow-2xs">
                  <Printer className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900 group-hover:text-indigo-800">Print</div>
                  <div className="text-xs text-slate-500">Auto-saves entry & prints instantly on Bluetooth printer</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Lightbox Viewer for Attachments */}
      <AttachmentViewerModal
        isOpen={Boolean(viewingAttachment)}
        onClose={() => setViewingAttachment(null)}
        imageUrl={viewingAttachment || undefined}
        title={`Attachment - ${voucherNumber}`}
      />

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isBarcodeModalOpen}
        onClose={() => setIsBarcodeModalOpen(false)}
        onScan={handleBarcodeScan}
        title={`Scan Item Barcode for ${type === 'SALE' ? 'Sale' : 'Purchase'}`}
      />
    </div>
  );
};
