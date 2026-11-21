import { useMemo, useState } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Layers,
  Plus,
  RotateCcw,
  Search,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react';
import type {
  AccountSellDateMode,
  SaleWithComputed,
  TableDensity,
} from '../types/models.ts';
import { ACCOUNT_TYPES, formatDisplayDateTime } from '../utils/warranty.ts';
import {
  buildCsv,
  computeAccountSellStats,
  filterAccountSellSales,
} from '../utils/analytics.ts';
import { WarrantyStatusText } from './StatusText.tsx';

export function AccountSellView({
  sales,
  density,
  nowTs,
  onAddSale,
  onViewSale,
  onOpenClient,
}: {
  sales: SaleWithComputed[];
  density: TableDensity;
  nowTs: number;
  onAddSale: () => void;
  onViewSale: (sale: SaleWithComputed) => void;
  onOpenClient: (clientId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [accountTypeFilter, setAccountTypeFilter] = useState<string>('ALL');
  const [dateMode, setDateMode] = useState<AccountSellDateMode>('ALL');
  const [singleDate, setSingleDate] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showAllTiers, setShowAllTiers] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const stats = useMemo(() => computeAccountSellStats(sales, nowTs), [sales, nowTs]);

  const filteredSales = useMemo(
    () =>
      filterAccountSellSales(
        sales,
        {
          query: search,
          accountType: accountTypeFilter,
          dateMode,
          singleDate,
          dateFrom,
          dateTo,
        },
        nowTs
      ),
    [sales, search, accountTypeFilter, dateMode, singleDate, dateFrom, dateTo, nowTs]
  );

  const totalPages = Math.max(1, Math.ceil(filteredSales.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedSales = filteredSales.slice((safePage - 1) * pageSize, safePage * pageSize);

  const hasActiveFilters =
    search.trim().length > 0 ||
    accountTypeFilter !== 'ALL' ||
    dateMode !== 'ALL';

  const handleResetFilters = () => {
    setSearch('');
    setAccountTypeFilter('ALL');
    setDateMode('ALL');
    setSingleDate('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const handleExportCsv = () => {
    const csv = buildCsv(
      [
        'Sale ID',
        'Account ID',
        'Client Name',
        'Client Email',
        'Account Type',
        'Sale Date',
        'Sale Time',
        'Warranty Status',
        'Replacements Count',
      ],
      filteredSales.map((s) => [
        s.saleCode,
        s.id,
        s.clientName,
        s.clientEmail,
        s.accountType,
        s.saleDate,
        s.saleTime,
        s.warrantyStatus,
        s.replacementCount,
      ])
    );

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `muse-account-sell-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const maxTierCount = useMemo(
    () => Math.max(1, ...stats.accountTypeBreakdown.map((t) => t.count)),
    [stats.accountTypeBreakdown]
  );

  const visibleTiers = useMemo(() => {
    if (showAllTiers) return stats.accountTypeBreakdown;
    return stats.accountTypeBreakdown.filter((t) => t.count > 0);
  }, [stats.accountTypeBreakdown, showAllTiers]);

  const cellPad = density === 'COMPACT' ? 'px-3 py-2' : 'px-4 py-3';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Account Sell</h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Automatic genuine account sales ledger derived directly from saved sale records. Replacements and expired warranties never distort totals.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={onAddSale}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Add New Sale
          </button>
        </div>
      </div>

      {/* 4 Core Account Sell KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div
          data-testid="kpi-total-accounts-sold"
          className="bg-[#111115] border border-zinc-800/90 rounded-xl p-5"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-zinc-400">Total Accounts Sold</p>
            <ShoppingBag className="w-4 h-4 text-red-500" />
          </div>
          <p className="text-2xl font-bold text-white font-mono tabular-nums mt-2">
            {stats.totalAccountsSold}
          </p>
          <p className="text-[11px] text-zinc-500 font-mono tabular-nums mt-1">
            {stats.totalVolumeBillions.toLocaleString()} Billion total account tier volume
          </p>
        </div>

        <div
          data-testid="kpi-total-sales"
          className="bg-[#111115] border border-zinc-800/90 rounded-xl p-5"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-zinc-400">Total Sales</p>
            <TrendingUp className="w-4 h-4 text-zinc-300" />
          </div>
          <p className="text-2xl font-bold text-white font-mono tabular-nums mt-2">
            {stats.totalSales}
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">
            Genuine saved sale transactions
          </p>
        </div>

        <div
          data-testid="kpi-accounts-sold-today"
          className="bg-[#111115] border border-zinc-800/90 rounded-xl p-5"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-zinc-400">Accounts Sold Today</p>
            <Calendar className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-400 font-mono tabular-nums mt-2">
            {stats.accountsSoldToday}
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">
            Recorded on today&apos;s date
          </p>
        </div>

        <div
          data-testid="kpi-accounts-sold-month"
          className="bg-[#111115] border border-zinc-800/90 rounded-xl p-5"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-zinc-400">Accounts Sold This Month</p>
            <Layers className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-white font-mono tabular-nums mt-2">
            {stats.accountsSoldThisMonth}
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">
            Current calendar month sales
          </p>
        </div>
      </div>

      {/* Account Type Breakdown (1 Billion to 31 Billion) */}
      <div className="bg-[#111115] border border-zinc-800/90 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Account Type Breakdown (1 Billion – 31 Billion)
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Click any account tier card to filter the Sold Accounts list below.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAllTiers((prev) => !prev)}
            className="text-xs font-medium text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-3 py-1.5 rounded-lg transition-colors self-start sm:self-auto"
          >
            {showAllTiers ? 'Show Sold Tiers Only' : 'Show All 31 Tiers'}
          </button>
        </div>

        {visibleTiers.length === 0 ? (
          <p className="text-xs text-zinc-500 py-2">No account sales recorded yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-2.5">
            {visibleTiers.map((tier) => {
              const isSelected = accountTypeFilter === tier.accountType;
              const widthPct = tier.count > 0 ? Math.max(8, Math.round((tier.count / maxTierCount) * 100)) : 0;
              return (
                <button
                  key={tier.accountType}
                  type="button"
                  onClick={() => {
                    setAccountTypeFilter((prev) =>
                      prev === tier.accountType ? 'ALL' : tier.accountType
                    );
                    setPage(1);
                  }}
                  className={`text-left rounded-lg border p-2.5 transition-colors ${
                    isSelected
                      ? 'bg-red-600/15 border-red-500 text-white'
                      : tier.count > 0
                      ? 'bg-zinc-950/90 border-zinc-800 hover:border-zinc-700 text-white'
                      : 'bg-zinc-950/40 border-zinc-800/60 text-zinc-500 hover:border-zinc-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-medium truncate">
                      {tier.accountType}
                    </span>
                    <span
                      className={`text-xs font-bold font-mono tabular-nums ${
                        tier.count > 0 ? 'text-white' : 'text-zinc-600'
                      }`}
                    >
                      {tier.count}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 w-full bg-zinc-900 rounded-full overflow-hidden">
                    {widthPct > 0 && (
                      <div
                        className="h-full bg-red-600 rounded-full"
                        style={{ width: `${widthPct}%` }}
                      />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Search & Filter Toolbar + Complete Sold Accounts List */}
      <div className="bg-[#111115] border border-zinc-800/90 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800/80 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-white">Complete Sold Accounts List</h3>
              <p className="text-xs text-zinc-400">
                Showing {filteredSales.length} of {sales.length} genuine sold{' '}
                {sales.length === 1 ? 'account' : 'accounts'}. Click any row to open full Account Details.
              </p>
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors self-start sm:self-auto"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Filters
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="relative md:col-span-5">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                aria-label="Search sold accounts by client name, email, Sale ID, or tier"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search client name, email, Sale ID, Account ID..."
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500"
              />
            </div>

            <div className="md:col-span-3">
              <select
                aria-label="Filter by account type"
                value={accountTypeFilter}
                onChange={(e) => {
                  setAccountTypeFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg px-3 py-2 text-xs text-zinc-200"
              >
                <option value="ALL">All Account Types (1B–31B)</option>
                {ACCOUNT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-4 flex flex-wrap sm:flex-nowrap items-center gap-2">
              <select
                aria-label="Filter by sale date"
                value={dateMode}
                onChange={(e) => {
                  setDateMode(e.target.value as AccountSellDateMode);
                  setPage(1);
                }}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg px-3 py-2 text-xs text-zinc-200"
              >
                <option value="ALL">Sale Date: All Time</option>
                <option value="TODAY">Sale Date: Today</option>
                <option value="THIS_MONTH">Sale Date: This Month</option>
                <option value="SINGLE_DATE">Sale Date: Specific Date</option>
                <option value="RANGE">Sale Date: Custom Range</option>
              </select>
            </div>
          </div>

          {dateMode === 'SINGLE_DATE' && (
            <div className="flex items-center gap-3 pt-1">
              <label htmlFor="account-sell-single-date" className="text-xs text-zinc-400">
                Exact Sale Date:
              </label>
              <input
                id="account-sell-single-date"
                type="date"
                value={singleDate}
                onChange={(e) => {
                  setSingleDate(e.target.value);
                  setPage(1);
                }}
                className="bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg px-3 py-1.5 text-xs text-white font-mono"
              />
            </div>
          )}

          {dateMode === 'RANGE' && (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <label htmlFor="account-sell-date-from" className="text-xs text-zinc-400">
                From:
              </label>
              <input
                id="account-sell-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg px-3 py-1.5 text-xs text-white font-mono"
              />
              <label htmlFor="account-sell-date-to" className="text-xs text-zinc-400">
                To:
              </label>
              <input
                id="account-sell-date-to"
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg px-3 py-1.5 text-xs text-white font-mono"
              />
            </div>
          )}
        </div>

        {paginatedSales.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm font-medium text-zinc-300">
              {sales.length === 0 ? 'No sold accounts recorded yet' : 'No sold accounts match your filters'}
            </p>
            <p className="text-xs text-zinc-500">
              {sales.length === 0
                ? 'Whenever you add and save a new sale, it will automatically appear here.'
                : 'Try clearing or adjusting your search query, account type, or date filter.'}
            </p>
            {sales.length === 0 && (
              <button
                type="button"
                onClick={onAddSale}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Record First Sale
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto overscroll-x-contain">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-[11px] font-semibold text-zinc-400 bg-zinc-950/60">
                  <th className={`${cellPad} whitespace-nowrap`}>Sale ID</th>
                  <th className={`${cellPad} whitespace-nowrap`}>Client Name</th>
                  <th className={`${cellPad} whitespace-nowrap`}>Client Email</th>
                  <th className={`${cellPad} whitespace-nowrap`}>Account Type</th>
                  <th className={`${cellPad} whitespace-nowrap`}>Sale Date &amp; Time</th>
                  <th className={`${cellPad} whitespace-nowrap`}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70 text-xs">
                {paginatedSales.map((sale) => (
                  <tr
                    key={sale.id}
                    onClick={() => onViewSale(sale)}
                    className="cursor-pointer hover:bg-zinc-900/50 transition-colors"
                  >
                    <td className={`${cellPad} whitespace-nowrap`}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewSale(sale);
                        }}
                        aria-label={`Open details for sold account ${sale.saleCode}`}
                        className="font-mono font-semibold text-white hover:text-red-400 transition-colors"
                      >
                        {sale.saleCode}
                      </button>
                      <span className="block text-[10px] font-mono text-zinc-500">
                        {sale.id}
                      </span>
                    </td>
                    <td className={`${cellPad} whitespace-nowrap`}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenClient(sale.clientId);
                        }}
                        className="font-medium text-white hover:text-red-400 transition-colors text-left"
                      >
                        {sale.clientName}
                      </button>
                    </td>
                    <td className={`${cellPad} text-zinc-300 whitespace-nowrap`}>
                      {sale.clientEmail}
                    </td>
                    <td className={`${cellPad} whitespace-nowrap font-medium text-white`}>
                      {sale.accountType}
                      {sale.hasReplacement && sale.effectiveAccountType !== sale.accountType && (
                        <span className="block text-[10px] text-amber-300">
                          Current: {sale.effectiveAccountType}
                        </span>
                      )}
                    </td>
                    <td className={`${cellPad} font-mono tabular-nums text-zinc-200 whitespace-nowrap`}>
                      <span>{sale.saleDate} · {sale.saleTime}</span>
                      <span className="block text-[10px] text-zinc-500">
                        {formatDisplayDateTime(sale.saleTimestamp)}
                      </span>
                    </td>
                    <td className={`${cellPad} whitespace-nowrap`}>
                      <div className="flex items-center gap-2">
                        <WarrantyStatusText status={sale.warrantyStatus} />
                        {sale.hasReplacement && (
                          <span className="text-[11px] font-mono text-amber-300">
                            · Replaced ({sale.replacementCount})
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {filteredSales.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800/80 text-xs text-zinc-400">
            <span className="font-mono tabular-nums">
              Showing {(safePage - 1) * pageSize + 1}–
              {Math.min(safePage * pageSize, filteredSales.length)} of {filteredSales.length}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Previous page"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-md border border-zinc-800 bg-zinc-950 text-zinc-300 hover:text-white disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-mono tabular-nums text-zinc-300">
                {safePage} / {totalPages}
              </span>
              <button
                type="button"
                aria-label="Next page"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-md border border-zinc-800 bg-zinc-950 text-zinc-300 hover:text-white disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
