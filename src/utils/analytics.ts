import type {
  AccountSellDateMode,
  AccountSellStats,
  AccountTypeStat,
  AppSettings,
  ClientRecord,
  ClientWithStats,
  DashboardMetrics,
  DateRangePreset,
  ReplacementRecord,
  SaleRecord,
  SaleWithComputed,
  TimeBucketPoint,
  WarrantyDurationStat,
} from '../types/models.ts';
import {
  ACCOUNT_TYPES,
  DAY_MS,
  WARRANTY_DURATIONS,
  enrichSaleWithWarranty,
  parseDateAndTimeToTimestamp,
} from './warranty.ts';

export function getDateRangeBounds(
  preset: DateRangePreset,
  nowTs: number = Date.now(),
  customStart?: string,
  customEnd?: string
): { startTs: number; endTs: number } {
  const now = new Date(nowTs);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

  switch (preset) {
    case 'today':
      return { startTs: startOfToday, endTs: endOfToday };
    case 'last_7_days':
      return { startTs: startOfToday - 6 * DAY_MS, endTs: endOfToday };
    case 'last_30_days':
      return { startTs: startOfToday - 29 * DAY_MS, endTs: endOfToday };
    case 'this_month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
      return { startTs: start, endTs: endOfToday };
    }
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0).getTime();
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime();
      return { startTs: start, endTs: end };
    }
    case 'this_year': {
      const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0).getTime();
      return { startTs: start, endTs: endOfToday };
    }
    case 'custom': {
      let startTs = 0;
      let endTs = Number.MAX_SAFE_INTEGER;
      if (customStart) {
        try {
          startTs = parseDateAndTimeToTimestamp(customStart, '00:00');
        } catch {
          startTs = 0;
        }
      }
      if (customEnd) {
        try {
          endTs = parseDateAndTimeToTimestamp(customEnd, '23:59:59') + 999;
        } catch {
          endTs = Number.MAX_SAFE_INTEGER;
        }
      }
      return { startTs, endTs };
    }
    case 'all_time':
    default:
      return { startTs: 0, endTs: Number.MAX_SAFE_INTEGER };
  }
}

export function buildClientsWithStats(
  clients: ClientRecord[],
  enrichedSales: SaleWithComputed[],
  replacements: ReplacementRecord[]
): ClientWithStats[] {
  const salesByClient = new Map<string, SaleWithComputed[]>();
  for (const sale of enrichedSales) {
    const arr = salesByClient.get(sale.clientId) ?? [];
    arr.push(sale);
    salesByClient.set(sale.clientId, arr);
  }

  const replacementsByClient = new Map<string, ReplacementRecord[]>();
  for (const rep of replacements) {
    const arr = replacementsByClient.get(rep.clientId) ?? [];
    arr.push(rep);
    replacementsByClient.set(rep.clientId, arr);
  }

  return clients
    .map((client) => {
      const clientSales = [...(salesByClient.get(client.id) ?? [])].sort(
        (a, b) => b.saleTimestamp - a.saleTimestamp
      );
      const clientReps = [...(replacementsByClient.get(client.id) ?? [])].sort(
        (a, b) => b.replacementTimestamp - a.replacementTimestamp
      );

      const firstPurchaseTs =
        clientSales.length > 0
          ? Math.min(...clientSales.map((s) => s.saleTimestamp))
          : null;

      const accountTypesSet = new Set<string>();
      let totalVolumeBillions = 0;
      let activeWarranties = 0;
      let expiringSoonWarranties = 0;
      let expiredWarranties = 0;

      for (const s of clientSales) {
        accountTypesSet.add(s.accountType);
        totalVolumeBillions += s.accountVolumeBillions;
        if (s.warrantyStatus === 'ACTIVE') activeWarranties += 1;
        else if (s.warrantyStatus === 'EXPIRING_SOON') expiringSoonWarranties += 1;
        else expiredWarranties += 1;
      }

      return {
        ...client,
        firstPurchaseTs,
        totalAccountsPurchased: clientSales.length,
        totalVolumeBillions,
        accountTypesPurchased: Array.from(accountTypesSet),
        totalReplacements: clientReps.length,
        activeWarranties,
        expiringSoonWarranties,
        expiredWarranties,
        sales: clientSales,
        replacements: clientReps,
      };
    })
    .sort((a, b) => (b.firstPurchaseTs ?? b.createdAt) - (a.firstPurchaseTs ?? a.createdAt));
}

function getLocalDayKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getLocalMonthKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function getWeekStartTs(ts: number): number {
  const d = new Date(ts);
  const dayOfWeek = d.getDay(); // 0=Sun..6=Sat
  const diffToMon = (dayOfWeek + 6) % 7;
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diffToMon, 0, 0, 0, 0);
  return mon.getTime();
}

export function computeDashboardMetrics(params: {
  sales: SaleRecord[];
  clients: ClientRecord[];
  replacements: ReplacementRecord[];
  settings: AppSettings;
  preset: DateRangePreset;
  nowTs?: number;
  customStart?: string;
  customEnd?: string;
}): DashboardMetrics {
  const nowTs = params.nowTs ?? Date.now();
  const thresholdHours = params.settings.expiringSoonThresholdHours;

  // Group replacements by saleId
  const replacementsBySale = new Map<string, ReplacementRecord[]>();
  for (const rep of params.replacements) {
    const arr = replacementsBySale.get(rep.originalSaleId) ?? [];
    arr.push(rep);
    replacementsBySale.set(rep.originalSaleId, arr);
  }

  // Enrich all sales first
  const allEnrichedSales = params.sales.map((s) =>
    enrichSaleWithWarranty(s, replacementsBySale.get(s.id) ?? [], thresholdHours, nowTs)
  );

  // Filter sales & replacements by selected date preset
  const { startTs, endTs } = getDateRangeBounds(
    params.preset,
    nowTs,
    params.customStart,
    params.customEnd
  );

  const filteredSales = allEnrichedSales.filter(
    (s) => s.saleTimestamp >= startTs && s.saleTimestamp <= endTs
  );
  const filteredReplacements = params.replacements.filter(
    (r) => r.replacementTimestamp >= startTs && r.replacementTimestamp <= endTs
  );

  const filteredClientIds = new Set(filteredSales.map((s) => s.clientId));
  const totalClients =
    params.preset === 'all_time' ? params.clients.length : filteredClientIds.size;

  const { startTs: todayStart, endTs: todayEnd } = getDateRangeBounds('today', nowTs);
  const todaysSales = allEnrichedSales.filter(
    (s) => s.saleTimestamp >= todayStart && s.saleTimestamp <= todayEnd
  ).length;

  let activeWarranties = 0;
  let expiringSoonWarranties = 0;
  let expiredWarranties = 0;
  let totalAccountVolumeBillions = 0;

  for (const s of filteredSales) {
    totalAccountVolumeBillions += s.accountVolumeBillions;
    if (s.warrantyStatus === 'ACTIVE') activeWarranties += 1;
    else if (s.warrantyStatus === 'EXPIRING_SOON') expiringSoonWarranties += 1;
    else expiredWarranties += 1;
  }

  // Daily sales: last 14 days
  const dailyMap = new Map<string, TimeBucketPoint>();
  const nowDate = new Date(nowTs);
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - i);
    const key = getLocalDayKey(d.getTime());
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    dailyMap.set(key, { key, label, salesCount: 0, volumeBillions: 0, replacementsCount: 0 });
  }
  for (const s of filteredSales) {
    const key = getLocalDayKey(s.saleTimestamp);
    const bucket = dailyMap.get(key);
    if (bucket) {
      bucket.salesCount += 1;
      bucket.volumeBillions += s.accountVolumeBillions;
    }
  }
  for (const r of filteredReplacements) {
    const key = getLocalDayKey(r.replacementTimestamp);
    const bucket = dailyMap.get(key);
    if (bucket) {
      bucket.replacementsCount += 1;
    }
  }

  // Weekly sales: last 8 weeks
  const weeklyMap = new Map<string, TimeBucketPoint>();
  const currentWeekStart = getWeekStartTs(nowTs);
  for (let i = 7; i >= 0; i -= 1) {
    const wTs = currentWeekStart - i * 7 * DAY_MS;
    const key = getLocalDayKey(wTs);
    const label = new Date(wTs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    weeklyMap.set(key, { key, label, salesCount: 0, volumeBillions: 0, replacementsCount: 0 });
  }
  for (const s of filteredSales) {
    const key = getLocalDayKey(getWeekStartTs(s.saleTimestamp));
    const bucket = weeklyMap.get(key);
    if (bucket) {
      bucket.salesCount += 1;
      bucket.volumeBillions += s.accountVolumeBillions;
    }
  }
  for (const r of filteredReplacements) {
    const key = getLocalDayKey(getWeekStartTs(r.replacementTimestamp));
    const bucket = weeklyMap.get(key);
    if (bucket) {
      bucket.replacementsCount += 1;
    }
  }

  // Monthly sales: last 12 months
  const monthlyMap = new Map<string, TimeBucketPoint>();
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - i, 1);
    const key = getLocalMonthKey(d.getTime());
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    monthlyMap.set(key, { key, label, salesCount: 0, volumeBillions: 0, replacementsCount: 0 });
  }
  for (const s of filteredSales) {
    const key = getLocalMonthKey(s.saleTimestamp);
    const bucket = monthlyMap.get(key);
    if (bucket) {
      bucket.salesCount += 1;
      bucket.volumeBillions += s.accountVolumeBillions;
    }
  }
  for (const r of filteredReplacements) {
    const key = getLocalMonthKey(r.replacementTimestamp);
    const bucket = monthlyMap.get(key);
    if (bucket) {
      bucket.replacementsCount += 1;
    }
  }

  // Account type distribution (all 31 tiers)
  const accountCounts = new Map<string, number>();
  for (const t of ACCOUNT_TYPES) accountCounts.set(t, 0);
  for (const s of filteredSales) {
    accountCounts.set(s.accountType, (accountCounts.get(s.accountType) ?? 0) + 1);
  }
  const totalFilteredCount = filteredSales.length || 1;
  const accountTypeStats: AccountTypeStat[] = ACCOUNT_TYPES.map((accountType, idx) => {
    const count = accountCounts.get(accountType) ?? 0;
    return {
      accountType,
      volumeBillions: idx + 1,
      count,
      percentage: filteredSales.length === 0 ? 0 : Math.round((count / totalFilteredCount) * 1000) / 10,
    };
  });

  // Warranty duration distribution (all 25 durations)
  const durationCounts = new Map<number, number>();
  for (const d of WARRANTY_DURATIONS) durationCounts.set(d.days, 0);
  for (const s of filteredSales) {
    durationCounts.set(s.warrantyDurationDays, (durationCounts.get(s.warrantyDurationDays) ?? 0) + 1);
  }
  const warrantyDurationStats: WarrantyDurationStat[] = WARRANTY_DURATIONS.map((d) => ({
    durationDays: d.days,
    label: d.label,
    count: durationCounts.get(d.days) ?? 0,
  }));

  let continueOriginal = 0;
  let startNew = 0;
  for (const r of filteredReplacements) {
    if (r.warrantyPolicy === 'CONTINUE_ORIGINAL') continueOriginal += 1;
    else startNew += 1;
  }

  const allClientsWithStats = buildClientsWithStats(
    params.clients,
    allEnrichedSales,
    params.replacements
  );

  const recentSales = [...filteredSales]
    .sort((a, b) => b.saleTimestamp - a.saleTimestamp)
    .slice(0, 6);

  const recentClients = [...allClientsWithStats]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 6);

  const recentlyExpired = [...allEnrichedSales]
    .filter((s) => s.warrantyStatus === 'EXPIRED')
    .sort((a, b) => b.effectiveWarrantyExpiryTs - a.effectiveWarrantyExpiryTs)
    .slice(0, 6);

  const upcomingExpirations = [...allEnrichedSales]
    .filter((s) => s.warrantyStatus !== 'EXPIRED')
    .sort((a, b) => a.effectiveWarrantyExpiryTs - b.effectiveWarrantyExpiryTs)
    .slice(0, 6);

  return {
    totalAccountsSold: filteredSales.length,
    totalClients,
    activeWarranties,
    expiringSoonWarranties,
    expiredWarranties,
    todaysSales,
    totalReplacements: filteredReplacements.length,
    totalAccountVolumeBillions,
    dailySales: Array.from(dailyMap.values()),
    weeklySales: Array.from(weeklyMap.values()),
    monthlySales: Array.from(monthlyMap.values()),
    accountTypeStats,
    warrantyDurationStats,
    replacementPolicyBreakdown: {
      continueOriginal,
      startNew,
    },
    recentSales,
    recentClients,
    recentlyExpired,
    upcomingExpirations,
  };
}

export function escapeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@]/.test(str) ? `'${str}` : str;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function buildCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const dataLines = rows.map((row) => row.map(escapeCsvCell).join(','));
  // Prefix UTF-8 BOM for clean Excel compatibility
  return '\uFEFF' + [headerLine, ...dataLines].join('\r\n');
}

/**
 * Computes genuine account sales statistics strictly from saved SaleRecord rows:
 * - Each genuine sale counts once (replacements do NOT count as new sales).
 * - Expired warranties remain counted in historical sales totals.
 * - Editing an existing sale updates its values without incrementing sales count.
 */
export function computeAccountSellStats(
  sales: SaleRecord[],
  nowTs: number = Date.now()
): AccountSellStats {
  const { startTs: todayStart, endTs: todayEnd } = getDateRangeBounds('today', nowTs);
  const { startTs: monthStart, endTs: monthEnd } = getDateRangeBounds('this_month', nowTs);

  const accountCounts = new Map<string, number>();
  for (const tier of ACCOUNT_TYPES) {
    accountCounts.set(tier, 0);
  }

  let totalVolumeBillions = 0;
  let accountsSoldToday = 0;
  let accountsSoldThisMonth = 0;

  for (const sale of sales) {
    totalVolumeBillions += sale.accountVolumeBillions;
    if (sale.saleTimestamp >= todayStart && sale.saleTimestamp <= todayEnd) {
      accountsSoldToday += 1;
    }
    if (sale.saleTimestamp >= monthStart && sale.saleTimestamp <= monthEnd) {
      accountsSoldThisMonth += 1;
    }
    accountCounts.set(sale.accountType, (accountCounts.get(sale.accountType) ?? 0) + 1);
  }

  const totalSales = sales.length;
  const totalForPct = totalSales || 1;
  const accountTypeBreakdown: AccountTypeStat[] = ACCOUNT_TYPES.map((accountType, idx) => {
    const count = accountCounts.get(accountType) ?? 0;
    return {
      accountType,
      volumeBillions: idx + 1,
      count,
      percentage: totalSales === 0 ? 0 : Math.round((count / totalForPct) * 1000) / 10,
    };
  });

  return {
    totalAccountsSold: totalSales,
    totalSales,
    totalVolumeBillions,
    accountsSoldToday,
    accountsSoldThisMonth,
    accountTypeBreakdown,
  };
}

export function filterAccountSellSales<T extends SaleRecord>(
  sales: T[],
  filters: {
    query?: string;
    accountType?: string;
    dateMode?: AccountSellDateMode;
    singleDate?: string;
    dateFrom?: string;
    dateTo?: string;
  },
  nowTs: number = Date.now()
): T[] {
  const q = (filters.query ?? '').trim().toLowerCase();
  const accountType = filters.accountType ?? 'ALL';
  const dateMode = filters.dateMode ?? 'ALL';

  const { startTs: todayStart, endTs: todayEnd } = getDateRangeBounds('today', nowTs);
  const { startTs: monthStart, endTs: monthEnd } = getDateRangeBounds('this_month', nowTs);

  return sales
    .filter((sale) => {
      if (accountType !== 'ALL' && sale.accountType !== accountType) {
        return false;
      }

      if (dateMode === 'TODAY') {
        if (sale.saleTimestamp < todayStart || sale.saleTimestamp > todayEnd) return false;
      } else if (dateMode === 'THIS_MONTH') {
        if (sale.saleTimestamp < monthStart || sale.saleTimestamp > monthEnd) return false;
      } else if (dateMode === 'SINGLE_DATE' && filters.singleDate) {
        if (sale.saleDate !== filters.singleDate) return false;
      } else if (dateMode === 'RANGE') {
        if (filters.dateFrom && sale.saleDate < filters.dateFrom) return false;
        if (filters.dateTo && sale.saleDate > filters.dateTo) return false;
      }

      if (q) {
        const matches =
          sale.clientName.toLowerCase().includes(q) ||
          sale.clientEmail.toLowerCase().includes(q) ||
          sale.saleCode.toLowerCase().includes(q) ||
          sale.id.toLowerCase().includes(q) ||
          sale.accountType.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    })
    .sort((a, b) => b.saleTimestamp - a.saleTimestamp);
}
