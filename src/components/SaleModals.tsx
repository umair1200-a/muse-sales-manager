import React, { useState, useEffect } from 'react';
import { X, RefreshCw, Edit3, Clock, History, Trash2, ShieldCheck } from 'lucide-react';
import type { SaleWithComputed, WarrantyPolicy } from '../types/models.ts';
import {
  ACCOUNT_TYPES,
  WARRANTY_DURATIONS,
  calculateWarrantyExpiryTs,
  formatDisplayDateTime,
  formatLocalDateInput,
  formatLocalTimeInput,
  parseDateAndTimeToTimestamp,
} from '../utils/warranty.ts';
import { WarrantyStatusText } from './StatusText.tsx';

export function SaleDetailsModal({
  sale,
  onClose,
  onEdit,
  onReplace,
  onDelete,
  onOpenClient,
}: {
  sale: SaleWithComputed | null;
  onClose: () => void;
  onEdit: (sale: SaleWithComputed) => void;
  onReplace: (sale: SaleWithComputed) => void;
  onDelete?: (sale: SaleWithComputed) => void;
  onOpenClient: (clientId: string) => void;
}) {
  if (!sale) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sale-details-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto overscroll-contain"
    >
      <div className="bg-[#111115] border border-zinc-800 rounded-xl max-w-5xl w-full my-auto max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain shadow-2xl">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-zinc-800 bg-zinc-950/60">
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-mono font-semibold text-red-400">
                Sale ID: {sale.saleCode}
              </span>
              <span className="text-zinc-600" aria-hidden="true">·</span>
              <span className="text-xs font-mono text-zinc-400">
                Account ID: {sale.id}
              </span>
            </div>
            <h2 id="sale-details-title" className="text-lg font-semibold text-white">
              Account Details &amp; Warranty Record
            </h2>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <WarrantyStatusText status={sale.warrantyStatus} />
              {sale.hasReplacement && (
                <span className="text-xs font-semibold text-amber-300 font-mono tabular-nums">
                  · Replaced ({sale.replacementCount})
                </span>
              )}
            </div>
            <button
              type="button"
              aria-label="Close sale details"
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-900 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Body */}
        <div className="p-6 space-y-5">
          {/* Row 1: Client + Account Tier + Live Countdown */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Client Card */}
            <div className="lg:col-span-4 bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-4 space-y-2">
              <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                Client Information
              </p>
              <div>
                <p className="text-[11px] text-zinc-500">Client Name</p>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenClient(sale.clientId);
                  }}
                  className="text-sm font-semibold text-white hover:text-red-400 transition-colors text-left"
                >
                  {sale.clientName}
                </button>
              </div>
              <div>
                <p className="text-[11px] text-zinc-500">Client Email</p>
                <p className="text-xs text-zinc-300 break-all">{sale.clientEmail}</p>
              </div>
            </div>

            {/* Account & Sale Identity Card */}
            <div className="lg:col-span-4 bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-4 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] text-zinc-500">Account Type</p>
                <p className="text-sm font-semibold text-white mt-0.5">{sale.accountType}</p>
                {sale.hasReplacement && sale.effectiveAccountType !== sale.accountType && (
                  <p className="text-[11px] text-amber-300 mt-0.5">
                    Current: {sale.effectiveAccountType}
                  </p>
                )}
              </div>
              <div>
                <p className="text-[11px] text-zinc-500">Account Status</p>
                <div className="mt-1 space-y-0.5">
                  <WarrantyStatusText status={sale.warrantyStatus} />
                  {sale.hasReplacement && (
                    <p className="text-[11px] font-semibold text-amber-300 font-mono">
                      Replaced ({sale.replacementCount})
                    </p>
                  )}
                </div>
              </div>
              <div>
                <p className="text-[11px] text-zinc-500">Sale ID</p>
                <p className="text-xs font-mono font-semibold text-zinc-200 mt-0.5">
                  {sale.saleCode}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-zinc-500">Account ID</p>
                <p className="text-xs font-mono text-zinc-300 mt-0.5 break-all">{sale.id}</p>
              </div>
            </div>

            {/* Live Warranty Countdown Card */}
            <div className="lg:col-span-4 bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                  Live Warranty Countdown
                </p>
                <ShieldCheck
                  className={`w-4 h-4 ${
                    sale.remaining.isExpired
                      ? 'text-red-400'
                      : sale.warrantyStatus === 'EXPIRING_SOON'
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                />
              </div>

              {sale.remaining.isExpired ? (
                <div className="mt-2">
                  <p className="text-base font-bold font-mono tabular-nums text-red-400">
                    {sale.remaining.expiredAgoLabel}
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    Warranty window has concluded
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {[
                    { label: 'Days', value: sale.remaining.days },
                    { label: 'Hours', value: sale.remaining.hours },
                    { label: 'Minutes', value: sale.remaining.minutes },
                    { label: 'Seconds', value: sale.remaining.seconds },
                  ].map((unit) => (
                    <div
                      key={unit.label}
                      className="bg-[#111115] border border-zinc-800 rounded-md px-2 py-1.5 text-center"
                    >
                      <p
                        className={`text-base font-bold font-mono tabular-nums ${
                          sale.warrantyStatus === 'EXPIRING_SOON'
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {String(unit.value).padStart(2, '0')}
                      </p>
                      <p className="text-[10px] text-zinc-500">{unit.label}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Complete Dates, Times & Warranty Window */}
          <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div>
              <p className="text-zinc-500">Sale Date &amp; Exact Time</p>
              <p className="font-mono tabular-nums text-white font-semibold mt-1">
                {sale.saleDate} · {sale.saleTime}
              </p>
              <p className="font-mono tabular-nums text-zinc-400 mt-0.5">
                {formatDisplayDateTime(sale.saleTimestamp)}
              </p>
            </div>

            <div>
              <p className="text-zinc-500">Warranty Duration</p>
              <p className="font-mono tabular-nums text-white font-semibold mt-1">
                {sale.effectiveDurationDays}{' '}
                {sale.effectiveDurationDays === 1 ? 'Day' : 'Days'} ({sale.effectiveDurationDays * 24} Hours)
              </p>
              {sale.effectiveDurationDays !== sale.warrantyDurationDays && (
                <p className="font-mono tabular-nums text-zinc-400 mt-0.5">
                  Original: {sale.warrantyDurationDays}{' '}
                  {sale.warrantyDurationDays === 1 ? 'Day' : 'Days'}
                </p>
              )}
            </div>

            <div>
              <p className="text-zinc-500">Warranty Start Date &amp; Time</p>
              <p className="font-mono tabular-nums text-white font-semibold mt-1">
                {formatDisplayDateTime(sale.effectiveWarrantyStartTs)}
              </p>
              {sale.effectiveWarrantyStartTs !== sale.warrantyStartTs && (
                <p className="font-mono tabular-nums text-zinc-400 mt-0.5">
                  Orig: {formatDisplayDateTime(sale.warrantyStartTs)}
                </p>
              )}
            </div>

            <div>
              <p className="text-zinc-500">Warranty Expiration Date &amp; Time</p>
              <p className="font-mono tabular-nums text-white font-semibold mt-1">
                {formatDisplayDateTime(sale.effectiveWarrantyExpiryTs)}
              </p>
              {sale.effectiveWarrantyExpiryTs !== sale.warrantyExpiryTs && (
                <p className="font-mono tabular-nums text-zinc-400 mt-0.5">
                  Orig: {formatDisplayDateTime(sale.warrantyExpiryTs)}
                </p>
              )}
            </div>
          </div>

          {sale.notes && (
            <div className="space-y-1">
              <p className="text-xs text-zinc-500">Notes</p>
              <p className="text-xs text-zinc-300 bg-zinc-950 border border-zinc-800/80 rounded-lg px-4 py-2.5">
                {sale.notes}
              </p>
            </div>
          )}

          {/* Row 3: Complete Replacement History */}
          <div className="space-y-2.5 border-t border-zinc-800/80 pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <History className="w-4 h-4 text-zinc-400" />
                Complete Replacement History ({sale.replacements.length})
              </h3>
            </div>

            {sale.replacements.length === 0 ? (
              <p className="text-xs text-zinc-500">No replacements issued for this account.</p>
            ) : (
              <div className="divide-y divide-zinc-800/70 border border-zinc-800/80 rounded-lg bg-zinc-950/50">
                {sale.replacements.map((rep) => (
                  <div key={rep.id} className="p-3.5 text-xs space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-white">
                        {rep.replacementCode}
                      </span>
                      <span className="text-zinc-400 font-mono tabular-nums">
                        {formatDisplayDateTime(rep.replacementTimestamp)}
                      </span>
                    </div>
                    <p className="text-zinc-300">
                      {rep.originalAccountType} →{' '}
                      <span className="text-white font-medium">{rep.newAccountType}</span>
                      <span className="text-zinc-500"> · </span>
                      <span>
                        {rep.warrantyPolicy === 'CONTINUE_ORIGINAL'
                          ? 'Continued Original Warranty'
                          : `Started New ${rep.warrantyDurationDays}-Day Warranty`}
                      </span>
                    </p>
                    <p className="text-[11px] font-mono tabular-nums text-zinc-400">
                      Window: {formatDisplayDateTime(rep.warrantyStartTs)} →{' '}
                      {formatDisplayDateTime(rep.warrantyExpiryTs)}
                    </p>
                    {rep.notes && <p className="text-zinc-400">{rep.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-zinc-800 bg-zinc-950/40">
          <div>
            {onDelete && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onDelete(sale);
                }}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-red-400 hover:text-white bg-zinc-900 hover:bg-red-950/60 border border-zinc-800 hover:border-red-800/70 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Sale
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-zinc-300 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onEdit(sale);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit Sale
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onReplace(sale);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Give Replacement
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function EditSaleModal({
  sale,
  onClose,
  onSave,
}: {
  sale: SaleWithComputed | null;
  onClose: () => void;
  onSave: (
    saleId: string,
    payload: {
      clientName: string;
      clientEmail: string;
      accountType: string;
      warrantyDurationDays: number;
      saleDate: string;
      saleTime: string;
      warrantyStartTs: number;
      recalculateWarranty: boolean;
      notes: string;
    }
  ) => Promise<void>;
}) {
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [accountType, setAccountType] = useState('1 Billion');
  const [saleDate, setSaleDate] = useState('');
  const [saleTime, setSaleTime] = useState('');
  const [modifyWarranty, setModifyWarranty] = useState(false);
  const [warrantyDurationDays, setWarrantyDurationDays] = useState(10);
  const [warrantyStartDate, setWarrantyStartDate] = useState('');
  const [warrantyStartTime, setWarrantyStartTime] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sale) {
      setClientName(sale.clientName);
      setClientEmail(sale.clientEmail);
      setAccountType(sale.accountType);
      setSaleDate(sale.saleDate);
      setSaleTime(sale.saleTime);
      setModifyWarranty(false);
      setWarrantyDurationDays(sale.warrantyDurationDays);
      setWarrantyStartDate(formatLocalDateInput(sale.warrantyStartTs));
      setWarrantyStartTime(formatLocalTimeInput(sale.warrantyStartTs));
      setNotes(sale.notes);
      setError(null);
    }
    // Only reset form state when opening a different sale ID, not on 1s countdown ticks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sale?.id]);

  if (!sale) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const startTs = modifyWarranty
        ? parseDateAndTimeToTimestamp(warrantyStartDate, warrantyStartTime)
        : sale.warrantyStartTs;

      await onSave(sale.id, {
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim(),
        accountType,
        warrantyDurationDays: modifyWarranty ? warrantyDurationDays : sale.warrantyDurationDays,
        saleDate,
        saleTime,
        warrantyStartTs: startTs,
        recalculateWarranty: modifyWarranty,
        notes: notes.trim(),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update sale.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-sale-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto overscroll-contain"
    >
      <div className="bg-[#111115] border border-zinc-800 rounded-xl max-w-xl w-full my-auto max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div>
            <p className="text-xs font-mono text-zinc-400">{sale.saleCode}</p>
            <h2 id="edit-sale-title" className="text-lg font-semibold text-white">
              Edit Sale Record
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close edit sale modal"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-950/50 border border-red-800/60 text-red-200 text-xs rounded-lg p-3">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="edit-client-name" className="block text-xs font-medium text-zinc-300">
                Client Name
              </label>
              <input
                id="edit-client-name"
                type="text"
                required
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="edit-client-email" className="block text-xs font-medium text-zinc-300">
                Client Email
              </label>
              <input
                id="edit-client-email"
                type="email"
                required
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="edit-account-type" className="block text-xs font-medium text-zinc-300">
                Account Type
              </label>
              <select
                id="edit-account-type"
                value={accountType}
                onChange={(e) => setAccountType(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-white"
              >
                {ACCOUNT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="edit-sale-date" className="block text-xs font-medium text-zinc-300">
                Sale Date
              </label>
              <input
                id="edit-sale-date"
                type="date"
                required
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-white font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="edit-sale-time" className="block text-xs font-medium text-zinc-300">
                Sale Time
              </label>
              <input
                id="edit-sale-time"
                type="time"
                required
                value={saleTime}
                onChange={(e) => setSaleTime(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-white font-mono"
              />
            </div>
          </div>

          <div className="border border-zinc-800/80 rounded-lg p-4 space-y-3 bg-zinc-950/50">
            <label className="flex items-center gap-2.5 text-xs font-medium text-zinc-200 cursor-pointer">
              <input
                type="checkbox"
                checked={modifyWarranty}
                onChange={(e) => setModifyWarranty(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-red-600 focus:ring-red-600"
              />
              Intentionally modify warranty start or duration (unchecked preserves original expiry)
            </label>

            {modifyWarranty ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="space-y-1">
                  <label htmlFor="edit-warranty-duration" className="block text-xs text-zinc-400">
                    Duration
                  </label>
                  <select
                    id="edit-warranty-duration"
                    value={warrantyDurationDays}
                    onChange={(e) => setWarrantyDurationDays(Number(e.target.value))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-white"
                  >
                    {WARRANTY_DURATIONS.map((w) => (
                      <option key={w.days} value={w.days}>
                        {w.label} ({w.hours}h)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="edit-warranty-start-date" className="block text-xs text-zinc-400">
                    Start Date
                  </label>
                  <input
                    id="edit-warranty-start-date"
                    type="date"
                    value={warrantyStartDate}
                    onChange={(e) => setWarrantyStartDate(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="edit-warranty-start-time" className="block text-xs text-zinc-400">
                    Start Time
                  </label>
                  <input
                    id="edit-warranty-start-time"
                    type="time"
                    value={warrantyStartTime}
                    onChange={(e) => setWarrantyStartTime(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs text-zinc-500 font-mono tabular-nums">
                Preserving Expiry: {formatDisplayDateTime(sale.warrantyExpiryTs)} ({sale.warrantyDurationDays} Days)
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="edit-sale-notes" className="block text-xs font-medium text-zinc-300">
              Notes
            </label>
            <textarea
              id="edit-sale-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-zinc-300 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-lg whitespace-nowrap"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ReplacementModal({
  sale,
  onClose,
  onSubmit,
}: {
  sale: SaleWithComputed | null;
  onClose: () => void;
  onSubmit: (payload: {
    originalSaleId: string;
    newAccountType: string;
    warrantyPolicy: WarrantyPolicy;
    newWarrantyDurationDays?: number;
    replacementTimestamp: number;
    notes: string;
  }) => Promise<void>;
}) {
  const [newAccountType, setNewAccountType] = useState('1 Billion');
  const [warrantyPolicy, setWarrantyPolicy] = useState<WarrantyPolicy>('CONTINUE_ORIGINAL');
  const [newDurationDays, setNewDurationDays] = useState(10);
  const [repDate, setRepDate] = useState('');
  const [repTime, setRepTime] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sale) {
      const now = Date.now();
      setNewAccountType(sale.effectiveAccountType || sale.accountType);
      setWarrantyPolicy('CONTINUE_ORIGINAL');
      setNewDurationDays(sale.warrantyDurationDays);
      setRepDate(formatLocalDateInput(now));
      setRepTime(formatLocalTimeInput(now));
      setNotes('');
      setError(null);
    }
    // Only initialize form when opening a different sale ID, not on 1s countdown ticks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sale?.id]);

  if (!sale) return null;

  let previewExpiryTs = sale.warrantyExpiryTs;
  try {
    const repTs = parseDateAndTimeToTimestamp(repDate, repTime);
    previewExpiryTs =
      warrantyPolicy === 'CONTINUE_ORIGINAL'
        ? sale.warrantyExpiryTs
        : calculateWarrantyExpiryTs(repTs, newDurationDays);
  } catch {
    previewExpiryTs = sale.warrantyExpiryTs;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const repTs = parseDateAndTimeToTimestamp(repDate, repTime);
      await onSubmit({
        originalSaleId: sale.id,
        newAccountType,
        warrantyPolicy,
        newWarrantyDurationDays: warrantyPolicy === 'START_NEW' ? newDurationDays : undefined,
        replacementTimestamp: repTs,
        notes: notes.trim(),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to issue replacement.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="replacement-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto overscroll-contain"
    >
      <div className="bg-[#111115] border border-zinc-800 rounded-xl max-w-2xl w-full my-auto max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div>
            <p className="text-xs font-mono text-zinc-400">Original Sale · {sale.saleCode}</p>
            <h2 id="replacement-modal-title" className="text-lg font-semibold text-white">
              Give Account Replacement
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close replacement form"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="bg-red-950/50 border border-red-800/60 text-red-200 text-xs rounded-lg p-3">
              {error}
            </div>
          )}

          {/* Preserved Original Sale Summary */}
          <div className="bg-zinc-950 border border-zinc-800/80 rounded-lg p-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-zinc-500">Client</p>
              <p className="text-white font-medium mt-0.5">{sale.clientName}</p>
              <p className="text-zinc-400 truncate">{sale.clientEmail}</p>
            </div>
            <div>
              <p className="text-zinc-500">Original Account &amp; Sale</p>
              <p className="text-zinc-200 font-medium mt-0.5">{sale.accountType}</p>
              <p className="text-zinc-400 font-mono tabular-nums">
                {sale.saleDate} · {sale.saleTime}
              </p>
            </div>
            <div>
              <p className="text-zinc-500">Original Warranty ({sale.warrantyDurationDays}d)</p>
              <div className="mt-0.5">
                <WarrantyStatusText status={sale.warrantyStatus} />
              </div>
              <p className="text-zinc-400 font-mono tabular-nums mt-0.5">
                Exp: {formatDisplayDateTime(sale.warrantyExpiryTs)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="rep-account-type" className="block text-xs font-medium text-zinc-300">
                New Account Type
              </label>
              <select
                id="rep-account-type"
                value={newAccountType}
                onChange={(e) => setNewAccountType(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-white"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="rep-date" className="block text-xs font-medium text-zinc-300">
                Replacement Date
              </label>
              <input
                id="rep-date"
                type="date"
                required
                value={repDate}
                onChange={(e) => setRepDate(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-white font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="rep-time" className="block text-xs font-medium text-zinc-300">
                Replacement Time
              </label>
              <input
                id="rep-time"
                type="time"
                required
                value={repTime}
                onChange={(e) => setRepTime(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-white font-mono"
              />
            </div>
          </div>

          <div className="space-y-2.5">
            <p className="text-xs font-medium text-zinc-300">Replacement Warranty Policy</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setWarrantyPolicy('CONTINUE_ORIGINAL')}
                className={`text-left p-3.5 rounded-lg border transition-colors ${
                  warrantyPolicy === 'CONTINUE_ORIGINAL'
                    ? 'bg-red-600/10 border-red-600 text-white'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                <p className="text-sm font-semibold">1. Continue Original Warranty</p>
                <p className="text-xs text-zinc-400 mt-1">
                  Keeps original expiry timestamp ({formatDisplayDateTime(sale.warrantyExpiryTs)}).
                </p>
              </button>

              <button
                type="button"
                onClick={() => setWarrantyPolicy('START_NEW')}
                className={`text-left p-3.5 rounded-lg border transition-colors ${
                  warrantyPolicy === 'START_NEW'
                    ? 'bg-red-600/10 border-red-600 text-white'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                <p className="text-sm font-semibold">2. Start New Warranty</p>
                <p className="text-xs text-zinc-400 mt-1">
                  Starts a fresh 1–25 day countdown from replacement timestamp.
                </p>
              </button>
            </div>
          </div>

          {warrantyPolicy === 'START_NEW' && (
            <div className="space-y-1.5">
              <label htmlFor="rep-new-duration" className="block text-xs font-medium text-zinc-300">
                New Warranty Duration (1–25 Days)
              </label>
              <select
                id="rep-new-duration"
                value={newDurationDays}
                onChange={(e) => setNewDurationDays(Number(e.target.value))}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-white"
              >
                {WARRANTY_DURATIONS.map((w) => (
                  <option key={w.days} value={w.days}>
                    {w.label} ({w.hours} Hours)
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-zinc-300 bg-zinc-950 border border-zinc-800/80 rounded-lg px-3.5 py-2.5 font-mono tabular-nums">
            <Clock className="w-4 h-4 text-red-400 shrink-0" />
            Resulting Warranty Expiry: {formatDisplayDateTime(previewExpiryTs)}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="rep-notes" className="block text-xs font-medium text-zinc-300">
              Replacement Notes
            </label>
            <textarea
              id="rep-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for replacement, account credentials reference, or remarks..."
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-zinc-300 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-lg whitespace-nowrap"
            >
              {submitting ? 'Issuing Replacement...' : 'Save Replacement Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
