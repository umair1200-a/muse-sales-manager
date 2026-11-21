import React, { useState, useEffect } from 'react';
import {
  Mail,
  Download,
  Upload,
  Cloud,
  Save,
  RefreshCw,
  ArrowRightLeft,
} from 'lucide-react';
import type {
  AppSettings,
  ClientWithStats,
  ReplacementRecord,
  SaleWithComputed,
  TableDensity,
  WarrantyStartMode,
} from '../types/models.ts';
import { WARRANTY_DURATIONS, formatDisplayDate, formatDisplayDateTime } from '../utils/warranty.ts';
import { buildCsv } from '../utils/analytics.ts';
import { isValidWorkspaceEmail, normalizeWorkspaceEmail } from '../lib/workspaceId.ts';

export function SettingsView({
  activeEmail,
  settings,
  sales,
  clients,
  replacements,
  cloudSyncing,
  onSaveSettings,
  onDownloadBackup,
  onRestoreBackup,
  onSwitchEmail,
  onRefreshCloud,
}: {
  activeEmail: string;
  settings: AppSettings;
  sales: SaleWithComputed[];
  clients: ClientWithStats[];
  replacements: ReplacementRecord[];
  cloudSyncing?: boolean;
  onSaveSettings: (payload: {
    expiringSoonThresholdHours: number;
    defaultWarrantyDurationDays: number;
    defaultWarrantyStartMode: WarrantyStartMode;
    tableDensity: TableDensity;
    rememberSessionDays: number;
  }) => Promise<void>;
  onDownloadBackup: () => Promise<void>;
  onRestoreBackup: (jsonText: string) => Promise<void>;
  onSwitchEmail: (email: string) => Promise<void>;
  onRefreshCloud: () => Promise<void>;
}) {
  const [thresholdHours, setThresholdHours] = useState(settings.expiringSoonThresholdHours);
  const [defaultDuration, setDefaultDuration] = useState(settings.defaultWarrantyDurationDays);
  const [defaultStartMode, setDefaultStartMode] = useState<WarrantyStartMode>(
    settings.defaultWarrantyStartMode
  );
  const [tableDensity, setTableDensity] = useState<TableDensity>(settings.tableDensity);
  const [rememberDays, setRememberDays] = useState(settings.rememberSessionDays);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsError, setPrefsError] = useState<string | null>(null);

  const [switchEmailInput, setSwitchEmailInput] = useState('');
  const [switchingEmail, setSwitchingEmail] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);

  useEffect(() => {
    setThresholdHours(settings.expiringSoonThresholdHours);
    setDefaultDuration(settings.defaultWarrantyDurationDays);
    setDefaultStartMode(settings.defaultWarrantyStartMode);
    setTableDensity(settings.tableDensity);
    setRememberDays(settings.rememberSessionDays);
    setPrefsError(null);
  }, [settings]);

  const triggerCsvDownload = (filename: string, csv: string) => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportSales = (filterMode: 'all' | 'active' | 'expired') => {
    const list =
      filterMode === 'active'
        ? sales.filter((s) => s.warrantyStatus !== 'EXPIRED')
        : filterMode === 'expired'
        ? sales.filter((s) => s.warrantyStatus === 'EXPIRED')
        : sales;

    const csv = buildCsv(
      [
        'Sale ID',
        'Client Name',
        'Client Email',
        'Account Type',
        'Effective Account Type',
        'Sale Date',
        'Sale Time',
        'Warranty Duration (Days)',
        'Warranty Start',
        'Warranty Expiry',
        'Status',
        'Remaining / Expired',
        'Replacements',
        'Notes',
      ],
      list.map((s) => [
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
        s.warrantyStatus,
        s.remaining.isExpired ? s.remaining.expiredAgoLabel : s.remaining.formattedCountdown,
        s.replacementCount,
        s.notes,
      ])
    );
    triggerCsvDownload(`muse-${filterMode}-sales-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const exportClients = () => {
    const csv = buildCsv(
      [
        'Client Name',
        'Client Email',
        'First Purchase',
        'Total Accounts',
        'Total Volume (B)',
        'Account Types',
        'Replacements',
        'Notes',
      ],
      clients.map((c) => [
        c.name,
        c.email,
        c.firstPurchaseTs ? formatDisplayDate(c.firstPurchaseTs) : '',
        c.totalAccountsPurchased,
        c.totalVolumeBillions,
        c.accountTypesPurchased.join('; '),
        c.totalReplacements,
        c.notes,
      ])
    );
    triggerCsvDownload(`muse-clients-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const exportReplacements = () => {
    const saleMap = new Map(sales.map((s) => [s.id, s]));
    const clientMap = new Map(clients.map((c) => [c.id, c]));
    const csv = buildCsv(
      [
        'Replacement ID',
        'Original Sale ID',
        'Client Name',
        'Client Email',
        'Original Account',
        'New Account',
        'Replacement Date',
        'Policy',
        'Warranty Duration (Days)',
        'Warranty Expiry',
        'Notes',
      ],
      replacements.map((r) => {
        const sale = saleMap.get(r.originalSaleId);
        const client = clientMap.get(r.clientId);
        return [
          r.replacementCode,
          sale?.saleCode || r.originalSaleId,
          sale?.clientName || client?.name || '',
          sale?.clientEmail || client?.email || '',
          r.originalAccountType,
          r.newAccountType,
          formatDisplayDateTime(r.replacementTimestamp),
          r.warrantyPolicy,
          r.warrantyDurationDays,
          formatDisplayDateTime(r.warrantyExpiryTs),
          r.notes,
        ];
      })
    );
    triggerCsvDownload(`muse-replacements-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const handleSavePrefs = async (e: React.FormEvent) => {
    e.preventDefault();
    setPrefsError(null);
    setSavingPrefs(true);
    try {
      await onSaveSettings({
        expiringSoonThresholdHours: thresholdHours,
        defaultWarrantyDurationDays: defaultDuration,
        defaultWarrantyStartMode: defaultStartMode,
        tableDensity,
        rememberSessionDays: rememberDays,
      });
    } catch (err) {
      setPrefsError(err instanceof Error ? err.message : 'Failed to save preferences.');
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await onRestoreBackup(text);
    e.target.value = '';
  };

  const handleInlineSwitchEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = normalizeWorkspaceEmail(switchEmailInput);
    if (!isValidWorkspaceEmail(cleaned)) {
      setSwitchError('Please enter a valid email address.');
      return;
    }
    if (cleaned === normalizeWorkspaceEmail(activeEmail)) {
      setSwitchError('This email workspace is already active.');
      return;
    }
    setSwitchError(null);
    setSwitchingEmail(true);
    try {
      await onSwitchEmail(cleaned);
      setSwitchEmailInput('');
    } catch (err) {
      setSwitchError(err instanceof Error ? err.message : 'Unable to switch email workspace.');
    } finally {
      setSwitchingEmail(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Warranty & Appearance Preferences */}
      <form
        onSubmit={handleSavePrefs}
        className="bg-[#111115] border border-zinc-800/90 rounded-xl p-6 space-y-5"
      >
        <div>
          <h2 className="text-base font-semibold text-white">Warranty &amp; Workspace Preferences</h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Configure expiring-soon threshold, table spacing, and session lifetime for this email workspace.
          </p>
        </div>

        {prefsError && (
          <div
            role="alert"
            className="bg-red-950/50 border border-red-800/60 text-red-200 text-xs rounded-lg p-3"
          >
            {prefsError}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="setting-threshold" className="block text-xs font-medium text-zinc-300">
              Expiring Soon Threshold (Hours)
            </label>
            <input
              id="setting-threshold"
              type="number"
              min={1}
              max={360}
              value={thresholdHours}
              onChange={(e) => setThresholdHours(Number(e.target.value))}
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-white font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="setting-duration" className="block text-xs font-medium text-zinc-300">
              Default Warranty Duration
            </label>
            <select
              id="setting-duration"
              value={defaultDuration}
              onChange={(e) => setDefaultDuration(Number(e.target.value))}
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-white"
            >
              {WARRANTY_DURATIONS.map((w) => (
                <option key={w.days} value={w.days}>
                  {w.label} ({w.hours}h)
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="setting-start-mode" className="block text-xs font-medium text-zinc-300">
              Default Warranty Start
            </label>
            <select
              id="setting-start-mode"
              value={defaultStartMode}
              onChange={(e) => setDefaultStartMode(e.target.value as WarrantyStartMode)}
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="SALE_TIME">Match Sale Date &amp; Time</option>
              <option value="CUSTOM">Custom Warranty Start</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="setting-density" className="block text-xs font-medium text-zinc-300">
              Table View Density
            </label>
            <select
              id="setting-density"
              value={tableDensity}
              onChange={(e) => setTableDensity(e.target.value as TableDensity)}
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="COMFORTABLE">Comfortable View</option>
              <option value="COMPACT">Compact View</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="setting-session-days" className="block text-xs font-medium text-zinc-300">
              Remember Session (Days)
            </label>
            <input
              id="setting-session-days"
              type="number"
              min={1}
              max={90}
              value={rememberDays}
              onChange={(e) => setRememberDays(Number(e.target.value))}
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg px-3 py-2 text-sm text-white font-mono"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingPrefs}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
          >
            <Save className="w-3.5 h-3.5" />
            {savingPrefs ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      </form>

      {/* Active Workspace Email & Switcher */}
      <div className="bg-[#111115] border border-zinc-800/90 rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Mail className="w-4 h-4 text-red-400" />
              Active Workspace Email
            </h2>
            <p className="text-xs text-zinc-400">
              All sales, clients, warranties, replacements, and settings are isolated under your active email address.
            </p>
          </div>
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 shrink-0">
            <p className="text-[11px] text-zinc-500">Current Email</p>
            <p className="text-xs font-mono font-semibold text-white mt-0.5">{activeEmail}</p>
          </div>
        </div>

        {switchError && (
          <div
            role="alert"
            className="bg-red-950/50 border border-red-800/60 text-red-200 text-xs rounded-lg p-3"
          >
            {switchError}
          </div>
        )}

        <form onSubmit={handleInlineSwitchEmail} className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <input
            type="email"
            aria-label="Switch to another workspace email"
            value={switchEmailInput}
            onChange={(e) => {
              setSwitchEmailInput(e.target.value);
              if (switchError) setSwitchError(null);
            }}
            placeholder="Enter another email to load or create its workspace..."
            className="flex-1 bg-zinc-950 border border-zinc-800 focus:border-red-500 focus:outline-none rounded-lg px-3.5 py-2 text-xs text-white placeholder-zinc-500"
          />
          <button
            type="submit"
            disabled={switchingEmail}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            {switchingEmail ? 'Switching...' : 'Switch Email'}
          </button>
        </form>
      </div>

      {/* Exports & Backup */}
      <div className="bg-[#111115] border border-zinc-800/90 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-white">CSV Export &amp; Database Backup</h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Download Excel-compatible UTF-8 CSV reports or export/restore full JSON snapshots for this email workspace.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => exportSales('all')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-200 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 rounded-lg whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export All Sales CSV
          </button>
          <button
            type="button"
            onClick={exportClients}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-200 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 rounded-lg whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export Clients CSV
          </button>
          <button
            type="button"
            onClick={() => exportSales('active')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-200 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 rounded-lg whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export Active Warranties CSV
          </button>
          <button
            type="button"
            onClick={() => exportSales('expired')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-200 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 rounded-lg whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export Expired Warranties CSV
          </button>
          <button
            type="button"
            onClick={exportReplacements}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-zinc-200 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 rounded-lg whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export Replacements CSV
          </button>
        </div>

        <div className="border-t border-zinc-800/80 pt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onDownloadBackup}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Download Full JSON Backup
          </button>

          <label className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-zinc-200 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 rounded-lg cursor-pointer whitespace-nowrap">
            <Upload className="w-3.5 h-3.5" />
            Restore JSON Backup
            <input
              type="file"
              accept="application/json,.json"
              onChange={handleRestoreFile}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Multi-Device Cloud Database Status */}
      <div className="bg-[#111115] border border-zinc-800/90 rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Cloud className="w-4 h-4 text-red-400" />
              Cloud Database Storage (Firestore)
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Your records are saved directly in Cloud Firestore under your email and stay synchronized across Chrome, Edge, desktop, and mobile devices.
            </p>
          </div>
          <span className="text-xs text-emerald-400 font-mono shrink-0">
            {cloudSyncing ? 'Syncing...' : `Cloud Connected · ${activeEmail}`}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={cloudBusy || cloudSyncing}
            onClick={async () => {
              setCloudBusy(true);
              try {
                await onRefreshCloud();
              } finally {
                setCloudBusy(false);
              }
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${cloudBusy || cloudSyncing ? 'animate-spin' : ''}`} />
            Refresh from Cloud
          </button>
        </div>
      </div>
    </div>
  );
}
