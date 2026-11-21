import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCsv,
  computeAccountSellStats,
  computeDashboardMetrics,
  filterAccountSellSales,
} from './analytics.ts';
import { DAY_MS } from './warranty.ts';
import type { AppSettings, ClientRecord, ReplacementRecord, SaleRecord } from '../types/models.ts';

const baseSettings: AppSettings = {
  expiringSoonThresholdHours: 48,
  defaultWarrantyDurationDays: 10,
  defaultWarrantyStartMode: 'SALE_TIME',
  tableDensity: 'COMFORTABLE',
  rememberSessionDays: 30,
  updatedAt: 1_700_000_000_000,
};

test('computeDashboardMetrics aggregates totals, account tiers, and statuses accurately', () => {
  const now = new Date(2026, 10, 19, 12, 0, 0, 0).getTime();

  const clients: ClientRecord[] = [
    {
      id: 'cli_1',
      name: 'Alice',
      email: 'alice@example.com',
      notes: '',
      createdAt: now - 5 * DAY_MS,
      updatedAt: now - 5 * DAY_MS,
    },
    {
      id: 'cli_2',
      name: 'Bob',
      email: 'bob@example.com',
      notes: '',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const sales: SaleRecord[] = [
    {
      id: 'sale_1',
      saleCode: 'MS-100001',
      clientId: 'cli_1',
      clientName: 'Alice',
      clientEmail: 'alice@example.com',
      accountType: '5 Billion',
      accountVolumeBillions: 5,
      saleDate: '2026-11-14',
      saleTime: '10:00',
      saleTimestamp: now - 5 * DAY_MS,
      warrantyDurationDays: 4,
      warrantyStartTs: now - 5 * DAY_MS,
      warrantyExpiryTs: now - 1 * DAY_MS, // expired
      notes: '',
      replacementCount: 0,
      createdAt: now - 5 * DAY_MS,
      updatedAt: now - 5 * DAY_MS,
    },
    {
      id: 'sale_2',
      saleCode: 'MS-100002',
      clientId: 'cli_2',
      clientName: 'Bob',
      clientEmail: 'bob@example.com',
      accountType: '15 Billion',
      accountVolumeBillions: 15,
      saleDate: '2026-11-19',
      saleTime: '09:00',
      saleTimestamp: now - 1000, // today
      warrantyDurationDays: 10,
      warrantyStartTs: now - 1000,
      warrantyExpiryTs: now - 1000 + 10 * DAY_MS, // active
      notes: '',
      replacementCount: 1,
      createdAt: now - 1000,
      updatedAt: now - 1000,
    },
  ];

  const replacements: ReplacementRecord[] = [
    {
      id: 'rep_1',
      replacementCode: 'REP-100001',
      originalSaleId: 'sale_2',
      clientId: 'cli_2',
      originalAccountType: '15 Billion',
      newAccountType: '15 Billion',
      replacementTimestamp: now - 500,
      warrantyPolicy: 'CONTINUE_ORIGINAL',
      warrantyDurationDays: 10,
      warrantyStartTs: now - 1000,
      warrantyExpiryTs: now - 1000 + 10 * DAY_MS,
      notes: 'Replaced quickly',
      createdAt: now - 500,
    },
  ];

  const allTime = computeDashboardMetrics({
    sales,
    clients,
    replacements,
    settings: baseSettings,
    preset: 'all_time',
    nowTs: now,
  });

  assert.equal(allTime.totalAccountsSold, 2);
  assert.equal(allTime.totalClients, 2);
  assert.equal(allTime.activeWarranties, 1);
  assert.equal(allTime.expiredWarranties, 1);
  assert.equal(allTime.expiringSoonWarranties, 0);
  assert.equal(allTime.todaysSales, 1);
  assert.equal(allTime.totalReplacements, 1);
  assert.equal(allTime.totalAccountVolumeBillions, 20);
  assert.equal(allTime.accountTypeStats.find((a) => a.accountType === '15 Billion')?.count, 1);
  assert.equal(allTime.accountTypeStats.find((a) => a.accountType === '5 Billion')?.count, 1);
  assert.equal(allTime.replacementPolicyBreakdown.continueOriginal, 1);

  const todayOnly = computeDashboardMetrics({
    sales,
    clients,
    replacements,
    settings: baseSettings,
    preset: 'today',
    nowTs: now,
  });
  assert.equal(todayOnly.totalAccountsSold, 1);
  assert.equal(todayOnly.totalAccountVolumeBillions, 15);
});

test('computeAccountSellStats obeys all 6 counting rules and covers all 31 tiers', () => {
  const now = new Date(2026, 10, 19, 12, 0, 0, 0).getTime();

  const expiredSale: SaleRecord = {
    id: 'sale_exp',
    saleCode: 'MS-100001',
    clientId: 'cli_1',
    clientName: 'Alice',
    clientEmail: 'alice@example.com',
    accountType: '1 Billion',
    accountVolumeBillions: 1,
    saleDate: '2026-10-10',
    saleTime: '10:00',
    saleTimestamp: new Date(2026, 9, 10, 10, 0, 0, 0).getTime(), // prior month
    warrantyDurationDays: 5,
    warrantyStartTs: new Date(2026, 9, 10, 10, 0, 0, 0).getTime(),
    warrantyExpiryTs: new Date(2026, 9, 15, 10, 0, 0, 0).getTime(), // expired
    notes: '',
    replacementCount: 0,
    createdAt: 1,
    updatedAt: 1,
  };

  const monthSaleWithReplacement: SaleRecord = {
    id: 'sale_month',
    saleCode: 'MS-100002',
    clientId: 'cli_2',
    clientName: 'Bob',
    clientEmail: 'bob@example.com',
    accountType: '10 Billion',
    accountVolumeBillions: 10,
    saleDate: '2026-11-05',
    saleTime: '14:30',
    saleTimestamp: new Date(2026, 10, 5, 14, 30, 0, 0).getTime(), // this month, not today
    warrantyDurationDays: 10,
    warrantyStartTs: new Date(2026, 10, 5, 14, 30, 0, 0).getTime(),
    warrantyExpiryTs: new Date(2026, 10, 15, 14, 30, 0, 0).getTime(),
    notes: '',
    replacementCount: 3, // 3 replacements must NOT increase sales count
    createdAt: 2,
    updatedAt: 2,
  };

  const todaySale: SaleRecord = {
    id: 'sale_today',
    saleCode: 'MS-100003',
    clientId: 'cli_3',
    clientName: 'Carol',
    clientEmail: 'carol@example.com',
    accountType: '31 Billion',
    accountVolumeBillions: 31,
    saleDate: '2026-11-19',
    saleTime: '09:15',
    saleTimestamp: new Date(2026, 10, 19, 9, 15, 0, 0).getTime(), // today
    warrantyDurationDays: 25,
    warrantyStartTs: new Date(2026, 10, 19, 9, 15, 0, 0).getTime(),
    warrantyExpiryTs: new Date(2026, 10, 19, 9, 15, 0, 0).getTime() + 25 * DAY_MS,
    notes: '',
    replacementCount: 0,
    createdAt: 3,
    updatedAt: 3,
  };

  const initial = [expiredSale, monthSaleWithReplacement, todaySale];
  const stats = computeAccountSellStats(initial, now);

  assert.equal(stats.totalAccountsSold, 3);
  assert.equal(stats.totalSales, 3);
  assert.equal(stats.accountsSoldToday, 1);
  assert.equal(stats.accountsSoldThisMonth, 2); // monthSaleWithReplacement + todaySale
  assert.equal(stats.totalVolumeBillions, 42);
  assert.equal(stats.accountTypeBreakdown.length, 31);
  assert.equal(stats.accountTypeBreakdown[0].accountType, '1 Billion');
  assert.equal(stats.accountTypeBreakdown[0].count, 1);
  assert.equal(stats.accountTypeBreakdown[9].accountType, '10 Billion');
  assert.equal(stats.accountTypeBreakdown[9].count, 1);
  assert.equal(stats.accountTypeBreakdown[30].accountType, '31 Billion');
  assert.equal(stats.accountTypeBreakdown[30].count, 1);

  // Editing an existing sale updates tier breakdown without increasing total count
  const edited = [
    expiredSale,
    { ...monthSaleWithReplacement, accountType: '20 Billion', accountVolumeBillions: 20 },
    todaySale,
  ];
  const afterEdit = computeAccountSellStats(edited, now);
  assert.equal(afterEdit.totalAccountsSold, 3);
  assert.equal(afterEdit.totalSales, 3);
  assert.equal(afterEdit.accountTypeBreakdown[9].count, 0);
  assert.equal(afterEdit.accountTypeBreakdown[19].count, 1);

  // Deleting a record decrements counts accurately
  const afterDelete = computeAccountSellStats(edited.slice(0, 2), now);
  assert.equal(afterDelete.totalAccountsSold, 2);
  assert.equal(afterDelete.accountsSoldToday, 0);
  assert.equal(afterDelete.accountsSoldThisMonth, 1);
});

test('filterAccountSellSales filters by search query, account type, and sale date modes', () => {
  const now = new Date(2026, 10, 19, 12, 0, 0, 0).getTime();
  const s1: SaleRecord = {
    id: 'sale_1',
    saleCode: 'MS-100001',
    clientId: 'cli_1',
    clientName: 'Alice Alpha',
    clientEmail: 'alice@example.com',
    accountType: '5 Billion',
    accountVolumeBillions: 5,
    saleDate: '2026-10-10',
    saleTime: '10:00',
    saleTimestamp: new Date(2026, 9, 10, 10, 0, 0, 0).getTime(),
    warrantyDurationDays: 5,
    warrantyStartTs: new Date(2026, 9, 10, 10, 0, 0, 0).getTime(),
    warrantyExpiryTs: new Date(2026, 9, 15, 10, 0, 0, 0).getTime(),
    notes: '',
    replacementCount: 0,
    createdAt: 1,
    updatedAt: 1,
  };
  const s2: SaleRecord = {
    id: 'sale_2',
    saleCode: 'MS-100002',
    clientId: 'cli_2',
    clientName: 'Bob Beta',
    clientEmail: 'bob@example.com',
    accountType: '15 Billion',
    accountVolumeBillions: 15,
    saleDate: '2026-11-19',
    saleTime: '11:20',
    saleTimestamp: new Date(2026, 10, 19, 11, 20, 0, 0).getTime(),
    warrantyDurationDays: 10,
    warrantyStartTs: new Date(2026, 10, 19, 11, 20, 0, 0).getTime(),
    warrantyExpiryTs: new Date(2026, 10, 29, 11, 20, 0, 0).getTime(),
    notes: '',
    replacementCount: 0,
    createdAt: 2,
    updatedAt: 2,
  };

  assert.equal(filterAccountSellSales([s1, s2], { accountType: '15 Billion' }, now).length, 1);
  assert.equal(filterAccountSellSales([s1, s2], { dateMode: 'TODAY' }, now).length, 1);
  assert.equal(
    filterAccountSellSales([s1, s2], { dateMode: 'SINGLE_DATE', singleDate: '2026-10-10' }, now)[0]
      .id,
    'sale_1'
  );
  assert.equal(
    filterAccountSellSales(
      [s1, s2],
      { dateMode: 'RANGE', dateFrom: '2026-11-01', dateTo: '2026-11-30' },
      now
    )[0].id,
    'sale_2'
  );
  assert.equal(filterAccountSellSales([s1, s2], { query: 'alice' }, now)[0].id, 'sale_1');
});

test('buildCsv escapes formulas, quotes, and emits UTF-8 BOM', () => {
  const csv = buildCsv(['Name', 'Email', 'Notes'], [['=Alice', 'a@b.com', 'Line "1", ok']]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes("'=Alice"));
  assert.ok(csv.includes('"Line ""1"", ok"'));
});

