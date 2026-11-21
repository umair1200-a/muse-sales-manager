import type {
  ReplacementRecord,
  SaleRecord,
  SaleWithComputed,
  WarrantyPolicy,
  WarrantyRemaining,
  WarrantyStatus,
} from '../types/models.ts';

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export const ACCOUNT_TYPES: string[] = Array.from(
  { length: 31 },
  (_, index) => `${index + 1} Billion`
);

export const WARRANTY_DURATIONS: Array<{ days: number; label: string; hours: number }> =
  Array.from({ length: 25 }, (_, index) => {
    const days = index + 1;
    return {
      days,
      label: days === 1 ? '1 Day' : `${days} Days`,
      hours: days * 24,
    };
  });

export function parseAccountVolumeBillions(accountType: string): number {
  const match = /^(\d{1,2})\s*Billion$/i.exec(accountType.trim());
  if (!match) {
    throw new Error(`Invalid account type: ${accountType}`);
  }
  const value = Number.parseInt(match[1], 10);
  if (value < 1 || value > 31) {
    throw new Error(`Account type volume must be between 1 and 31 Billion: ${accountType}`);
  }
  return value;
}

export function isValidAccountType(accountType: string): boolean {
  try {
    parseAccountVolumeBillions(accountType);
    return true;
  } catch {
    return false;
  }
}

export function isValidWarrantyDuration(days: number): boolean {
  return Number.isInteger(days) && days >= 1 && days <= 25;
}

export function calculateWarrantyExpiryTs(startTs: number, durationDays: number): number {
  if (!Number.isFinite(startTs) || startTs < 0) {
    throw new Error('Invalid warranty start timestamp');
  }
  if (!isValidWarrantyDuration(durationDays)) {
    throw new Error('Warranty duration must be between 1 and 25 days');
  }
  return startTs + durationDays * DAY_MS;
}

export function parseDateAndTimeToTimestamp(dateStr: string, timeStr: string): number {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!dateMatch) {
    throw new Error(`Invalid date format (expected YYYY-MM-DD): ${dateStr}`);
  }
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timeStr.trim());
  if (!timeMatch) {
    throw new Error(`Invalid time format (expected HH:MM): ${timeStr}`);
  }

  const year = Number.parseInt(dateMatch[1], 10);
  const month = Number.parseInt(dateMatch[2], 10) - 1;
  const day = Number.parseInt(dateMatch[3], 10);
  const hours = Number.parseInt(timeMatch[1], 10);
  const minutes = Number.parseInt(timeMatch[2], 10);
  const seconds = timeMatch[3] ? Number.parseInt(timeMatch[3], 10) : 0;

  const d = new Date(year, month, day, hours, minutes, seconds, 0);
  if (Number.isNaN(d.getTime())) {
    throw new Error('Invalid date/time value');
  }
  return d.getTime();
}

export function formatLocalDateInput(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatLocalTimeInput(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function formatDisplayDateTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDisplayDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

export function formatExpiredAgo(expiredDurationMs: number): string {
  if (expiredDurationMs <= 0) {
    return 'Active';
  }
  const totalMinutes = Math.floor(expiredDurationMs / 60_000);
  if (totalMinutes < 1) {
    return 'Expired Just Now';
  }
  if (totalMinutes < 60) {
    return `Expired ${totalMinutes} ${totalMinutes === 1 ? 'Minute' : 'Minutes'} Ago`;
  }
  const totalHours = Math.floor(expiredDurationMs / HOUR_MS);
  if (totalHours < 24) {
    return `Expired ${totalHours} ${totalHours === 1 ? 'Hour' : 'Hours'} Ago`;
  }
  const totalDays = Math.floor(expiredDurationMs / DAY_MS);
  return `Expired ${totalDays} ${totalDays === 1 ? 'Day' : 'Days'} Ago`;
}

export function calculateWarrantyRemaining(
  expiryTs: number,
  nowTs: number = Date.now()
): WarrantyRemaining {
  const diff = expiryTs - nowTs;
  if (diff <= 0) {
    const expiredDurationMs = Math.abs(diff);
    const expiredAgoLabel = formatExpiredAgo(expiredDurationMs);
    return {
      totalRemainingMs: 0,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      isExpired: true,
      expiredDurationMs,
      expiredAgoLabel,
      formattedCountdown: '00 DAYS : 00 HOURS : 00 MINUTES : 00 SECONDS',
    };
  }

  const days = Math.floor(diff / DAY_MS);
  const remAfterDays = diff % DAY_MS;
  const hours = Math.floor(remAfterDays / HOUR_MS);
  const remAfterHours = remAfterDays % HOUR_MS;
  const minutes = Math.floor(remAfterHours / 60_000);
  const seconds = Math.floor((remAfterHours % 60_000) / 1000);

  const pad = (n: number) => String(n).padStart(2, '0');
  const formattedCountdown = `${pad(days)} DAYS : ${pad(hours)} HOURS : ${pad(minutes)} MINUTES : ${pad(seconds)} SECONDS`;

  return {
    totalRemainingMs: diff,
    days,
    hours,
    minutes,
    seconds,
    isExpired: false,
    expiredDurationMs: 0,
    expiredAgoLabel: '',
    formattedCountdown,
  };
}

export function getWarrantyStatus(
  expiryTs: number,
  thresholdHours: number = 48,
  nowTs: number = Date.now()
): WarrantyStatus {
  const remainingMs = expiryTs - nowTs;
  if (remainingMs <= 0) {
    return 'EXPIRED';
  }
  if (remainingMs <= thresholdHours * HOUR_MS) {
    return 'EXPIRING_SOON';
  }
  return 'ACTIVE';
}

export function computeReplacementWarranty(params: {
  policy: WarrantyPolicy;
  originalWarrantyDurationDays: number;
  originalWarrantyStartTs: number;
  originalWarrantyExpiryTs: number;
  replacementTimestamp: number;
  newWarrantyDurationDays?: number;
}): {
  warrantyDurationDays: number;
  warrantyStartTs: number;
  warrantyExpiryTs: number;
} {
  if (params.policy === 'CONTINUE_ORIGINAL') {
    return {
      warrantyDurationDays: params.originalWarrantyDurationDays,
      warrantyStartTs: params.originalWarrantyStartTs,
      warrantyExpiryTs: params.originalWarrantyExpiryTs,
    };
  }

  const days = params.newWarrantyDurationDays ?? params.originalWarrantyDurationDays;
  if (!isValidWarrantyDuration(days)) {
    throw new Error('New replacement warranty duration must be between 1 and 25 days');
  }
  return {
    warrantyDurationDays: days,
    warrantyStartTs: params.replacementTimestamp,
    warrantyExpiryTs: calculateWarrantyExpiryTs(params.replacementTimestamp, days),
  };
}

export function enrichSaleWithWarranty(
  sale: SaleRecord,
  replacementsForSale: ReplacementRecord[],
  thresholdHours: number = 48,
  nowTs: number = Date.now()
): SaleWithComputed {
  const sortedReplacements = [...replacementsForSale].sort(
    (a, b) => a.replacementTimestamp - b.replacementTimestamp
  );
  const latestReplacement =
    sortedReplacements.length > 0 ? sortedReplacements[sortedReplacements.length - 1] : null;

  // Latest START_NEW replacement overrides active warranty window while keeping original sale columns intact
  const latestStartNew = [...sortedReplacements]
    .reverse()
    .find((r) => r.warrantyPolicy === 'START_NEW');

  const effectiveWarrantyStartTs = latestStartNew
    ? latestStartNew.warrantyStartTs
    : sale.warrantyStartTs;
  const effectiveWarrantyExpiryTs = latestStartNew
    ? latestStartNew.warrantyExpiryTs
    : sale.warrantyExpiryTs;
  const effectiveDurationDays = latestStartNew
    ? latestStartNew.warrantyDurationDays
    : sale.warrantyDurationDays;
  const effectiveAccountType = latestReplacement
    ? latestReplacement.newAccountType
    : sale.accountType;
  const effectiveVolumeBillions = parseAccountVolumeBillions(effectiveAccountType);

  const remaining = calculateWarrantyRemaining(effectiveWarrantyExpiryTs, nowTs);
  const warrantyStatus = getWarrantyStatus(effectiveWarrantyExpiryTs, thresholdHours, nowTs);

  return {
    ...sale,
    effectiveAccountType,
    effectiveVolumeBillions,
    effectiveDurationDays,
    effectiveWarrantyStartTs,
    effectiveWarrantyExpiryTs,
    warrantyStatus,
    remaining,
    replacements: sortedReplacements,
    hasReplacement: sortedReplacements.length > 0,
  };
}
