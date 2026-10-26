import { Party } from '../types';

export interface CollectionRoute {
  id: string;
  name: string;
  keywords: string[];
  isDefault?: boolean;
}

const STORAGE_KEY = 'vyapar_collection_routes';

export const DEFAULT_COLLECTION_ROUTES: CollectionRoute[] = [
  {
    id: 'route_dattigaon',
    name: 'Dattigaon Circle',
    keywords: ['dattigaon', 'dhulet', 'bhopawar'],
    isDefault: true,
  },
  {
    id: 'route_ringnod',
    name: 'Ringnod Route',
    keywords: ['ringnod', 'piperni', 'tirla'],
    isDefault: true,
  },
  {
    id: 'route_bhopawar',
    name: 'Bhopawar Circle',
    keywords: ['bhopawar', 'badodiya', 'khamaliya', 'patlawadiya'],
    isDefault: true,
  },
  {
    id: 'route_amzera',
    name: 'Amzera Circle',
    keywords: ['amzera', 'amjhera', 'machaliya'],
    isDefault: true,
  },
  {
    id: 'route_rajgarh',
    name: 'Rajgarh Town',
    keywords: ['rajgarh'],
    isDefault: true,
  },
  {
    id: 'route_sardarpur',
    name: 'Sardarpur',
    keywords: ['sardarpur'],
    isDefault: true,
  },
];

export function getStoredRoutes(): CollectionRoute[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Error reading stored collection routes:', e);
  }
  return DEFAULT_COLLECTION_ROUTES;
}

export function saveStoredRoutes(routes: CollectionRoute[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(routes));
  } catch (e) {
    console.error('Error saving collection routes:', e);
  }
}

export function matchPartyToRoute(party: Party, route: CollectionRoute): boolean {
  if (!route || !route.keywords || route.keywords.length === 0) return true;
  const name = (party.name || '').toLowerCase();
  const address = (party.address || '').toLowerCase();

  return route.keywords.some((kw) => {
    const cleanKw = kw.trim().toLowerCase();
    if (!cleanKw) return false;
    return name.includes(cleanKw) || address.includes(cleanKw);
  });
}
