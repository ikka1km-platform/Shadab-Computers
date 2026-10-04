
export function formatCurrency(amount: number, symbol: string = '₹'): string {
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const formatted = absAmount.toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
  return `${isNegative ? '-' : ''}${symbol}${formatted}`;
}

export function formatDate(dateString: string): string {
  if (!dateString || dateString === 'ALL') return 'All Dates';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

export function formatDateTime(dateString: string): string {
  try {
    const d = new Date(dateString);
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return dateString;
  }
}

const singleDigits = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const doubleDigits = [
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function convertLessThanThousand(n: number): string {
  let word = '';
  if (n >= 100) {
    word += singleDigits[Math.floor(n / 100)] + ' Hundred ';
    n %= 100;
  }
  if (n >= 10 && n <= 19) {
    word += doubleDigits[n - 10] + ' ';
  } else if (n >= 20) {
    word += tens[Math.floor(n / 10)] + ' ';
    if (n % 10 > 0) {
      word += singleDigits[n % 10] + ' ';
    }
  } else if (n > 0) {
    word += singleDigits[n] + ' ';
  }
  return word.trim();
}

export function numberToWordsINR(amount: number): string {
  if (amount === 0) return 'Rupees Zero Only';
  const isNegative = amount < 0;
  amount = Math.abs(amount);

  const wholeRupees = Math.floor(amount);
  const paise = Math.round((amount - wholeRupees) * 100);

  let remaining = wholeRupees;
  let words = '';

  const crore = Math.floor(remaining / 10000000);
  remaining %= 10000000;
  if (crore > 0) {
    words += convertLessThanThousand(crore) + ' Crore ';
  }

  const lakh = Math.floor(remaining / 100000);
  remaining %= 100000;
  if (lakh > 0) {
    words += convertLessThanThousand(lakh) + ' Lakh ';
  }

  const thousand = Math.floor(remaining / 1000);
  remaining %= 1000;
  if (thousand > 0) {
    words += convertLessThanThousand(thousand) + ' Thousand ';
  }

  if (remaining > 0) {
    words += convertLessThanThousand(remaining);
  }

  words = words.trim();
  let result = `Rupees ${words}`;
  if (paise > 0) {
    result += ` and ${convertLessThanThousand(paise)} Paise`;
  }
  result += ' Only';

  return isNegative ? `Minus ${result}` : result;
}

/**
 * Compares two transactions in descending order (LATEST entries on top, older on bottom).
 */
export function compareTransactionsDesc(
  a: { date?: string; createdAt?: string; id?: number; voucherNumber?: string },
  b: { date?: string; createdAt?: string; id?: number; voucherNumber?: string }
): number {
  const dateA = a.date ? new Date(a.date.replace(' ', 'T')).getTime() : 0;
  const dateB = b.date ? new Date(b.date.replace(' ', 'T')).getTime() : 0;
  if (!isNaN(dateA) && !isNaN(dateB) && dateB !== dateA) {
    return dateB - dateA;
  }

  const createdA = a.createdAt ? new Date(a.createdAt.replace(' ', 'T')).getTime() : 0;
  const createdB = b.createdAt ? new Date(b.createdAt.replace(' ', 'T')).getTime() : 0;
  if (!isNaN(createdA) && !isNaN(createdB) && createdB !== createdA) {
    return createdB - createdA;
  }

  const idA = a.id || 0;
  const idB = b.id || 0;
  if (idB !== idA) {
    return idB - idA;
  }

  return (b.voucherNumber || '').localeCompare(a.voucherNumber || '');
}

/**
 * Compares two transactions in ascending order (OLDEST entries on top, newer on bottom).
 */
export function compareTransactionsAsc(
  a: { date?: string; createdAt?: string; id?: number; voucherNumber?: string },
  b: { date?: string; createdAt?: string; id?: number; voucherNumber?: string }
): number {
  return -compareTransactionsDesc(a, b);
}
