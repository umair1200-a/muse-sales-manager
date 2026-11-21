import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  EngineError,
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
} from '../src/lib/salesEngine.ts';
import type {
  AppSettings,
  ClientRecord,
  ReplacementRecord,
  SaleRecord,
  TableDensity,
  WarrantyPolicy,
  WarrantyStartMode,
} from '../src/types/models.ts';

const TMP_DB_FILE = path.join('/tmp', 'muse-sales-manager-db.json');
let memoryState: MuseDatabaseState | null = null;

function loadState(): MuseDatabaseState {
  try {
    if (fs.existsSync(TMP_DB_FILE)) {
      const raw = fs.readFileSync(TMP_DB_FILE, 'utf8');
      const parsed = sanitizeDatabaseState(JSON.parse(raw));
      memoryState = parsed;
      return parsed;
    }
  } catch {
    // Fall back to in-memory state if /tmp is inaccessible
  }
  if (!memoryState) {
    memoryState = createEmptyDatabaseState();
  }
  return memoryState;
}

function saveState(next: MuseDatabaseState): void {
  memoryState = next;
  try {
    fs.writeFileSync(TMP_DB_FILE, JSON.stringify(next), 'utf8');
  } catch {
    // Keep memoryState updated even if filesystem write fails
  }
}

interface VercelRequest extends IncomingMessage {
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
}

async function readJsonBody(req: VercelRequest): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body as Record<string, unknown>;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    return JSON.parse(req.body) as Record<string, unknown>;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function resolvePathname(req: VercelRequest): string {
  const headerPath =
    (typeof req.headers['x-forwarded-uri'] === 'string' && req.headers['x-forwarded-uri']) ||
    (typeof req.headers['x-matched-path'] === 'string' && req.headers['x-matched-path']) ||
    '';
  const rawUrl = req.url && req.url !== '/api/index' ? req.url : headerPath || req.url || '/';
  try {
    const parsed = new URL(rawUrl, 'http://localhost');
    return parsed.pathname;
  } catch {
    return '/';
  }
}

export default async function handler(req: VercelRequest, res: ServerResponse): Promise<void> {
  const method = (req.method || 'GET').toUpperCase();
  const pathname = resolvePathname(req);

  if (method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    if (method === 'GET' && (pathname === '/api/health' || pathname === '/api/index')) {
      sendJson(res, 200, {
        status: 'ok',
        runtime: 'vercel-serverless',
        persistent: false,
        timestamp: Date.now(),
      });
      return;
    }

    if (method === 'GET' && pathname === '/api/state') {
      sendJson(res, 200, getSortedState(loadState()));
      return;
    }

    if (method === 'POST' && pathname === '/api/sales') {
      const body = await readJsonBody(req);
      const resData = createSaleInState(loadState(), {
        clientName: String(body.clientName ?? ''),
        clientEmail: String(body.clientEmail ?? ''),
        accountType: String(body.accountType ?? ''),
        warrantyDurationDays: Number(body.warrantyDurationDays),
        saleDate: String(body.saleDate ?? ''),
        saleTime: String(body.saleTime ?? ''),
        warrantyStartTs: Number(body.warrantyStartTs),
        notes: typeof body.notes === 'string' ? body.notes : '',
      });
      saveState(resData.nextState);
      sendJson(res, 201, { sale: resData.sale, client: resData.client });
      return;
    }

    const saleMatch = pathname.match(/^\/api\/sales\/([^/]+)$/);
    if (saleMatch) {
      const saleId = decodeURIComponent(saleMatch[1]);
      if (method === 'PUT') {
        const body = await readJsonBody(req);
        const resData = updateSaleInState(loadState(), saleId, {
          clientName: typeof body.clientName === 'string' ? body.clientName : undefined,
          clientEmail: typeof body.clientEmail === 'string' ? body.clientEmail : undefined,
          accountType: typeof body.accountType === 'string' ? body.accountType : undefined,
          warrantyDurationDays:
            body.warrantyDurationDays !== undefined ? Number(body.warrantyDurationDays) : undefined,
          saleDate: typeof body.saleDate === 'string' ? body.saleDate : undefined,
          saleTime: typeof body.saleTime === 'string' ? body.saleTime : undefined,
          warrantyStartTs:
            body.warrantyStartTs !== undefined ? Number(body.warrantyStartTs) : undefined,
          recalculateWarranty: Boolean(body.recalculateWarranty),
          notes: typeof body.notes === 'string' ? body.notes : undefined,
        });
        saveState(resData.nextState);
        sendJson(res, 200, { sale: resData.sale });
        return;
      }

      if (method === 'DELETE') {
        const resData = deleteSaleInState(loadState(), saleId);
        saveState(resData.nextState);
        sendJson(res, 200, { success: true });
        return;
      }
    }

    if (method === 'POST' && pathname === '/api/replacements') {
      const body = await readJsonBody(req);
      const resData = createReplacementInState(loadState(), {
        originalSaleId: String(body.originalSaleId ?? ''),
        newAccountType: String(body.newAccountType ?? ''),
        warrantyPolicy: body.warrantyPolicy as WarrantyPolicy,
        newWarrantyDurationDays:
          body.newWarrantyDurationDays !== undefined
            ? Number(body.newWarrantyDurationDays)
            : undefined,
        replacementTimestamp:
          body.replacementTimestamp !== undefined ? Number(body.replacementTimestamp) : undefined,
        notes: typeof body.notes === 'string' ? body.notes : '',
      });
      saveState(resData.nextState);
      sendJson(res, 201, { replacement: resData.replacement });
      return;
    }

    const clientMatch = pathname.match(/^\/api\/clients\/([^/]+)$/);
    if (clientMatch) {
      const clientId = decodeURIComponent(clientMatch[1]);
      if (method === 'PUT') {
        const body = await readJsonBody(req);
        const resData = updateClientInState(loadState(), clientId, {
          name: typeof body.name === 'string' ? body.name : undefined,
          notes: typeof body.notes === 'string' ? body.notes : undefined,
        });
        saveState(resData.nextState);
        sendJson(res, 200, { client: resData.client });
        return;
      }

      if (method === 'DELETE') {
        const resData = deleteClientInState(loadState(), clientId);
        saveState(resData.nextState);
        sendJson(res, 200, { success: true });
        return;
      }
    }

    if (method === 'PUT' && pathname === '/api/settings') {
      const body = await readJsonBody(req);
      const resData = updateSettingsInState(loadState(), {
        expiringSoonThresholdHours:
          body.expiringSoonThresholdHours !== undefined
            ? Number(body.expiringSoonThresholdHours)
            : undefined,
        defaultWarrantyDurationDays:
          body.defaultWarrantyDurationDays !== undefined
            ? Number(body.defaultWarrantyDurationDays)
            : undefined,
        defaultWarrantyStartMode: body.defaultWarrantyStartMode as WarrantyStartMode | undefined,
        tableDensity: body.tableDensity as TableDensity | undefined,
        rememberSessionDays:
          body.rememberSessionDays !== undefined ? Number(body.rememberSessionDays) : undefined,
      });
      saveState(resData.nextState);
      sendJson(res, 200, { settings: resData.settings });
      return;
    }

    if (method === 'GET' && pathname === '/api/backup') {
      sendJson(res, 200, exportBackupFromState(loadState()));
      return;
    }

    if (method === 'POST' && pathname === '/api/restore') {
      const body = await readJsonBody(req);
      const resData = restoreBackupIntoState(loadState(), {
        clients: body.clients as ClientRecord[],
        sales: body.sales as SaleRecord[],
        replacements: body.replacements as ReplacementRecord[],
        settings: body.settings as AppSettings | null | undefined,
        mode: body.mode === 'merge' ? 'merge' : 'replace',
      });
      saveState(resData.nextState);
      sendJson(res, 200, { success: true });
      return;
    }

    sendJson(res, 404, { error: `API endpoint not found: ${method} ${pathname}` });
  } catch (error) {
    if (error instanceof EngineError) {
      sendJson(res, error.status, { error: error.message });
      return;
    }
    if (error instanceof SyntaxError) {
      sendJson(res, 400, { error: 'Invalid JSON request payload.' });
      return;
    }
    console.error('Vercel API handler error:', error);
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Internal server error.',
    });
  }
}
