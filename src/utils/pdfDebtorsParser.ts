import * as pdfjsLib from 'pdfjs-dist';

// Configure pdfjs worker
if (typeof window !== 'undefined') {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  } catch (e) {
    console.warn('Could not set workerSrc via unpkg, falling back:', e);
  }
}

export interface ParsedDebtorRow {
  id: string;
  rawName: string;
  cleanedName: string;
  accountCode?: string;
  closingBalance: number; // positive = Debit, negative = Credit
  rawDebit?: number;
  rawCredit?: number;
  isExcludedAgent: boolean; // Nalchha, JPM, Sajid, Shin Shakti
  excludeReason?: string;
  suggestedFirm: 'KRISHI_SEWA' | 'SHADAB_COMPUTERS';
}

export interface ParsePdfResult {
  reportTitle: string;
  periodText: string;
  rows: ParsedDebtorRow[];
  totalDebit: number;
  totalCredit: number;
}

// Check if customer belongs to the other recovery agent (Auto-Ignore)
export function isOtherAgentAccount(name?: string | null): { isExcluded: boolean; reason?: string } {
  if (!name || typeof name !== 'string') return { isExcluded: false };
  const upper = name.trim().toUpperCase();

  // 1. Nalchha route
  if (/^NALCHHA\b/i.test(upper) || /\bNALCHHA\b/i.test(upper)) {
    return { isExcluded: true, reason: 'Other Agent (Nalchha Route)' };
  }

  // 2. Sajid Phone Account
  if (/SAJID\s+PHONE/i.test(upper)) {
    return { isExcluded: true, reason: 'Other Agent (Sajid Phone Account)' };
  }

  // 3. JPM accounts (Sandeep JPM, Sunil Kulmi JPM, etc.)
  if (/\bJPM\b/i.test(upper)) {
    return { isExcluded: true, reason: 'Other Agent (JPM Route)' };
  }

  // 4. Shin Shakti Kirana Stores Fulgavdi
  if (/FULGAVDI/i.test(upper) || /SHIN\s+SHAKTI\s+KIRANA/i.test(upper)) {
    return { isExcluded: true, reason: 'Other Agent (Fulgavdi Route)' };
  }

  return { isExcluded: false };
}

// Determine if shop defaults to Krishi Sewa Kendra or Shadab Computers
export function getSuggestedFirm(name?: string | null): 'KRISHI_SEWA' | 'SHADAB_COMPUTERS' {
  if (!name || typeof name !== 'string') return 'SHADAB_COMPUTERS';
  const upper = name.trim().toUpperCase();
  // Amzera shops belong to Krishi Sewa Kendra
  if (/^AMZERA\b/i.test(upper) || /^AMZREA\b/i.test(upper) || /\bAMZERA\b/i.test(upper)) {
    return 'KRISHI_SEWA';
  }
  return 'SHADAB_COMPUTERS';
}

// Extract customer ID code if present in name (e.g. "660694209")
export function extractCustomerCode(name?: string | null): { cleanedName: string; code?: string } {
  if (!name || typeof name !== 'string') return { cleanedName: '' };
  // Check for 5 to 12 digit customer ID code in the string (e.g. 660455, 660694209, 662069870)
  const match = name.match(/\b(\d{5,12})\b/);
  if (match) {
    return {
      cleanedName: name.trim(),
      code: match[1],
    };
  }
  return {
    cleanedName: name.trim(),
  };
}

/**
 * Parses a Sundry Debtors PDF file buffer or ArrayBuffer
 */
export async function parseDebtorsPdf(fileData: ArrayBuffer): Promise<ParsePdfResult> {
  const loadingTask = pdfjsLib.getDocument({ data: fileData });
  const pdfDoc = await loadingTask.promise;

  let reportTitle = 'SHADAB COMPUTERS - Sundry Debtors';
  let periodText = '';
  const rawRows: { name: string; debit?: number; credit?: number }[] = [];

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const items = textContent.items as any[];

    // Group items by vertical position Y (within 4 pixels tolerance)
    const lineMap: { [yKey: number]: { x: number; text: string }[] } = {};

    for (const item of items) {
      if (!item.str || item.str.trim() === '') continue;
      const y = Math.round(item.transform[5]);
      const x = Math.round(item.transform[4]);

      // Find an existing y bucket within +/- 3 pixels
      let matchedKey: number | null = null;
      for (const k of Object.keys(lineMap)) {
        const numK = Number(k);
        if (Math.abs(numK - y) <= 3) {
          matchedKey = numK;
          break;
        }
      }

      const key = matchedKey !== null ? matchedKey : y;
      if (!lineMap[key]) lineMap[key] = [];
      lineMap[key].push({ x, text: item.str });
    }

    // Sort Y in descending order (top of page to bottom)
    const sortedY = Object.keys(lineMap)
      .map(Number)
      .sort((a, b) => b - a);

    for (const y of sortedY) {
      const lineItems = lineMap[y].sort((a, b) => a.x - b.x);
      const fullLineText = lineItems.map((i) => i.text).join(' ').trim();

      if (!fullLineText) continue;

      // Extract Period info if present
      if (/1-Apr-\d+\s+to\s+1-\w+-\d+/i.test(fullLineText)) {
        periodText = fullLineText;
        continue;
      }

      // Skip header lines
      if (
        /Particulars/i.test(fullLineText) ||
        /Closing Balance/i.test(fullLineText) ||
        /Debit\s+Credit/i.test(fullLineText) ||
        /Group Summary/i.test(fullLineText) ||
        /SHADAB COMPUTERS/i.test(fullLineText) ||
        /Sundry Debtors/i.test(fullLineText)
      ) {
        continue;
      }

      // Check for Grand Total row
      if (/Grand Total/i.test(fullLineText)) {
        continue;
      }

      // Parse Party Name + Amount(s)
      // Usually: [Name] [Debit] or [Name] [Debit] [Credit] or [Name] [Credit]
      // Search for numbers at the end of the line
      // E.g.: "AMZERA AMIT PAN SADAN 1500.00" -> Name: "AMZERA AMIT PAN SADAN", Amount: 1500.00
      // Or Credit column like "SHIN SHAKTI KIRANA STORS FULGAVDI 4316.00"
      
      // Look at the line items x positions to identify columns if possible
      // In Tally reports: Name is at x ~ 50-80, Debit is at x ~ 400-500, Credit is at x ~ 500-600
      let nameParts: string[] = [];
      let debitVal: number | undefined;
      let creditVal: number | undefined;

      // Parse amounts from the trailing items
      // Check from right to left
      const tokens = fullLineText.split(/\s+/);
      const lastToken = tokens[tokens.length - 1]?.replace(/,/g, '');
      const secondLastToken = tokens[tokens.length - 2]?.replace(/,/g, '');

      // A customer ID is a 5-12 digit integer (e.g. 660455, 662069870, 661994459, 660556255, 660694209, 661506489)
      // Customer IDs NEVER have decimal points, whereas currency amounts ALWAYS have .XX or are typical balances
      const isCustomerIdCode = (s: string) => {
        if (!s) return false;
        const clean = s.replace(/,/g, '');
        return /^\d{5,12}$/.test(clean);
      };

      const isAmount = (s: string) => {
        if (!s) return false;
        const clean = s.replace(/,/g, '');
        if (isNaN(Number(clean)) || clean === '') return false;
        if (isCustomerIdCode(clean)) return false;
        return /^\d+(\.\d+)?$/.test(clean);
      };

      if (isAmount(lastToken)) {
        const val1 = parseFloat(lastToken);
        // If line has "FULGAVDI" or "SHIN SHAKTI", it belongs to Credit column; otherwise Debit
        if (/FULGAVDI/i.test(fullLineText) || /SHIN SHAKTI/i.test(fullLineText)) {
          creditVal = val1;
        } else {
          debitVal = val1;
        }
        nameParts = tokens.slice(0, tokens.length - 1);

        const partyName = nameParts.join(' ').trim();
        if (partyName && partyName.length > 2) {
          rawRows.push({
            name: partyName,
            debit: debitVal,
            credit: creditVal,
          });
        }
      }
    }
  }

  // Deduplicate and build final parsed rows
  const parsedRows: ParsedDebtorRow[] = [];
  let totalDebit = 0;
  let totalCredit = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const { cleanedName, code } = extractCustomerCode(row.name);
    const { isExcluded, reason } = isOtherAgentAccount(cleanedName);
    const suggestedFirm = getSuggestedFirm(cleanedName);

    const debit = row.debit || 0;
    const credit = row.credit || 0;

    totalDebit += debit;
    totalCredit += credit;

    // In sundry debtors, Debit is positive receivable (Lena hai), Credit is negative payable/advance (Dena hai)
    const closingBalance = debit > 0 ? debit : -credit;

    parsedRows.push({
      id: `ROW_${i}_${Date.now().toString(36)}`,
      rawName: row.name,
      cleanedName,
      accountCode: code,
      closingBalance,
      rawDebit: debit,
      rawCredit: credit,
      isExcludedAgent: isExcluded,
      excludeReason: reason,
      suggestedFirm,
    });
  }

  return {
    reportTitle,
    periodText,
    rows: parsedRows,
    totalDebit,
    totalCredit,
  };
}
