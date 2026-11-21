import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import {
  getDb,
  mapClientRow,
  mapReplacementRow,
  mapSaleRow,
  mapSettingsRow,
} from './src/server/db.ts';
import {
  calculateWarrantyExpiryTs,
  computeReplacementWarranty,
  isValidAccountType,
  isValidWarrantyDuration,
  parseAccountVolumeBillions,
  parseDateAndTimeToTimestamp,
} from './src/utils/warranty.ts';

const PORT = 3000;
const app = express();

app.set('trust proxy', 1);
app.use(express.json({ limit: '5mb' }));

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function generateCode(prefix: string): string {
  const num = crypto.randomInt(100000, 999999);
  return `${prefix}-${num}`;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', runtime: 'node-sqlite', persistent: true, timestamp: Date.now() });
});

// Full Application State
app.get('/api/state', (_req, res) => {
  try {
    const db = getDb();
    const clients = db
      .prepare('SELECT * FROM clients ORDER BY created_at DESC')
      .all()
      .map((r) => mapClientRow(r as Record<string, unknown>));

    const sales = db
      .prepare('SELECT * FROM sales ORDER BY sale_timestamp DESC')
      .all()
      .map((r) => mapSaleRow(r as Record<string, unknown>));

    const replacements = db
      .prepare('SELECT * FROM replacements ORDER BY replacement_timestamp DESC')
      .all()
      .map((r) => mapReplacementRow(r as Record<string, unknown>));

    const settingsRow = db.prepare('SELECT * FROM settings WHERE id = 1').get() as Record<
      string,
      unknown
    >;

    res.json({
      clients,
      sales,
      replacements,
      settings: mapSettingsRow(settingsRow),
    });
  } catch (error) {
    console.error('Fetch state error:', error);
    res.status(500).json({ error: 'Failed to load database records.' });
  }
});

// Create Sale + Upsert Client (Protected)
app.post('/api/sales', (req, res) => {
  try {
    const {
      clientName,
      clientEmail,
      accountType,
      warrantyDurationDays,
      saleDate,
      saleTime,
      warrantyStartTs,
      notes = '',
    } = req.body ?? {};

    if (typeof clientName !== 'string' || !clientName.trim()) {
      res.status(400).json({ error: 'Client Name is required.' });
      return;
    }
    if (typeof clientEmail !== 'string' || !isValidEmail(clientEmail.trim())) {
      res.status(400).json({ error: 'A valid Client Email is required.' });
      return;
    }
    if (typeof accountType !== 'string' || !isValidAccountType(accountType)) {
      res.status(400).json({ error: 'Please select a valid Account Type (1 Billion – 31 Billion).' });
      return;
    }
    const duration = Number(warrantyDurationDays);
    if (!isValidWarrantyDuration(duration)) {
      res.status(400).json({ error: 'Warranty Duration must be between 1 and 25 days.' });
      return;
    }
    if (typeof saleDate !== 'string' || typeof saleTime !== 'string') {
      res.status(400).json({ error: 'Sale Date and Sale Time are required.' });
      return;
    }

    const saleTimestamp = parseDateAndTimeToTimestamp(saleDate, saleTime);
    const startTs =
      typeof warrantyStartTs === 'number' && Number.isFinite(warrantyStartTs) && warrantyStartTs > 0
        ? Math.floor(warrantyStartTs)
        : saleTimestamp;
    const expiryTs = calculateWarrantyExpiryTs(startTs, duration);
    const volumeBillions = parseAccountVolumeBillions(accountType);
    const normalizedEmail = clientEmail.trim().toLowerCase();
    const cleanName = clientName.trim().slice(0, 160);
    const cleanNotes = typeof notes === 'string' ? notes.trim().slice(0, 2000) : '';

    const db = getDb();
    const now = Date.now();

    db.exec('BEGIN IMMEDIATE');
    try {
      // Deduplicate client by normalized email
      let clientRow = db
        .prepare('SELECT * FROM clients WHERE LOWER(email) = ?')
        .get(normalizedEmail) as Record<string, unknown> | undefined;

      let clientId: string;
      if (!clientRow) {
        clientId = generateId('cli');
        db.prepare(
          'INSERT INTO clients (id, name, email, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(clientId, cleanName, normalizedEmail, '', now, now);
        clientRow = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId) as Record<
          string,
          unknown
        >;
      } else {
        clientId = String(clientRow.id);
        db.prepare('UPDATE clients SET name = ?, updated_at = ? WHERE id = ?').run(
          cleanName,
          now,
          clientId
        );
        clientRow = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId) as Record<
          string,
          unknown
        >;
      }

      const saleId = generateId('sale');
      let saleCode = generateCode('MS');
      while (db.prepare('SELECT 1 FROM sales WHERE sale_code = ?').get(saleCode)) {
        saleCode = generateCode('MS');
      }

      db.prepare(
        `INSERT INTO sales (
          id, sale_code, client_id, client_name, client_email,
          account_type, account_volume_billions, sale_date, sale_time,
          sale_timestamp, warranty_duration_days, warranty_start_ts,
          warranty_expiry_ts, notes, replacement_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
      ).run(
        saleId,
        saleCode,
        clientId,
        cleanName,
        normalizedEmail,
        `${volumeBillions} Billion`,
        volumeBillions,
        saleDate.trim(),
        saleTime.trim(),
        saleTimestamp,
        duration,
        startTs,
        expiryTs,
        cleanNotes,
        now,
        now
      );

      db.exec('COMMIT');

      const saleRow = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId) as Record<
        string,
        unknown
      >;
      res.status(201).json({
        sale: mapSaleRow(saleRow),
        client: mapClientRow(clientRow),
      });
    } catch (txError) {
      db.exec('ROLLBACK');
      throw txError;
    }
  } catch (error) {
    console.error('Create sale error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to save sale.' });
  }
});

// Edit Sale (Preserves warranty unless intentionally changed)
app.put('/api/sales/:id', (req, res) => {
  try {
    const saleId = String(req.params.id);
    const db = getDb();
    const existingRow = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId) as
      | Record<string, unknown>
      | undefined;

    if (!existingRow) {
      res.status(404).json({ error: 'Sale record not found.' });
      return;
    }
    const existing = mapSaleRow(existingRow);

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
    } = req.body ?? {};

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
    const nextSaleTimestamp = parseDateAndTimeToTimestamp(nextSaleDate, nextSaleTime);

    const nextDuration =
      warrantyDurationDays !== undefined && isValidWarrantyDuration(Number(warrantyDurationDays))
        ? Number(warrantyDurationDays)
        : existing.warrantyDurationDays;

    const nextStartTs =
      typeof warrantyStartTs === 'number' && Number.isFinite(warrantyStartTs) && warrantyStartTs > 0
        ? Math.floor(warrantyStartTs)
        : existing.warrantyStartTs;

    // Never reset warranty accidentally during edit unless duration, startTs, or explicit flag changed
    const warrantyIntentChanged =
      Boolean(recalculateWarranty) ||
      nextDuration !== existing.warrantyDurationDays ||
      nextStartTs !== existing.warrantyStartTs;

    const nextExpiryTs = warrantyIntentChanged
      ? calculateWarrantyExpiryTs(nextStartTs, nextDuration)
      : existing.warrantyExpiryTs;

    const cleanNotes =
      typeof notes === 'string' ? notes.trim().slice(0, 2000) : existing.notes;
    const now = Date.now();

    db.exec('BEGIN IMMEDIATE');
    try {
      let clientId = existing.clientId;
      if (cleanEmail !== existing.clientEmail) {
        const matchedClient = db
          .prepare('SELECT id FROM clients WHERE LOWER(email) = ?')
          .get(cleanEmail) as { id: string } | undefined;
        if (matchedClient) {
          clientId = matchedClient.id;
          db.prepare('UPDATE clients SET name = ?, updated_at = ? WHERE id = ?').run(
            cleanName,
            now,
            clientId
          );
        } else {
          clientId = generateId('cli');
          db.prepare(
            'INSERT INTO clients (id, name, email, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(clientId, cleanName, cleanEmail, '', now, now);
        }
      } else {
        db.prepare('UPDATE clients SET name = ?, updated_at = ? WHERE id = ?').run(
          cleanName,
          now,
          clientId
        );
      }

      db.prepare(
        `UPDATE sales SET
          client_id = ?, client_name = ?, client_email = ?,
          account_type = ?, account_volume_billions = ?,
          sale_date = ?, sale_time = ?, sale_timestamp = ?,
          warranty_duration_days = ?, warranty_start_ts = ?, warranty_expiry_ts = ?,
          notes = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        clientId,
        cleanName,
        cleanEmail,
        nextAccountType,
        nextVolume,
        nextSaleDate,
        nextSaleTime,
        nextSaleTimestamp,
        nextDuration,
        nextStartTs,
        nextExpiryTs,
        cleanNotes,
        now,
        saleId
      );

      db.exec('COMMIT');

      const updatedSale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId) as Record<
        string,
        unknown
      >;
      res.json({ sale: mapSaleRow(updatedSale) });
    } catch (txError) {
      db.exec('ROLLBACK');
      throw txError;
    }
  } catch (error) {
    console.error('Update sale error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update sale.' });
  }
});

// Delete Sale (Protected)
app.delete('/api/sales/:id', (req, res) => {
  try {
    const saleId = String(req.params.id);
    const db = getDb();
    const result = db.prepare('DELETE FROM sales WHERE id = ?').run(saleId);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Sale record not found.' });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Delete sale error:', error);
    res.status(500).json({ error: 'Failed to delete sale.' });
  }
});

// Issue Replacement (Preserves original sale, creates linked replacement)
app.post('/api/replacements', (req, res) => {
  try {
    const {
      originalSaleId,
      newAccountType,
      warrantyPolicy,
      newWarrantyDurationDays,
      replacementTimestamp,
      notes = '',
    } = req.body ?? {};

    if (typeof originalSaleId !== 'string' || !originalSaleId) {
      res.status(400).json({ error: 'Original Sale ID is required.' });
      return;
    }
    if (typeof newAccountType !== 'string' || !isValidAccountType(newAccountType)) {
      res.status(400).json({ error: 'Valid New Account Type (1–31 Billion) is required.' });
      return;
    }
    if (warrantyPolicy !== 'CONTINUE_ORIGINAL' && warrantyPolicy !== 'START_NEW') {
      res.status(400).json({ error: 'Valid Replacement Warranty Policy is required.' });
      return;
    }

    const db = getDb();
    const saleRow = db.prepare('SELECT * FROM sales WHERE id = ?').get(originalSaleId) as
      | Record<string, unknown>
      | undefined;

    if (!saleRow) {
      res.status(404).json({ error: 'Original sale record not found.' });
      return;
    }
    const sale = mapSaleRow(saleRow);

    const repTs =
      typeof replacementTimestamp === 'number' && Number.isFinite(replacementTimestamp)
        ? Math.floor(replacementTimestamp)
        : Date.now();

    const computedWarranty = computeReplacementWarranty({
      policy: warrantyPolicy,
      originalWarrantyDurationDays: sale.warrantyDurationDays,
      originalWarrantyStartTs: sale.warrantyStartTs,
      originalWarrantyExpiryTs: sale.warrantyExpiryTs,
      replacementTimestamp: repTs,
      newWarrantyDurationDays:
        newWarrantyDurationDays !== undefined ? Number(newWarrantyDurationDays) : undefined,
    });

    const normalizedNewType = `${parseAccountVolumeBillions(newAccountType)} Billion`;
    const cleanNotes = typeof notes === 'string' ? notes.trim().slice(0, 2000) : '';
    const now = Date.now();

    db.exec('BEGIN IMMEDIATE');
    try {
      const repId = generateId('rep');
      let repCode = generateCode('REP');
      while (db.prepare('SELECT 1 FROM replacements WHERE replacement_code = ?').get(repCode)) {
        repCode = generateCode('REP');
      }

      db.prepare(
        `INSERT INTO replacements (
          id, replacement_code, original_sale_id, client_id,
          original_account_type, new_account_type, replacement_timestamp,
          warranty_policy, warranty_duration_days, warranty_start_ts,
          warranty_expiry_ts, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        repId,
        repCode,
        sale.id,
        sale.clientId,
        sale.accountType,
        normalizedNewType,
        repTs,
        warrantyPolicy,
        computedWarranty.warrantyDurationDays,
        computedWarranty.warrantyStartTs,
        computedWarranty.warrantyExpiryTs,
        cleanNotes,
        now
      );

      db.prepare(
        'UPDATE sales SET replacement_count = replacement_count + 1, updated_at = ? WHERE id = ?'
      ).run(now, sale.id);

      db.exec('COMMIT');

      const repRow = db.prepare('SELECT * FROM replacements WHERE id = ?').get(repId) as Record<
        string,
        unknown
      >;
      res.status(201).json({ replacement: mapReplacementRow(repRow) });
    } catch (txError) {
      db.exec('ROLLBACK');
      throw txError;
    }
  } catch (error) {
    console.error('Create replacement error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to issue replacement.',
    });
  }
});

// Update Client Notes / Name
app.put('/api/clients/:id', (req, res) => {
  try {
    const clientId = String(req.params.id);
    const { name, notes } = req.body ?? {};
    const db = getDb();
    const existingRow = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId) as
      | Record<string, unknown>
      | undefined;

    if (!existingRow) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }
    const existing = mapClientRow(existingRow);
    const nextName =
      typeof name === 'string' && name.trim() ? name.trim().slice(0, 160) : existing.name;
    const nextNotes =
      typeof notes === 'string' ? notes.trim().slice(0, 2000) : existing.notes;
    const now = Date.now();

    db.prepare('UPDATE clients SET name = ?, notes = ?, updated_at = ? WHERE id = ?').run(
      nextName,
      nextNotes,
      now,
      clientId
    );
    const updatedRow = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId) as Record<
      string,
      unknown
    >;
    res.json({ client: mapClientRow(updatedRow) });
  } catch (error) {
    console.error('Update client error:', error);
    res.status(500).json({ error: 'Failed to update client.' });
  }
});

// Delete Client (Protected)
app.delete('/api/clients/:id', (req, res) => {
  try {
    const clientId = String(req.params.id);
    const db = getDb();
    const result = db.prepare('DELETE FROM clients WHERE id = ?').run(clientId);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Delete client error:', error);
    res.status(500).json({ error: 'Failed to delete client.' });
  }
});

// Update Settings (Protected)
app.put('/api/settings', (req, res) => {
  try {
    const {
      expiringSoonThresholdHours,
      defaultWarrantyDurationDays,
      defaultWarrantyStartMode,
      tableDensity,
      rememberSessionDays,
    } = req.body ?? {};

    const db = getDb();
    const current = mapSettingsRow(
      db.prepare('SELECT * FROM settings WHERE id = 1').get() as Record<string, unknown>
    );

    const nextThreshold =
      expiringSoonThresholdHours !== undefined
        ? Math.min(360, Math.max(1, Math.floor(Number(expiringSoonThresholdHours))))
        : current.expiringSoonThresholdHours;

    const nextDefaultDuration =
      defaultWarrantyDurationDays !== undefined &&
      isValidWarrantyDuration(Number(defaultWarrantyDurationDays))
        ? Number(defaultWarrantyDurationDays)
        : current.defaultWarrantyDurationDays;

    const nextStartMode =
      defaultWarrantyStartMode === 'SALE_TIME' || defaultWarrantyStartMode === 'CUSTOM'
        ? defaultWarrantyStartMode
        : current.defaultWarrantyStartMode;

    const nextDensity =
      tableDensity === 'COMFORTABLE' || tableDensity === 'COMPACT'
        ? tableDensity
        : current.tableDensity;

    const nextRememberDays =
      rememberSessionDays !== undefined
        ? Math.min(90, Math.max(1, Math.floor(Number(rememberSessionDays))))
        : current.rememberSessionDays;

    const now = Date.now();
    db.prepare(
      `UPDATE settings SET
        expiring_soon_threshold_hours = ?,
        default_warranty_duration_days = ?,
        default_warranty_start_mode = ?,
        table_density = ?,
        remember_session_days = ?,
        updated_at = ?
       WHERE id = 1`
    ).run(
      nextThreshold,
      nextDefaultDuration,
      nextStartMode,
      nextDensity,
      nextRememberDays,
      now
    );

    const updated = mapSettingsRow(
      db.prepare('SELECT * FROM settings WHERE id = 1').get() as Record<string, unknown>
    );
    res.json({ settings: updated });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings.' });
  }
});

// Full JSON Backup Export (Protected)
app.get('/api/backup', (_req, res) => {
  try {
    const db = getDb();
    const clients = db
      .prepare('SELECT * FROM clients')
      .all()
      .map((r) => mapClientRow(r as Record<string, unknown>));
    const sales = db
      .prepare('SELECT * FROM sales')
      .all()
      .map((r) => mapSaleRow(r as Record<string, unknown>));
    const replacements = db
      .prepare('SELECT * FROM replacements')
      .all()
      .map((r) => mapReplacementRow(r as Record<string, unknown>));
    const settings = mapSettingsRow(
      db.prepare('SELECT * FROM settings WHERE id = 1').get() as Record<string, unknown>
    );

    res.json({
      version: 1,
      exportedAt: new Date().toISOString(),
      clients,
      sales,
      replacements,
      settings,
    });
  } catch (error) {
    console.error('Backup export error:', error);
    res.status(500).json({ error: 'Failed to generate backup.' });
  }
});

// Restore / Cloud Sync Merge (Protected)
app.post('/api/restore', (req, res) => {
  try {
    const { clients, sales, replacements, settings, mode = 'replace' } = req.body ?? {};
    if (!Array.isArray(clients) || !Array.isArray(sales) || !Array.isArray(replacements)) {
      res.status(400).json({ error: 'Invalid backup structure.' });
      return;
    }

    const db = getDb();
    db.exec('BEGIN IMMEDIATE');
    try {
      if (mode === 'replace') {
        db.prepare('DELETE FROM replacements').run();
        db.prepare('DELETE FROM sales').run();
        db.prepare('DELETE FROM clients').run();
      }

      const upsertClient = db.prepare(
        `INSERT INTO clients (id, name, email, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           email = excluded.email,
           notes = excluded.notes,
           updated_at = MAX(clients.updated_at, excluded.updated_at)`
      );

      for (const c of clients) {
        if (!c?.id || !c?.email) continue;
        upsertClient.run(
          String(c.id),
          String(c.name || c.email),
          String(c.email).toLowerCase(),
          String(c.notes || ''),
          Number(c.createdAt || Date.now()),
          Number(c.updatedAt || Date.now())
        );
      }

      const upsertSale = db.prepare(
        `INSERT INTO sales (
          id, sale_code, client_id, client_name, client_email,
          account_type, account_volume_billions, sale_date, sale_time,
          sale_timestamp, warranty_duration_days, warranty_start_ts,
          warranty_expiry_ts, notes, replacement_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          client_name = excluded.client_name,
          client_email = excluded.client_email,
          account_type = excluded.account_type,
          account_volume_billions = excluded.account_volume_billions,
          sale_date = excluded.sale_date,
          sale_time = excluded.sale_time,
          sale_timestamp = excluded.sale_timestamp,
          warranty_duration_days = excluded.warranty_duration_days,
          warranty_start_ts = excluded.warranty_start_ts,
          warranty_expiry_ts = excluded.warranty_expiry_ts,
          notes = excluded.notes,
          replacement_count = excluded.replacement_count,
          updated_at = MAX(sales.updated_at, excluded.updated_at)`
      );

      for (const s of sales) {
        if (!s?.id || !s?.clientId) continue;
        upsertSale.run(
          String(s.id),
          String(s.saleCode || generateCode('MS')),
          String(s.clientId),
          String(s.clientName || ''),
          String(s.clientEmail || '').toLowerCase(),
          String(s.accountType || '1 Billion'),
          Number(s.accountVolumeBillions || 1),
          String(s.saleDate || '2026-01-01'),
          String(s.saleTime || '00:00'),
          Number(s.saleTimestamp || Date.now()),
          Number(s.warrantyDurationDays || 1),
          Number(s.warrantyStartTs || Date.now()),
          Number(s.warrantyExpiryTs || Date.now()),
          String(s.notes || ''),
          Number(s.replacementCount || 0),
          Number(s.createdAt || Date.now()),
          Number(s.updatedAt || Date.now())
        );
      }

      const upsertRep = db.prepare(
        `INSERT INTO replacements (
          id, replacement_code, original_sale_id, client_id,
          original_account_type, new_account_type, replacement_timestamp,
          warranty_policy, warranty_duration_days, warranty_start_ts,
          warranty_expiry_ts, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING`
      );

      for (const r of replacements) {
        if (!r?.id || !r?.originalSaleId || !r?.clientId) continue;
        upsertRep.run(
          String(r.id),
          String(r.replacementCode || generateCode('REP')),
          String(r.originalSaleId),
          String(r.clientId),
          String(r.originalAccountType || '1 Billion'),
          String(r.newAccountType || '1 Billion'),
          Number(r.replacementTimestamp || Date.now()),
          String(r.warrantyPolicy || 'CONTINUE_ORIGINAL'),
          Number(r.warrantyDurationDays || 1),
          Number(r.warrantyStartTs || Date.now()),
          Number(r.warrantyExpiryTs || Date.now()),
          String(r.notes || ''),
          Number(r.createdAt || Date.now())
        );
      }

      if (settings && typeof settings === 'object') {
        db.prepare(
          `UPDATE settings SET
            expiring_soon_threshold_hours = ?,
            default_warranty_duration_days = ?,
            default_warranty_start_mode = ?,
            table_density = ?,
            remember_session_days = ?,
            updated_at = ?
           WHERE id = 1`
        ).run(
          Number(settings.expiringSoonThresholdHours || 48),
          Number(settings.defaultWarrantyDurationDays || 10),
          settings.defaultWarrantyStartMode === 'CUSTOM' ? 'CUSTOM' : 'SALE_TIME',
          settings.tableDensity === 'COMPACT' ? 'COMPACT' : 'COMFORTABLE',
          Number(settings.rememberSessionDays || 30),
          Number(settings.updatedAt || Date.now())
        );
      }

      db.exec('COMMIT');
      res.json({ success: true });
    } catch (txError) {
      db.exec('ROLLBACK');
      throw txError;
    }
  } catch (error) {
    console.error('Restore backup error:', error);
    res.status(500).json({ error: 'Failed to restore backup data.' });
  }
});

// Initialize database on startup (non-blocking)
getDb();

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Muse Sales Manager server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
