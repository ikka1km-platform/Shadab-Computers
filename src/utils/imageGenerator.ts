import { BusinessProfile, DenominationBreakdown, Transaction } from '../types';
import { formatCurrency, formatDate, formatDateTime, numberToWordsINR } from './formatters';
import { Capacitor, registerPlugin } from '@capacitor/core';

export interface NativeSharePluginInterface {
  shareImage(options: { base64: string; filename: string; title?: string; text?: string; target?: 'whatsapp' | 'all' }): Promise<{ success: boolean; sharedDirectWhatsApp?: boolean }>;
  saveImage(options: { base64: string; filename: string }): Promise<{ success: boolean; filename: string; uri?: string; location?: string }>;
  shareText?(options: { text: string; title?: string; target?: 'whatsapp' | 'all' }): Promise<{ success: boolean }>;
}

export const NativeShare = registerPlugin<NativeSharePluginInterface>('NativeShare');

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

  // 1. Prepare filtered non-zero denomination rows (omit any note with 0 count)
  const allDenomRows = [
    { label: '₹500 Notes', badge: '₹500', count: totalDenoms.c500 || 0, subtotal: (totalDenoms.c500 || 0) * 500, badgeBg: '#f5f5f4', badgeBorder: '#d6d3d1', badgeText: '#1c1917' },
    { label: '₹200 Notes', badge: '₹200', count: totalDenoms.c200 || 0, subtotal: (totalDenoms.c200 || 0) * 200, badgeBg: '#fef3c7', badgeBorder: '#fde68a', badgeText: '#92400e' },
    { label: '₹100 Notes', badge: '₹100', count: totalDenoms.c100 || 0, subtotal: (totalDenoms.c100 || 0) * 100, badgeBg: '#e0e7ff', badgeBorder: '#c7d2fe', badgeText: '#3730a3' },
    { label: '₹50 Notes',  badge: '₹50',  count: totalDenoms.c50 || 0,  subtotal: (totalDenoms.c50 || 0) * 50,  badgeBg: '#cffafe', badgeBorder: '#a5f3fc', badgeText: '#155e75' },
    { label: '₹20 Notes',  badge: '₹20',  count: totalDenoms.c20 || 0,  subtotal: (totalDenoms.c20 || 0) * 20,  badgeBg: '#ffedd5', badgeBorder: '#fed7aa', badgeText: '#9a3412' },
    { label: '₹10 Notes',  badge: '₹10',  count: totalDenoms.c10 || 0,  subtotal: (totalDenoms.c10 || 0) * 10,  badgeBg: '#dcfce7', badgeBorder: '#bbf7d0', badgeText: '#166534' },
    { label: '₹5 Notes',   badge: '₹5',   count: totalDenoms.c5 || 0,   subtotal: (totalDenoms.c5 || 0) * 5,   badgeBg: '#f1f5f9', badgeBorder: '#cbd5e1', badgeText: '#334155' },
    { label: 'Coins (₹)',  badge: 'COIN', count: '-',                   subtotal: totalDenoms.coins || 0,      badgeBg: '#fef9c3', badgeBorder: '#fef08a', badgeText: '#854d0e', isCoin: true },
  ];

  // Only share denomination rows that have a positive count or subtotal
  const activeDenomRows = allDenomRows.filter((r) => 
    (typeof r.count === 'number' && r.count > 0) || (typeof r.subtotal === 'number' && r.subtotal > 0)
  );

  const denomRows = activeDenomRows.length > 0 ? activeDenomRows : [
    { label: 'No Physical Notes Counted', badge: '₹0', count: 0, subtotal: 0, badgeBg: '#f1f5f9', badgeBorder: '#cbd5e1', badgeText: '#64748b' }
  ];

  // Calculate dynamic canvas height strictly for summary + non-zero rows + signatures (no receipt log in JPG)
  const height = 630 + denomRows.length * 36;

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
  const dateLabel = selectedDate === 'ALL' ? 'ALL DATES (CONSOLIDATED)' : formatDate(selectedDate).toUpperCase();
  const dateStr = `DATE: ${dateLabel}`;
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
  const subtitleDate = selectedDate === 'ALL' ? 'all recorded dates' : formatDate(selectedDate);
  ctx.fillText(
    `Official note piece count report generated for ${displayFirm} on ${subtitleDate}`,
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

  curY += totalRowH + 35;

  // 8. Signatures Block
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
  const safeDate = selectedDate === 'ALL' ? 'All_Dates' : selectedDate;
  const filename = `Cash_Note_Retally_${safeFirm}_${safeDate}.jpg`;

  return { blob, dataUrl, filename };
}

/**
 * Triggers native mobile/desktop Web Share API (WhatsApp, Telegram, Gmail, etc.)
 * On Android Capacitor: invokes NativeSharePlugin with attached JPEG directly to WhatsApp.
 */
export async function shareDenominationJPEG(
  options: GenerateImageOptions,
  target: 'whatsapp' | 'all' = 'whatsapp'
): Promise<{ success: boolean; shared: boolean; downloaded: boolean; message?: string }> {
  try {
    const { blob, dataUrl, filename } = await generateDenominationJPEG(options);

    const displayFirm = options.firmName && options.firmName !== 'ALL' && options.firmName !== 'All Firms'
      ? options.firmName
      : 'All Firms Consolidated';

    const dateLabel = options.selectedDate === 'ALL' ? 'All Dates' : formatDate(options.selectedDate);
    const shareTitle = `${displayFirm} - Cash Note Re-Tally (${dateLabel})`;
    const shareText = `📊 Daily Cash Note Re-Tally Sheet for *${displayFirm}* (${dateLabel}).\n\n` +
      `💵 Total Physical Cash: ${formatCurrency(options.totalDenoms.totalAmount || 0)}\n` +
      `🔢 Total Notes: ${options.totalDenoms.totalNotes || 0} Pieces\n` +
      (options.totalDenoms.coins ? `🪙 Coins / Change: ${formatCurrency(options.totalDenoms.coins)}\n` : '') +
      `\nShared from Vyapar Plus App.`;

    const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;

    // 1. Android Native Share Plugin (Direct WhatsApp / System Chooser with attached JPG)
    if (Capacitor.isNativePlatform()) {
      try {
        const res = await NativeShare.shareImage({
          base64: base64Data,
          filename,
          title: shareTitle,
          text: shareText,
          target,
        });
        return {
          success: true,
          shared: true,
          downloaded: false,
          message: res.sharedDirectWhatsApp ? 'Opened WhatsApp with JPG!' : 'Opened Share sheet with JPG!'
        };
      } catch (nativeErr: any) {
        console.warn('NativeSharePlugin failed, falling back to Web Share API:', nativeErr);
      }
    }

    // 2. Web Share API (Safari iOS, Chrome)
    const file = new File([blob], filename, { type: 'image/jpeg' });
    if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          files: [file],
        });
        return { success: true, shared: true, downloaded: false, message: 'Shared via Web Share' };
      } catch (err: any) {
        if (err.name === 'AbortError') {
          return { success: true, shared: false, downloaded: false };
        }
        console.warn('Navigator share error, falling back to download:', err);
      }
    }

    // 3. Fallback: Browser Download (for Desktop browser)
    if (target === 'whatsapp' && typeof window !== 'undefined') {
      const waUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
      window.open(waUrl, '_blank');
    }
    downloadBlob(dataUrl, filename);
    return { success: true, shared: target === 'whatsapp', downloaded: true, message: `Downloaded: ${filename}` };
  } catch (error) {
    console.error('Error sharing denomination JPEG:', error);
    alert('Failed to generate JPEG image. Please try again.');
    return { success: false, shared: false, downloaded: false };
  }
}

/**
 * Saves high-resolution JPEG directly into phone's internal storage (Pictures/Vyapar in MediaStore) on Android,
 * making it immediately visible in Photos/Gallery/Files, or downloads via browser on Web.
 */
export async function saveDenominationJPEG(options: GenerateImageOptions): Promise<{ success: boolean; filePath?: string; filename: string; location?: string }> {
  try {
    const { dataUrl, filename } = await generateDenominationJPEG(options);
    const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;

    if (Capacitor.isNativePlatform()) {
      try {
        const res = await NativeShare.saveImage({
          base64: base64Data,
          filename,
        });
        return {
          success: true,
          filePath: res.uri,
          filename,
          location: res.location || 'Pictures/Vyapar (Phone Storage)'
        };
      } catch (nativeErr) {
        console.warn('Native save failed, downloading as blob:', nativeErr);
      }
    }

    downloadBlob(dataUrl, filename);
    return { success: true, filePath: filename, filename, location: 'Downloads' };
  } catch (error) {
    console.error('Error saving denomination JPEG:', error);
    return { success: false, filename: '' };
  }
}

/**
 * Direct download helper for JPG image (Web only)
 */
export function downloadBlob(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
