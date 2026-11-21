import React, { useState, useEffect } from 'react';
import { X, Mail, Calendar, RefreshCw, Save } from 'lucide-react';
import type { ClientWithStats, SaleWithComputed } from '../types/models.ts';
import { formatDisplayDate, formatDisplayDateTime } from '../utils/warranty.ts';
import { WarrantyStatusText } from './StatusText.tsx';

export function ClientProfileModal({
  client,
  onClose,
  onUpdateClient,
  onViewSale,
}: {
  client: ClientWithStats | null;
  onClose: () => void;
  onUpdateClient: (clientId: string, payload: { name: string; notes: string }) => Promise<void>;
  onViewSale: (sale: SaleWithComputed) => void;
}) {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (client) {
      setName(client.name);
      setNotes(client.notes);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.id]);

  if (!client) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onUpdateClient(client.id, { name: name.trim(), notes: notes.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update client details.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="client-profile-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto overscroll-contain"
    >
      <div className="bg-[#111115] border border-zinc-800 rounded-xl max-w-3xl w-full my-auto max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div>
            <h2 id="client-profile-title" className="text-lg font-semibold text-white">
              {client.name}
            </h2>
            <p className="text-xs text-zinc-400 flex items-center gap-1.5 mt-0.5">
              <Mail className="w-3.5 h-3.5" />
              {client.email}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close client profile"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-b border-zinc-800/80 pb-5">
            <div>
              <p className="text-xs text-zinc-500">Accounts Purchased</p>
              <p className="text-xl font-semibold text-white font-mono tabular-nums mt-1">
                {client.totalAccountsPurchased}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Total Volume</p>
              <p className="text-xl font-semibold text-white font-mono tabular-nums mt-1">
                {client.totalVolumeBillions}B
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Active / Expired</p>
              <p className="text-xl font-semibold font-mono tabular-nums mt-1">
                <span className="text-emerald-400">{client.activeWarranties + client.expiringSoonWarranties}</span>
                <span className="text-zinc-600"> / </span>
                <span className="text-red-400">{client.expiredWarranties}</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Replacements</p>
              <p className="text-xl font-semibold text-amber-400 font-mono tabular-nums mt-1">
                {client.totalReplacements}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-zinc-500" />
              First Purchase:{' '}
              <span className="text-zinc-200 font-mono tabular-nums">
                {client.firstPurchaseTs ? formatDisplayDate(client.firstPurchaseTs) : '—'}
              </span>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Tiers: <span className="text-zinc-200">{client.accountTypesPurchased.join(', ') || 'None'}</span>
            </span>
          </div>

          <form onSubmit={handleSave} className="space-y-3 bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-4">
            {error && (
              <div
                role="alert"
                className="bg-red-950/50 border border-red-800/60 text-red-200 text-xs rounded-lg p-3"
              >
                {error}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="profile-client-name" className="block text-xs text-zinc-400">
                  Client Name
                </label>
                <input
                  id="profile-client-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg px-3 py-1.5 text-sm text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs text-zinc-400">Email Identifier</label>
                <input
                  type="text"
                  disabled
                  value={client.email}
                  className="w-full bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-400 cursor-not-allowed"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="profile-client-notes" className="block text-xs text-zinc-400">
                Client Notes
              </label>
              <textarea
                id="profile-client-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add private client preferences or notes..."
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Saving...' : 'Save Client Details'}
              </button>
            </div>
          </form>

          <div className="space-y-2.5">
            <h3 className="text-sm font-semibold text-white">
              Purchase &amp; Warranty Timeline ({client.sales.length})
            </h3>
            {client.sales.length === 0 ? (
              <p className="text-xs text-zinc-500">No purchases found for this client.</p>
            ) : (
              <div className="divide-y divide-zinc-800/70 border border-zinc-800/80 rounded-lg overflow-hidden">
                {client.sales.map((sale) => (
                  <div
                    key={sale.id}
                    className="p-3.5 bg-zinc-950/40 hover:bg-zinc-900/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-semibold text-white">{sale.saleCode}</span>
                        <span className="text-zinc-600">·</span>
                        <span className="text-zinc-200 font-medium">{sale.accountType}</span>
                        <span className="text-zinc-600">·</span>
                        <span className="font-mono tabular-nums text-zinc-400">
                          {sale.saleDate} {sale.saleTime}
                        </span>
                      </div>
                      <p className="text-xs font-mono tabular-nums text-zinc-400">
                        {sale.remaining.isExpired
                          ? sale.remaining.expiredAgoLabel
                          : sale.remaining.formattedCountdown}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <WarrantyStatusText status={sale.warrantyStatus} />
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onViewSale(sale);
                        }}
                        className="px-2.5 py-1 text-xs font-medium text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-md whitespace-nowrap"
                      >
                        Inspect
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2.5">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-zinc-400" />
              Replacement History ({client.replacements.length})
            </h3>
            {client.replacements.length === 0 ? (
              <p className="text-xs text-zinc-500">No replacements issued to this client.</p>
            ) : (
              <div className="divide-y divide-zinc-800/70 border border-zinc-800/80 rounded-lg overflow-hidden">
                {client.replacements.map((rep) => (
                  <div key={rep.id} className="p-3.5 bg-zinc-950/40 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-white">
                        {rep.replacementCode}
                      </span>
                      <span className="font-mono tabular-nums text-zinc-400">
                        {formatDisplayDateTime(rep.replacementTimestamp)}
                      </span>
                    </div>
                    <p className="text-zinc-300">
                      {rep.originalAccountType} → <span className="text-white font-medium">{rep.newAccountType}</span>
                      <span className="text-zinc-500"> · </span>
                      {rep.warrantyPolicy === 'CONTINUE_ORIGINAL'
                        ? 'Continued Original Warranty'
                        : `New ${rep.warrantyDurationDays}-Day Warranty`}
                    </p>
                    {rep.notes && <p className="text-zinc-400">{rep.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
