import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type {
  AppSettings,
  ClientRecord,
  ClientWithStats,
  DateRangePreset,
  GlobalSearchResult,
  ReplacementRecord,
  SaleRecord,
  SaleWithComputed,
  TableDensity,
  WarrantyPolicy,
  WarrantyStartMode,
} from './types/models.ts';
import {
  cloudCreateReplacement,
  cloudCreateSale,
  cloudDeleteClient,
  cloudDeleteSale,
  cloudExportBackup,
  cloudRestoreBackup,
  cloudUpdateClient,
  cloudUpdateSale,
  cloudUpdateSettings,
  getRecentWorkspaceEmails,
  getSavedActiveEmail,
  loadWorkspaceFromFirestore,
  saveActiveEmail,
  subscribeToWorkspaceFirestore,
} from './lib/cloudSync.ts';
import { isValidWorkspaceEmail, normalizeWorkspaceEmail } from './lib/workspaceId.ts';
import type { MuseDatabaseState } from './lib/salesEngine.ts';
import { enrichSaleWithWarranty } from './utils/warranty.ts';
import { buildClientsWithStats, computeDashboardMetrics } from './utils/analytics.ts';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { ToastStack, type ToastItem } from './components/Toast.tsx';
import { ConfirmDialog } from './components/ConfirmDialog.tsx';
import { AppShell, type NavTab } from './components/AppShell.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { AddSaleView } from './components/AddSaleView.tsx';
import { AccountsTableView } from './components/AccountsTableView.tsx';
import { AccountSellView } from './components/AccountSellView.tsx';
import { ClientsView } from './components/ClientsView.tsx';
import { ReplacementsView } from './components/ReplacementsView.tsx';
import { AnalyticsView } from './components/AnalyticsView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import {
  EditSaleModal,
  ReplacementModal,
  SaleDetailsModal,
} from './components/SaleModals.tsx';
import { ClientProfileModal } from './components/ClientProfileModal.tsx';
import { SwitchEmailModal, WorkspaceEmailGate } from './components/WorkspaceEmailModal.tsx';

const DEFAULT_SETTINGS: AppSettings = {
  expiringSoonThresholdHours: 48,
  defaultWarrantyDurationDays: 10,
  defaultWarrantyStartMode: 'SALE_TIME',
  tableDensity: 'COMFORTABLE',
  rememberSessionDays: 30,
  updatedAt: 0,
};

function MuseSalesManagerApp() {
  const [activeEmail, setActiveEmail] = useState<string | null>(() => getSavedActiveEmail());
  const [recentEmails, setRecentEmails] = useState<string[]>(() => getRecentWorkspaceEmails());
  const [switchModalOpen, setSwitchModalOpen] = useState(false);
  const [switchingEmail, setSwitchingEmail] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);

  const [loadingData, setLoadingData] = useState(false);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [replacements, setReplacements] = useState<ReplacementRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [datePreset, setDatePreset] = useState<DateRangePreset>('all_time');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [nowTs, setNowTs] = useState(() => Date.now());

  const [globalQuery, setGlobalQuery] = useState('');
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [replacingSaleId, setReplacingSaleId] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'sale' | 'client';
    id: string;
    label: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const workspaceEpochRef = useRef(0);
  const latestStateRef = useRef<MuseDatabaseState>({
    clients: [],
    sales: [],
    replacements: [],
    settings: DEFAULT_SETTINGS,
  });

  useEffect(() => {
    latestStateRef.current = { clients, sales, replacements, settings };
  }, [clients, sales, replacements, settings]);

  const addToast = useCallback(
    (type: ToastItem['type'], title: string, message?: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, type, title, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Live 1-second clock tick for accurate timestamp-based countdown display
  useEffect(() => {
    const interval = setInterval(() => {
      setNowTs(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const applyWorkspaceState = useCallback((nextState: MuseDatabaseState) => {
    latestStateRef.current = nextState;
    setClients(nextState.clients);
    setSales(nextState.sales);
    setReplacements(nextState.replacements);
    setSettings(nextState.settings);
  }, []);

  const resetUiForEmailSwitch = useCallback(() => {
    const emptyState: MuseDatabaseState = {
      clients: [],
      sales: [],
      replacements: [],
      settings: DEFAULT_SETTINGS,
    };
    applyWorkspaceState(emptyState);
    setGlobalQuery('');
    setSelectedSaleId(null);
    setEditingSaleId(null);
    setReplacingSaleId(null);
    setSelectedClientId(null);
    setDeleteTarget(null);
  }, [applyWorkspaceState]);

  // Load and subscribe to the active email's isolated Cloud Firestore workspace
  useEffect(() => {
    if (!activeEmail) return;

    const currentEpoch = ++workspaceEpochRef.current;
    let active = true;
    let unsubFirestore: (() => void) | null = null;

    resetUiForEmailSwitch();
    setLoadingData(true);
    setCloudSyncing(true);

    (async () => {
      try {
        const result = await loadWorkspaceFromFirestore(activeEmail);
        if (!active || workspaceEpochRef.current !== currentEpoch) return;

        applyWorkspaceState(result.state);
        setLoadingData(false);
        setCloudSyncing(false);

        unsubFirestore = subscribeToWorkspaceFirestore(
          activeEmail,
          (remoteState) => {
            if (!active || workspaceEpochRef.current !== currentEpoch) return;
            applyWorkspaceState(remoteState);
          },
          (err) => {
            if (!active || workspaceEpochRef.current !== currentEpoch) return;
            addToast(
              'error',
              'Cloud Sync Error',
              err instanceof Error ? err.message : 'Unable to sync live cloud updates.'
            );
          }
        );
      } catch (err) {
        if (!active || workspaceEpochRef.current !== currentEpoch) return;
        setLoadingData(false);
        setCloudSyncing(false);
        addToast(
          'error',
          'Failed to Load Cloud Workspace',
          err instanceof Error ? err.message : 'Please check your internet connection and try again.'
        );
      }
    })();

    return () => {
      active = false;
      if (unsubFirestore) {
        unsubFirestore();
      }
    };
  }, [activeEmail, applyWorkspaceState, resetUiForEmailSwitch, addToast]);

  const handleOpenOrSwitchEmail = useCallback(
    async (rawEmail: string) => {
      const cleaned = normalizeWorkspaceEmail(rawEmail);
      if (!isValidWorkspaceEmail(cleaned)) {
        throw new Error('Please enter a valid email address.');
      }

      const previousEmail = activeEmail;
      setSwitchingEmail(true);
      setEntryError(null);
      try {
        const saved = saveActiveEmail(cleaned);
        setRecentEmails(getRecentWorkspaceEmails());
        setActiveEmail(saved);
        if (previousEmail && previousEmail !== saved) {
          addToast(
            'success',
            'Workspace Email Switched',
            `Loading cloud data for ${saved}.`
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to open workspace email.';
        setEntryError(msg);
        throw err;
      } finally {
        setSwitchingEmail(false);
      }
    },
    [activeEmail, addToast]
  );

  const handleRefreshFromCloud = useCallback(async () => {
    if (!activeEmail) return;
    setCloudSyncing(true);
    try {
      const result = await loadWorkspaceFromFirestore(activeEmail);
      applyWorkspaceState(result.state);
      addToast(
        'success',
        'Cloud Data Refreshed',
        `${result.state.sales.length} sales and ${result.state.clients.length} clients loaded for ${activeEmail}.`
      );
    } catch (err) {
      addToast(
        'error',
        'Cloud Refresh Failed',
        err instanceof Error ? err.message : 'Could not fetch latest cloud data.'
      );
    } finally {
      setCloudSyncing(false);
    }
  }, [activeEmail, applyWorkspaceState, addToast]);

  // Enriched sales & client aggregates driven by real timestamps
  const replacementsBySale = useMemo(() => {
    const map = new Map<string, ReplacementRecord[]>();
    for (const r of replacements) {
      const arr = map.get(r.originalSaleId) ?? [];
      arr.push(r);
      map.set(r.originalSaleId, arr);
    }
    return map;
  }, [replacements]);

  const enrichedSales: SaleWithComputed[] = useMemo(() => {
    return sales.map((s) =>
      enrichSaleWithWarranty(
        s,
        replacementsBySale.get(s.id) ?? [],
        settings.expiringSoonThresholdHours,
        nowTs
      )
    );
  }, [sales, replacementsBySale, settings.expiringSoonThresholdHours, nowTs]);

  const clientsWithStats: ClientWithStats[] = useMemo(() => {
    return buildClientsWithStats(clients, enrichedSales, replacements);
  }, [clients, enrichedSales, replacements]);

  const metrics = useMemo(() => {
    return computeDashboardMetrics({
      sales,
      clients,
      replacements,
      settings,
      preset: datePreset,
      nowTs,
      customStart,
      customEnd,
    });
  }, [sales, clients, replacements, settings, datePreset, nowTs, customStart, customEnd]);

  const expiringSoonCount = useMemo(
    () => enrichedSales.filter((s) => s.warrantyStatus === 'EXPIRING_SOON').length,
    [enrichedSales]
  );

  // Global search across Client Name, Email, Sale ID, Account Type, Replacement ID
  const searchResults: GlobalSearchResult[] = useMemo(() => {
    const q = globalQuery.trim().toLowerCase();
    if (!q) return [];
    const results: GlobalSearchResult[] = [];

    for (const c of clientsWithStats) {
      if (c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)) {
        results.push({
          type: 'client',
          id: c.id,
          code: `${c.totalAccountsPurchased} acc`,
          title: c.name,
          subtitle: c.email,
          meta: 'Client',
          clientId: c.id,
        });
      }
    }

    for (const s of enrichedSales) {
      if (
        s.saleCode.toLowerCase().includes(q) ||
        s.clientName.toLowerCase().includes(q) ||
        s.clientEmail.toLowerCase().includes(q) ||
        s.effectiveAccountType.toLowerCase().includes(q) ||
        s.accountType.toLowerCase().includes(q)
      ) {
        results.push({
          type: 'sale',
          id: s.id,
          code: s.saleCode,
          title: `${s.clientName} · ${s.effectiveAccountType}`,
          subtitle: s.clientEmail,
          meta: s.warrantyStatus,
          saleId: s.id,
        });
      }
    }

    for (const r of replacements) {
      if (
        r.replacementCode.toLowerCase().includes(q) ||
        r.newAccountType.toLowerCase().includes(q) ||
        r.originalAccountType.toLowerCase().includes(q)
      ) {
        const sale = enrichedSales.find((s) => s.id === r.originalSaleId);
        results.push({
          type: 'replacement',
          id: r.id,
          code: r.replacementCode,
          title: `${r.originalAccountType} → ${r.newAccountType}`,
          subtitle: sale ? `${sale.clientName} (${sale.saleCode})` : r.originalSaleId,
          meta: 'Replacement',
          saleId: r.originalSaleId,
        });
      }
    }

    return results.slice(0, 10);
  }, [globalQuery, clientsWithStats, enrichedSales, replacements]);

  const handleSelectSearchResult = (res: GlobalSearchResult) => {
    if (res.type === 'client' && res.clientId) {
      setSelectedClientId(res.clientId);
    } else if (res.saleId) {
      setSelectedSaleId(res.saleId);
    }
  };

  // Cloud-first CRUD handlers (saved directly to Cloud Firestore under the active email)
  const handleCreateSale = async (payload: {
    clientName: string;
    clientEmail: string;
    accountType: string;
    warrantyDurationDays: number;
    saleDate: string;
    saleTime: string;
    warrantyStartTs: number;
    notes: string;
  }) => {
    if (!activeEmail) return;
    setCloudSyncing(true);
    try {
      const res = await cloudCreateSale(activeEmail, latestStateRef.current, payload);
      applyWorkspaceState(res.nextState);
      addToast(
        'success',
        `Sale ${res.sale.saleCode} saved to cloud`,
        `${res.sale.accountType} · ${res.sale.warrantyDurationDays}-day warranty started.`
      );
      setActiveTab('accounts');
    } finally {
      setCloudSyncing(false);
    }
  };

  const handleUpdateSale = async (
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
  ) => {
    if (!activeEmail) return;
    setCloudSyncing(true);
    try {
      const res = await cloudUpdateSale(activeEmail, latestStateRef.current, saleId, payload);
      applyWorkspaceState(res.nextState);
      addToast('success', `Sale ${res.sale.saleCode} updated`, 'Changes saved to cloud.');
    } finally {
      setCloudSyncing(false);
    }
  };

  const handleCreateReplacement = async (payload: {
    originalSaleId: string;
    newAccountType: string;
    warrantyPolicy: WarrantyPolicy;
    newWarrantyDurationDays?: number;
    replacementTimestamp: number;
    notes: string;
  }) => {
    if (!activeEmail) return;
    setCloudSyncing(true);
    try {
      const res = await cloudCreateReplacement(activeEmail, latestStateRef.current, payload);
      applyWorkspaceState(res.nextState);
      addToast(
        'success',
        `Replacement ${res.replacement.replacementCode} issued`,
        'Original sale preserved and replacement linked in cloud.'
      );
    } finally {
      setCloudSyncing(false);
    }
  };

  const handleUpdateClient = async (
    clientId: string,
    payload: { name: string; notes: string }
  ) => {
    if (!activeEmail) return;
    setCloudSyncing(true);
    try {
      const res = await cloudUpdateClient(activeEmail, latestStateRef.current, clientId, payload);
      applyWorkspaceState(res.nextState);
      addToast('success', 'Client updated', `${res.client.name} saved to cloud.`);
    } finally {
      setCloudSyncing(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !activeEmail) return;
    setDeleting(true);
    setCloudSyncing(true);
    try {
      if (deleteTarget.type === 'sale') {
        const res = await cloudDeleteSale(activeEmail, latestStateRef.current, deleteTarget.id);
        applyWorkspaceState(res.nextState);
        addToast('success', 'Sale deleted', `${deleteTarget.label} removed from cloud.`);
      } else {
        const res = await cloudDeleteClient(activeEmail, latestStateRef.current, deleteTarget.id);
        applyWorkspaceState(res.nextState);
        addToast('success', 'Client deleted', `${deleteTarget.label} and linked sales removed.`);
      }
      setDeleteTarget(null);
    } catch (err) {
      addToast('error', 'Delete failed', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setDeleting(false);
      setCloudSyncing(false);
    }
  };

  const handleSaveSettings = async (payload: {
    expiringSoonThresholdHours: number;
    defaultWarrantyDurationDays: number;
    defaultWarrantyStartMode: WarrantyStartMode;
    tableDensity: TableDensity;
    rememberSessionDays: number;
  }) => {
    if (!activeEmail) return;
    setCloudSyncing(true);
    try {
      const res = await cloudUpdateSettings(activeEmail, latestStateRef.current, payload);
      applyWorkspaceState(res.nextState);
      addToast('success', 'Settings saved', 'Warranty threshold and workspace preferences saved to cloud.');
    } finally {
      setCloudSyncing(false);
    }
  };

  const handleDownloadBackup = async () => {
    try {
      const backup = cloudExportBackup(latestStateRef.current);
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeEmailTag = (activeEmail || 'workspace').replace(/[^a-z0-9]/gi, '-');
      a.download = `muse-sales-backup-${safeEmailTag}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addToast('success', 'Backup downloaded', 'Complete JSON snapshot exported.');
    } catch (err) {
      addToast('error', 'Backup failed', err instanceof Error ? err.message : 'Export error');
    }
  };

  const handleRestoreBackup = async (jsonText: string) => {
    if (!activeEmail) return;
    setCloudSyncing(true);
    try {
      const parsed = JSON.parse(jsonText);
      const res = await cloudRestoreBackup(activeEmail, latestStateRef.current, {
        clients: parsed.clients,
        sales: parsed.sales,
        replacements: parsed.replacements,
        settings: parsed.settings,
        mode: 'merge',
      });
      applyWorkspaceState(res.nextState);
      addToast('success', 'Backup restored', `Records merged into cloud workspace for ${activeEmail}.`);
    } catch (err) {
      addToast(
        'error',
        'Restore failed',
        err instanceof Error ? err.message : 'Invalid backup JSON file.'
      );
    } finally {
      setCloudSyncing(false);
    }
  };

  const selectedSale = useMemo(
    () => enrichedSales.find((s) => s.id === selectedSaleId) ?? null,
    [enrichedSales, selectedSaleId]
  );
  const editingSale = useMemo(
    () => enrichedSales.find((s) => s.id === editingSaleId) ?? null,
    [enrichedSales, editingSaleId]
  );
  const replacingSale = useMemo(
    () => enrichedSales.find((s) => s.id === replacingSaleId) ?? null,
    [enrichedSales, replacingSaleId]
  );
  const selectedClient = useMemo(
    () => clientsWithStats.find((c) => c.id === selectedClientId) ?? null,
    [clientsWithStats, selectedClientId]
  );

  if (!activeEmail) {
    return (
      <>
        <WorkspaceEmailGate
          recentEmails={recentEmails}
          loading={switchingEmail}
          errorMessage={entryError}
          onSubmitEmail={handleOpenOrSwitchEmail}
        />
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  return (
    <>
      <AppShell
        activeTab={activeTab}
        activeEmail={activeEmail}
        expiringCount={expiringSoonCount}
        cloudSyncing={cloudSyncing}
        searchResults={searchResults}
        onSearchQueryChange={setGlobalQuery}
        onSelectSearchResult={handleSelectSearchResult}
        onOpenSwitchEmail={() => setSwitchModalOpen(true)}
        onNavigate={setActiveTab}
      >
        {loadingData && sales.length === 0 && clients.length === 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-24 bg-[#111115] border border-zinc-800/80 rounded-xl animate-pulse"
                />
              ))}
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <DashboardView
                metrics={metrics}
                datePreset={datePreset}
                customStart={customStart}
                customEnd={customEnd}
                onChangeDatePreset={setDatePreset}
                onChangeCustomStart={setCustomStart}
                onChangeCustomEnd={setCustomEnd}
                onNavigate={(t) => setActiveTab(t as NavTab)}
                onSelectSale={(s) => setSelectedSaleId(s.id)}
                onSelectClient={(c) => setSelectedClientId(c.id)}
              />
            )}

            {activeTab === 'add-sale' && (
              <AddSaleView
                clients={clients}
                settings={settings}
                onCreateSale={handleCreateSale}
                onCancel={() => setActiveTab('dashboard')}
              />
            )}

            {(activeTab === 'accounts' ||
              activeTab === 'active' ||
              activeTab === 'expiring' ||
              activeTab === 'expired') && (
              <AccountsTableView
                mode={
                  activeTab === 'accounts'
                    ? 'all'
                    : activeTab === 'active'
                    ? 'active'
                    : activeTab === 'expiring'
                    ? 'expiring'
                    : 'expired'
                }
                sales={enrichedSales}
                density={settings.tableDensity}
                thresholdHours={settings.expiringSoonThresholdHours}
                onAddSale={() => setActiveTab('add-sale')}
                onViewSale={(s) => setSelectedSaleId(s.id)}
                onEditSale={(s) => setEditingSaleId(s.id)}
                onReplaceSale={(s) => setReplacingSaleId(s.id)}
                onDeleteSale={(s) =>
                  setDeleteTarget({
                    type: 'sale',
                    id: s.id,
                    label: `${s.saleCode} (${s.clientName})`,
                  })
                }
                onOpenClient={(cid) => setSelectedClientId(cid)}
              />
            )}

            {activeTab === 'account-sell' && (
              <AccountSellView
                sales={enrichedSales}
                density={settings.tableDensity}
                nowTs={nowTs}
                onAddSale={() => setActiveTab('add-sale')}
                onViewSale={(s) => setSelectedSaleId(s.id)}
                onOpenClient={(cid) => setSelectedClientId(cid)}
              />
            )}

            {activeTab === 'clients' && (
              <ClientsView
                clients={clientsWithStats}
                density={settings.tableDensity}
                onSelectClient={(c) => setSelectedClientId(c.id)}
                onDeleteClient={(c) =>
                  setDeleteTarget({
                    type: 'client',
                    id: c.id,
                    label: `${c.name} (${c.email})`,
                  })
                }
              />
            )}

            {activeTab === 'replacements' && (
              <ReplacementsView
                replacements={replacements}
                sales={enrichedSales}
                clients={clients}
                density={settings.tableDensity}
                onSelectSale={(s) => setSelectedSaleId(s.id)}
                onOpenClient={(cid) => setSelectedClientId(cid)}
              />
            )}

            {activeTab === 'analytics' && (
              <AnalyticsView
                sales={sales}
                clients={clients}
                replacements={replacements}
                settings={settings}
                metrics={metrics}
                datePreset={datePreset}
                customStart={customStart}
                customEnd={customEnd}
                onChangeDatePreset={setDatePreset}
                onChangeCustomStart={setCustomStart}
                onChangeCustomEnd={setCustomEnd}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsView
                activeEmail={activeEmail}
                settings={settings}
                sales={enrichedSales}
                clients={clientsWithStats}
                replacements={replacements}
                cloudSyncing={cloudSyncing}
                onSaveSettings={handleSaveSettings}
                onDownloadBackup={handleDownloadBackup}
                onRestoreBackup={handleRestoreBackup}
                onSwitchEmail={handleOpenOrSwitchEmail}
                onRefreshCloud={handleRefreshFromCloud}
              />
            )}
          </>
        )}
      </AppShell>

      <SaleDetailsModal
        sale={selectedSale}
        onClose={() => setSelectedSaleId(null)}
        onEdit={(s) => setEditingSaleId(s.id)}
        onReplace={(s) => setReplacingSaleId(s.id)}
        onDelete={(s) =>
          setDeleteTarget({
            type: 'sale',
            id: s.id,
            label: `${s.saleCode} (${s.clientName})`,
          })
        }
        onOpenClient={(cid) => setSelectedClientId(cid)}
      />

      <EditSaleModal
        sale={editingSale}
        onClose={() => setEditingSaleId(null)}
        onSave={handleUpdateSale}
      />

      <ReplacementModal
        sale={replacingSale}
        onClose={() => setReplacingSaleId(null)}
        onSubmit={handleCreateReplacement}
      />

      <ClientProfileModal
        client={selectedClient}
        onClose={() => setSelectedClientId(null)}
        onUpdateClient={handleUpdateClient}
        onViewSale={(s) => setSelectedSaleId(s.id)}
      />

      <SwitchEmailModal
        open={switchModalOpen}
        currentEmail={activeEmail}
        recentEmails={recentEmails}
        switching={switchingEmail}
        onSwitchEmail={handleOpenOrSwitchEmail}
        onClose={() => setSwitchModalOpen(false)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.type === 'client' ? 'Client' : 'Sale Record'}`}
        description={
          deleteTarget?.type === 'client'
            ? `Permanently delete ${deleteTarget.label} and all associated sales and replacement records? This cannot be undone.`
            : `Permanently delete sale ${deleteTarget?.label}? Associated replacement records will also be removed.`
        }
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MuseSalesManagerApp />
    </ErrorBoundary>
  );
}
