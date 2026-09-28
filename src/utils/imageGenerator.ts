import { BusinessProfile, DenominationBreakdown, Transaction } from '../types';
import { formatCurrency, formatDate, formatDateTime, numberToWordsINR } from './formatters';

interface GenerateImageOptions {
  selectedDate: string;
  totalDenoms: DenominationBreakdown;
  cashTransactions: Transaction[];
  profile: BusinessProfile;
  firmName?: string;
}

/**
 * Renders a high-resolution, pixel-perfect JPEG image of the Re-Tally Sheet with Firm Details and Note Demonstrations.
 */
export async function generateDenominationJPEG({
  selectedDate,
  totalDenoms,
  cashTransactions,
  profile,
  firmName,
}: GenerateImageOptions): Promise<{ blob: Blob; dataUrl: string; filename: string }> {
  const displayFirm = firmName && firmName !== 'ALL' && firmName !== 'All Firms' 
    ? firmName 
    : 'All Firms Consolidated';

  // Base canvas configuration
  const width = 880;
  const paddingX = 40;
  const cardWidth = width - paddingX * 2; // 800px

  // Calculate dynamic canvas height
  const maxReceiptsToShow = Math.min(cashTransactions.length, 12);
  const receiptsHeight = cashTransactions.length > 0 ? 50 + maxReceiptsToShow * 34 + 20 : 0;
  const height = 980 + receiptsHeight;

  // Use 2x DPR for ultra-crisp text rendering (WhatsApp & printing ready)
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to create canvas 2D context');

  ctx.scale(scale, scale);

  // Helper drawing functions
  const roundRect = (
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    fill: boolean = true,
    stroke: boolean = false
  ) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  };

  // 1. Overall Background (Clean Slate/Light Gray)
  ctx.fillStyle = '#f1f5f9'; // slate-100
  ctx.fillRect(0, 0, width, height);

  // 2. Main White Container Card
  const cardX = paddingX;
  const cardY = 30;
  const cardH = height - 60;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(15, 23, 42, 0.08)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 8;
  roundRect(cardX, cardY, cardWidth, cardH, 20, true, false);
  ctx.shadowColor = 'transparent'; // reset shadow

  let curY = cardY;

  // 3. Top Header Banner (Slate-900)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cardX + 20, curY);
  ctx.lineTo(cardX + cardWidth - 20, curY);
  ctx.quadraticCurveTo(cardX + cardWidth, curY, cardX + cardWidth, curY + 20);
  ctx.lineTo(cardX + cardWidth, curY + 95);
  ctx.lineTo(cardX, curY + 95);
  ctx.lineTo(cardX, curY + 20);
  ctx.quadraticCurveTo(cardX, curY, cardX + 20, curY);
  ctx.closePath();
  ctx.clip();

  ctx.fillStyle = '#0f172a'; // slate-900
  ctx.fillRect(cardX, curY, cardWidth, 95);

  // Business Name
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(profile.businessName || 'MY BUSINESS FIRM', cardX + 30, curY + 40);

  // Subtitle / Address / Phone / GSTIN
  ctx.fillStyle = '#94a3b8'; // slate-400
  ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const addressLine = profile.address ? `${profile.address} • ` : '';
  const phoneLine = profile.phone ? `Ph: ${profile.phone}` : '';
  const gstinLine = profile.gstin ? ` • GSTIN: ${profile.gstin}` : '';
  ctx.fillText(`${addressLine}${phoneLine}${gstinLine}`, cardX + 30, curY + 68);
  ctx.restore();

  curY += 95;

  // 4. Firm Name & Date Banner (Indigo Accent Bar)
  ctx.fillStyle = '#4338ca'; // indigo-700
  ctx.fillRect(cardX, curY, cardWidth, 44);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(`🏢 FIRM / DESK: ${displayFirm.toUpperCase()}`, cardX + 30, curY + 28);

  ctx.fillStyle = '#e0e7ff'; // indigo-100
  ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const dateStr = `DATE: ${formatDate(selectedDate).toUpperCase()}`;
  const dateWidth = ctx.measureText(dateStr).width;
  ctx.fillText(dateStr, cardX + cardWidth - 30 - dateWidth, curY + 28);

  curY += 44;

  // 5. Document Title
  curY += 25;
  ctx.fillStyle = '#1e293b'; // slate-800
  ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('CURRENCY DENOMINATION & NOTE RE-TALLY SHEET', cardX + 30, curY);

  curY += 18;
  ctx.fillStyle = '#64748b'; // slate-500
  ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(
    `Official note piece count report generated for ${displayFirm} on ${formatDate(selectedDate)}`,
    cardX + 30,
    curY
  );

  // 6. Top Summary KPI Cards (Side-by-side)
  curY += 20;
  const kpiW = (cardWidth - 60 - 20) / 2;
  const kpiH = 92;

  // KPI 1: Total Physical Cash (Emerald Card)
  ctx.fillStyle = '#ecfdf5'; // emerald-50
  ctx.strokeStyle = '#a7f3d0'; // emerald-200
  ctx.lineWidth = 1.5;
  roundRect(cardX + 30, curY, kpiW, kpiH, 14, true, true);

  ctx.fillStyle = '#065f46'; // emerald-800
  ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('TOTAL PHYSICAL CASH TO DEPOSIT', cardX + 45, curY + 26);

  ctx.fillStyle = '#047857'; // emerald-700
  ctx.font = '900 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(formatCurrency(totalDenoms.totalAmount || 0), cardX + 45, curY + 56);

  ctx.fillStyle = '#065f46';
  ctx.font = 'italic 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const words = numberToWordsINR(totalDenoms.totalAmount || 0);
  ctx.fillText(words.length > 45 ? `${words.slice(0, 42)}...` : words, cardX + 45, curY + 76);

  // KPI 2: Total Notes Counted (Blue Card)
  const kpi2X = cardX + 30 + kpiW + 20;
  ctx.fillStyle = '#eff6ff'; // blue-50
  ctx.strokeStyle = '#bfdbfe'; // blue-200
  roundRect(kpi2X, curY, kpiW, kpiH, 14, true, true);

  ctx.fillStyle = '#1e40af'; // blue-800
  ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('TOTAL CURRENCY NOTES COUNTED', kpi2X + 15, curY + 26);

  ctx.fillStyle = '#1d4ed8'; // blue-700
  ctx.font = '900 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(`${totalDenoms.totalNotes || 0} Pieces`, kpi2X + 15, curY + 56);

  ctx.fillStyle = '#1e40af';
  ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(
    `Loose Coins: ${formatCurrency(totalDenoms.coins || 0)}  |  ${cashTransactions.length} Receipts`,
    kpi2X + 15,
    curY + 76
  );

  curY += kpiH + 25;

  // 7. Denomination Sheet Table
  const tableX = cardX + 30;
  const tableW = cardWidth - 60;
  const colXDenom = tableX + 20;
  const colXCount = tableX + 320;
  const colXSubtotal = tableX + 570;
  const colXShare = tableX + tableW - 25;

  // Table Header
  const thH = 38;
  ctx.fillStyle = '#334155'; // slate-700
  roundRect(tableX, curY, tableW, thH, 8, true, false);

  ctx.fillStyle = '#f8fafc'; // slate-50
  ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('DENOMINATION VALUE', colXDenom, curY + 24);

  ctx.textAlign = 'center';
  ctx.fillText('PIECE / NOTE COUNT', colXCount, curY + 24);

  ctx.textAlign = 'right';
  ctx.fillText('CALCULATED SUBTOTAL (₹)', colXSubtotal, curY + 24);
  ctx.fillText('SHARE %', colXShare, curY + 24);

  curY += thH;

  const denomRows = [
    { label: '₹500 Notes', badge: '₹500', count: totalDenoms.c500 || 0, subtotal: (totalDenoms.c500 || 0) * 500, badgeBg: '#f5f5f4', badgeBorder: '#d6d3d1', badgeText: '#1c1917' },
    { label: '₹200 Notes', badge: '₹200', count: totalDenoms.c200 || 0, subtotal: (totalDenoms.c200 || 0) * 200, badgeBg: '#fef3c7', badgeBorder: '#fde68a', badgeText: '#92400e' },
    { label: '₹100 Notes', badge: '₹100', count: totalDenoms.c100 || 0, subtotal: (totalDenoms.c100 || 0) * 100, badgeBg: '#e0e7ff', badgeBorder: '#c7d2fe', badgeText: '#3730a3' },
    { label: '₹50 Notes',  badge: '₹50',  count: totalDenoms.c50 || 0,  subtotal: (totalDenoms.c50 || 0) * 50,  badgeBg: '#cffafe', badgeBorder: '#a5f3fc', badgeText: '#155e75' },
    { label: '₹20 Notes',  badge: '₹20',  count: totalDenoms.c20 || 0,  subtotal: (totalDenoms.c20 || 0) * 20,  badgeBg: '#ffedd5', badgeBorder: '#fed7aa', badgeText: '#9a3412' },
    { label: '₹10 Notes',  badge: '₹10',  count: totalDenoms.c10 || 0,  subtotal: (totalDenoms.c10 || 0) * 10,  badgeBg: '#dcfce7', badgeBorder: '#bbf7d0', badgeText: '#166534' },
    { label: '₹5 Notes',   badge: '₹5',   count: totalDenoms.c5 || 0,   subtotal: (totalDenoms.c5 || 0) * 5,   badgeBg: '#f1f5f9', badgeBorder: '#cbd5e1', badgeText: '#334155' },
    { label: 'Coins (₹)',  badge: 'COIN', count: '-',                   subtotal: totalDenoms.coins || 0,      badgeBg: '#fef9c3', badgeBorder: '#fef08a', badgeText: '#854d0e', isCoin: true },
  ];

  const totalAmt = totalDenoms.totalAmount || 1;

  denomRows.forEach((row, idx) => {
    const rowH = 36;
    const isEven = idx % 2 === 0;

    // Row Background
    ctx.fillStyle = isEven ? '#ffffff' : '#f8fafc';
    ctx.fillRect(tableX, curY, tableW, rowH);

    // Row Bottom Border
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tableX, curY + rowH);
    ctx.lineTo(tableX + tableW, curY + rowH);
    ctx.stroke();

    // Denomination Badge
    ctx.fillStyle = row.badgeBg;
    ctx.strokeStyle = row.badgeBorder;
    roundRect(colXDenom, curY + 7, 44, 22, 6, true, true);

    ctx.fillStyle = row.badgeText;
    ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(row.badge, colXDenom + 22, curY + 22);

    // Label
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(row.label, colXDenom + 54, curY + 23);

    // Piece / Note count
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 14px "Courier New", Courier, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(row.count), colXCount, curY + 23);

    // Subtotal
    ctx.fillStyle = '#047857'; // emerald-700
    ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(formatCurrency(row.subtotal), colXSubtotal, curY + 23);

    // Share Percentage
    const pct = totalAmt > 0 ? ((row.subtotal / totalAmt) * 100).toFixed(1) : '0.0';
    ctx.fillStyle = '#64748b';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${pct}%`, colXShare, curY + 23);

    curY += rowH;
  });

  // Table Grand Total Row
  const totalRowH = 44;
  ctx.fillStyle = '#ecfdf5'; // emerald-50
  ctx.strokeStyle = '#10b981'; // emerald-500
  ctx.lineWidth = 2;
  roundRect(tableX, curY, tableW, totalRowH, 8, true, true);

  ctx.fillStyle = '#064e3b'; // emerald-950
  ctx.font = '900 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`GRAND TOTAL CASH (${displayFirm.toUpperCase()})`, colXDenom, curY + 27);

  ctx.font = '900 15px "Courier New", Courier, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${totalDenoms.totalNotes || 0} Notes`, colXCount, curY + 27);

  ctx.fillStyle = '#047857';
  ctx.font = '900 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(formatCurrency(totalDenoms.totalAmount || 0), colXSubtotal, curY + 28);

  ctx.fillStyle = '#064e3b';
  ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('100.0%', colXShare, curY + 27);

  curY += totalRowH + 25;

  // 8. Customer Cash Receipts Demonstration Log (if present)
  if (cashTransactions.length > 0) {
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(
      `RECEIPT-WISE NOTE DEMONSTRATION LOG (${cashTransactions.length} Total Receipts)`,
      tableX,
      curY
    );

    curY += 12;

    // Header for mini table
    const rthH = 28;
    ctx.fillStyle = '#f1f5f9';
    roundRect(tableX, curY, tableW, rthH, 6, true, false);

    ctx.fillStyle = '#475569';
    ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('VOUCHER #', tableX + 15, curY + 18);
    ctx.fillText('CUSTOMER / PARTY', tableX + 130, curY + 18);
    ctx.fillText('FIRM', tableX + 310, curY + 18);
    ctx.fillText('CASH RECVD', tableX + 440, curY + 18);
    ctx.fillText('NOTES DEMONSTRATION', tableX + 560, curY + 18);

    curY += rthH;

    const displayedTxs = cashTransactions.slice(0, maxReceiptsToShow);

    displayedTxs.forEach((tx) => {
      const rowH = 34;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(tableX, curY, tableW, rowH);

      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tableX, curY + rowH);
      ctx.lineTo(tableX + tableW, curY + rowH);
      ctx.stroke();

      const cd = tx.cashDenominations;
      const cashAmt = tx.paymentMode === 'SPLIT' && tx.splitPayment
        ? tx.splitPayment.cashAmount
        : (tx.paidAmount !== undefined ? tx.paidAmount : tx.amount);

      const parts: string[] = [];
      if (cd?.c500) parts.push(`₹500x${cd.c500}`);
      if (cd?.c200) parts.push(`₹200x${cd.c200}`);
      if (cd?.c100) parts.push(`₹100x${cd.c100}`);
      if (cd?.c50) parts.push(`₹50x${cd.c50}`);
      if (cd?.c20) parts.push(`₹20x${cd.c20}`);
      if (cd?.c10) parts.push(`₹10x${cd.c10}`);
      if (cd?.c5) parts.push(`₹5x${cd.c5}`);
      if (cd?.coins) parts.push(`Coins ₹${cd.coins}`);
      const notesStr = parts.length > 0 ? parts.join(', ') : 'Direct Cash';

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 11px "Courier New", Courier, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(tx.voucherNumber, tableX + 15, curY + 21);

      ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const pName = (tx.partyName || 'Customer').slice(0, 18);
      ctx.fillText(pName, tableX + 130, curY + 21);

      // Firm badge
      ctx.fillStyle = '#4f46e5';
      ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(tx.firmName ? tx.firmName.slice(0, 14) : 'Main', tableX + 310, curY + 21);

      ctx.fillStyle = '#047857';
      ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(formatCurrency(cashAmt), tableX + 440, curY + 21);

      ctx.fillStyle = '#64748b';
      ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(notesStr.slice(0, 36), tableX + 560, curY + 21);

      curY += rowH;
    });

    if (cashTransactions.length > maxReceiptsToShow) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'italic 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        `+ ${cashTransactions.length - maxReceiptsToShow} more receipts recorded on this date`,
        tableX + tableW / 2,
        curY + 20
      );
      curY += 25;
    }

    curY += 15;
  }

  // 9. Signatures Block
  curY += 25;
  const sigLineW = 180;

  // Cashier signature
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(tableX + 20, curY);
  ctx.lineTo(tableX + 20 + sigLineW, curY);
  ctx.stroke();

  ctx.fillStyle = '#64748b';
  ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Cashier / Counter In-Charge', tableX + 20 + sigLineW / 2, curY + 18);

  // Bank Verifier / Manager signature
  const sigRightX = tableX + tableW - 20 - sigLineW;
  ctx.beginPath();
  ctx.moveTo(sigRightX, curY);
  ctx.lineTo(sigRightX + sigLineW, curY);
  ctx.stroke();

  ctx.fillText('Manager / Bank Verification Seal', sigRightX + sigLineW / 2, curY + 18);

  // 10. Watermark Footer
  curY += 45;
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    `Verified & Tallied with Vyapar Plus Desktop & Android App • Generated on ${formatDateTime(new Date().toISOString())}`,
    cardX + cardWidth / 2,
    curY
  );

  // Convert to high-quality JPEG
  const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Failed to create JPEG blob from canvas'));
      },
      'image/jpeg',
      0.95
    );
  });

  const safeFirm = displayFirm.replace(/\s+/g, '_');
  const filename = `Cash_Note_Retally_${safeFirm}_${selectedDate}.jpg`;

  return { blob, dataUrl, filename };
}

/**
 * Triggers native mobile/desktop Web Share API (WhatsApp, Telegram, Gmail, etc.)
 * with fallback to automatic JPG file download.
 */
export async function shareDenominationJPEG(options: GenerateImageOptions): Promise<{ success: boolean; shared: boolean; downloaded: boolean }> {
  try {
    const { blob, dataUrl, filename } = await generateDenominationJPEG(options);

    const displayFirm = options.firmName && options.firmName !== 'ALL' && options.firmName !== 'All Firms'
      ? options.firmName
      : 'All Firms Consolidated';

    const shareTitle = `${displayFirm} - Cash Note Re-Tally (${formatDate(options.selectedDate)})`;
    const shareText = `📊 Daily Cash Denomination & Note Demonstration Sheet for *${displayFirm}* on ${formatDate(options.selectedDate)}.\n\n` +
      `💵 Total Physical Cash: ${formatCurrency(options.totalDenoms.totalAmount || 0)}\n` +
      `🔢 Total Notes: ${options.totalDenoms.totalNotes || 0} Pieces\n` +
      `🧾 Receipts Count: ${options.cashTransactions.length} Receipts\n\n` +
      `Shared from Vyapar Plus App.`;

    const file = new File([blob], filename, { type: 'image/jpeg' });

    // Check if browser supports sharing files (Android Chrome, Safari, Samsung Internet, Edge)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          files: [file],
        });
        return { success: true, shared: true, downloaded: false };
      } catch (err: any) {
        // User closed the share dialog without picking an app
        if (err.name === 'AbortError') {
          return { success: true, shared: false, downloaded: false };
        }
        // If file sharing failed, fallback to download
        console.warn('Navigator share error, falling back to download:', err);
      }
    }

    // Fallback: Direct Download of JPG
    downloadBlob(dataUrl, filename);
    return { success: true, shared: false, downloaded: true };
  } catch (error) {
    console.error('Error sharing denomination JPEG:', error);
    alert('Failed to generate JPEG image. Please try again.');
    return { success: false, shared: false, downloaded: false };
  }
}

/**
 * Direct download helper for JPG image
 */
export function downloadBlob(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
