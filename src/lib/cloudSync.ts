import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase.ts';
import {
  emailToWorkspaceId,
  isValidWorkspaceEmail,
  normalizeWorkspaceEmail,
} from './workspaceId.ts';
import type {
  AppSettings,
  ClientRecord,
  ReplacementRecord,
  SaleRecord,
  TableDensity,
  WarrantyPolicy,
  WarrantyStartMode,
} from '../types/models.ts';
import { parseAccountVolumeBillions } from '../utils/warranty.ts';
import {
  DEFAULT_APP_SETTINGS,
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

const ACTIVE_EMAIL_KEY = 'muse_active_workspace_email_v1';
const RECENT_EMAILS_KEY = 'muse_recent_workspace_emails_v1';

const ensuredWorkspaces = new Set<string>();

export function getSavedActiveEmail(): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(ACTIVE_EMAIL_KEY);
    if (!raw || !isValidWorkspaceEmail(raw)) return null;
    return normalizeWorkspaceEmail(raw);
  } catch {
    return null;
  }
}

export function getRecentWorkspaceEmails(): string[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(RECENT_EMAILS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === 'string' && isValidWorkspaceEmail(item))
      .map((item) => normalizeWorkspaceEmail(item))
      .slice(0, 6);
  } catch {
    return [];
  }
}

export function saveActiveEmail(email: string): string {
  const normalized = normalizeWorkspaceEmail(email);
  if (!isValidWorkspaceEmail(normalized)) {
    throw new Error('Please enter a valid email address.');
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(ACTIVE_EMAIL_KEY, normalized);
      const recent = getRecentWorkspaceEmails().filter((e) => e !== normalized);
      window.localStorage.setItem(RECENT_EMAILS_KEY, JSON.stringify([normalized, ...recent].slice(0, 6)));
    }
  } catch {
    // Ignore storage quota errors in restricted browsing modes
  }
  return normalized;
}

export function clearSavedActiveEmail(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(ACTIVE_EMAIL_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

function toFirestoreClient(client: ClientRecord) {
  const now = Math.trunc(Date.now());
  return {
    id: String(client.id),
    name: String(client.name || client.email || 'Client').slice(0, 160),
    email: String(client.email).trim().toLowerCase().slice(0, 200),
    notes: String(client.notes ?? '').slice(0, 2000),
    createdAt: Math.max(0, Math.trunc(Number(client.createdAt || now))),
    updatedAt: Math.max(0, Math.trunc(Number(client.updatedAt || now))),
  };
}

function toFirestoreSale(sale: SaleRecord) {
  const now = Math.trunc(Date.now());
  const volume = Math.min(
    31,
    Math.max(
      1,
      Math.trunc(Number(sale.accountVolumeBillions || parseAccountVolumeBillions(sale.accountType) || 1))
    )
  );
  const startTs = Math.max(0, Math.trunc(Number(sale.warrantyStartTs || now)));
  const expiryTs = Math.max(startTs, Math.trunc(Number(sale.warrantyExpiryTs || startTs)));
  const duration = Math.min(25, Math.max(1, Math.trunc(Number(sale.warrantyDurationDays || 1))));
  const accountType = `${volume} Billion`;

  return {
    id: String(sale.id),
    saleCode: String(sale.saleCode),
    clientId: String(sale.clientId),
    clientName: String(sale.clientName || sale.clientEmail || 'Client').slice(0, 160),
    clientEmail: String(sale.clientEmail).trim().toLowerCase().slice(0, 200),
    accountType,
    accountVolumeBillions: volume,
    saleDate: String(sale.saleDate).slice(0, 10).padEnd(10, '0'),
    saleTime: String(sale.saleTime || '00:00').slice(0, 8),
    saleTimestamp: Math.max(0, Math.trunc(Number(sale.saleTimestamp || now))),
    warrantyDurationDays: duration,
    warrantyStartTs: startTs,
    warrantyExpiryTs: expiryTs,
    notes: String(sale.notes ?? '').slice(0, 2000),
    replacementCount: Math.max(0, Math.trunc(Number(sale.replacementCount || 0))),
    createdAt: Math.max(0, Math.trunc(Number(sale.createdAt || now))),
    updatedAt: Math.max(0, Math.trunc(Number(sale.updatedAt || now))),
  };
}

function toFirestoreReplacement(rep: ReplacementRecord) {
  const now = Math.trunc(Date.now());
  const startTs = Math.max(0, Math.trunc(Number(rep.warrantyStartTs || now)));
  const expiryTs = Math.max(startTs, Math.trunc(Number(rep.warrantyExpiryTs || startTs)));
  const duration = Math.min(25, Math.max(1, Math.trunc(Number(rep.warrantyDurationDays || 1))));

  return {
    id: String(rep.id),
    replacementCode: String(rep.replacementCode),
    originalSaleId: String(rep.originalSaleId),
    clientId: String(rep.clientId),
    originalAccountType: String(rep.originalAccountType || '1 Billion').slice(0, 40),
    newAccountType: String(rep.newAccountType || '1 Billion').slice(0, 40),
    replacementTimestamp: Math.max(0, Math.trunc(Number(rep.replacementTimestamp || now))),
    warrantyPolicy: rep.warrantyPolicy === 'START_NEW' ? 'START_NEW' : 'CONTINUE_ORIGINAL',
    warrantyDurationDays: duration,
    warrantyStartTs: startTs,
    warrantyExpiryTs: expiryTs,
    notes: String(rep.notes ?? '').slice(0, 2000),
    createdAt: Math.max(0, Math.trunc(Number(rep.createdAt || now))),
  };
}

function toFirestoreSettings(settings: AppSettings) {
  return {
    expiringSoonThresholdHours: Math.min(
      360,
      Math.max(1, Math.trunc(Number(settings.expiringSoonThresholdHours || 48)))
    ),
    defaultWarrantyDurationDays: Math.min(
      25,
      Math.max(1, Math.trunc(Number(settings.defaultWarrantyDurationDays || 10)))
    ),
    defaultWarrantyStartMode:
      settings.defaultWarrantyStartMode === 'CUSTOM' ? 'CUSTOM' : 'SALE_TIME',
    tableDensity: settings.tableDensity === 'COMPACT' ? 'COMPACT' : 'COMFORTABLE',
    rememberSessionDays: Math.min(
      90,
      Math.max(1, Math.trunc(Number(settings.rememberSessionDays || 30)))
    ),
    updatedAt: Math.max(0, Math.trunc(Number(settings.updatedAt || Date.now()))),
  };
}

function wsDoc(workspaceId: string) {
  return doc(db, 'workspaces', workspaceId);
}

function wsClientsCol(workspaceId: string) {
  return collection(db, 'workspaces', workspaceId, 'clients');
}

function wsSalesCol(workspaceId: string) {
  return collection(db, 'workspaces', workspaceId, 'sales');
}

function wsReplacementsCol(workspaceId: string) {
  return collection(db, 'workspaces', workspaceId, 'replacements');
}

function wsSettingsDoc(workspaceId: string) {
  return doc(db, 'workspaces', workspaceId, 'settings', 'global');
}

async function commitSetsInChunks(
  ops: Array<{ ref: ReturnType<typeof doc>; data: Record<string, unknown> }>,
  chunkSize = 400
): Promise<void> {
  for (let i = 0; i < ops.length; i += chunkSize) {
    const slice = ops.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    for (const op of slice) {
      batch.set(op.ref, op.data);
    }
    await batch.commit();
  }
}

async function commitDeletesInChunks(
  refs: Array<ReturnType<typeof doc>>,
  chunkSize = 400
): Promise<void> {
  for (let i = 0; i < refs.length; i += chunkSize) {
    const slice = refs.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    for (const ref of slice) {
      batch.delete(ref);
    }
    await batch.commit();
  }
}

export async function ensureEmailWorkspace(
  email: string
): Promise<{ workspaceId: string; email: string; isNew: boolean }> {
  const normalized = normalizeWorkspaceEmail(email);
  const workspaceId = emailToWorkspaceId(normalized);
  const ref = wsDoc(workspaceId);

  if (ensuredWorkspaces.has(workspaceId)) {
    return { workspaceId, email: normalized, isNew: false };
  }

  try {
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      ensuredWorkspaces.add(workspaceId);
      return { workspaceId, email: normalized, isNew: false };
    }

    const now = Math.trunc(Date.now());
    await setDoc(ref, {
      id: workspaceId,
      email: normalized,
      createdAt: now,
      updatedAt: now,
    });

    await setDoc(
      wsSettingsDoc(workspaceId),
      toFirestoreSettings({ ...DEFAULT_APP_SETTINGS, updatedAt: now })
    );

    ensuredWorkspaces.add(workspaceId);
    return { workspaceId, email: normalized, isNew: true };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `workspaces/${workspaceId}`);
  }
}

export async function loadWorkspaceFromFirestore(email: string): Promise<{
  state: MuseDatabaseState;
  isNew: boolean;
  workspaceId: string;
  email: string;
}> {
  const { workspaceId, email: normalized, isNew } = await ensureEmailWorkspace(email);

  try {
    const [clientsSnap, salesSnap, repsSnap, settingsSnap] = await Promise.all([
      getDocs(wsClientsCol(workspaceId)),
      getDocs(wsSalesCol(workspaceId)),
      getDocs(wsReplacementsCol(workspaceId)),
      getDoc(wsSettingsDoc(workspaceId)),
    ]);

    const clients = clientsSnap.docs.map((d) => d.data() as ClientRecord);
    const sales = salesSnap.docs.map((d) => d.data() as SaleRecord);
    const replacements = repsSnap.docs.map((d) => d.data() as ReplacementRecord);
    const settings = settingsSnap.exists()
      ? (settingsSnap.data() as AppSettings)
      : { ...DEFAULT_APP_SETTINGS, updatedAt: Date.now() };

    const state = getSortedState(
      sanitizeDatabaseState({ clients, sales, replacements, settings })
    );

    return { state, isNew, workspaceId, email: normalized };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `workspaces/${workspaceId}`);
  }
}

export function subscribeToWorkspaceFirestore(
  email: string,
  onUpdate: (state: MuseDatabaseState) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const workspaceId = emailToWorkspaceId(email);

  let latestClients: ClientRecord[] = [];
  let latestSales: SaleRecord[] = [];
  let latestReplacements: ReplacementRecord[] = [];
  let latestSettings: AppSettings = { ...DEFAULT_APP_SETTINGS, updatedAt: 0 };

  let hasClients = false;
  let hasSales = false;
  let hasReps = false;
  let hasSettings = false;

  const emitIfReady = () => {
    if (hasClients && hasSales && hasReps && hasSettings) {
      onUpdate(
        getSortedState(
          sanitizeDatabaseState({
            clients: latestClients,
            sales: latestSales,
            replacements: latestReplacements,
            settings: latestSettings,
          })
        )
      );
    }
  };

  const reportError = (path: string) => (err: unknown) => {
    console.error('Firestore listener error on', path, err);
    if (onError) onError(err);
  };

  const unsubClients = onSnapshot(
    wsClientsCol(workspaceId),
    (snap) => {
      latestClients = snap.docs.map((d) => d.data() as ClientRecord);
      hasClients = true;
      emitIfReady();
    },
    reportError(`workspaces/${workspaceId}/clients`)
  );

  const unsubSales = onSnapshot(
    wsSalesCol(workspaceId),
    (snap) => {
      latestSales = snap.docs.map((d) => d.data() as SaleRecord);
      hasSales = true;
      emitIfReady();
    },
    reportError(`workspaces/${workspaceId}/sales`)
  );

  const unsubReps = onSnapshot(
    wsReplacementsCol(workspaceId),
    (snap) => {
      latestReplacements = snap.docs.map((d) => d.data() as ReplacementRecord);
      hasReps = true;
      emitIfReady();
    },
    reportError(`workspaces/${workspaceId}/replacements`)
  );

  const unsubSettings = onSnapshot(
    wsSettingsDoc(workspaceId),
    (snap) => {
      if (snap.exists()) {
        latestSettings = snap.data() as AppSettings;
      }
      hasSettings = true;
      emitIfReady();
    },
    reportError(`workspaces/${workspaceId}/settings/global`)
  );

  return () => {
    unsubClients();
    unsubSales();
    unsubReps();
    unsubSettings();
  };
}

export async function cloudCreateSale(
  email: string,
  currentState: MuseDatabaseState,
  payload: {
    clientName: string;
    clientEmail: string;
    accountType: string;
    warrantyDurationDays: number;
    saleDate: string;
    saleTime: string;
    warrantyStartTs: number;
    notes: string;
  }
): Promise<{ sale: SaleRecord; client: ClientRecord; nextState: MuseDatabaseState }> {
  const { workspaceId } = await ensureEmailWorkspace(email);
  const { nextState, sale, client } = createSaleInState(currentState, payload);

  const clientRef = doc(db, 'workspaces', workspaceId, 'clients', client.id);
  const saleRef = doc(db, 'workspaces', workspaceId, 'sales', sale.id);

  try {
    const clientData = toFirestoreClient(client);
    const existingClientSnap = await getDoc(clientRef);
    if (existingClientSnap.exists()) {
      const existingCreatedAt = existingClientSnap.data()?.createdAt;
      if (typeof existingCreatedAt === 'number') {
        clientData.createdAt = existingCreatedAt;
      }
    }

    await setDoc(clientRef, clientData);
    await setDoc(saleRef, toFirestoreSale(sale));

    return {
      sale,
      client: { ...client, createdAt: clientData.createdAt },
      nextState: getSortedState(nextState),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `workspaces/${workspaceId}/sales/${sale.id}`);
  }
}

export async function cloudUpdateSale(
  email: string,
  currentState: MuseDatabaseState,
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
): Promise<{ sale: SaleRecord; nextState: MuseDatabaseState }> {
  const { workspaceId } = await ensureEmailWorkspace(email);
  const { nextState, sale } = updateSaleInState(currentState, saleId, payload);
  const client = nextState.clients.find((c) => c.id === sale.clientId);

  try {
    if (client) {
      const clientRef = doc(db, 'workspaces', workspaceId, 'clients', client.id);
      const clientData = toFirestoreClient(client);
      const existingClientSnap = await getDoc(clientRef);
      if (existingClientSnap.exists()) {
        const existingCreatedAt = existingClientSnap.data()?.createdAt;
        if (typeof existingCreatedAt === 'number') {
          clientData.createdAt = existingCreatedAt;
        }
      }
      await setDoc(clientRef, clientData);
    }

    const saleRef = doc(db, 'workspaces', workspaceId, 'sales', sale.id);
    const saleData = toFirestoreSale(sale);
    const existingSaleSnap = await getDoc(saleRef);
    if (existingSaleSnap.exists()) {
      const existingData = existingSaleSnap.data();
      if (typeof existingData?.createdAt === 'number') {
        saleData.createdAt = existingData.createdAt;
      }
      if (typeof existingData?.saleCode === 'string') {
        saleData.saleCode = existingData.saleCode;
      }
    }

    await setDoc(saleRef, saleData);
    return { sale, nextState: getSortedState(nextState) };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `workspaces/${workspaceId}/sales/${saleId}`);
  }
}

export async function cloudDeleteSale(
  email: string,
  currentState: MuseDatabaseState,
  saleId: string
): Promise<{ nextState: MuseDatabaseState }> {
  const { workspaceId } = await ensureEmailWorkspace(email);
  const linkedRepIds = currentState.replacements
    .filter((r) => r.originalSaleId === saleId)
    .map((r) => r.id);
  const { nextState } = deleteSaleInState(currentState, saleId);

  try {
    const refs = [
      ...linkedRepIds.map((repId) =>
        doc(db, 'workspaces', workspaceId, 'replacements', repId)
      ),
      doc(db, 'workspaces', workspaceId, 'sales', saleId),
    ];
    await commitDeletesInChunks(refs);
    return { nextState: getSortedState(nextState) };
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `workspaces/${workspaceId}/sales/${saleId}`);
  }
}

export async function cloudCreateReplacement(
  email: string,
  currentState: MuseDatabaseState,
  payload: {
    originalSaleId: string;
    newAccountType: string;
    warrantyPolicy: WarrantyPolicy;
    newWarrantyDurationDays?: number;
    replacementTimestamp: number;
    notes: string;
  }
): Promise<{ replacement: ReplacementRecord; nextState: MuseDatabaseState }> {
  const { workspaceId } = await ensureEmailWorkspace(email);
  const { nextState, replacement } = createReplacementInState(currentState, payload);
  const updatedSale = nextState.sales.find((s) => s.id === payload.originalSaleId);

  try {
    await setDoc(
      doc(db, 'workspaces', workspaceId, 'replacements', replacement.id),
      toFirestoreReplacement(replacement)
    );
    if (updatedSale) {
      await setDoc(
        doc(db, 'workspaces', workspaceId, 'sales', updatedSale.id),
        toFirestoreSale(updatedSale)
      );
    }
    return { replacement, nextState: getSortedState(nextState) };
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.CREATE,
      `workspaces/${workspaceId}/replacements/${replacement.id}`
    );
  }
}

export async function cloudUpdateClient(
  email: string,
  currentState: MuseDatabaseState,
  clientId: string,
  payload: { name: string; notes: string }
): Promise<{ client: ClientRecord; nextState: MuseDatabaseState }> {
  const { workspaceId } = await ensureEmailWorkspace(email);
  const { nextState, client } = updateClientInState(currentState, clientId, payload);

  try {
    const clientRef = doc(db, 'workspaces', workspaceId, 'clients', client.id);
    const clientData = toFirestoreClient(client);
    const existingSnap = await getDoc(clientRef);
    if (existingSnap.exists()) {
      const existingCreatedAt = existingSnap.data()?.createdAt;
      if (typeof existingCreatedAt === 'number') {
        clientData.createdAt = existingCreatedAt;
      }
    }
    await setDoc(clientRef, clientData);
    return { client, nextState: getSortedState(nextState) };
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `workspaces/${workspaceId}/clients/${clientId}`
    );
  }
}

export async function cloudDeleteClient(
  email: string,
  currentState: MuseDatabaseState,
  clientId: string
): Promise<{ nextState: MuseDatabaseState }> {
  const { workspaceId } = await ensureEmailWorkspace(email);
  const linkedSaleIds = currentState.sales
    .filter((s) => s.clientId === clientId)
    .map((s) => s.id);
  const linkedRepIds = currentState.replacements
    .filter((r) => r.clientId === clientId || linkedSaleIds.includes(r.originalSaleId))
    .map((r) => r.id);
  const { nextState } = deleteClientInState(currentState, clientId);

  try {
    const refs = [
      ...linkedRepIds.map((repId) =>
        doc(db, 'workspaces', workspaceId, 'replacements', repId)
      ),
      ...linkedSaleIds.map((saleId) =>
        doc(db, 'workspaces', workspaceId, 'sales', saleId)
      ),
      doc(db, 'workspaces', workspaceId, 'clients', clientId),
    ];
    await commitDeletesInChunks(refs);
    return { nextState: getSortedState(nextState) };
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.DELETE,
      `workspaces/${workspaceId}/clients/${clientId}`
    );
  }
}

export async function cloudUpdateSettings(
  email: string,
  currentState: MuseDatabaseState,
  payload: {
    expiringSoonThresholdHours: number;
    defaultWarrantyDurationDays: number;
    defaultWarrantyStartMode: WarrantyStartMode;
    tableDensity: TableDensity;
    rememberSessionDays: number;
  }
): Promise<{ settings: AppSettings; nextState: MuseDatabaseState }> {
  const { workspaceId } = await ensureEmailWorkspace(email);
  const { nextState, settings } = updateSettingsInState(currentState, payload);

  try {
    await setDoc(wsSettingsDoc(workspaceId), toFirestoreSettings(settings));
    return { settings, nextState: getSortedState(nextState) };
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `workspaces/${workspaceId}/settings/global`
    );
  }
}

export async function cloudRestoreBackup(
  email: string,
  currentState: MuseDatabaseState,
  payload: {
    clients: ClientRecord[];
    sales: SaleRecord[];
    replacements: ReplacementRecord[];
    settings?: AppSettings | null;
    mode?: 'replace' | 'merge';
  }
): Promise<{ nextState: MuseDatabaseState }> {
  const { workspaceId } = await ensureEmailWorkspace(email);
  const { nextState } = restoreBackupIntoState(currentState, payload);

  try {
    const [existingClientsSnap, existingSalesSnap, existingRepsSnap] = await Promise.all([
      getDocs(wsClientsCol(workspaceId)),
      getDocs(wsSalesCol(workspaceId)),
      getDocs(wsReplacementsCol(workspaceId)),
    ]);

    const existingClientCreatedAt = new Map<string, number>();
    for (const d of existingClientsSnap.docs) {
      const ca = d.data()?.createdAt;
      if (typeof ca === 'number') existingClientCreatedAt.set(d.id, ca);
    }

    const existingSaleMeta = new Map<string, { createdAt: number; saleCode: string }>();
    for (const d of existingSalesSnap.docs) {
      const data = d.data();
      if (typeof data?.createdAt === 'number' && typeof data?.saleCode === 'string') {
        existingSaleMeta.set(d.id, { createdAt: data.createdAt, saleCode: data.saleCode });
      }
    }

    const existingRepIds = new Set(existingRepsSnap.docs.map((d) => d.id));

    const clientOps = nextState.clients.map((client) => {
      const data = toFirestoreClient(client);
      const preserved = existingClientCreatedAt.get(client.id);
      if (preserved !== undefined) data.createdAt = preserved;
      return {
        ref: doc(db, 'workspaces', workspaceId, 'clients', client.id),
        data,
      };
    });
    await commitSetsInChunks(clientOps);

    const validClientIds = new Set([
      ...existingClientCreatedAt.keys(),
      ...nextState.clients.map((c) => c.id),
    ]);

    const saleOps = nextState.sales
      .filter((sale) => validClientIds.has(sale.clientId))
      .map((sale) => {
        const data = toFirestoreSale(sale);
        const preserved = existingSaleMeta.get(sale.id);
        if (preserved) {
          data.createdAt = preserved.createdAt;
          data.saleCode = preserved.saleCode;
        }
        return {
          ref: doc(db, 'workspaces', workspaceId, 'sales', sale.id),
          data,
        };
      });
    await commitSetsInChunks(saleOps);

    const validSaleIds = new Set([
      ...existingSaleMeta.keys(),
      ...saleOps.map((op) => String(op.data.id)),
    ]);

    const repOps = nextState.replacements
      .filter(
        (rep) =>
          !existingRepIds.has(rep.id) &&
          validSaleIds.has(rep.originalSaleId) &&
          validClientIds.has(rep.clientId)
      )
      .map((rep) => ({
        ref: doc(db, 'workspaces', workspaceId, 'replacements', rep.id),
        data: toFirestoreReplacement(rep),
      }));
    await commitSetsInChunks(repOps);

    await setDoc(wsSettingsDoc(workspaceId), toFirestoreSettings(nextState.settings));

    return { nextState: getSortedState(nextState) };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `workspaces/${workspaceId}/restore`);
  }
}

export function cloudExportBackup(currentState: MuseDatabaseState) {
  return exportBackupFromState(currentState);
}
