import { useState, useMemo } from 'react';
import { Search, Download } from 'lucide-react';
import type {
  ClientRecord,
  ReplacementRecord,
  SaleWithComputed,
  TableDensity,
} from '../types/models.ts';
import { formatDisplayDateTime } from '../utils/warranty.ts';
import { buildCsv } from '../utils/analytics.ts';

export function ReplacementsView({
  replacements,
  sales,
  clients,
  density,
  onSelectSale,
  onOpenClient,
}: {
  replacements: ReplacementRecord[];
  sales: SaleWithComputed[];
  clients: ClientRecord[];
  density: TableDensity;
  onSelectSale: (sale: SaleWithComputed) => void;
  onOpenClient: (clientId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [policyFilter, setPolicyFilter] = useState<'ALL' | 'CONTINUE_ORIGINAL' | 'START_NEW'>('ALL');

  const saleMap = useMemo(() => new Map(sales.map((s) => [s.id, s])), [sales]);
  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const enrichedRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return replacements
      .map((rep) => {
        const sale = saleMap.get(rep.originalSaleId) ?? null;
        const client = clientMap.get(rep.clientId) ?? null;
        return {
          ...rep,
          sale,
          clientName: sale?.clientName ?? client?.name ?? 'Unknown Client',
          clientEmail: sale?.clientEmail ?? client?.email ?? '',
          saleCode: sale?.saleCode ?? rep.originalSaleId,
          originalDurationDays: sale?.warrantyDurationDays ?? rep.warrantyDurationDays,
          originalExpiryTs: sale?.warrantyExpiryTs ?? rep.warrantyExpiryTs,
        };
      })
      .filter((row) => {
        if (policyFilter !== 'ALL' && row.warrantyPolicy !== policyFilter) return false;
        if (!q) return true;
        return (
          row.replacementCode.toLowerCase().includes(q) ||
          row.saleCode.toLowerCase().includes(q) ||
          row.clientName.toLowerCase().includes(q) ||
          row.clientEmail.toLowerCase().includes(q) ||
          row.originalAccountType.toLowerCase().includes(q) ||
          row.newAccountType.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.replacementTimestamp - a.replacementTimestamp);
  }, [replacements, saleMap, clientMap, search, policyFilter]);

  const handleExportCsv = () => {
    const csv = buildCsv(
      [
        'Replacement ID',
        'Original Sale ID',
        'Client Name',
        'Client Email',
        'Original Account Type',
        'New Account Type',
        'Replacement Date',
        'Original Warranty (Days)',
        'Replacement Warranty (Days)',
        'Warranty Policy',
        'Replacement Expiry',
        'Notes',
      ],
      enrichedRows.map((r) => [
        r.replacementCode,
        r.saleCode,
        r.clientName,
        r.clientEmail,
        r.originalAccountType,
        r.newAccountType,
        formatDisplayDateTime(r.replacementTimestamp),
        r.originalDurationDays,
        r.warrantyDurationDays,
        r.warrantyPolicy === 'CONTINUE_ORIGINAL' ? 'Continue Original Warranty' : 'Start New Warranty',
        formatDisplayDateTime(r.warrantyExpiryTs),
        r.notes,
      ])
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `muse-replacements-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cellPad = density === 'COMPACT' ? 'px-3 py-2' : 'px-4 py-3';

  return (
    <div className="space-y-4">
      <div className="bg-[#111115] border border-zinc-800/90 rounded-xl p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white">Replacement History</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Immutable replacement audit trail linked to original sales and warranty windows.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors whitespace-nowrap self-start"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              aria-label="Search replacement records"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Replacement ID, Sale ID, client, or tier..."
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500"
            />
          </div>

          <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-lg p-1 self-start">
            {(
              [
                { key: 'ALL', label: 'All Policies' },
                { key: 'CONTINUE_ORIGINAL', label: 'Continue Original' },
                { key: 'START_NEW', label: 'Start New' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setPolicyFilter(opt.key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  policyFilter === opt.key
                    ? 'bg-red-600 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-[#111115] border border-zinc-800/90 rounded-xl overflow-hidden">
        {enrichedRows.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-sm font-medium text-zinc-300">No replacement records found</p>
            <p className="text-xs text-zinc-500">
              Use &ldquo;Replace&rdquo; on any account record in All Accounts to log a replacement.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto overscroll-x-contain">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-[11px] font-semibold text-zinc-400 bg-zinc-950/60">
                  <th className={`${cellPad} whitespace-nowrap`}>Replacement ID</th>
                  <th className={`${cellPad} whitespace-nowrap`}>Client</th>
                  <th className={`${cellPad} whitespace-nowrap`}>Original Account</th>
                  <th className={`${cellPad} whitespace-nowrap`}>New Account</th>
                  <th className={`${cellPad} whitespace-nowrap`}>Replacement Date</th>
                  <th className={`${cellPad} whitespace-nowrap`}>Original Warranty</th>
                  <th className={`${cellPad} whitespace-nowrap`}>Replacement Warranty</th>
                  <th className={`${cellPad} whitespace-nowrap`}>Policy</th>
                  <th className={`${cellPad} whitespace-nowrap`}>Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70 text-xs">
                {enrichedRows.map((row) => (
                  <tr key={row.id} className="hover:bg-zinc-900/40 transition-colors">
                    <td className={`${cellPad} font-mono whitespace-nowrap`}>
                      <span className="font-semibold text-white block">{row.replacementCode}</span>
                      {row.sale && (
                        <button
                          type="button"
                          onClick={() => onSelectSale(row.sale!)}
                          className="text-[11px] text-zinc-400 hover:text-red-400"
                        >
                          Orig: {row.saleCode}
                        </button>
                      )}
                    </td>
                    <td className={`${cellPad} whitespace-nowrap`}>
                      <button
                        type="button"
                        onClick={() => onOpenClient(row.clientId)}
                        className="font-medium text-white hover:text-red-400 text-left block"
                      >
                        {row.clientName}
                      </button>
                      <span className="text-[11px] text-zinc-400 block">{row.clientEmail}</span>
                    </td>
                    <td className={`${cellPad} text-zinc-300 whitespace-nowrap`}>
                      {row.originalAccountType}
                    </td>
                    <td className={`${cellPad} text-white font-medium whitespace-nowrap`}>
                      {row.newAccountType}
                    </td>
                    <td className={`${cellPad} font-mono tabular-nums text-zinc-300 whitespace-nowrap`}>
                      {formatDisplayDateTime(row.replacementTimestamp)}
                    </td>
                    <td className={`${cellPad} font-mono tabular-nums text-zinc-400 whitespace-nowrap`}>
                      {row.originalDurationDays}d (Exp {formatDisplayDateTime(row.originalExpiryTs)})
                    </td>
                    <td className={`${cellPad} font-mono tabular-nums text-zinc-200 whitespace-nowrap`}>
                      {row.warrantyDurationDays}d (Exp {formatDisplayDateTime(row.warrantyExpiryTs)})
                    </td>
                    <td className={`${cellPad} whitespace-nowrap`}>
                      <span
                        className={
                          row.warrantyPolicy === 'START_NEW' ? 'text-emerald-400' : 'text-amber-400'
                        }
                      >
                        {row.warrantyPolicy === 'START_NEW'
                          ? 'Start New Warranty'
                          : 'Continue Original'}
                      </span>
                    </td>
                    <td className={`${cellPad} text-zinc-400 max-w-[200px] truncate`}>
                      {row.notes || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
