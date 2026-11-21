export type WarrantyStatus = 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED';

export type WarrantyPolicy = 'CONTINUE_ORIGINAL' | 'START_NEW';

export type DateRangePreset =
  | 'today'
  | 'last_7_days'
  | 'last_30_days'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'all_time'
  | 'custom';

export type TableDensity = 'COMFORTABLE' | 'COMPACT';

export type WarrantyStartMode = 'SALE_TIME' | 'CUSTOM';

export interface AdminUser {
  id: string;
  email: string;
  createdAt: number;
  updatedAt: number;
}

export interface ClientRecord {
  id: string;
  name: string;
  email: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface SaleRecord {
  id: string;
  saleCode: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  accountType: string;
  accountVolumeBillions: number;
  saleDate: string; // YYYY-MM-DD
  saleTime: string; // HH:MM
  saleTimestamp: number;
  warrantyDurationDays: number;
  warrantyStartTs: number;
  warrantyExpiryTs: number;
  notes: string;
  replacementCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface ReplacementRecord {
  id: string;
  replacementCode: string;
  originalSaleId: string;
  clientId: string;
  originalAccountType: string;
  newAccountType: string;
  replacementTimestamp: number;
  warrantyPolicy: WarrantyPolicy;
  warrantyDurationDays: number;
  warrantyStartTs: number;
  warrantyExpiryTs: number;
  notes: string;
  createdAt: number;
}

export interface AppSettings {
  expiringSoonThresholdHours: number;
  defaultWarrantyDurationDays: number;
  defaultWarrantyStartMode: WarrantyStartMode;
  tableDensity: TableDensity;
  rememberSessionDays: number;
  updatedAt: number;
}

export interface WarrantyRemaining {
  totalRemainingMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
  expiredDurationMs: number;
  expiredAgoLabel: string;
  formattedCountdown: string;
}

export interface SaleWithComputed extends SaleRecord {
  effectiveAccountType: string;
  effectiveVolumeBillions: number;
  effectiveDurationDays: number;
  effectiveWarrantyStartTs: number;
  effectiveWarrantyExpiryTs: number;
  warrantyStatus: WarrantyStatus;
  remaining: WarrantyRemaining;
  replacements: ReplacementRecord[];
  hasReplacement: boolean;
}

export interface ClientWithStats extends ClientRecord {
  firstPurchaseTs: number | null;
  totalAccountsPurchased: number;
  totalVolumeBillions: number;
  accountTypesPurchased: string[];
  totalReplacements: number;
  activeWarranties: number;
  expiringSoonWarranties: number;
  expiredWarranties: number;
  sales: SaleWithComputed[];
  replacements: ReplacementRecord[];
}

export interface TimeBucketPoint {
  key: string;
  label: string;
  salesCount: number;
  volumeBillions: number;
  replacementsCount: number;
}

export interface AccountTypeStat {
  accountType: string;
  volumeBillions: number;
  count: number;
  percentage: number;
}

export interface WarrantyDurationStat {
  durationDays: number;
  label: string;
  count: number;
}

export interface DashboardMetrics {
  totalAccountsSold: number;
  totalClients: number;
  activeWarranties: number;
  expiringSoonWarranties: number;
  expiredWarranties: number;
  todaysSales: number;
  totalReplacements: number;
  totalAccountVolumeBillions: number;
  dailySales: TimeBucketPoint[];
  weeklySales: TimeBucketPoint[];
  monthlySales: TimeBucketPoint[];
  accountTypeStats: AccountTypeStat[];
  warrantyDurationStats: WarrantyDurationStat[];
  replacementPolicyBreakdown: {
    continueOriginal: number;
    startNew: number;
  };
  recentSales: SaleWithComputed[];
  recentClients: ClientWithStats[];
  recentlyExpired: SaleWithComputed[];
  upcomingExpirations: SaleWithComputed[];
}

export interface GlobalSearchResult {
  type: 'sale' | 'client' | 'replacement';
  id: string;
  code: string;
  title: string;
  subtitle: string;
  meta: string;
  saleId?: string;
  clientId?: string;
}

export interface AccountSellStats {
  totalAccountsSold: number;
  totalSales: number;
  totalVolumeBillions: number;
  accountsSoldToday: number;
  accountsSoldThisMonth: number;
  accountTypeBreakdown: AccountTypeStat[];
}

export type AccountSellDateMode = 'ALL' | 'TODAY' | 'THIS_MONTH' | 'SINGLE_DATE' | 'RANGE';

