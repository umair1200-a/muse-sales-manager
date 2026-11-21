import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EngineError,
  createEmptyDatabaseState,
  createReplacementInState,
  createSaleInState,
  deleteClientInState,
  deleteSaleInState,
  exportBackupFromState,
  mergeDatabaseStates,
  restoreBackupIntoState,
  updateClientInState,
  updateSaleInState,
  updateSettingsInState,
} from './salesEngine.ts';
import apiHandler from '../../api/index.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';

test('salesEngine validates required inputs and rejects invalid payloads', () => {
  const empty = createEmptyDatabaseState(1000);

  assert.throws(
    () =>
      createSaleInState(empty, {
        clientName: '',
        clientEmail: 'a@b.com',
        accountType: '5 Billion',
        warrantyDurationDays: 10,
        saleDate: '2026-05-01',
        saleTime: '12:00',
        warrantyStartTs: 1000,
      }),
    (err: unknown) => err instanceof EngineError && err.status === 400
  );

  assert.throws(
    () =>
      createSaleInState(empty, {
        clientName: 'Test Client',
        clientEmail: 'not-an-email',
        accountType: '5 Billion',
        warrantyDurationDays: 10,
        saleDate: '2026-05-01',
        saleTime: '12:00',
        warrantyStartTs: 1000,
      }),
    (err: unknown) => err instanceof EngineError && err.status === 400
  );

  assert.throws(
    () =>
      createSaleInState(empty, {
        clientName: 'Test Client',
        clientEmail: 'client@example.com',
        accountType: '99 Billion',
        warrantyDurationDays: 10,
        saleDate: '2026-05-01',
        saleTime: '12:00',
        warrantyStartTs: 1000,
      }),
    (err: unknown) => err instanceof EngineError && err.status === 400
  );
});

test('salesEngine creates sales, deduplicates clients by email, preserves warranty on edit, and issues replacements', () => {
  const s0 = createEmptyDatabaseState(1_700_000_000_000);

  const c1 = createSaleInState(
    s0,
    {
      clientName: 'Rohan Sharma',
      clientEmail: 'Rohan@Example.com',
      accountType: '10 Billion',
      warrantyDurationDays: 10,
      saleDate: '2026-05-01',
      saleTime: '14:30',
      warrantyStartTs: 1_777_645_800_000,
      notes: 'First account',
    },
    1_777_645_800_000
  );

  assert.equal(c1.client.email, 'rohan@example.com');
  assert.equal(c1.sale.accountVolumeBillions, 10);
  assert.ok(c1.sale.saleCode.startsWith('MS-'));

  // Second sale with same email reuses the same client ID
  const c2 = createSaleInState(
    c1.nextState,
    {
      clientName: 'Rohan Sharma',
      clientEmail: 'rohan@example.com',
      accountType: '25 Billion',
      warrantyDurationDays: 20,
      saleDate: '2026-05-02',
      saleTime: '09:00',
      warrantyStartTs: 1_777_712_400_000,
      notes: 'Second account',
    },
    1_777_712_400_000
  );

  assert.equal(c2.nextState.clients.length, 1);
  assert.equal(c2.nextState.sales.length, 2);
  assert.equal(c2.sale.clientId, c1.client.id);

  // Edit notes without recalculateWarranty preserves warrantyExpiryTs
  const edited = updateSaleInState(
    c2.nextState,
    c1.sale.id,
    { notes: 'Updated remark', recalculateWarranty: false },
    1_777_720_000_000
  );
  assert.equal(edited.sale.warrantyExpiryTs, c1.sale.warrantyExpiryTs);
  assert.equal(edited.sale.notes, 'Updated remark');

  // Issue replacement with CONTINUE_ORIGINAL preserves expiry and increments replacementCount
  const rep = createReplacementInState(
    edited.nextState,
    {
      originalSaleId: c1.sale.id,
      newAccountType: '12 Billion',
      warrantyPolicy: 'CONTINUE_ORIGINAL',
      replacementTimestamp: 1_777_730_000_000,
      notes: 'Tier swap',
    },
    1_777_730_000_000
  );
  assert.ok(rep.replacement.replacementCode.startsWith('REP-'));
  assert.equal(rep.replacement.warrantyExpiryTs, c1.sale.warrantyExpiryTs);
  const updatedOrigSale = rep.nextState.sales.find((s) => s.id === c1.sale.id);
  assert.equal(updatedOrigSale?.replacementCount, 1);

  // Update client notes & settings
  const clientUpd = updateClientInState(rep.nextState, c1.client.id, { notes: 'VIP buyer' });
  assert.equal(clientUpd.client.notes, 'VIP buyer');

  const settingsUpd = updateSettingsInState(clientUpd.nextState, {
    expiringSoonThresholdHours: 72,
    tableDensity: 'COMPACT',
  });
  assert.equal(settingsUpd.settings.expiringSoonThresholdHours, 72);
  assert.equal(settingsUpd.settings.tableDensity, 'COMPACT');

  // Backup export & restore
  const backup = exportBackupFromState(settingsUpd.nextState);
  const wiped = deleteClientInState(settingsUpd.nextState, c1.client.id);
  assert.equal(wiped.nextState.clients.length, 0);
  assert.equal(wiped.nextState.sales.length, 0);
  assert.equal(wiped.nextState.replacements.length, 0);

  const restored = restoreBackupIntoState(wiped.nextState, {
    clients: backup.clients,
    sales: backup.sales,
    replacements: backup.replacements,
    settings: backup.settings,
    mode: 'replace',
  });
  assert.equal(restored.nextState.clients.length, 1);
  assert.equal(restored.nextState.sales.length, 2);
  assert.equal(restored.nextState.replacements.length, 1);

  // Delete single sale cascades its replacements
  const afterSaleDelete = deleteSaleInState(restored.nextState, c1.sale.id);
  assert.equal(afterSaleDelete.nextState.sales.length, 1);
  assert.equal(afterSaleDelete.nextState.replacements.length, 0);
});

test('Vercel /api/index handler serves /api/health, /api/state, and full CRUD without 404s', async () => {
  async function invoke(method: string, url: string, body?: unknown) {
    let statusCode = 200;
    const headers: Record<string, string> = {};
    let payloadText = '';

    const req = {
      method,
      url,
      headers: {},
      body,
      async *[Symbol.asyncIterator]() {
        // body provided directly
      },
    } as unknown as IncomingMessage;

    const res = {
      set statusCode(code: number) {
        statusCode = code;
      },
      get statusCode() {
        return statusCode;
      },
      setHeader(name: string, val: string) {
        headers[name.toLowerCase()] = val;
      },
      end(chunk?: string | Buffer) {
        payloadText = chunk ? String(chunk) : '';
      },
    } as unknown as ServerResponse;

    await apiHandler(req, res);
    return {
      statusCode,
      headers,
      json: payloadText ? JSON.parse(payloadText) : null,
    };
  }

  const health = await invoke('GET', '/api/health');
  assert.equal(health.statusCode, 200);
  assert.equal(health.json.status, 'ok');
  assert.equal(health.json.persistent, false);

  const stateRes = await invoke('GET', '/api/state');
  assert.equal(stateRes.statusCode, 200);
  assert.ok(Array.isArray(stateRes.json.sales));

  const createRes = await invoke('POST', '/api/sales', {
    clientName: 'Vercel Test Buyer',
    clientEmail: 'vercel-test@example.com',
    accountType: '7 Billion',
    warrantyDurationDays: 14,
    saleDate: '2026-05-10',
    saleTime: '10:00',
    warrantyStartTs: Date.now(),
    notes: 'Vercel handler test',
  });
  assert.equal(createRes.statusCode, 201);
  const saleId = createRes.json.sale.id;
  const clientId = createRes.json.client.id;

  const repRes = await invoke('POST', '/api/replacements', {
    originalSaleId: saleId,
    newAccountType: '8 Billion',
    warrantyPolicy: 'CONTINUE_ORIGINAL',
    replacementTimestamp: Date.now(),
    notes: 'Replacement check',
  });
  assert.equal(repRes.statusCode, 201);

  const delRes = await invoke('DELETE', `/api/sales/${saleId}`);
  assert.equal(delRes.statusCode, 200);

  const delCliRes = await invoke('DELETE', `/api/clients/${clientId}`);
  assert.equal(delCliRes.statusCode, 200);
});

test('mergeDatabaseStates merges offline and cloud records cleanly, deduplicates clients by email, and preserves remote metadata', () => {
  const remoteBase = createSaleInState(
    createEmptyDatabaseState(1_000),
    {
      clientName: 'Cloud Buyer',
      clientEmail: 'shared@example.com',
      accountType: '10 Billion',
      warrantyDurationDays: 10,
      saleDate: '2026-05-01',
      saleTime: '10:00',
      warrantyStartTs: 1_777_629_600_000,
      notes: 'Remote sale',
    },
    1_777_629_600_000
  ).nextState;

  const remoteWithRep = createReplacementInState(
    remoteBase,
    {
      originalSaleId: remoteBase.sales[0].id,
      newAccountType: '12 Billion',
      warrantyPolicy: 'CONTINUE_ORIGINAL',
      replacementTimestamp: 1_777_640_000_000,
      notes: 'Remote replacement',
    },
    1_777_640_000_000
  ).nextState;

  // Identical states require no cloud upload
  const identical = mergeDatabaseStates(remoteWithRep, remoteWithRep);
  assert.equal(identical.needsCloudUpload, false);
  assert.equal(identical.merged.clients.length, 1);
  assert.equal(identical.merged.sales.length, 1);
  assert.equal(identical.merged.replacements.length, 1);

  // Local device has a second offline sale for the SAME email under a different local clientId + a brand-new buyer
  const localOnlyShared = createSaleInState(
    createEmptyDatabaseState(2_000),
    {
      clientName: 'Local Alias Name',
      clientEmail: 'SHARED@example.com',
      accountType: '15 Billion',
      warrantyDurationDays: 15,
      saleDate: '2026-05-02',
      saleTime: '12:00',
      warrantyStartTs: 1_777_723_200_000,
      notes: 'Offline mobile sale',
    },
    1_777_723_200_000
  ).nextState;

  const localBoth = createSaleInState(
    localOnlyShared,
    {
      clientName: 'Brand New Buyer',
      clientEmail: 'newbuyer@example.com',
      accountType: '20 Billion',
      warrantyDurationDays: 20,
      saleDate: '2026-05-03',
      saleTime: '14:00',
      warrantyStartTs: 1_777_816_800_000,
      notes: 'Another offline sale',
    },
    1_777_816_800_000
  ).nextState;

  const mergedResult = mergeDatabaseStates(localBoth, remoteWithRep);
  assert.equal(mergedResult.needsCloudUpload, true);
  assert.equal(mergedResult.merged.clients.length, 2);
  assert.equal(mergedResult.merged.sales.length, 3);
  assert.equal(mergedResult.merged.replacements.length, 1);

  const canonicalSharedClient = mergedResult.merged.clients.find(
    (c) => c.email === 'shared@example.com'
  );
  assert.ok(canonicalSharedClient);
  assert.equal(canonicalSharedClient.id, remoteWithRep.clients[0].id);

  // Local offline sale for shared@example.com must have been remapped to the canonical remote clientId
  const remappedSale = mergedResult.merged.sales.find((s) => s.notes === 'Offline mobile sale');
  assert.ok(remappedSale);
  assert.equal(remappedSale.clientId, canonicalSharedClient.id);
});

