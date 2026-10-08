'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@omnikes/contexts/AuthContext';
import { AdminPageShell } from '@omnikes/components/layout/AdminPageShell';

interface AuditItem {
  id: string;
  userId: string | null;
  organizationId: string | null;
  storeId: string | null;
  action: string;
  module: string;
  entityId: string | null;
  entityType: string | null;
  oldValues: unknown;
  newValues: unknown;
  metadata: unknown;
  ipAddress: string | null;
  createdAt: string;
  user: { id: string; name: string | null; email: string } | null;
}

interface AuditResponse {
  items: AuditItem[];
  total: number;
  page: number;
  take: number;
  totalPages: number;
  facets: {
    actions: string[];
    modules: string[];
    stores: { id: string; name: string; code: string }[];
  };
}

function jsonValue(value: unknown) {
  if (value === null || value === undefined) return '—';
  try { return JSON.stringify(value, null, 2); } catch { return '—'; }
}

export default function AdministrationAuditPage() {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [module, setModule] = useState('');
  const [storeId, setStoreId] = useState('');
  const [page, setPage] = useState(1);

  const load = async (nextPage = page) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(nextPage), take: '50' });
      if (search.trim()) params.set('search', search.trim());
      if (action) params.set('action', action);
      if (module) params.set('module', module);
      if (storeId) params.set('storeId', storeId);
      const response = await fetch('/api/admin/audit?' + params.toString());
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Impossible de charger le journal');
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && user) setTimeout(() => void load(1), 0);
    // load intentionally captures the current filters; it is not a stable dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, search, action, module, storeId]);

  if (authLoading || loading && !data) return <main className="p-8">Chargement de l’administration…</main>;
  if (!user) return null;

  return (
    <AdminPageShell><main className="p-6 md:p-8 space-y-6">
      <header>
        <p className="text-sm text-muted">Administration</p>
        <h1 className="text-3xl font-semibold">Audit & journalisation</h1>
        <p className="mt-1 text-muted">Historique des actions enregistrées pour l’organisation courante.</p>
      </header>

      <nav className="flex flex-wrap gap-2">
        <a href="/administration/users" className="rounded-lg border px-4 py-2 text-sm">Utilisateurs</a>
        <a href="/administration/roles" className="rounded-lg border px-4 py-2 text-sm">Rôles</a>
        <a href="/administration/stores" className="rounded-lg border px-4 py-2 text-sm">Magasins</a>
        <a href="/administration/organization" className="rounded-lg border px-4 py-2 text-sm">Organisation</a>
        <a href="/administration/audit" className="rounded-lg bg-info-soft px-4 py-2 text-sm font-medium text-info">Audit</a>
      </nav>

      {error && <div className="rounded-lg bg-danger-soft p-3 text-danger">{error}</div>}

      <section className="rounded-xl border bg-white p-5">
        <div className="grid gap-3 md:grid-cols-4">
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Rechercher action/module/entité…" className="rounded-lg border px-3 py-2" />
          <select value={module} onChange={(e) => { setModule(e.target.value); setPage(1); }} className="rounded-lg border px-3 py-2">
            <option value="">Tous les modules</option>
            {data?.facets.modules.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="rounded-lg border px-3 py-2">
            <option value="">Toutes les actions</option>
            {data?.facets.actions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={storeId} onChange={(e) => { setStoreId(e.target.value); setPage(1); }} className="rounded-lg border px-3 py-2">
            <option value="">Tous les magasins</option>
            {data?.facets.stores.map((store) => <option key={store.id} value={store.id}>{store.name} ({store.code})</option>)}
          </select>
        </div>
      </section>

      <section className="rounded-xl border bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-muted">
              <tr><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">Utilisateur</th><th className="px-4 py-3 text-left">Action</th><th className="px-4 py-3 text-left">Module</th><th className="px-4 py-3 text-left">Entité</th><th className="px-4 py-3 text-left">Détails</th></tr>
            </thead>
            <tbody>
              {data?.items.map((item) => (
                <tr key={item.id} className="border-t align-top">
                  <td className="px-4 py-3 whitespace-nowrap">{new Date(item.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3">{item.user?.name || item.user?.email || item.userId || 'Système'}</td>
                  <td className="px-4 py-3 font-medium">{item.action}</td>
                  <td className="px-4 py-3">{item.module}</td>
                  <td className="px-4 py-3">{item.entityType || '—'}<br /><span className="font-mono text-xs">{item.entityId || '—'}</span></td>
                  <td className="px-4 py-3"><details><summary className="cursor-pointer text-info">Voir</summary><pre className="mt-2 max-w-xl overflow-auto rounded bg-surface-muted p-2 text-xs">{jsonValue({ oldValues: item.oldValues, newValues: item.newValues, metadata: item.metadata })}</pre></details></td>
                </tr>
              ))}
              {data?.items.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">Aucun événement.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {data && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">{data.total} événement(s) — page {data.page} / {Math.max(data.totalPages, 1)}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1 || loading} onClick={() => { const p = page - 1; setPage(p); void load(p); }} className="rounded-lg border px-3 py-2 disabled:opacity-50">Précédent</button>
            <button disabled={page >= data.totalPages || loading} onClick={() => { const p = page + 1; setPage(p); void load(p); }} className="rounded-lg border px-3 py-2 disabled:opacity-50">Suivant</button>
          </div>
        </div>
      )}
    </main>
    </AdminPageShell>
  );
}
