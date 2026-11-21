import { useState } from 'react';
import {
  Plus,
  Users,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  RefreshCw,
  Layers,
  CalendarDays,
  ShoppingBag,
} from 'lucide-react';
import type {
  ClientWithStats,
  DashboardMetrics,
  DateRangePreset,
  SaleWithComputed,
} from '../types/models.ts';
import { formatDisplayDateTime } from '../utils/warranty.ts';
import {
  HorizontalDistributionList,
  TimelineBarChart,
  WarrantyStatusDonut,
} from './Charts.tsx';
import { WarrantyStatusText } from './StatusText.tsx';

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

export function DashboardView({
  metrics,
  datePreset,
  customStart,
  customEnd,
  onChangeDatePreset,
  onChangeCustomStart,
  onChangeCustomEnd,
  onNavigate,
  onSelectSale,
  onSelectClient,
}: {
  metrics: DashboardMetrics;
  datePreset: DateRangePreset;
  customStart: string;
  customEnd: string;
  onChangeDatePreset: (preset: DateRangePreset) => void;
  onChangeCustomStart: (val: string) => void;
  onChangeCustomEnd: (val: string) => void;
  onNavigate: (tab: string) => void;
  onSelectSale: (sale: SaleWithComputed) => void;
  onSelectClient: (client: ClientWithStats) => void;
}) {
  const [chartPeriod, setChartPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  const kpiCards = [
    {
      label: 'Total Accounts Sold',
      value: metrics.totalAccountsSold,
      icon: ShoppingBag,
      accent: 'text-white',
      onClick: () => onNavigate('accounts'),
    },
    {
      label: 'Total Clients',
      value: metrics.totalClients,
      icon: Users,
      accent: 'text-white',
      onClick: () => onNavigate('clients'),
    },
    {
      label: 'Active Warranties',
      value: metrics.activeWarranties,
      icon: ShieldCheck,
      accent: 'text-emerald-400',
      onClick: () => onNavigate('active'),
    },
    {
      label: 'Expired Warranties',
      value: metrics.expiredWarranties,
      icon: ShieldX,
      accent: 'text-red-400',
      onClick: () => onNavigate('expired'),
    },
    {
      label: "Today's Sales",
      value: metrics.todaysSales,
      icon: CalendarDays,
      accent: 'text-white',
      onClick: () => onNavigate('accounts'),
    },
    {
      label: 'Total Replacements',
      value: metrics.totalReplacements,
      icon: RefreshCw,
      accent: 'text-amber-400',
      onClick: () => onNavigate('replacements'),
    },
    {
      label: 'Expiring Soon',
      value: metrics.expiringSoonWarranties,
      icon: ShieldAlert,
      accent: 'text-amber-400',
      onClick: () => onNavigate('expiring'),
    },
    {
      label: 'Total Account Volume Sold',
      value: `${metrics.totalAccountVolumeBillions}B`,
      icon: Layers,
      accent: 'text-red-400',
      onClick: () => onNavigate('analytics'),
    },
  ];

  const timelineData =
    chartPeriod === 'daily'
      ? metrics.dailySales
      : chartPeriod === 'weekly'
      ? metrics.weeklySales
      : metrics.monthlySales;

  const topAccountTypes = [...metrics.accountTypeStats]
    .filter((a) => a.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((a) => ({
      label: a.accountType,
      count: a.count,
      secondary: `${a.percentage}%`,
    }));

  return (
    <div className="space-y-6">
      {/* Top Action & Date Filter Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#111115] border border-zinc-800/90 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {DATE_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => onChangeDatePreset(preset.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                datePreset === preset.value
                  ? 'bg-red-600 text-white'
                  : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800/80'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {datePreset === 'custom' && (
            <div className="flex items-center gap-2 text-xs">
              <input
                type="date"
                aria-label="Custom start date"
                value={customStart}
                onChange={(e) => onChangeCustomStart(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-white font-mono"
              />
              <span className="text-zinc-500">to</span>
              <input
                type="date"
                aria-label="Custom end date"
                value={customEnd}
                onChange={(e) => onChangeCustomEnd(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-white font-mono"
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => onNavigate('add-sale')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Add New Sale
          </button>
        </div>
      </div>

      {/* 8 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.label}
              type="button"
              onClick={card.onClick}
              className="text-left bg-[#111115] hover:bg-[#16161C] border border-zinc-800/90 rounded-xl p-5 transition-colors space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-400">{card.label}</span>
                <Icon className="w-4 h-4 text-zinc-500 shrink-0" />
              </div>
              <p className={`text-2xl sm:text-3xl font-bold font-mono tabular-nums ${card.accent}`}>
                {card.value}
              </p>
            </button>
          );
        })}
      </div>

      {/* Primary Charts Row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-[#111115] border border-zinc-800/90 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-white">Sales Overview</h2>
              <p className="text-xs text-zinc-400">
                Accounts sold and replacements tracked over time
              </p>
            </div>
            <div className="inline-flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-1 self-start">
              {(['daily', 'weekly', 'monthly'] as const).map((period) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => setChartPeriod(period)}
                  className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap ${
                    chartPeriod === period
                      ? 'bg-red-600 text-white'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {period}
                </button>
              ))}
            </div>
          </div>
          <TimelineBarChart data={timelineData} />
        </div>

        <div className="bg-[#111115] border border-zinc-800/90 rounded-xl p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-white">Warranty Status</h2>
            <p className="text-xs text-zinc-400">Live active vs expiring vs expired breakdown</p>
          </div>
          <WarrantyStatusDonut
            active={metrics.activeWarranties}
            expiringSoon={metrics.expiringSoonWarranties}
            expired={metrics.expiredWarranties}
          />
          <div className="border-t border-zinc-800/80 pt-3 grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-zinc-500">Continue Original</p>
              <p className="font-mono tabular-nums text-white font-semibold mt-0.5">
                {metrics.replacementPolicyBreakdown.continueOriginal} replacements
              </p>
            </div>
            <div>
              <p className="text-zinc-500">Start New Warranty</p>
              <p className="font-mono tabular-nums text-white font-semibold mt-0.5">
                {metrics.replacementPolicyBreakdown.startNew} replacements
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Account Type Statistics + Operational Feeds */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="bg-[#111115] border border-zinc-800/90 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Account Type Statistics</h2>
              <p className="text-xs text-zinc-400">Volume tiers sold (1B – 31B)</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('analytics')}
              className="text-xs font-medium text-red-400 hover:text-red-300 whitespace-nowrap"
            >
              View All 31
            </button>
          </div>
          <HorizontalDistributionList
            items={topAccountTypes}
            emptyLabel="Add your first sale to see account tier volume breakdown."
          />
        </div>

        <div className="bg-[#111115] border border-zinc-800/90 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Recent Sales</h2>
              <p className="text-xs text-zinc-400">Latest recorded client accounts</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('accounts')}
              className="text-xs font-medium text-red-400 hover:text-red-300 whitespace-nowrap"
            >
              All Sales
            </button>
          </div>
          {metrics.recentSales.length === 0 ? (
            <p className="text-sm text-zinc-500 py-4">No sales recorded yet.</p>
          ) : (
            <div className="divide-y divide-zinc-800/70">
              {metrics.recentSales.map((sale) => (
                <button
                  key={sale.id}
                  type="button"
                  onClick={() => onSelectSale(sale)}
                  className="w-full text-left py-2.5 flex items-center justify-between gap-3 hover:bg-zinc-900/40 px-2 -mx-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{sale.clientName}</p>
                    <p className="text-xs text-zinc-400 font-mono tabular-nums truncate">
                      {sale.saleCode} · {sale.effectiveAccountType}
                    </p>
                  </div>
                  <WarrantyStatusText status={sale.warrantyStatus} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#111115] border border-zinc-800/90 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Recent Clients</h2>
              <p className="text-xs text-zinc-400">Unique client profiles by email</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('clients')}
              className="text-xs font-medium text-red-400 hover:text-red-300 whitespace-nowrap"
            >
              All Clients
            </button>
          </div>
          {metrics.recentClients.length === 0 ? (
            <p className="text-sm text-zinc-500 py-4">No clients recorded yet.</p>
          ) : (
            <div className="divide-y divide-zinc-800/70">
              {metrics.recentClients.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => onSelectClient(client)}
                  className="w-full text-left py-2.5 flex items-center justify-between gap-3 hover:bg-zinc-900/40 px-2 -mx-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{client.name}</p>
                    <p className="text-xs text-zinc-400 truncate">{client.email}</p>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-zinc-300 shrink-0">
                    {client.totalAccountsPurchased} acc · {client.totalVolumeBillions}B
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Upcoming Expirations & Recently Expired */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#111115] border border-zinc-800/90 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Upcoming Expirations</h2>
              <p className="text-xs text-zinc-400">Active accounts closest to warranty end</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('expiring')}
              className="text-xs font-medium text-amber-400 hover:text-amber-300 whitespace-nowrap"
            >
              Expiring Soon
            </button>
          </div>
          {metrics.upcomingExpirations.length === 0 ? (
            <p className="text-sm text-zinc-500 py-3">No active warranties running.</p>
          ) : (
            <div className="divide-y divide-zinc-800/70">
              {metrics.upcomingExpirations.map((sale) => (
                <button
                  key={sale.id}
                  type="button"
                  onClick={() => onSelectSale(sale)}
                  className="w-full text-left py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-zinc-900/40 px-2 -mx-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {sale.clientName} · <span className="text-zinc-400">{sale.effectiveAccountType}</span>
                    </p>
                    <p className="text-xs text-zinc-500 font-mono tabular-nums">
                      Expires {formatDisplayDateTime(sale.effectiveWarrantyExpiryTs)}
                    </p>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-amber-400 shrink-0">
                    {sale.remaining.formattedCountdown}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#111115] border border-zinc-800/90 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Recently Expired Warranties</h2>
              <p className="text-xs text-zinc-400">Accounts whose warranty window has ended</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('expired')}
              className="text-xs font-medium text-red-400 hover:text-red-300 whitespace-nowrap"
            >
              View All Expired
            </button>
          </div>
          {metrics.recentlyExpired.length === 0 ? (
            <p className="text-sm text-zinc-500 py-3">No expired warranties recorded.</p>
          ) : (
            <div className="divide-y divide-zinc-800/70">
              {metrics.recentlyExpired.map((sale) => (
                <button
                  key={sale.id}
                  type="button"
                  onClick={() => onSelectSale(sale)}
                  className="w-full text-left py-2.5 flex items-center justify-between gap-3 hover:bg-zinc-900/40 px-2 -mx-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {sale.clientName} · <span className="text-zinc-400">{sale.effectiveAccountType}</span>
                    </p>
                    <p className="text-xs text-zinc-500 font-mono tabular-nums">
                      Ended {formatDisplayDateTime(sale.effectiveWarrantyExpiryTs)}
                    </p>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-red-400 shrink-0">
                    {sale.remaining.expiredAgoLabel}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
