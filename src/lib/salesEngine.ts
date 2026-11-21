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
  calculateWarrantyExpiryTs,
  computeReplacementWarranty,
  isValidAccountType,
  isValidWarrantyDuration,
  parseAccountVolumeBillions,
  parseDateAndTimeToTimestamp,
} from '../utils/warranty.ts';

export interface MuseDatabaseState {
  clients: ClientRecord[];
  sales: SaleRecord[];
  replacements: ReplacementRecord[];
  settings: AppSettings;
}

export class EngineError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'EngineError';
    this.status = status;
  }
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  expiringSoonThresholdHours: 48,
  defaultWarrantyDurationDays: 10,
  defaultWarrantyStartMode: 'SALE_TIME',
  tableDensity: 'COMFORTABLE',
  rememberSessionDays: 30,
  updatedAt: 0,
};

export function createEmptyDatabaseState(now: number = Date.now()): MuseDatabaseState {
  return {
    clients: [],
    sales: [],
    replacements: [],
    settings: {
      ...DEFAULT_APP_SETTINGS,
      updatedAt: now,
    },
  };
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function randomSixDigit(): number {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    const arr = new Uint32Array(1);
    globalThis.crypto.getRandomValues(arr);
    return 100000 + (arr[0] % 899999);
  }
  return 100000 + Math.floor(Math.random() * 899999);
}

export function generateId(prefix: string): string {
  return `${prefix}_${randomHex(6)}`;
}

export function generateCode(prefix: string, existingCodes?: Set<string>): string {
  let code = `${prefix}-${randomSixDigit()}`;
  let attempts = 0;
  while (existingCodes && existingCodes.has(code) && attempts < 20) {
    code = `${prefix}-${randomSixDigit()}`;
    attempts += 1;
  }
  return code;
}

export function cloneDatabaseState(state: MuseDatabaseState): MuseDatabaseState {
  return {
    clients: state.clients.map((c) => ({ ...c })),
    sales: state.sales.map((s) => ({ ...s })),
    replacements: state.replacements.map((r) => ({ ...r })),
    settings: { ...state.settings },
  };
}

export function sanitizeDatabaseState(raw: unknown): MuseDatabaseState {
  const base = createEmptyDatabaseState();
  if (!raw || typeof raw !== 'object') return base;
  const obj = raw as Partial<MuseDatabaseState>;

  const clients: ClientRecord[] = Array.isArray(obj.clients)
    ? obj.clients
        .filter((c): c is ClientRecord => Boolean(c && typeof c.id === 'string' && typeof c.email === 'string'))
        .map((c) => ({
          id: String(c.id),
          name: String(c.name || c.email),
          email: String(c.email).trim().toLowerCase(),
          notes: String(c.notes ?? ''),
          createdAt: Number(c.createdAt || Date.now()),
          updatedAt: Number(c.updatedAt || Date.now()),
        }))
    : [];

  const sales: SaleRecord[] = Array.isArray(obj.sales)
    ? obj.sales
        .filter((s): s is SaleRecord => Boolean(s && typeof s.id === 'string' && typeof s.clientId === 'string'))
        .map((s) => ({
          id: String(s.id),
          saleCode: String(s.saleCode || generateCode('MS')),
          clientId: String(s.clientId),
          clientName: String(s.clientName || ''),
          clientEmail: String(s.clientEmail || '').trim().toLowerCase(),
          accountType: String(s.accountType || '1 Billion'),
          accountVolumeBillions: Number(s.accountVolumeBillions || parseAccountVolumeBillions(String(s.accountType || '1 Billion')) || 1),
          saleDate: String(s.saleDate || '2026-01-01'),
          saleTime: String(s.saleTime || '00:00'),
          saleTimestamp: Number(s.saleTimestamp || Date.now()),
          warrantyDurationDays: Number(s.warrantyDurationDays || 1),
          warrantyStartTs: Number(s.warrantyStartTs || Date.now()),
          warrantyExpiryTs: Number(s.warrantyExpiryTs || Date.now()),
          notes: String(s.notes ?? ''),
          replacementCount: Number(s.replacementCount ?? 0),
          createdAt: Number(s.createdAt || Date.now()),
          updatedAt: Number(s.updatedAt || Date.now()),
        }))
    : [];

  const replacements: ReplacementRecord[] = Array.isArray(obj.replacements)
    ? obj.replacements
        .filter(
          (r): r is ReplacementRecord =>
            Boolean(r && typeof r.id === 'string' && typeof r.originalSaleId === 'string' && typeof r.clientId === 'string')
        )
        .map((r) => ({
          id: String(r.id),
          replacementCode: String(r.replacementCode || generateCode('REP')),
          originalSaleId: String(r.originalSaleId),
          clientId: String(r.clientId),
          originalAccountType: String(r.originalAccountType || '1 Billion'),
          newAccountType: String(r.newAccountType || '1 Billion'),
          replacementTimestamp: Number(r.replacementTimestamp || Date.now()),
          warrantyPolicy: r.warrantyPolicy === 'START_NEW' ? 'START_NEW' : 'CONTINUE_ORIGINAL',
          warrantyDurationDays: Number(r.warrantyDurationDays || 1),
          warrantyStartTs: Number(r.warrantyStartTs || Date.now()),
          warrantyExpiryTs: Number(r.warrantyExpiryTs || Date.now()),
          notes: String(r.notes ?? ''),
          createdAt: Number(r.createdAt || Date.now()),
        }))
    : [];

  const s = obj.settings;
  const settings: AppSettings =
    s && typeof s === 'object'
      ? {
          expiringSoonThresholdHours: Math.min(360, Math.max(1, Math.floor(Number(s.expiringSoonThresholdHours || 48)))),
          defaultWarrantyDurationDays: isValidWarrantyDuration(Number(s.defaultWarrantyDurationDays))
            ? Number(s.defaultWarrantyDurationDays)
            : 10,
          defaultWarrantyStartMode: s.defaultWarrantyStartMode === 'CUSTOM' ? 'CUSTOM' : 'SALE_TIME',
          tableDensity: s.tableDensity === 'COMPACT' ? 'COMPACT' : 'COMFORTABLE',
          rememberSessionDays: Math.min(90, Math.max(1, Math.floor(Number(s.rememberSessionDays || 30)))),
          updatedAt: Number(s.updatedAt || Date.now()),
        }
      : { ...DEFAULT_APP_SETTINGS, updatedAt: Date.now() };

  return { clients, sales, replacements, settings };
}

export function getSortedState(state: MuseDatabaseState): MuseDatabaseState {
  const copy = cloneDatabaseState(state);
  copy.clients.sort((a, b) => b.createdAt - a.createdAt);
  copy.sales.sort((a, b) => b.saleTimestamp - a.saleTimestamp);
  copy.replacements.sort((a, b) => b.replacementTimestamp - a.replacementTimestamp);
  return copy;
}

export function createSaleInState(
  state: MuseDatabaseState,
  payload: {
    clientName: string;
    clientEmail: string;
    accountType: string;
    warrantyDurationDays: number;
    saleDate: string;
    saleTime: string;
    warrantyStartTs: number;
    notes?: string;
  },
  now: number = Date.now()
): { nextState: MuseDatabaseState; sale: SaleRecord; client: ClientRecord } {
  const {
    clientName,
    clientEmail,
    accountType,
    warrantyDurationDays,
    saleDate,
    saleTime,
    warrantyStartTs,
    notes = '',
  } = payload;

  if (typeof clientName !== 'string' || !clientName.trim()) {
    throw new EngineError(400, 'Client Name is required.');
  }
  if (typeof clientEmail !== 'string' || !isValidEmail(clientEmail.trim())) {
    throw new EngineError(400, 'A valid Client Email is required.');
  }
  if (typeof accountType !== 'string' || !isValidAccountType(accountType)) {
    throw new EngineError(400, 'Please select a valid Account Type (1 Billion – 31 Billion).');
  }
  const duration = Number(warrantyDurationDays);
  if (!isValidWarrantyDuration(duration)) {
    throw new EngineError(400, 'Warranty Duration must be between 1 and 25 days.');
  }
  if (typeof saleDate !== 'string' || typeof saleTime !== 'string') {
    throw new EngineError(400, 'Sale Date and Sale Time are required.');
  }

  let saleTimestamp: number;
  try {
    saleTimestamp = parseDateAndTimeToTimestamp(saleDate, saleTime);
  } catch (err) {
    throw new EngineError(400, err instanceof Error ? err.message : 'Invalid sale date/time.');
  }

  const startTs =
    typeof warrantyStartTs === 'number' && Number.isFinite(warrantyStartTs) && warrantyStartTs > 0
      ? Math.floor(warrantyStartTs)
      : saleTimestamp;
  const expiryTs = calculateWarrantyExpiryTs(startTs, duration);
  const volumeBillions = parseAccountVolumeBillions(accountType);
  const normalizedEmail = clientEmail.trim().toLowerCase();
  const cleanName = clientName.trim().slice(0, 160);
  const cleanNotes = typeof notes === 'string' ? notes.trim().slice(0, 2000) : '';

  const nextState = cloneDatabaseState(state);

  let client = nextState.clients.find((c) => c.email.toLowerCase() === normalizedEmail);
  if (!client) {
    client = {
      id: generateId('cli'),
      name: cleanName,
      email: normalizedEmail,
      notes: '',
      createdAt: now,
      updatedAt: now,
    };
    nextState.clients.unshift(client);
  } else {
    client.name = cleanName;
    client.updatedAt = now;
  }

  const existingCodes = new Set(nextState.sales.map((s) => s.saleCode));
  const sale: SaleRecord = {
    id: generateId('sale'),
    saleCode: generateCode('MS', existingCodes),
    clientId: client.id,
    clientName: cleanName,
    clientEmail: normalizedEmail,
    accountType: `${volumeBillions} Billion`,
    accountVolumeBillions: volumeBillions,
    saleDate: saleDate.trim(),
    saleTime: saleTime.trim(),
    saleTimestamp,
    warrantyDurationDays: duration,
    warrantyStartTs: startTs,
    warrantyExpiryTs: expiryTs,
    notes: cleanNotes,
    replacementCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  nextState.sales.unshift(sale);
  return { nextState, sale, client: { ...client } };
}

export function updateSaleInState(
  state: MuseDatabaseState,
  saleId: string,
  payload: {
    clientName?: string;
    clientEmail?: string;
    accountType?: string;
    warrantyDurationDays?: number;
    saleDate?: string;
    saleTime?: string;
    warrantyStartTs?: number;
    recalculateWarranty?: boolean;
    notes?: string;
  },
  now: number = Date.now()
): { nextState: MuseDatabaseState; sale: SaleRecord } {
  const nextState = cloneDatabaseState(state);
  const idx = nextState.sales.findIndex((s) => s.id === saleId);
  if (idx === -1) {
    throw new EngineError(404, 'Sale record not found.');
  }

  const existing = nextState.sales[idx];
  const {
    clientName,
    clientEmail,
    accountType,
    warrantyDurationDays,
    saleDate,
    saleTime,
    warrantyStartTs,
    recalculateWarranty,
    notes,
  } = payload;

  const cleanName =
    typeof clientName === 'string' && clientName.trim()
      ? clientName.trim().slice(0, 160)
      : existing.clientName;
  const cleanEmail =
    typeof clientEmail === 'string' && isValidEmail(clientEmail.trim())
      ? clientEmail.trim().toLowerCase()
      : existing.clientEmail;
  const nextAccountType =
    typeof accountType === 'string' && isValidAccountType(accountType)
      ? `${parseAccountVolumeBillions(accountType)} Billion`
      : existing.accountType;
  const nextVolume = parseAccountVolumeBillions(nextAccountType);

  const nextSaleDate =
    typeof saleDate === 'string' && saleDate.trim() ? saleDate.trim() : existing.saleDate;
  const nextSaleTime =
    typeof saleTime === 'string' && saleTime.trim() ? saleTime.trim() : existing.saleTime;

  let nextSaleTimestamp: number;
  try {
    nextSaleTimestamp = parseDateAndTimeToTimestamp(nextSaleDate, nextSaleTime);
  } catch (err) {
    throw new EngineError(400, err instanceof Error ? err.message : 'Invalid sale date/time.');
  }

  const nextDuration =
    warrantyDurationDays !== undefined && isValidWarrantyDuration(Number(warrantyDurationDays))
      ? Number(warrantyDurationDays)
      : existing.warrantyDurationDays;

  const nextStartTs =
    typeof warrantyStartTs === 'number' && Number.isFinite(warrantyStartTs) && warrantyStartTs > 0
      ? Math.floor(warrantyStartTs)
      : existing.warrantyStartTs;

  const warrantyIntentChanged =
    Boolean(recalculateWarranty) ||
    nextDuration !== existing.warrantyDurationDays ||
    nextStartTs !== existing.warrantyStartTs;

  const nextExpiryTs = warrantyIntentChanged
    ? calculateWarrantyExpiryTs(nextStartTs, nextDuration)
    : existing.warrantyExpiryTs;

  const cleanNotes =
    typeof notes === 'string' ? notes.trim().slice(0, 2000) : existing.notes;

  let clientId = existing.clientId;
  if (cleanEmail !== existing.clientEmail) {
    const matchedClient = nextState.clients.find((c) => c.email.toLowerCase() === cleanEmail);
    if (matchedClient) {
      clientId = matchedClient.id;
      matchedClient.name = cleanName;
      matchedClient.updatedAt = now;
    } else {
      clientId = generateId('cli');
      nextState.clients.unshift({
        id: clientId,
        name: cleanName,
        email: cleanEmail,
        notes: '',
        createdAt: now,
        updatedAt: now,
      });
    }
  } else {
    const currentClient = nextState.clients.find((c) => c.id === clientId);
    if (currentClient) {
      currentClient.name = cleanName;
      currentClient.updatedAt = now;
    }
  }

  const updatedSale: SaleRecord = {
    ...existing,
    clientId,
    clientName: cleanName,
    clientEmail: cleanEmail,
    accountType: nextAccountType,
    accountVolumeBillions: nextVolume,
    saleDate: nextSaleDate,
    saleTime: nextSaleTime,
    saleTimestamp: nextSaleTimestamp,
    warrantyDurationDays: nextDuration,
    warrantyStartTs: nextStartTs,
    warrantyExpiryTs: nextExpiryTs,
    notes: cleanNotes,
    updatedAt: now,
  };

  nextState.sales[idx] = updatedSale;
  return { nextState, sale: updatedSale };
}

export function deleteSaleInState(
  state: MuseDatabaseState,
  saleId: string
): { nextState: MuseDatabaseState } {
  const exists = state.sales.some((s) => s.id === saleId);
  if (!exists) {
    throw new EngineError(404, 'Sale record not found.');
  }
  const nextState = cloneDatabaseState(state);
  nextState.sales = nextState.sales.filter((s) => s.id !== saleId);
  nextState.replacements = nextState.replacements.filter((r) => r.originalSaleId !== saleId);
  return { nextState };
}

export function createReplacementInState(
  state: MuseDatabaseState,
  payload: {
    originalSaleId: string;
    newAccountType: string;
    warrantyPolicy: WarrantyPolicy;
    newWarrantyDurationDays?: number;
    replacementTimestamp?: number;
    notes?: string;
  },
  now: number = Date.now()
): { nextState: MuseDatabaseState; replacement: ReplacementRecord } {
  const {
    originalSaleId,
    newAccountType,
    warrantyPolicy,
    newWarrantyDurationDays,
    replacementTimestamp,
    notes = '',
  } = payload;

  if (typeof originalSaleId !== 'string' || !originalSaleId) {
    throw new EngineError(400, 'Original Sale ID is required.');
  }
  if (typeof newAccountType !== 'string' || !isValidAccountType(newAccountType)) {
    throw new EngineError(400, 'Valid New Account Type (1–31 Billion) is required.');
  }
  if (warrantyPolicy !== 'CONTINUE_ORIGINAL' && warrantyPolicy !== 'START_NEW') {
    throw new EngineError(400, 'Valid Replacement Warranty Policy is required.');
  }

  const nextState = cloneDatabaseState(state);
  const sale = nextState.sales.find((s) => s.id === originalSaleId);
  if (!sale) {
    throw new EngineError(404, 'Original sale record not found.');
  }

  const repTs =
    typeof replacementTimestamp === 'number' && Number.isFinite(replacementTimestamp)
      ? Math.floor(replacementTimestamp)
      : now;

  let computedWarranty;
  try {
    computedWarranty = computeReplacementWarranty({
      policy: warrantyPolicy,
      originalWarrantyDurationDays: sale.warrantyDurationDays,
      originalWarrantyStartTs: sale.warrantyStartTs,
      originalWarrantyExpiryTs: sale.warrantyExpiryTs,
      replacementTimestamp: repTs,
      newWarrantyDurationDays:
        newWarrantyDurationDays !== undefined ? Number(newWarrantyDurationDays) : undefined,
    });
  } catch (err) {
    throw new EngineError(
      400,
      err instanceof Error ? err.message : 'Invalid replacement warranty configuration.'
    );
  }

  const normalizedNewType = `${parseAccountVolumeBillions(newAccountType)} Billion`;
  const cleanNotes = typeof notes === 'string' ? notes.trim().slice(0, 2000) : '';
  const existingRepCodes = new Set(nextState.replacements.map((r) => r.replacementCode));

  const replacement: ReplacementRecord = {
    id: generateId('rep'),
    replacementCode: generateCode('REP', existingRepCodes),
    originalSaleId: sale.id,
    clientId: sale.clientId,
    originalAccountType: sale.accountType,
    newAccountType: normalizedNewType,
    replacementTimestamp: repTs,
    warrantyPolicy,
    warrantyDurationDays: computedWarranty.warrantyDurationDays,
    warrantyStartTs: computedWarranty.warrantyStartTs,
    warrantyExpiryTs: computedWarranty.warrantyExpiryTs,
    notes: cleanNotes,
    createdAt: now,
  };

  nextState.replacements.unshift(replacement);
  sale.replacementCount += 1;
  sale.updatedAt = now;

  return { nextState, replacement };
}

export function updateClientInState(
  state: MuseDatabaseState,
  clientId: string,
  payload: { name?: string; notes?: string },
  now: number = Date.now()
): { nextState: MuseDatabaseState; client: ClientRecord } {
  const nextState = cloneDatabaseState(state);
  const client = nextState.clients.find((c) => c.id === clientId);
  if (!client) {
    throw new EngineError(404, 'Client not found.');
  }

  const nextName =
    typeof payload.name === 'string' && payload.name.trim()
      ? payload.name.trim().slice(0, 160)
      : client.name;
  const nextNotes =
    typeof payload.notes === 'string' ? payload.notes.trim().slice(0, 2000) : client.notes;

  client.name = nextName;
  client.notes = nextNotes;
  client.updatedAt = now;

  return { nextState, client: { ...client } };
}

export function deleteClientInState(
  state: MuseDatabaseState,
  clientId: string
): { nextState: MuseDatabaseState } {
  const exists = state.clients.some((c) => c.id === clientId);
  if (!exists) {
    throw new EngineError(404, 'Client not found.');
  }

  const nextState = cloneDatabaseState(state);
  nextState.clients = nextState.clients.filter((c) => c.id !== clientId);
  const removedSaleIds = new Set(
    nextState.sales.filter((s) => s.clientId === clientId).map((s) => s.id)
  );
  nextState.sales = nextState.sales.filter((s) => s.clientId !== clientId);
  nextState.replacements = nextState.replacements.filter(
    (r) => r.clientId !== clientId && !removedSaleIds.has(r.originalSaleId)
  );
  return { nextState };
}

export function updateSettingsInState(
  state: MuseDatabaseState,
  payload: {
    expiringSoonThresholdHours?: number;
    defaultWarrantyDurationDays?: number;
    defaultWarrantyStartMode?: WarrantyStartMode;
    tableDensity?: TableDensity;
    rememberSessionDays?: number;
  },
  now: number = Date.now()
): { nextState: MuseDatabaseState; settings: AppSettings } {
  const nextState = cloneDatabaseState(state);
  const current = nextState.settings;

  const thresholdNum = Number(payload.expiringSoonThresholdHours);
  const nextThreshold =
    payload.expiringSoonThresholdHours !== undefined && Number.isFinite(thresholdNum)
      ? Math.min(360, Math.max(1, Math.floor(thresholdNum)))
      : current.expiringSoonThresholdHours;

  const nextDefaultDuration =
    payload.defaultWarrantyDurationDays !== undefined &&
    isValidWarrantyDuration(Number(payload.defaultWarrantyDurationDays))
      ? Number(payload.defaultWarrantyDurationDays)
      : current.defaultWarrantyDurationDays;

  const nextStartMode: WarrantyStartMode =
    payload.defaultWarrantyStartMode === 'SALE_TIME' ||
    payload.defaultWarrantyStartMode === 'CUSTOM'
      ? payload.defaultWarrantyStartMode
      : current.defaultWarrantyStartMode;

  const nextDensity: TableDensity =
    payload.tableDensity === 'COMFORTABLE' || payload.tableDensity === 'COMPACT'
      ? payload.tableDensity
      : current.tableDensity;

  const rememberNum = Number(payload.rememberSessionDays);
  const nextRememberDays =
    payload.rememberSessionDays !== undefined && Number.isFinite(rememberNum)
      ? Math.min(90, Math.max(1, Math.floor(rememberNum)))
      : current.rememberSessionDays;

  const updated: AppSettings = {
    expiringSoonThresholdHours: nextThreshold,
    defaultWarrantyDurationDays: nextDefaultDuration,
    defaultWarrantyStartMode: nextStartMode,
    tableDensity: nextDensity,
    rememberSessionDays: nextRememberDays,
    updatedAt: now,
  };

  nextState.settings = updated;
  return { nextState, settings: { ...updated } };
}

export function exportBackupFromState(state: MuseDatabaseState) {
  const sorted = getSortedState(state);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    clients: sorted.clients,
    sales: sorted.sales,
    replacements: sorted.replacements,
    settings: sorted.settings,
  };
}

export function restoreBackupIntoState(
  state: MuseDatabaseState,
  payload: {
    clients: ClientRecord[];
    sales: SaleRecord[];
    replacements: ReplacementRecord[];
    settings?: AppSettings | null;
    mode?: 'replace' | 'merge';
  },
  now: number = Date.now()
): { nextState: MuseDatabaseState } {
  const { clients, sales, replacements, settings, mode = 'replace' } = payload ?? {};
  if (!Array.isArray(clients) || !Array.isArray(sales) || !Array.isArray(replacements)) {
    throw new EngineError(400, 'Invalid backup structure.');
  }

  const nextState =
    mode === 'replace'
      ? {
          clients: [],
          sales: [],
          replacements: [],
          settings: { ...state.settings },
        }
      : cloneDatabaseState(state);

  const clientMap = new Map(nextState.clients.map((c) => [c.id, c]));
  for (const c of clients) {
    if (!c?.id || !c?.email) continue;
    const id = String(c.id);
    const existing = clientMap.get(id);
    const merged: ClientRecord = {
      id,
      name: String(c.name || c.email),
      email: String(c.email).trim().toLowerCase(),
      notes: String(c.notes || ''),
      createdAt: existing ? Math.min(existing.createdAt, Number(c.createdAt || now)) : Number(c.createdAt || now),
      updatedAt: existing ? Math.max(existing.updatedAt, Number(c.updatedAt || now)) : Number(c.updatedAt || now),
    };
    clientMap.set(id, merged);
  }
  nextState.clients = Array.from(clientMap.values());

  const saleMap = new Map(nextState.sales.map((s) => [s.id, s]));
  const existingCodes = new Set(nextState.sales.map((s) => s.saleCode));
  for (const s of sales) {
    if (!s?.id || !s?.clientId) continue;
    const id = String(s.id);
    const existing = saleMap.get(id);
    const saleCode = existing?.saleCode || String(s.saleCode || generateCode('MS', existingCodes));
    existingCodes.add(saleCode);
    const merged: SaleRecord = {
      id,
      saleCode,
      clientId: String(s.clientId),
      clientName: String(s.clientName || ''),
      clientEmail: String(s.clientEmail || '').trim().toLowerCase(),
      accountType: String(s.accountType || '1 Billion'),
      accountVolumeBillions: Number(s.accountVolumeBillions || 1),
      saleDate: String(s.saleDate || '2026-01-01'),
      saleTime: String(s.saleTime || '00:00'),
      saleTimestamp: Number(s.saleTimestamp || now),
      warrantyDurationDays: Number(s.warrantyDurationDays || 1),
      warrantyStartTs: Number(s.warrantyStartTs || now),
      warrantyExpiryTs: Number(s.warrantyExpiryTs || now),
      notes: String(s.notes || ''),
      replacementCount: Number(s.replacementCount || 0),
      createdAt: existing ? Math.min(existing.createdAt, Number(s.createdAt || now)) : Number(s.createdAt || now),
      updatedAt: existing ? Math.max(existing.updatedAt, Number(s.updatedAt || now)) : Number(s.updatedAt || now),
    };
    saleMap.set(id, merged);
  }
  nextState.sales = Array.from(saleMap.values());

  const repMap = new Map(nextState.replacements.map((r) => [r.id, r]));
  const existingRepCodes = new Set(nextState.replacements.map((r) => r.replacementCode));
  for (const r of replacements) {
    if (!r?.id || !r?.originalSaleId || !r?.clientId) continue;
    const id = String(r.id);
    if (repMap.has(id)) continue;
    const repCode = String(r.replacementCode || generateCode('REP', existingRepCodes));
    existingRepCodes.add(repCode);
    repMap.set(id, {
      id,
      replacementCode: repCode,
      originalSaleId: String(r.originalSaleId),
      clientId: String(r.clientId),
      originalAccountType: String(r.originalAccountType || '1 Billion'),
      newAccountType: String(r.newAccountType || '1 Billion'),
      replacementTimestamp: Number(r.replacementTimestamp || now),
      warrantyPolicy: r.warrantyPolicy === 'START_NEW' ? 'START_NEW' : 'CONTINUE_ORIGINAL',
      warrantyDurationDays: Number(r.warrantyDurationDays || 1),
      warrantyStartTs: Number(r.warrantyStartTs || now),
      warrantyExpiryTs: Number(r.warrantyExpiryTs || now),
      notes: String(r.notes || ''),
      createdAt: Number(r.createdAt || now),
    });
  }
  nextState.replacements = Array.from(repMap.values());

  if (settings && typeof settings === 'object') {
    nextState.settings = sanitizeDatabaseState({ settings }).settings;
  }

  return { nextState };
}

export interface MergeDatabaseResult {
  merged: MuseDatabaseState;
  needsCloudUpload: boolean;
}

/**
 * Merges local browser/SQLite records with remote Cloud Firestore records without losing data.
 * Deduplicates clients by normalized email, maps orphaned local clientIds to canonical remote clientIds,
 * preserves remote immutable fields (`createdAt`, `saleCode`), and indicates if local has newer/extra records to push.
 */
export function mergeDatabaseStates(
  localInput: MuseDatabaseState,
  remoteInput: Omit<Partial<MuseDatabaseState>, 'settings'> & { settings?: AppSettings | null }
): MergeDatabaseResult {
  const local = sanitizeDatabaseState(localInput);
  const remote = sanitizeDatabaseState({
    clients: remoteInput.clients ?? [],
    sales: remoteInput.sales ?? [],
    replacements: remoteInput.replacements ?? [],
    settings: remoteInput.settings ?? local.settings,
  });

  let needsCloudUpload = false;

  // 1. Merge clients: canonicalize by normalized email first, then id
  const clientById = new Map<string, ClientRecord>();
  const clientIdByEmail = new Map<string, string>();
  const clientRemap = new Map<string, string>();

  for (const rc of remote.clients) {
    const email = rc.email.trim().toLowerCase();
    clientById.set(rc.id, { ...rc, email });
    if (email) clientIdByEmail.set(email, rc.id);
  }

  for (const lc of local.clients) {
    const email = lc.email.trim().toLowerCase();
    const canonicalId = (email && clientIdByEmail.get(email)) || lc.id;
    if (canonicalId !== lc.id) {
      clientRemap.set(lc.id, canonicalId);
    }

    const existing = clientById.get(canonicalId);
    if (!existing) {
      clientById.set(canonicalId, { ...lc, id: canonicalId, email });
      if (email) clientIdByEmail.set(email, canonicalId);
      needsCloudUpload = true;
    } else if (lc.updatedAt > existing.updatedAt && (lc.name !== existing.name || lc.notes !== existing.notes)) {
      clientById.set(canonicalId, {
        ...existing,
        name: lc.name,
        notes: lc.notes,
        updatedAt: lc.updatedAt,
      });
      needsCloudUpload = true;
    }
  }

  // 2. Merge sales by id (remapping local clientId if needed)
  const saleById = new Map<string, SaleRecord>();
  for (const rs of remote.sales) {
    saleById.set(rs.id, { ...rs });
  }

  for (const ls of local.sales) {
    const mappedClientId = clientRemap.get(ls.clientId) || ls.clientId;
    const existing = saleById.get(ls.id);
    if (!existing) {
      saleById.set(ls.id, { ...ls, clientId: mappedClientId });
      needsCloudUpload = true;
    } else if (ls.updatedAt > existing.updatedAt) {
      saleById.set(ls.id, {
        ...ls,
        id: existing.id,
        saleCode: existing.saleCode,
        createdAt: existing.createdAt,
        clientId: existing.clientId,
      });
      needsCloudUpload = true;
    }
  }

  // 3. Merge replacements by id and reconcile sale.replacementCount
  const repById = new Map<string, ReplacementRecord>();
  for (const rr of remote.replacements) {
    repById.set(rr.id, { ...rr });
  }
  for (const lr of local.replacements) {
    const mappedClientId = clientRemap.get(lr.clientId) || lr.clientId;
    if (!repById.has(lr.id)) {
      repById.set(lr.id, { ...lr, clientId: mappedClientId });
      needsCloudUpload = true;
    }
  }

  const repCounts = new Map<string, number>();
  for (const r of repById.values()) {
    repCounts.set(r.originalSaleId, (repCounts.get(r.originalSaleId) ?? 0) + 1);
  }
  for (const sale of saleById.values()) {
    const count = repCounts.get(sale.id) ?? 0;
    if (count > sale.replacementCount) {
      sale.replacementCount = count;
      needsCloudUpload = true;
    }
  }

  // 4. Merge settings by updatedAt
  const remoteHasSettings = Boolean(remoteInput.settings && typeof remoteInput.settings === 'object');
  let mergedSettings = remoteHasSettings ? { ...remote.settings } : { ...local.settings };
  if (!remoteHasSettings || local.settings.updatedAt > remote.settings.updatedAt) {
    mergedSettings = { ...local.settings };
    if (local.settings.updatedAt > 0 && (!remoteHasSettings || local.settings.updatedAt > remote.settings.updatedAt)) {
      needsCloudUpload = true;
    }
  }

  const merged = getSortedState({
    clients: Array.from(clientById.values()),
    sales: Array.from(saleById.values()),
    replacements: Array.from(repById.values()),
    settings: mergedSettings,
  });

  return { merged, needsCloudUpload };
}

