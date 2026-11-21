import type {
  AppSettings,
  ClientRecord,
  ReplacementRecord,
  SaleRecord,
  WarrantyPolicy,
  WarrantyStartMode,
  TableDensity,
} from '../types/models.ts';
import { clientStore } from './clientStore.ts';

export interface AppStateResponse {
  clients: ClientRecord[];
  sales: SaleRecord[];
  replacements: ReplacementRecord[];
  settings: AppSettings;
}

type BackendMode = 'remote-sqlite' | 'client-local';

let resolvedModePromise: Promise<BackendMode> | null = null;

export function resetApiBackendDetectionForTests(): void {
  resolvedModePromise = null;
}

async function detectBackendMode(): Promise<BackendMode> {
  if (resolvedModePromise) {
    return resolvedModePromise;
  }

  resolvedModePromise = (async (): Promise<BackendMode> => {
    try {
      const response = await fetch('/api/health', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || !contentType.includes('application/json')) {
        return 'client-local';
      }
      const data = (await response.json()) as { status?: string; persistent?: boolean };
      if (data?.status === 'ok' && data?.persistent === true) {
        return 'remote-sqlite';
      }
      return 'client-local';
    } catch {
      return 'client-local';
    }
  })();

  return resolvedModePromise;
}

async function apiFetch<T>(url: string, init: RequestInit = {}, localFallback?: () => T): Promise<T> {
  const mode = await detectBackendMode();
  if (mode === 'client-local' && localFallback) {
    return localFallback();
  }

  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const response = await fetch(url, {
      ...init,
      headers,
      credentials: 'include',
    });

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await response.json() : await response.text();

    // If a static CDN / SPA fallback answered instead of JSON API (e.g. HTML 404 or 200 index.html),
    // switch cleanly to persistent browser storage so no 404 breaks the user flow.
    if (!isJson && localFallback) {
      resolvedModePromise = Promise.resolve('client-local');
      return localFallback();
    }

    if (!response.ok) {
      const message =
        typeof data === 'object' && data && 'error' in data
          ? String((data as { error: unknown }).error)
          : `Request failed with status ${response.status}`;
      throw new Error(message);
    }

    return data as T;
  } catch (error) {
    if (localFallback && error instanceof TypeError) {
      resolvedModePromise = Promise.resolve('client-local');
      return localFallback();
    }
    throw error;
  }
}

export const api = {
  getState: () =>
    apiFetch<AppStateResponse>('/api/state', {}, () => clientStore.getState()),

  createSale: (payload: {
    clientName: string;
    clientEmail: string;
    accountType: string;
    warrantyDurationDays: number;
    saleDate: string;
    saleTime: string;
    warrantyStartTs: number;
    notes: string;
  }) =>
    apiFetch<{ sale: SaleRecord; client: ClientRecord }>(
      '/api/sales',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      () => clientStore.createSale(payload)
    ),

  updateSale: (
    saleId: string,
    payload: {
      clientName: string;
      clientEmail: string;
      accountType: string;
      warrantyDurationDays: number;
      saleDate: string;
      saleTime: string;
      warrantyStartTs: number;
      recalculateWarranty: boolean;
      notes: string;
    }
  ) =>
    apiFetch<{ sale: SaleRecord }>(
      `/api/sales/${encodeURIComponent(saleId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
      () => clientStore.updateSale(saleId, payload)
    ),

  deleteSale: (saleId: string) =>
    apiFetch<{ success: boolean }>(
      `/api/sales/${encodeURIComponent(saleId)}`,
      {
        method: 'DELETE',
      },
      () => clientStore.deleteSale(saleId)
    ),

  createReplacement: (payload: {
    originalSaleId: string;
    newAccountType: string;
    warrantyPolicy: WarrantyPolicy;
    newWarrantyDurationDays?: number;
    replacementTimestamp: number;
    notes: string;
  }) =>
    apiFetch<{ replacement: ReplacementRecord }>(
      '/api/replacements',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      () => clientStore.createReplacement(payload)
    ),

  updateClient: (clientId: string, payload: { name: string; notes: string }) =>
    apiFetch<{ client: ClientRecord }>(
      `/api/clients/${encodeURIComponent(clientId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
      () => clientStore.updateClient(clientId, payload)
    ),

  deleteClient: (clientId: string) =>
    apiFetch<{ success: boolean }>(
      `/api/clients/${encodeURIComponent(clientId)}`,
      {
        method: 'DELETE',
      },
      () => clientStore.deleteClient(clientId)
    ),

  updateSettings: (payload: {
    expiringSoonThresholdHours: number;
    defaultWarrantyDurationDays: number;
    defaultWarrantyStartMode: WarrantyStartMode;
    tableDensity: TableDensity;
    rememberSessionDays: number;
  }) =>
    apiFetch<{ settings: AppSettings }>(
      '/api/settings',
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
      () => clientStore.updateSettings(payload)
    ),

  downloadBackup: () =>
    apiFetch<{
      version: number;
      exportedAt: string;
      clients: ClientRecord[];
      sales: SaleRecord[];
      replacements: ReplacementRecord[];
      settings: AppSettings;
    }>('/api/backup', {}, () => clientStore.downloadBackup()),

  restoreBackup: (payload: {
    clients: ClientRecord[];
    sales: SaleRecord[];
    replacements: ReplacementRecord[];
    settings?: AppSettings | null;
    mode?: 'replace' | 'merge';
  }) =>
    apiFetch<{ success: boolean }>(
      '/api/restore',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      () => clientStore.restoreBackup(payload)
    ),
};
