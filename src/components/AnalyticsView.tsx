import type {
  AppSettings,
  ClientRecord,
  DashboardMetrics,
  DateRangePreset,
  ReplacementRecord,
  SaleRecord,
} from '../types/models.ts';
import { computeDashboardMetrics } from '../utils/analytics.ts';
import {
  HorizontalDistributionList,
  TimelineBarChart,
  WarrantyStatusDonut,
} from './Charts.tsx';

const DATE_PRESETS: Array<{ value: DateRangePreset; label: string }> = [
  { value: 'all_time', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_year', label: 'This Year' },
  { value: 'custom', label: 'Custom Range' },
];

export function AnalyticsView({
  sales,
  clients,
  replacements,
  settings,
  metrics,
  datePreset,
  customStart,
  customEnd,
  onChangeDatePreset,
  onChangeCustomStart,
  onChangeCustomEnd,
}: {
  sales: SaleRecord[];
  clients: ClientRecord[];
  replacements: ReplacementRecord[];
  settings: AppSettings;
  metrics: DashboardMetrics;
  datePreset: DateRangePreset;
  customStart: string;
  customEnd: string;
  onChangeDatePreset: (p: DateRangePreset) => void;
  onChangeCustomStart: (v: string) => void;
  onChangeCustomEnd: (v: string) => void;
}) {
  const nowTs = Date.now();
  const weeklyTotal = computeDashboardMetrics({
    sales,
    clients,
    replacements,
    settings,
    preset: 'last_7_days',
    nowTs,
  }).totalAccountsSold;
  const monthlyTotal = computeDashboardMetrics({
    sales,
    clients,
    replacements,
    settings,
    preset: 'this_month',
    nowTs,
  }).totalAccountsSold;
  const yearlyTotal = computeDashboardMetrics({
    sales,
    clients,
    replacements,
    settings,
    preset: 'this_year',
    nowTs,
  }).totalAccountsSold;

  const mostSold = [...metrics.accountTypeStats]
    .filter((a) => a.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((a) => ({ label: a.accountType, count: a.count, secondary: `${a.percentage}%` }));

  const durationItems = metrics.warrantyDurationStats
    .filter((d) => d.count > 0)
    .map((d) => ({ label: d.label, count: d.count, secondary: `${d.durationDays * 24}h` }));

  return (
    <div className="space-y-6">
      {/* Date Range Controls */}
      <div className="bg-[#111115] border border-zinc-800/90 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {DATE_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => onChangeDatePreset(preset.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                datePreset === preset.value
                  ? 'bg-red-600 text-white'
                  : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800/80'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {datePreset === 'custom' && (
          <div className="flex items-center gap-2 text-xs">
            <input
              type="date"
              aria-label="Analytics start date"
              value={customStart}
              onChange={(e) => onChangeCustomStart(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-white font-mono"
            />
            <span className="text-zinc-500">to</span>
            <input
              type="date"
              aria-label="Analytics end date"
              value={customEnd}
              onChange={(e) => onChangeCustomEnd(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-white font-mono"
            />
          </div>
        )}
      </div>

      {/* Period Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Filtered Sales', value: metrics.totalAccountsSold },
          { label: "Today's Sales", value: metrics.todaysSales },
          { label: 'Last 7 Days', value: weeklyTotal },
          { label: 'This Month', value: monthlyTotal },
          { label: 'This Year', value: yearlyTotal },
          { label: 'Total Volume', value: `${metrics.totalAccountVolumeBillions}B` },
        ].map((item) => (
          <div
            key={item.label}
            className="bg-[#111115] border border-zinc-800/90 rounded-xl p-4 space-y-1.5"
          >
            <p className="text-xs text-zinc-400">{item.label}</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-white">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Timeline & Monthly Bar Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-[#111115] border border-zinc-800/90 rounded-xl p-5 space-y-3">
          <div>
            <h2 className="text-base font-semibold text-white">Daily Sales &amp; Replacement Timeline</h2>
            <p className="text-xs text-zinc-400">14-day sales volume and replacement velocity</p>
          </div>
          <TimelineBarChart data={metrics.dailySales} />
        </div>

        <div className="bg-[#111115] border border-zinc-800/90 rounded-xl p-5 space-y-3">
          <div>
            <h2 className="text-base font-semibold text-white">Monthly Sales Bar Chart</h2>
            <p className="text-xs text-zinc-400">12-month account sales performance</p>
          </div>
          <TimelineBarChart data={metrics.monthlySales} />
        </div>
      </div>

      {/* Warranty Status + Top Tiers + Warranty Durations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-[#111115] border border-zinc-800/90 rounded-xl p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-white">Active vs Expired Warranties</h2>
            <p className="text-xs text-zinc-400">Live warranty status distribution</p>
          </div>
          <WarrantyStatusDonut
            active={metrics.activeWarranties}
            expiringSoon={metrics.expiringSoonWarranties}
            expired={metrics.expiredWarranties}
          />
          <div className="border-t border-zinc-800/80 pt-3 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-zinc-400">Total Replacements</span>
              <span className="font-mono tabular-nums text-white font-semibold">
                {metrics.totalReplacements}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Continue Original Policy</span>
              <span className="font-mono tabular-nums text-amber-400">
                {metrics.replacementPolicyBreakdown.continueOriginal}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Start New Warranty Policy</span>
              <span className="font-mono tabular-nums text-emerald-400">
                {metrics.replacementPolicyBreakdown.startNew}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-[#111115] border border-zinc-800/90 rounded-xl p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-white">Most Frequently Sold Tiers</h2>
            <p className="text-xs text-zinc-400">Top account sizes from database records</p>
          </div>
          <HorizontalDistributionList
            items={mostSold}
            emptyLabel="No sales data recorded in this date range."
          />
        </div>

        <div className="bg-[#111115] border border-zinc-800/90 rounded-xl p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-white">Sales by Warranty Duration</h2>
            <p className="text-xs text-zinc-400">Distribution across 1–25 day warranty selections</p>
          </div>
          <HorizontalDistributionList
            items={durationItems}
            emptyLabel="No warranty duration data recorded."
          />
        </div>
      </div>

      {/* Exhaustive 1 Billion – 31 Billion Ledger */}
      <div className="bg-[#111115] border border-zinc-800/90 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-white">
            Complete Account Type Breakdown (1 Billion – 31 Billion)
          </h2>
          <p className="text-xs text-zinc-400">
            Real-time counts for all 31 account volume tiers from saved database records.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
          {metrics.accountTypeStats.map((stat) => (
            <div
              key={stat.accountType}
              className={`border rounded-lg p-3 ${
                stat.count > 0
                  ? 'bg-zinc-950 border-red-600/40'
                  : 'bg-zinc-950/40 border-zinc-800/70'
              }`}
            >
              <p className="text-[11px] text-zinc-400 truncate">{stat.accountType}</p>
              <p
                className={`text-lg font-bold font-mono tabular-nums mt-0.5 ${
                  stat.count > 0 ? 'text-white' : 'text-zinc-600'
                }`}
              >
                {stat.count}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
