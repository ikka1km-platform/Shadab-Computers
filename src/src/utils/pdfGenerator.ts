import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Party, Transaction, BusinessProfile, DenominationBreakdown } from '../types';
import { formatCurrency, formatDate, numberToWordsINR } from './formatters';

export function generateDailyDenominationPDF(
  selectedDate: string,
  totalDenoms: DenominationBreakdown,
  cashTransactions: Transaction[],
  profile: BusinessProfile,
  firmName?: string
) {
  const doc = new jsPDF();

  // Business Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(14, 14, 182, 26, 'F');

  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  const headerTitle = firmName && firmName !== 'ALL' && firmName !== 'All Firms' 
    ? `${profile.businessName} (${firmName})`
    : profile.businessName;
  doc.text(headerTitle, 20, 24);

  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text(profile.address || '', 20, 31);
  const subHeader = firmName && firmName !== 'ALL' && firmName !== 'All Firms'
    ? `Branch/Firm: ${firmName} | Phone: ${profile.phone || 'N/A'} | Date: ${formatDate(selectedDate)}`
    : `Consolidated (All Firms) | Phone: ${profile.phone || 'N/A'} | Date: ${formatDate(selectedDate)}`;
  doc.text(subHeader, 20, 36);

  // Document Title
  doc.setFontSize(14);
  doc.setTextColor(30, 41, 59);
  doc.text('DAILY CASH RETALLY & BANK DEPOSIT SLIP', 14, 48);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Date of Tally: ${formatDate(selectedDate)}`, 14, 55);
  doc.text(`Total Receipts with Cash: ${cashTransactions.length}`, 14, 60);

  // Total Box
  doc.setFillColor(240, 253, 244); // emerald-50
  doc.setDrawColor(187, 247, 208); // emerald-200
  doc.roundedRect(120, 44, 76, 20, 2, 2, 'FD');

  doc.setFontSize(9);
  doc.setTextColor(22, 101, 52); // emerald-800
  doc.text('TOTAL PHYSICAL CASH:', 124, 52);

  doc.setFontSize(14);
  doc.setTextColor(21, 128, 61);
  doc.text(formatCurrency(totalDenoms.totalAmount || 0), 124, 60);

  // Consolidated Denomination Table
  const denomList = [
    { label: '₹500 Notes', count: totalDenoms.c500 || 0, subtotal: (totalDenoms.c500 || 0) * 500 },
    { label: '₹200 Notes', count: totalDenoms.c200 || 0, subtotal: (totalDenoms.c200 || 0) * 200 },
    { label: '₹100 Notes', count: totalDenoms.c100 || 0, subtotal: (totalDenoms.c100 || 0) * 100 },
    { label: '₹50 Notes', count: totalDenoms.c50 || 0, subtotal: (totalDenoms.c50 || 0) * 50 },
    { label: '₹20 Notes', count: totalDenoms.c20 || 0, subtotal: (totalDenoms.c20 || 0) * 20 },
    { label: '₹10 Notes', count: totalDenoms.c10 || 0, subtotal: (totalDenoms.c10 || 0) * 10 },
    { label: '₹5 Notes', count: totalDenoms.c5 || 0, subtotal: (totalDenoms.c5 || 0) * 5 },
    { label: 'Coins', count: '-', subtotal: totalDenoms.coins || 0 },
  ];

  const tableRows = denomList
    .filter((d) => (typeof d.count === 'number' && d.count > 0) || d.subtotal > 0)
    .map((d) => [d.label, d.count, formatCurrency(d.subtotal)]);

  tableRows.push([
    'GRAND TOTAL',
    `${totalDenoms.totalNotes || 0} Total Notes`,
    formatCurrency(totalDenoms.totalAmount || 0),
  ]);

  autoTable(doc, {
    startY: 68,
    head: [['Currency Denomination', 'Total Pieces (Notes)', 'Calculated Amount (₹)']],
    body: tableRows,
    theme: 'grid',
    headStyles: { fillColor: [16, 149, 106] }, // emerald-600
    styles: { fontSize: 9 },
  });

  let currentY = (doc as any).lastAutoTable?.finalY + 12;

  // In Words
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Amount in Words: ${numberToWordsINR(totalDenoms.totalAmount || 0)}`, 14, currentY);

  currentY += 10;

  // Individual Customer Breakdown Table
  if (cashTransactions.length > 0) {
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.text('Receipt-Wise Customer Cash Collection Log:', 14, currentY);

    const receiptRows = cashTransactions.map((tx) => {
      const cd = tx.cashDenominations;
      let notesSummary = '-';
      if (cd) {
        const parts: string[] = [];
        if (cd.c500) parts.push(`₹500x${cd.c500}`);
        if (cd.c200) parts.push(`₹200x${cd.c200}`);
        if (cd.c100) parts.push(`₹100x${cd.c100}`);
        if (cd.c50) parts.push(`₹50x${cd.c50}`);
        if (cd.c20) parts.push(`₹20x${cd.c20}`);
        if (cd.c10) parts.push(`₹10x${cd.c10}`);
        if (cd.c5) parts.push(`₹5x${cd.c5}`);
        if (cd.coins) parts.push(`Coins ₹${cd.coins}`);
        notesSummary = parts.join(', ');
      }

      const cashAmt = tx.paymentMode === 'SPLIT' && tx.splitPayment ? tx.splitPayment.cashAmount : tx.amount;

      return [
        tx.voucherNumber,
        tx.partyName || 'Customer',
        tx.firmName || 'Main Firm',
        formatCurrency(cashAmt),
        notesSummary,
      ];
    });

    autoTable(doc, {
      startY: currentY + 4,
      head: [['Voucher #', 'Customer Name', 'Firm / Unit', 'Cash Amount', 'Note Counts Provided']],
      body: receiptRows,
      theme: 'striped',
      headStyles: { fillColor: [51, 65, 85] },
      styles: { fontSize: 8.5 },
    });

    currentY = (doc as any).lastAutoTable?.finalY + 18;
  }

  // Signatures
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('Cashier Signature', 20, currentY + 15);
  doc.line(20, currentY + 10, 60, currentY + 10);

  doc.text('Manager / Bank Verifier Signature', 130, currentY + 15);
  doc.line(130, currentY + 10, 185, currentY + 10);

  const safeFirm = firmName && firmName !== 'ALL' && firmName !== 'All Firms' ? `${firmName.replace(/\s+/g, '_')}_` : '';
  doc.save(`Cash_Denomination_Tally_${safeFirm}${selectedDate}.pdf`);
}

export function generatePartyStatementPDF(
  party: Party,
  transactions: Transaction[],
  profile: BusinessProfile,
  fromDate?: string,
  toDate?: string
) {
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text(profile.businessName, 14, 20);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(profile.address || '', 14, 26);
  doc.text(`Phone: ${profile.phone || 'N/A'} | Email: ${profile.email || 'N/A'}`, 14, 31);
  if (profile.gstin) {
    doc.text(`GSTIN: ${profile.gstin}`, 14, 36);
  }

  doc.setDrawColor(226, 232, 240);
  doc.line(14, 40, 196, 40);

  doc.setFontSize(14);
  doc.setTextColor(30, 41, 59);
  doc.text('STATEMENT OF ACCOUNT (LEDGER)', 14, 48);

  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  doc.text(`Party: ${party.name}`, 14, 55);
  doc.text(`Phone: ${party.phone || 'N/A'}`, 14, 60);
  doc.text(`Account Code: ${party.accountCode}`, 14, 65);

  const dateRangeText = fromDate && toDate ? `Period: ${formatDate(fromDate)} to ${formatDate(toDate)}` : `Date: ${formatDate(new Date().toISOString())}`;
  doc.text(dateRangeText, 130, 55);

  const isReceivable = party.currentBalance > 0;
  const balanceLabel = isReceivable ? "You'll Receive (Dr)" : party.currentBalance < 0 ? "You'll Pay (Cr)" : "Settled (0.00)";
  doc.setFontSize(11);
  doc.text(`Net Balance: ${formatCurrency(Math.abs(party.currentBalance))}`, 130, 62);
  doc.setFontSize(9);
  doc.setTextColor(isReceivable ? 22 : 185, isReceivable ? 163 : 28, isReceivable ? 74 : 28);
  doc.text(`Status: ${balanceLabel}`, 130, 67);

  let running = party.openingBalance;
  const rows = [
    [
      formatDate(party.createdAt),
      'Opening Balance',
      '-',
      party.openingBalance > 0 ? formatCurrency(party.openingBalance) : '-',
      party.openingBalance < 0 ? formatCurrency(Math.abs(party.openingBalance)) : '-',
      formatCurrency(running),
    ],
  ];

  transactions.forEach((tx) => {
    let debit = '-';
    let credit = '-';

    if (party.partyType === 'CUSTOMER') {
      if (tx.type === 'SALE') {
        debit = formatCurrency(tx.amount);
        running += tx.amount;
      } else if (tx.type === 'PAYMENT_IN') {
        credit = formatCurrency(tx.amount);
        running -= tx.amount;
      }
    } else {
      if (tx.type === 'PURCHASE') {
        credit = formatCurrency(tx.amount);
        running -= tx.amount;
      } else if (tx.type === 'PAYMENT_OUT') {
        debit = formatCurrency(tx.amount);
        running += tx.amount;
      }
    }

    const modeText = tx.paymentMode === 'SPLIT' && tx.splitPayment
      ? `Split (Cash: ₹${tx.splitPayment.cashAmount} / Online: ₹${tx.splitPayment.onlineAmount})`
      : tx.paymentMode || '-';

    rows.push([
      formatDate(tx.date),
      `${tx.voucherNumber} (${tx.type.replace('_', ' ')})`,
      modeText,
      debit,
      credit,
      formatCurrency(running),
    ]);
  });

  autoTable(doc, {
    startY: 73,
    head: [['Date', 'Voucher / Details', 'Mode', 'Debit (+)', 'Credit (-)', 'Balance']],
    body: rows,
    theme: 'striped',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [51, 65, 85],
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 150;
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('This is a computer-generated statement and does not require a physical signature.', 14, finalY + 15);

  doc.save(`${party.name}_Ledger_Statement.pdf`);
}

export function generateReceiptVoucherPDF(
  transaction: Transaction,
  party: Party | undefined,
  profile: BusinessProfile
) {
  const doc = new jsPDF();

  doc.setFillColor(30, 41, 59);
  doc.rect(14, 14, 182, 24, 'F');

  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text(profile.businessName, 20, 25);

  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text(profile.address || '', 20, 32);

  doc.setFontSize(14);
  doc.setTextColor(30, 41, 59);
  const title = transaction.type === 'PAYMENT_IN' ? 'OFFICIAL PAYMENT RECEIPT' :
                transaction.type === 'PAYMENT_OUT' ? 'PAYMENT OUT VOUCHER' :
                transaction.type === 'SALE' ? (profile.invoiceTitle || 'TAX INVOICE / BILL') : 'EXPENSE VOUCHER';
  doc.text(title, 14, 48);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Voucher No: ${transaction.voucherNumber}`, 14, 55);
  doc.text(`Date: ${formatDate(transaction.date)}`, 14, 60);

  const modeDisplay = transaction.paymentMode === 'SPLIT' && transaction.splitPayment
    ? `Split: Cash ₹${transaction.splitPayment.cashAmount} + ${transaction.splitPayment.onlineMode} ₹${transaction.splitPayment.onlineAmount}${transaction.splitPayment.onlineRef ? ` (Ref: ${transaction.splitPayment.onlineRef})` : ''}`
    : transaction.paymentMode;
  doc.text(`Payment Mode: ${modeDisplay}`, 14, 65);

  if (party) {
    doc.text(`Party Name: ${party.name}`, 120, 55);
    doc.text(`Phone: ${party.phone || 'N/A'}`, 120, 60);
    doc.text(`Account Code: ${party.accountCode}`, 120, 65);
    if (party.gstin) doc.text(`GSTIN: ${party.gstin}`, 120, 70);
  }

  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, 72, 182, 28, 3, 3, 'F');

  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);
  doc.text('Total Amount Received / Paid:', 20, 82);

  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text(formatCurrency(transaction.amount), 20, 92);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`In Words: ${numberToWordsINR(transaction.amount)}`, 14, 107);

  if (transaction.description) {
    doc.text(`Remarks: ${transaction.description}`, 14, 114);
  }

  let currentY = 120;

  if (transaction.cashDenominations) {
    const cd = transaction.cashDenominations;
    const denomRows: any[] = [];
    if (cd.c500) denomRows.push(['₹500 Notes', cd.c500, formatCurrency(cd.c500 * 500)]);
    if (cd.c200) denomRows.push(['₹200 Notes', cd.c200, formatCurrency(cd.c200 * 200)]);
    if (cd.c100) denomRows.push(['₹100 Notes', cd.c100, formatCurrency(cd.c100 * 100)]);
    if (cd.c50) denomRows.push(['₹50 Notes', cd.c50, formatCurrency(cd.c50 * 50)]);
    if (cd.c20) denomRows.push(['₹20 Notes', cd.c20, formatCurrency(cd.c20 * 20)]);
    if (cd.c10) denomRows.push(['₹10 Notes', cd.c10, formatCurrency(cd.c10 * 10)]);
    if (cd.c5) denomRows.push(['₹5 Notes', cd.c5, formatCurrency(cd.c5 * 5)]);
    if (cd.coins) denomRows.push(['Coins', '-', formatCurrency(cd.coins)]);

    if (denomRows.length > 0) {
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text('Attached Physical Cash Denomination Breakdown:', 14, currentY);

      autoTable(doc, {
        startY: currentY + 3,
        head: [['Currency Denomination', 'Count / Pcs', 'Subtotal (₹)']],
        body: [
          ...denomRows,
          ['Total Cash Counted', `${cd.totalNotes || '-'} Notes`, formatCurrency(cd.totalAmount || 0)],
        ],
        theme: 'striped',
        headStyles: { fillColor: [16, 149, 106] },
        styles: { fontSize: 8.5 },
      });

      currentY = (doc as any).lastAutoTable?.finalY + 12;
    }
  }

  if (transaction.items && transaction.items.length > 0) {
    const itemRows = transaction.items.map((it, idx) => [
      idx + 1,
      it.name,
      `${it.quantity} ${it.unit}`,
      formatCurrency(it.rate),
      `${it.taxRate}%`,
      formatCurrency(it.discount),
      formatCurrency(it.total),
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['#', 'Item Description', 'Qty', 'Rate', 'Tax', 'Disc', 'Total']],
      body: itemRows,
      theme: 'grid',
      headStyles: { fillColor: [51, 65, 85] },
    });
    currentY = (doc as any).lastAutoTable?.finalY + 10;
  }

  // Terms & Conditions
  if (profile.termsAndConditions) {
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Terms & Conditions:', 14, currentY + 4);
    const splitTerms = doc.splitTextToSize(profile.termsAndConditions, 110);
    doc.text(splitTerms, 14, currentY + 9);
  }

  // Footer Note
  if (profile.invoiceFooterNote) {
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(profile.invoiceFooterNote, 14, currentY + 24);
  }

  // Signature
  const signatureLabel = profile.signatureText || 'Authorized Signatory';
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(signatureLabel, 135, currentY + 20);
  doc.line(130, currentY + 15, 185, currentY + 15);

  doc.save(`${transaction.voucherNumber}_${transaction.type}.pdf`);
}
