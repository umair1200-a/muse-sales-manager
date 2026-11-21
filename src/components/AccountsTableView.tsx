import { useState, useMemo } from 'react';
import {
  Search,
  Download,
  Eye,
  Edit3,
  RefreshCw,
  Trash2,
  History,
  Plus,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { SaleWithComputed, TableDensity } from '../types/models.ts';
import { formatDisplayDateTime } from '../utils/warranty.ts';
import { buildCsv } from '../utils/analytics.ts';
import { WarrantyStatusText } from './StatusText.tsx';

export type AccountsViewMode = 'all' | 'active' | 'expiring' | 'expired';

export function AccountsTableView({
  mode,
  sales,
  density,
  thresholdHours,
  onAddSale,
  onViewSale,
  onEditSale,
  onReplaceSale,
  onDeleteSale,
  onOpenClient,
}: {
  mode: AccountsViewMode;
  sales: SaleWithComputed[];
  density: TableDensity;
  thresholdHours: number;
  onAddSale: () => void;
  onViewSale: (sale: SaleWithComputed) => void;
  onEditSale: (sale: SaleWithComputed) => void;
  onReplaceSale: (sale: SaleWithComputed) => void;
  onDeleteSale: (sale: SaleWithComputed) => void;
  onOpenClient: (clientId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'REPLACED'
  >('ALL');
  const [sortBy, setSortBy] = useState<
    'EXPIRING_SOONEST' | 'RECENTLY_SOLD' | 'OLDEST_FIRST' | 'ACCOUNT_TYPE' | 'CLIENT_NAME'
  >(mode === 'active' || mode === 'expiring' ? 'EXPIRING_SOONEST' : 'RECENTLY_SOLD');
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const baseSales = useMemo(() => {
    if (mode === 'active') {
      return sales.filter(
        (s) => s.warrantyStatus === 'ACTIVE' || s.warrantyStatus === 'EXPIRING_SOON'
      );
    }
    if (mode === 'expiring') {
      return sales.filter((s) => s.warrantyStatus === 'EXPIRING_SOON');
    }
    if (mode === 'expired') {
      return sales.filter((s) => s.warrantyStatus === 'EXPIRED');
    }
    return sales;
  }, [sales, mode]);

  const filteredSales = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = baseSales.filter((s) => {
      if (mode === 'all') {
        if (statusFilter === 'ACTIVE' && s.warrantyStatus !== 'ACTIVE') return false;
        if (statusFilter === 'EXPIRING_SOON' && s.warrantyStatus !== 'EXPIRING_SOON') return false;
        if (statusFilter === 'EXPIRED' && s.warrantyStatus !== 'EXPIRED') return false;
        if (statusFilter === 'REPLACED' && !s.hasReplacement) return false;
      }

      if (!q) return true;
      return (
        s.clientName.toLowerCase().includes(q) ||
        s.clientEmail.toLowerCase().includes(q) ||
        s.saleCode.toLowerCase().includes(q) ||
        s.accountType.toLowerCase().includes(q) ||
        s.effectiveAccountType.toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'EXPIRING_SOONEST':
          return a.effectiveWarrantyExpiryTs - b.effectiveWarrantyExpiryTs;
        case 'OLDEST_FIRST':
          return a.saleTimestamp - b.saleTimestamp;
        case 'ACCOUNT_TYPE':
          return b.effectiveVolumeBillions - a.effectiveVolumeBillions;
        case 'CLIENT_NAME':
          return a.clientName.localeCompare(b.clientName);
        case 'RECENTLY_SOLD':
        default:
          return b.saleTimestamp - a.saleTimestamp;
      }
    });
  }, [baseSales, mode, statusFilter, search, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredSales.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedSales = filteredSales.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleExportCsv = () => {
    const csv = buildCsv(
      [
        'Sale ID',
        'Client Name',
        'Client Email',
        'Original Account Type',
        'Effective Account Type',
        'Sale Date',
        'Sale Time',
        'Warranty Duration (Days)',
        'Warranty Start',
        'Warranty Expiry',
        'Remaining / Expired',
        'Warranty Status',
        'Replacements Count',
        'Notes',
      ],
      filteredSales.map((s) => [
        s.saleCode,
        s.clientName,
        s.clientEmail,
        s.accountType,
        s.effectiveAccountType,
        s.saleDate,
        s.saleTime,
        s.effectiveDurationDays,
        formatDisplayDateTime(s.effectiveWarrantyStartTs),
        formatDisplayDateTime(s.effectiveWarrantyExpiryTs),
        s.remaining.isExpired ? s.remaining.expiredAgoLabel : s.remaining.formattedCountdown,
        s.warrantyStatus,
        s.replacementCount,
        s.notes,
      ])
    );

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `muse-sales-${mode}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cellPad = density === 'COMPACT' ? 'px-2.5 py-2' : 'px-3 py-2.5';

  const headings: Record<AccountsViewMode, { title: string; desc: string }> = {
    all: {
      title: 'All Accounts & Sales Records',
      desc: 'Complete ledger of sold Muse AI accounts, live warranty timers, and replacement actions.',
    },
    active: {
      title: 'Active Warranties',
      desc: 'All accounts with valid warranty windows counting down in real time.',
    },
    expiring: {
      title: 'Expiring Soon',
      desc: `Accounts within ${thresholdHours} hours of warranty expiration requiring attention.`,
    },
    expired: {
      title: 'Expired Warranties',
      desc: 'Permanent historical archive of accounts whose warranty duration has concluded.',
    },
  };

  return (
    <div className="space-y-4">
      {mode === 'expiring' && baseSales.length > 0 && (
        <div className="bg-amber-950/30 border border-amber-700/40 rounded-xl px-4 py-3 flex items-center gap-3 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            {baseSales.length} {baseSales.length === 1 ? 'account warranty is' : 'account warranties are'} expiring within {thresholdHours} hours.
          </span>
        </div>
      )}

      {/* Filter & Search Toolbar */}
      <div className="bg-[#111115] border border-zinc-800/90 rounded-xl p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white">{headings[mode].title}</h2>
            <p className="text-xs text-zinc-400 mt-0.5">{headings[mode].desc}</p>
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
              Add Sale
            </button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              aria-label="Search accounts by client name, email, sale ID, or account type"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search client name, email, Sale ID, or tier..."
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {mode === 'all' && (
              <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-lg p-1">
                {(
                  [
                    { key: 'ALL', label: 'All' },
                    { key: 'ACTIVE', label: 'Active' },
                    { key: 'EXPIRING_SOON', label: 'Expiring' },
                    { key: 'EXPIRED', label: 'Expired' },
                    { key: 'REPLACED', label: 'Replaced' },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => {
                      setStatusFilter(f.key);
                      setPage(1);
                    }}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      statusFilter === f.key
                        ? 'bg-red-600 text-white'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}

            <select
              aria-label="Sort records"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:border-red-500 focus:outline-none"
            >
              <option value="RECENTLY_SOLD">Sort: Recently Sold</option>
              <option value="EXPIRING_SOONEST">Sort: Expiring Soonest</option>
              <option value="OLDEST_FIRST">Sort: Oldest First</option>
              <option value="ACCOUNT_TYPE">Sort: Account Volume</option>
              <option value="CLIENT_NAME">Sort: Client Name</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-[#111115] border border-zinc-800/90 rounded-xl overflow-hidden">
        {paginatedSales.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm font-medium text-zinc-300">No matching account records found</p>
            <p className="text-xs text-zinc-500">
              {baseSales.length === 0
                ? 'Start by recording your first Muse AI account sale.'
                : 'Try adjusting your search query or status filters.'}
            </p>
            {baseSales.length === 0 && (
              <button
                type="button"
                onClick={onAddSale}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add First Sale
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto overscroll-x-contain">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-[11px] font-semibold text-zinc-400 bg-zinc-950/60">
                  <th className={`${cellPad} whitespace-nowrap`}>Sale ID</th>
                  <th className={`${cellPad} whitespace-nowrap`}>Client</th>
                  <th className={`${cellPad} whitespace-nowrap`}>Account</th>
                  <th className={`${cellPad} whitespace-nowrap`}>Sale Date</th>
                  <th className={`${cellPad} whitespace-nowrap`}>Warranty Window</th>
                  <th className={`${cellPad} whitespace-nowrap`}>Remaining Warranty</th>
                  <th className={`${cellPad} whitespace-nowrap`}>Status</th>
                  <th className={`${cellPad} whitespace-nowrap`}>Replacement</th>
                  <th className={`${cellPad} whitespace-nowrap text-right`}>Actions</th>
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
                        aria-label={`Open account details for ${sale.saleCode}`}
                        className="font-mono font-semibold text-white hover:text-red-400 transition-colors text-left"
                      >
                        {sale.saleCode}
                      </button>
                    </td>
                    <td className={`${cellPad} max-w-[175px]`}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenClient(sale.clientId);
                        }}
                        className="font-medium text-white hover:text-red-400 transition-colors text-left block truncate max-w-full"
                      >
                        {sale.clientName}
                      </button>
                      <span className="text-[11px] text-zinc-400 block truncate">
                        {sale.clientEmail}
                      </span>
                    </td>
                    <td className={`${cellPad} whitespace-nowrap text-zinc-200 font-medium`}>
                      <span>{sale.effectiveAccountType}</span>
                      <span className="block text-[10px] font-mono text-zinc-400">
                        {sale.effectiveDurationDays} {sale.effectiveDurationDays === 1 ? 'Day' : 'Days'}
                      </span>
                    </td>
                    <td className={`${cellPad} font-mono tabular-nums text-zinc-300 whitespace-nowrap text-[11px]`}>
                      <span>{sale.saleDate}</span>
                      <span className="block text-zinc-500">{sale.saleTime}</span>
                    </td>
                    <td className={`${cellPad} font-mono tabular-nums whitespace-nowrap text-[11px]`}>
                      <span className="text-zinc-400 block">
                        Start: {formatDisplayDateTime(sale.effectiveWarrantyStartTs)}
                      </span>
                      <span className="text-zinc-200 block">
                        Exp: {formatDisplayDateTime(sale.effectiveWarrantyExpiryTs)}
                      </span>
                    </td>
                    <td className={`${cellPad} font-mono tabular-nums whitespace-nowrap text-[11px]`}>
                      {sale.remaining.isExpired ? (
                        <span className="text-red-400">{sale.remaining.expiredAgoLabel}</span>
                      ) : (
                        <span
                          className={
                            sale.warrantyStatus === 'EXPIRING_SOON'
                              ? 'text-amber-400 font-semibold'
                              : 'text-emerald-400'
                          }
                        >
                          {sale.remaining.formattedCountdown}
                        </span>
                      )}
                    </td>
                    <td className={`${cellPad} whitespace-nowrap`}>
                      <WarrantyStatusText status={sale.warrantyStatus} />
                    </td>
                    <td className={`${cellPad} whitespace-nowrap text-[11px]`}>
                      {sale.hasReplacement ? (
                        <span className="text-amber-300 font-mono tabular-nums">
                          Replaced ({sale.replacementCount})
                        </span>
                      ) : (
                        <span className="text-zinc-500">None</span>
                      )}
                    </td>
                    <td className={`${cellPad} whitespace-nowrap text-right`}>
                      <div className="inline-flex items-center justify-end gap-0.5">
                        <button
                          type="button"
                          title="View sale details"
                          aria-label={`View sale ${sale.saleCode}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewSale(sale);
                          }}
                          className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Edit sale"
                          aria-label={`Edit sale ${sale.saleCode}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditSale(sale);
                          }}
                          className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Give replacement"
                          aria-label={`Give replacement for ${sale.saleCode}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onReplaceSale(sale);
                          }}
                          className="px-2 py-1 text-[11px] font-medium text-amber-300 hover:text-white hover:bg-amber-600/20 border border-amber-600/30 rounded-md transition-colors inline-flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Replace
                        </button>
                        <button
                          type="button"
                          title="View replacement history"
                          aria-label={`View history for ${sale.saleCode}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewSale(sale);
                          }}
                          className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-colors"
                        >
                          <History className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Delete sale"
                          aria-label={`Delete sale ${sale.saleCode}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSale(sale);
                          }}
                          className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-950/40 rounded-md transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
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
