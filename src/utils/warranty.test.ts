import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCOUNT_TYPES,
  DAY_MS,
  HOUR_MS,
  WARRANTY_DURATIONS,
  calculateWarrantyExpiryTs,
  calculateWarrantyRemaining,
  computeReplacementWarranty,
  enrichSaleWithWarranty,
  getWarrantyStatus,
  parseAccountVolumeBillions,
} from './warranty.ts';
import type { ReplacementRecord, SaleRecord } from '../types/models.ts';

test('ACCOUNT_TYPES contains all 31 options from 1 Billion to 31 Billion', () => {
  assert.equal(ACCOUNT_TYPES.length, 31);
  assert.equal(ACCOUNT_TYPES[0], '1 Billion');
  assert.equal(ACCOUNT_TYPES[14], '15 Billion');
  assert.equal(ACCOUNT_TYPES[30], '31 Billion');
  assert.equal(parseAccountVolumeBillions('31 Billion'), 31);
});

test('WARRANTY_DURATIONS contains all 25 options from 1 Day to 25 Days with exact 24h multiples', () => {
  assert.equal(WARRANTY_DURATIONS.length, 25);
  assert.equal(WARRANTY_DURATIONS[0].hours, 24);
  assert.equal(WARRANTY_DURATIONS[9].hours, 240);
  assert.equal(WARRANTY_DURATIONS[24].hours, 600);
});

test('calculateWarrantyExpiryTs adds exact 24h * days', () => {
  const start = Date.UTC(2026, 10, 19, 18, 30, 0);
  const expiry = calculateWarrantyExpiryTs(start, 10);
  assert.equal(expiry - start, 10 * DAY_MS);
});

test('calculateWarrantyRemaining computes days, hours, minutes, seconds and expired labels deterministically', () => {
  const start = 1_700_000_000_000;
  const expiry = start + 10 * DAY_MS;
  const rem = calculateWarrantyRemaining(expiry, start + 1000);
  assert.equal(rem.isExpired, false);
  assert.equal(rem.days, 9);
  assert.equal(rem.hours, 23);
  assert.equal(rem.minutes, 59);
  assert.equal(rem.seconds, 59);
  assert.equal(rem.formattedCountdown, '09 DAYS : 23 HOURS : 59 MINUTES : 59 SECONDS');

  const expiredOneHour = calculateWarrantyRemaining(expiry, expiry + HOUR_MS);
  assert.equal(expiredOneHour.isExpired, true);
  assert.equal(expiredOneHour.expiredAgoLabel, 'Expired 1 Hour Ago');

  const expiredFiveDays = calculateWarrantyRemaining(expiry, expiry + 5 * DAY_MS);
  assert.equal(expiredFiveDays.expiredAgoLabel, 'Expired 5 Days Ago');
});

test('getWarrantyStatus assigns ACTIVE, EXPIRING_SOON, and EXPIRED based on threshold', () => {
  const now = 1_700_000_000_000;
  assert.equal(getWarrantyStatus(now + 49 * HOUR_MS, 48, now), 'ACTIVE');
  assert.equal(getWarrantyStatus(now + 48 * HOUR_MS, 48, now), 'EXPIRING_SOON');
  assert.equal(getWarrantyStatus(now + 12 * HOUR_MS, 48, now), 'EXPIRING_SOON');
  assert.equal(getWarrantyStatus(now, 48, now), 'EXPIRED');
  assert.equal(getWarrantyStatus(now - 5000, 48, now), 'EXPIRED');
});

test('computeReplacementWarranty handles CONTINUE_ORIGINAL vs START_NEW policies', () => {
  const origStart = 1_700_000_000_000;
  const origExpiry = origStart + 10 * DAY_MS;
  const repTs = origStart + 4 * DAY_MS;

  const continued = computeReplacementWarranty({
    policy: 'CONTINUE_ORIGINAL',
    originalWarrantyDurationDays: 10,
    originalWarrantyStartTs: origStart,
    originalWarrantyExpiryTs: origExpiry,
    replacementTimestamp: repTs,
    newWarrantyDurationDays: 20,
  });
  assert.equal(continued.warrantyStartTs, origStart);
  assert.equal(continued.warrantyExpiryTs, origExpiry);
  assert.equal(continued.warrantyDurationDays, 10);

  const startedNew = computeReplacementWarranty({
    policy: 'START_NEW',
    originalWarrantyDurationDays: 10,
    originalWarrantyStartTs: origStart,
    originalWarrantyExpiryTs: origExpiry,
    replacementTimestamp: repTs,
    newWarrantyDurationDays: 15,
  });
  assert.equal(startedNew.warrantyStartTs, repTs);
  assert.equal(startedNew.warrantyExpiryTs, repTs + 15 * DAY_MS);
  assert.equal(startedNew.warrantyDurationDays, 15);
});

test('enrichSaleWithWarranty preserves original sale timestamps and updates effective warranty on START_NEW replacement', () => {
  const start = 1_700_000_000_000;
  const sale: SaleRecord = {
    id: 'sale_1',
    saleCode: 'MS-000001',
    clientId: 'cli_1',
    clientName: 'Test Client',
    clientEmail: 'test@example.com',
    accountType: '10 Billion',
    accountVolumeBillions: 10,
    saleDate: '2026-11-19',
    saleTime: '18:30',
    saleTimestamp: start,
    warrantyDurationDays: 10,
    warrantyStartTs: start,
    warrantyExpiryTs: start + 10 * DAY_MS,
    notes: '',
    replacementCount: 1,
    createdAt: start,
    updatedAt: start,
  };

  const rep: ReplacementRecord = {
    id: 'rep_1',
    replacementCode: 'REP-000001',
    originalSaleId: 'sale_1',
    clientId: 'cli_1',
    originalAccountType: '10 Billion',
    newAccountType: '20 Billion',
    replacementTimestamp: start + 2 * DAY_MS,
    warrantyPolicy: 'START_NEW',
    warrantyDurationDays: 15,
    warrantyStartTs: start + 2 * DAY_MS,
    warrantyExpiryTs: start + 17 * DAY_MS,
    notes: 'Upgraded replacement',
    createdAt: start + 2 * DAY_MS,
  };

  const enriched = enrichSaleWithWarranty(sale, [rep], 48, start + 3 * DAY_MS);
  assert.equal(enriched.warrantyExpiryTs, start + 10 * DAY_MS);
  assert.equal(enriched.effectiveWarrantyExpiryTs, start + 17 * DAY_MS);
  assert.equal(enriched.effectiveAccountType, '20 Billion');
  assert.equal(enriched.warrantyStatus, 'ACTIVE');
});
