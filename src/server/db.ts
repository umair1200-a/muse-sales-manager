import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import type {
  AppSettings,
  ClientRecord,
  ReplacementRecord,
  SaleRecord,
} from '../types/models.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'muse_sales.sqlite');

let dbInstance: DatabaseSync | null = null;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const expectedBuf = Buffer.from(keyHex, 'hex');
  const actualBuf = crypto.scryptSync(password, salt, 64);
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

export function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const db = new DatabaseSync(DB_FILE);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
      remember_session INTEGER NOT NULL DEFAULT 1,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      notes TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      sale_code TEXT NOT NULL UNIQUE,
      client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      client_name TEXT NOT NULL,
      client_email TEXT NOT NULL,
      account_type TEXT NOT NULL,
      account_volume_billions INTEGER NOT NULL,
      sale_date TEXT NOT NULL,
      sale_time TEXT NOT NULL,
      sale_timestamp INTEGER NOT NULL,
      warranty_duration_days INTEGER NOT NULL,
      warranty_start_ts INTEGER NOT NULL,
      warranty_expiry_ts INTEGER NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      replacement_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS replacements (
      id TEXT PRIMARY KEY,
      replacement_code TEXT NOT NULL UNIQUE,
      original_sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      original_account_type TEXT NOT NULL,
      new_account_type TEXT NOT NULL,
      replacement_timestamp INTEGER NOT NULL,
      warranty_policy TEXT NOT NULL,
      warranty_duration_days INTEGER NOT NULL,
      warranty_start_ts INTEGER NOT NULL,
      warranty_expiry_ts INTEGER NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      expiring_soon_threshold_hours INTEGER NOT NULL DEFAULT 48,
      default_warranty_duration_days INTEGER NOT NULL DEFAULT 10,
      default_warranty_start_mode TEXT NOT NULL DEFAULT 'SALE_TIME',
      table_density TEXT NOT NULL DEFAULT 'COMFORTABLE',
      remember_session_days INTEGER NOT NULL DEFAULT 30,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sales_client_id ON sales(client_id);
    CREATE INDEX IF NOT EXISTS idx_sales_timestamp ON sales(sale_timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_replacements_sale_id ON replacements(original_sale_id);
    CREATE INDEX IF NOT EXISTS idx_replacements_client_id ON replacements(client_id);
  `);

  // Seed default settings row if missing
  const settingsRow = db.prepare('SELECT id FROM settings WHERE id = 1').get();
  if (!settingsRow) {
    db.prepare(
      `INSERT INTO settings (
        id, expiring_soon_threshold_hours, default_warranty_duration_days,
        default_warranty_start_mode, table_density, remember_session_days, updated_at
      ) VALUES (1, 48, 10, 'SALE_TIME', 'COMFORTABLE', 30, ?)`
    ).run(Date.now());
  }

  dbInstance = db;
  return db;
}

export function mapClientRow(row: Record<string, unknown>): ClientRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    notes: String(row.notes ?? ''),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export function mapSaleRow(row: Record<string, unknown>): SaleRecord {
  return {
    id: String(row.id),
    saleCode: String(row.sale_code),
    clientId: String(row.client_id),
    clientName: String(row.client_name),
    clientEmail: String(row.client_email),
    accountType: String(row.account_type),
    accountVolumeBillions: Number(row.account_volume_billions),
    saleDate: String(row.sale_date),
    saleTime: String(row.sale_time),
    saleTimestamp: Number(row.sale_timestamp),
    warrantyDurationDays: Number(row.warranty_duration_days),
    warrantyStartTs: Number(row.warranty_start_ts),
    warrantyExpiryTs: Number(row.warranty_expiry_ts),
    notes: String(row.notes ?? ''),
    replacementCount: Number(row.replacement_count ?? 0),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export function mapReplacementRow(row: Record<string, unknown>): ReplacementRecord {
  return {
    id: String(row.id),
    replacementCode: String(row.replacement_code),
    originalSaleId: String(row.original_sale_id),
    clientId: String(row.client_id),
    originalAccountType: String(row.original_account_type),
    newAccountType: String(row.new_account_type),
    replacementTimestamp: Number(row.replacement_timestamp),
    warrantyPolicy: String(row.warranty_policy) as ReplacementRecord['warrantyPolicy'],
    warrantyDurationDays: Number(row.warranty_duration_days),
    warrantyStartTs: Number(row.warranty_start_ts),
    warrantyExpiryTs: Number(row.warranty_expiry_ts),
    notes: String(row.notes ?? ''),
    createdAt: Number(row.created_at),
  };
}

export function mapSettingsRow(row: Record<string, unknown>): AppSettings {
  return {
    expiringSoonThresholdHours: Number(row.expiring_soon_threshold_hours),
    defaultWarrantyDurationDays: Number(row.default_warranty_duration_days),
    defaultWarrantyStartMode: String(row.default_warranty_start_mode) as AppSettings['defaultWarrantyStartMode'],
    tableDensity: String(row.table_density) as AppSettings['tableDensity'],
    rememberSessionDays: Number(row.remember_session_days),
    updatedAt: Number(row.updated_at),
  };
}
