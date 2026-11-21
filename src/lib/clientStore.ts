import type {
  AppSettings,
  ClientRecord,
  ReplacementRecord,
  SaleRecord,
  TableDensity,
  WarrantyPolicy,
  WarrantyStartMode,
} from '../types/models.ts';
import {
  createEmptyDatabaseState,
  createReplacementInState,
  createSaleInState,
  deleteClientInState,
  deleteSaleInState,
  exportBackupFromState,
  getSortedState,
  restoreBackupIntoState,
  sanitizeDatabaseState,
  updateClientInState,
  updateSaleInState,
  updateSettingsInState,
  type MuseDatabaseState,
} from './salesEngine.ts';

const STORAGE_KEY = 'muse_sales_manager_db_v1';
let memoryFallbackState: MuseDatabaseState | null = null;

function readClientState(): MuseDatabaseState {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = sanitizeDatabaseState(JSON.parse(raw));
        memoryFallbackState = parsed;
        return parsed;
      }
      const empty = createEmptyDatabaseState();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(empty));
      memoryFallbackState = empty;
      return empty;
    } catch {
      // Fall through to in-memory copy if storage is restricted
    }
  }
  if (!memoryFallbackState) {
    memoryFallbackState = createEmptyDatabaseState();
  }
  return memoryFallbackState;
}

function writeClientState(next: MuseDatabaseState): void {
  memoryFallbackState = next;
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore quota errors while keeping memoryFallbackState active
    }
  }
}

export const clientStore = {
  getState: () => getSortedState(readClientState()),

  createSale: (payload: {
    clientName: string;
    clientEmail: string;
    accountType: string;
    warrantyDurationDays: number;
    saleDate: string;
    saleTime: string;
    warrantyStartTs: number;
    notes: string;
  }) => {
    const res = createSaleInState(readClientState(), payload);
    writeClientState(res.nextState);
    return { sale: res.sale, client: res.client };
  },

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
  ) => {
    const res = updateSaleInState(readClientState(), saleId, payload);
    writeClientState(res.nextState);
    return { sale: res.sale };
  },

  deleteSale: (saleId: string) => {
    const res = deleteSaleInState(readClientState(), saleId);
    writeClientState(res.nextState);
    return { success: true };
  },

  createReplacement: (payload: {
    originalSaleId: string;
    newAccountType: string;
    warrantyPolicy: WarrantyPolicy;
    newWarrantyDurationDays?: number;
    replacementTimestamp: number;
    notes: string;
  }) => {
    const res = createReplacementInState(readClientState(), payload);
    writeClientState(res.nextState);
    return { replacement: res.replacement };
  },

  updateClient: (clientId: string, payload: { name: string; notes: string }) => {
    const res = updateClientInState(readClientState(), clientId, payload);
    writeClientState(res.nextState);
    return { client: res.client };
  },

  deleteClient: (clientId: string) => {
    const res = deleteClientInState(readClientState(), clientId);
    writeClientState(res.nextState);
    return { success: true };
  },

  updateSettings: (payload: {
    expiringSoonThresholdHours: number;
    defaultWarrantyDurationDays: number;
    defaultWarrantyStartMode: WarrantyStartMode;
    tableDensity: TableDensity;
    rememberSessionDays: number;
  }) => {
    const res = updateSettingsInState(readClientState(), payload);
    writeClientState(res.nextState);
    return { settings: res.settings };
  },

  downloadBackup: () => exportBackupFromState(readClientState()),

  restoreBackup: (payload: {
    clients: ClientRecord[];
    sales: SaleRecord[];
    replacements: ReplacementRecord[];
    settings?: AppSettings | null;
    mode?: 'replace' | 'merge';
  }) => {
    const res = restoreBackupIntoState(readClientState(), payload);
    writeClientState(res.nextState);
    return { success: true };
  },
};
