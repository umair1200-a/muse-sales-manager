import { useState, useMemo } from 'react';
import { Search, Download, User, Trash2 } from 'lucide-react';
import type { ClientWithStats, TableDensity } from '../types/models.ts';
import { formatDisplayDate } from '../utils/warranty.ts';
import { buildCsv } from '../utils/analytics.ts';

export function ClientsView({
  clients,
  density,
  onSelectClient,
  onDeleteClient,
}: {
  clients: ClientWithStats[];
  density: TableDensity;
  onSelectClient: (client: ClientWithStats) => void;
  onDeleteClient: (client: ClientWithStats) => void;
}) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.accountTypesPurchased.some((t) => t.toLowerCase().includes(q)) ||
        c.notes.toLowerCase().includes(q)
    );
  }, [clients, search]);

  const handleExportCsv = () => {
    const csv = buildCsv(
      [
        'Client Name',
        'Client Email',
        'First Purchase Date',
        'Total Accounts Purchased',
        'Total Volume (Billions)',
        'Account Types Purchased',
        'Total Replacements',
        'Active Warranties',
        'Expired Warranties',
        'Notes',
      ],
      filtered.map((c) => [
        c.name,
        c.email,
        c.firstPurchaseTs ? formatDisplayDate(c.firstPurchaseTs) : '',
        c.totalAccountsPurchased,
        c.totalVolumeBillions,
        c.accountTypesPurchased.join('; '),
        c.totalReplacements,
        c.activeWarranties + c.expiringSoonWarranties,
        c.expiredWarranties,
        c.notes,
      ])
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `muse-clients-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cellPad = density === 'COMPACT' ? 'px-3 py-2' : 'px-4 py-3';

  return (
    <div className="space-y-4">
      <div className="bg-[#111115] border border-zinc-800/90 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-white">All Clients</h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Automatically deduplicated by email address across repeat account purchases.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              aria-label="Search clients"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, or tier..."
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500"
            />
          </div>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="bg-[#111115] border border-zinc-800/90 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-sm font-medium text-zinc-300">No clients found</p>
            <p className="text-xs text-zinc-500">
              Client profiles are created automatically when you save a new sale.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto overscroll-x-contain">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-[11px] font-semibold text-zinc-400 bg-zinc-950/60">
                  <th className={`${cellPad} whitespace-nowrap`}>Client Name</th>
                  <th className={`${cellPad} whitespace-nowrap`}>Client Email</th>
                  <th className={`${cellPad} whitespace-nowrap`}>First Purchase</th>
                  <th className={`${cellPad} whitespace-nowrap`}>Accounts Sold</th>
                  <th className={`${cellPad} whitespace-nowrap`}>Account Types</th>
                  <th className={`${cellPad} whitespace-nowrap`}>Replacements</th>
                  <th className={`${cellPad} whitespace-nowrap`}>Notes</th>
                  <th className={`${cellPad} whitespace-nowrap text-right`}>Profile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70 text-xs">
                {filtered.map((client) => (
                  <tr key={client.id} className="hover:bg-zinc-900/40 transition-colors">
                    <td className={`${cellPad} font-semibold text-white whitespace-nowrap`}>
                      <button
                        type="button"
                        onClick={() => onSelectClient(client)}
                        className="hover:text-red-400 transition-colors text-left"
                      >
                        {client.name}
                      </button>
                    </td>
                    <td className={`${cellPad} text-zinc-300 whitespace-nowrap`}>
                      {client.email}
                    </td>
                    <td className={`${cellPad} font-mono tabular-nums text-zinc-400 whitespace-nowrap`}>
                      {client.firstPurchaseTs ? formatDisplayDate(client.firstPurchaseTs) : '—'}
                    </td>
                    <td className={`${cellPad} font-mono tabular-nums text-zinc-200 whitespace-nowrap`}>
                      {client.totalAccountsPurchased} ({client.totalVolumeBillions}B)
                    </td>
                    <td className={`${cellPad} text-zinc-300 max-w-[240px] truncate`}>
                      {client.accountTypesPurchased.join(', ') || '—'}
                    </td>
                    <td className={`${cellPad} font-mono tabular-nums text-amber-400 whitespace-nowrap`}>
                      {client.totalReplacements}
                    </td>
                    <td className={`${cellPad} text-zinc-400 max-w-[180px] truncate`}>
                      {client.notes || '—'}
                    </td>
                    <td className={`${cellPad} whitespace-nowrap text-right`}>
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onSelectClient(client)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-md"
                        >
                          <User className="w-3 h-3" />
                          View Profile
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete client ${client.name}`}
                          onClick={() => onDeleteClient(client)}
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
      </div>
    </div>
  );
}
