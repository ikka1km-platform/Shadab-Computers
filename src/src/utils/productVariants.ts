export interface ColorOption {
  name: string;
  hex: string;
}

export const POPULAR_COLORS: ColorOption[] = [
  { name: 'Black', hex: '#0f172a' },
  { name: 'White', hex: '#ffffff' },
  { name: 'Blue', hex: '#2563eb' },
  { name: 'Green', hex: '#16a34a' },
  { name: 'Navy Blue', hex: '#1e3a8a' },
  { name: 'Royal Blue', hex: '#2563eb' },
  { name: 'Sky Blue', hex: '#38bdf8' },
  { name: 'Red', hex: '#dc2626' },
  { name: 'Maroon', hex: '#831843' },
  { name: 'Olive Green', hex: '#4d7c0f' },
  { name: 'Dark Green', hex: '#14532d' },
  { name: 'Yellow', hex: '#eab308' },
  { name: 'Mustard', hex: '#ca8a04' },
  { name: 'Grey', hex: '#64748b' },
  { name: 'Gray', hex: '#64748b' },
  { name: 'Pink', hex: '#ec4899' },
  { name: 'Beige', hex: '#e2d9c8' },
  { name: 'Brown', hex: '#78350f' },
  { name: 'Orange', hex: '#ea580c' },
  { name: 'Purple', hex: '#7e22ce' },
  { name: 'Gold', hex: '#d97706' },
  { name: 'Silver', hex: '#94a3b8' },
];

/**
 * Returns a CSS hex/color code for a given colour name.
 */
export function getColorHex(colorName: string): string {
  if (!colorName) return '#94a3b8';
  const clean = colorName.trim().toLowerCase();
  const found = POPULAR_COLORS.find((c) => c.name.toLowerCase() === clean);
  if (found) return found.hex;
  return clean;
}

/**
 * Normalizes item colors from both colors array and comma/slash separated color string.
 * Supports "blue/white/red/green", "Blue, White, Red", etc.
 */
export function getItemColors(it?: { color?: string; colors?: string[] } | null): string[] {
  if (!it) return [];
  const result: string[] = [];

  const addUnique = (str: string) => {
    if (!str) return;
    str.split(/[,/|]+/).forEach((part) => {
      const trimmed = part.trim();
      if (trimmed && !result.some((r) => r.toLowerCase() === trimmed.toLowerCase())) {
        result.push(trimmed);
      }
    });
  };

  if (it.colors && Array.isArray(it.colors) && it.colors.length > 0) {
    it.colors.forEach(addUnique);
  }
  if (it.color && it.color.trim()) {
    addUnique(it.color);
  }
  return result;
}
