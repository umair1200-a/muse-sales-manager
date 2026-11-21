import React, { useState, useMemo } from 'react';
import { CheckCircle2, Clock, UserCheck } from 'lucide-react';
import type { AppSettings, ClientRecord } from '../types/models.ts';
import {
  ACCOUNT_TYPES,
  WARRANTY_DURATIONS,
  calculateWarrantyExpiryTs,
  formatDisplayDateTime,
  formatLocalDateInput,
  formatLocalTimeInput,
  parseDateAndTimeToTimestamp,
} from '../utils/warranty.ts';

export function AddSaleView({
  clients,
  settings,
  onCreateSale,
  onCancel,
}: {
  clients: ClientRecord[];
  settings: AppSettings;
  onCreateSale: (payload: {
    clientName: string;
    clientEmail: string;
    accountType: string;
    warrantyDurationDays: number;
    saleDate: string;
    saleTime: string;
    warrantyStartTs: number;
    notes: string;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const initialNow = useMemo(() => Date.now(), []);
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [accountType, setAccountType] = useState('');
  const [warrantyDurationDays, setWarrantyDurationDays] = useState<string>('');
  const [saleDate, setSaleDate] = useState(() => formatLocalDateInput(initialNow));
  const [saleTime, setSaleTime] = useState(() => formatLocalTimeInput(initialNow));
  const [customWarrantyStart, setCustomWarrantyStart] = useState(
    settings.defaultWarrantyStartMode === 'CUSTOM'
  );
  const [warrantyStartDate, setWarrantyStartDate] = useState(() =>
    formatLocalDateInput(initialNow)
  );
  const [warrantyStartTime, setWarrantyStartTime] = useState(() =>
    formatLocalTimeInput(initialNow)
  );
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matchedClient = useMemo(() => {
    const clean = clientEmail.trim().toLowerCase();
    if (!clean) return null;
    return clients.find((c) => c.email.toLowerCase() === clean) ?? null;
  }, [clients, clientEmail]);

  const preview = useMemo(() => {
    try {
      const startTs = customWarrantyStart
        ? parseDateAndTimeToTimestamp(warrantyStartDate, warrantyStartTime)
        : parseDateAndTimeToTimestamp(saleDate, saleTime);
      const duration = Number(warrantyDurationDays);
      if (!duration || duration < 1 || duration > 25) {
        return { startTs, expiryTs: null, hours: null };
      }
      return {
        startTs,
        expiryTs: calculateWarrantyExpiryTs(startTs, duration),
        hours: duration * 24,
      };
    } catch {
      return { startTs: null, expiryTs: null, hours: null };
    }
  }, [
    customWarrantyStart,
    warrantyStartDate,
    warrantyStartTime,
    saleDate,
    saleTime,
    warrantyDurationDays,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!clientName.trim()) {
      setError('Client Name is required.');
      return;
    }
    if (!clientEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail.trim())) {
      setError('A valid Client Email is required.');
      return;
    }
    if (!accountType) {
      setError('Please select an Account Type manually (1 Billion – 31 Billion).');
      return;
    }
    const durationNum = Number(warrantyDurationDays);
    if (!durationNum || durationNum < 1 || durationNum > 25) {
      setError('Please select a Warranty Duration manually (1 – 25 Days).');
      return;
    }

    setSubmitting(true);
    try {
      const startTs = customWarrantyStart
        ? parseDateAndTimeToTimestamp(warrantyStartDate, warrantyStartTime)
        : parseDateAndTimeToTimestamp(saleDate, saleTime);

      await onCreateSale({
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim(),
        accountType,
        warrantyDurationDays: durationNum,
        saleDate,
        saleTime,
        warrantyStartTs: startTs,
        notes: notes.trim(),
      });

      const resetNow = Date.now();
      setClientName('');
      setClientEmail('');
      setAccountType('');
      setWarrantyDurationDays('');
      setSaleDate(formatLocalDateInput(resetNow));
      setSaleTime(formatLocalTimeInput(resetNow));
      setWarrantyStartDate(formatLocalDateInput(resetNow));
      setWarrantyStartTime(formatLocalTimeInput(resetNow));
      setNotes('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save sale.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="bg-[#111115] border border-zinc-800/90 rounded-xl p-6 space-y-6">
        <div className="border-b border-zinc-800/80 pb-4">
          <h2 className="text-lg font-semibold text-white">Record New Account Sale</h2>
          <p className="text-xs text-zinc-400 mt-1">
            Select account volume tier and warranty duration manually. Expiry timestamp and countdown start automatically on save.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="bg-red-950/50 border border-red-800/60 text-red-200 text-xs rounded-lg px-4 py-3"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Client Information */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-zinc-400 tracking-wide">
              Client Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="sale-client-name" className="block text-xs font-medium text-zinc-300">
                  Client Name <span className="text-red-400">*</span>
                </label>
                <input
                  id="sale-client-name"
                  type="text"
                  required
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="e.g., Aarav Mehta"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-zinc-600"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="sale-client-email" className="block text-xs font-medium text-zinc-300">
                  Client Email <span className="text-red-400">*</span>
                </label>
                <input
                  id="sale-client-email"
                  type="email"
                  required
                  value={clientEmail}
                  onChange={(e) => {
                    const val = e.target.value;
                    setClientEmail(val);
                    const found = clients.find(
                      (c) => c.email.toLowerCase() === val.trim().toLowerCase()
                    );
                    if (found && !clientName.trim()) {
                      setClientName(found.name);
                    }
                  }}
                  placeholder="client@example.com"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-zinc-600"
                />
                {matchedClient && (
                  <p className="text-xs text-emerald-400 inline-flex items-center gap-1.5 mt-1">
                    <UserCheck className="w-3.5 h-3.5" />
                    Existing client profile matched ({matchedClient.name}) — sale will link automatically.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Account & Warranty Information */}
          <div className="space-y-4 border-t border-zinc-800/80 pt-5">
            <h3 className="text-xs font-semibold text-zinc-400 tracking-wide">
              Account &amp; Warranty Details
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="sale-account-type" className="block text-xs font-medium text-zinc-300">
                  Account Type (1 Billion – 31 Billion) <span className="text-red-400">*</span>
                </label>
                <select
                  id="sale-account-type"
                  required
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg px-3.5 py-2.5 text-sm text-white"
                >
                  <option value="" disabled>
                    Select Account Type...
                  </option>
                  {ACCOUNT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="sale-warranty-duration" className="block text-xs font-medium text-zinc-300">
                  Warranty Duration (1 – 25 Days) <span className="text-red-400">*</span>
                </label>
                <select
                  id="sale-warranty-duration"
                  required
                  value={warrantyDurationDays}
                  onChange={(e) => setWarrantyDurationDays(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg px-3.5 py-2.5 text-sm text-white"
                >
                  <option value="" disabled>
                    Select Warranty Duration...
                  </option>
                  {WARRANTY_DURATIONS.map((w) => (
                    <option key={w.days} value={w.days}>
                      {w.label} ({w.hours} Hours)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="sale-date" className="block text-xs font-medium text-zinc-300">
                  Sale Date
                </label>
                <input
                  id="sale-date"
                  type="date"
                  required
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg px-3.5 py-2.5 text-sm text-white font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="sale-time" className="block text-xs font-medium text-zinc-300">
                  Sale Time
                </label>
                <input
                  id="sale-time"
                  type="time"
                  required
                  value={saleTime}
                  onChange={(e) => setSaleTime(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg px-3.5 py-2.5 text-sm text-white font-mono"
                />
              </div>
            </div>

            <div className="space-y-3 bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-4">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={customWarrantyStart}
                  onChange={(e) => setCustomWarrantyStart(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-red-600 focus:ring-red-600"
                />
                Use a custom Warranty Start Date &amp; Time (default matches Sale Date &amp; Time)
              </label>

              {customWarrantyStart && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div className="space-y-1">
                    <label htmlFor="warranty-start-date" className="block text-xs text-zinc-400">
                      Warranty Start Date
                    </label>
                    <input
                      id="warranty-start-date"
                      type="date"
                      required
                      value={warrantyStartDate}
                      onChange={(e) => setWarrantyStartDate(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="warranty-start-time" className="block text-xs text-zinc-400">
                      Warranty Start Time
                    </label>
                    <input
                      id="warranty-start-time"
                      type="time"
                      required
                      value={warrantyStartTime}
                      onChange={(e) => setWarrantyStartTime(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white font-mono"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 text-xs">
                <div className="flex items-start gap-2">
                  <Clock className="w-4 h-4 text-zinc-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-zinc-500">Warranty Start</p>
                    <p className="font-mono tabular-nums text-zinc-200 mt-0.5">
                      {preview.startTs ? formatDisplayDateTime(preview.startTs) : '—'}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-zinc-500">Calculated Warranty Expiry</p>
                    <p className="font-mono tabular-nums text-white font-semibold mt-0.5">
                      {preview.expiryTs
                        ? `${formatDisplayDateTime(preview.expiryTs)} (${preview.hours}h)`
                        : 'Select duration to calculate'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="sale-notes" className="block text-xs font-medium text-zinc-300">
                Notes (Optional)
              </label>
              <textarea
                id="sale-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Payment reference, delivery details, or account notes..."
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-zinc-600"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-zinc-800/80 pt-5">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 text-sm font-medium text-zinc-300 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
            >
              {submitting ? 'Saving Sale...' : 'SAVE SALE'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
