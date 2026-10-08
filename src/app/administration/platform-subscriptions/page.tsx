'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@omnikes/contexts/AuthContext';
import { AdminPageShell } from '@omnikes/components/layout/AdminPageShell';

type Organization = {
  id: string;
  name: string;
  slug: string;
  country: string;
  currency: string;
  subscriptionStatus: string;
  subscriptionPlan: string | null;
  subscriptionExpiresAt: string | null;
};

const PLANS = [
  { value: 'OMNIKES_149', label: 'OmniKès 149 USD' },
  { value: 'OMNIKES_249', label: 'OmniKès 249 USD' },
  { value: 'OMNIKES_299', label: 'OmniKès 299 USD' },
] as const;

type Plan = (typeof PLANS)[number]['value'];

function normalizePlan(value: string | null): Plan {
  return PLANS.some((item) => item.value === value)
    ? value as Plan
    : 'OMNIKES_249';
}

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-HT', {
    dateStyle: 'medium',
    timeZone: 'America/Port-au-Prince',
  }).format(new Date(value));
}

function toDateInputValue(value: string | null) {
  return value ? new Date(value).toISOString().slice(0, 10) : '';
}

export default function PlatformSubscriptionsPage() {
  const { user, loading: authLoading } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [plan, setPlan] = useState<Plan>('OMNIKES_249');
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const initialSelectionDone = useRef(false);

  const selected = organizations.find((item) => item.id === selectedId) ?? null;

  const selectOrganization = (organization: Organization) => {
    setSelectedId(organization.id);
    setPlan(normalizePlan(organization.subscriptionPlan));
    setExpiresAt(toDateInputValue(organization.subscriptionExpiresAt));
    setError('');
    setMessage('');
  };

  useEffect(() => {
    if (authLoading || !user?.id) return;

    let cancelled = false;
    void fetch('/api/platform/subscriptions', { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Accès plateforme refusé');
        if (cancelled) return;
        const nextOrganizations = body.organizations ?? [];
        setOrganizations(nextOrganizations);
        const first = nextOrganizations[0] as Organization | undefined;
        if (!initialSelectionDone.current && first) {
          initialSelectionDone.current = true;
          setSelectedId(first.id);
          setPlan(normalizePlan(first.subscriptionPlan));
          setExpiresAt(toDateInputValue(first.subscriptionExpiresAt));
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur de chargement');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id]);

  const save = async (action: 'ACTIVATE' | 'CANCEL') => {
    if (!selectedId) return;
    if (action === 'ACTIVATE' && !expiresAt) {
      setError('La date d’expiration est obligatoire.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(`/api/platform/subscriptions/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'ACTIVATE'
          ? { action, plan, expiresAt }
          : { action }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Opération refusée');

      setOrganizations((current) =>
        current.map((item) => item.id === selectedId ? body.organization : item),
      );
      setMessage(
        action === 'ACTIVATE'
          ? 'Abonnement activé/renouvelé. L’identité de cette organisation est maintenant autorisée sur les documents clients tant que l’entitlement reste actif.'
          : 'Abonnement annulé. L’identité de cette organisation est masquée sur les documents clients.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opération impossible');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) return <main className="p-8">Chargement de la plateforme…</main>;
  if (!user) return null;

  return (
    <AdminPageShell><main className="p-6 md:p-8 space-y-6">
      <header>
        <p className="text-sm text-muted">OmniKès Platform</p>
        <h1 className="text-3xl font-semibold">Entitlements & abonnements</h1>
        <p className="mt-1 text-muted">
          Gestion commerciale multi-organisation. Cette interface n’accorde aucun accès aux ventes, stocks ou données métier des tenants.
        </p>
      </header>

      {error && <div className="rounded-lg bg-danger-soft p-3 text-danger">{error}</div>}
      {message && <div className="rounded-lg bg-success-soft p-3 text-success">{message}</div>}

      <section className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="overflow-hidden rounded-xl border bg-white">
          <div className="border-b px-5 py-4 font-semibold">Organisations</div>
          <div className="divide-y">
            {organizations.map((organization) => (
              <button
                key={organization.id}
                type="button"
                onClick={() => selectOrganization(organization)}
                className={`w-full px-5 py-4 text-left hover:bg-surface-muted ${selectedId === organization.id ? 'bg-info-soft' : ''}`}
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="font-medium">{organization.name}</span>
                  <span className="text-xs font-semibold">{organization.subscriptionStatus}</span>
                </div>
                <div className="mt-1 text-sm text-muted">
                  {organization.slug} · {organization.subscriptionPlan ?? 'Aucun plan'} · {formatDate(organization.subscriptionExpiresAt)}
                </div>
              </button>
            ))}
          </div>
        </div>

        <aside className="rounded-xl border bg-white p-5">
          {selected ? (
            <>
              <h2 className="text-lg font-semibold">{selected.name}</h2>
              <p className="mt-1 text-sm text-muted">{selected.country} · {selected.currency}</p>

              <dl className="mt-5 space-y-3 text-sm">
                <div><dt className="text-muted">Statut</dt><dd className="font-semibold">{selected.subscriptionStatus}</dd></div>
                <div><dt className="text-muted">Plan</dt><dd>{selected.subscriptionPlan ?? 'Aucun'}</dd></div>
                <div><dt className="text-muted">Expiration</dt><dd>{formatDate(selected.subscriptionExpiresAt)}</dd></div>
              </dl>

              <div className="mt-6 space-y-4">
                <label className="block text-sm font-medium">
                  Plan
                  <select value={plan} onChange={(event) => setPlan(event.target.value as Plan)} className="mt-1 w-full rounded-lg border px-3 py-2">
                    {PLANS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>

                <label className="block text-sm font-medium">
                  Date d’expiration
                  <input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" />
                </label>

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save('ACTIVATE')}
                  className="w-full rounded-lg bg-primary px-4 py-2.5 text-white disabled:opacity-50"
                >
                  {saving ? 'Traitement…' : 'Activer / renouveler'}
                </button>

                {selected.subscriptionStatus === 'ACTIVE' && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void save('CANCEL')}
                    className="w-full rounded-lg border border-red-300 px-4 py-2.5 text-danger disabled:opacity-50"
                  >
                    Annuler l’abonnement
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">Aucune organisation disponible.</p>
          )}
        </aside>
      </section>
    </main>
  );
}
