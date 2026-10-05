'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '@omnikes/contexts/AuthContext';

type SubscriptionStatus = 'NONE' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'PAST_DUE';

interface SubscriptionOrganization {
  id: string;
  name: string;
  subscriptionStatus: SubscriptionStatus | string;
  subscriptionPlan: string | null;
  subscriptionExpiresAt: string | null;
}

interface SubscriptionResponse {
  organization: SubscriptionOrganization;
  canManage: boolean;
}

const PLANS = [
  { value: 'OMNIKES_149', label: 'OmniKès 149 USD' },
  { value: 'OMNIKES_249', label: 'OmniKès 249 USD' },
  { value: 'OMNIKES_299', label: 'OmniKès 299 USD' },
] as const;

function toDateInputValue(value: string | null) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-HT', {
    dateStyle: 'medium',
    timeZone: 'America/Port-au-Prince',
  }).format(new Date(value));
}

function planLabel(value: string | null) {
  return PLANS.find((plan) => plan.value === value)?.label ?? value ?? 'Aucun';
}

export default function AdministrationSubscriptionPage() {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<SubscriptionResponse | null>(null);
  const [plan, setPlan] = useState<(typeof PLANS)[number]['value']>('OMNIKES_249');
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/subscription', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Impossible de charger l’abonnement');
      const result = body as SubscriptionResponse;
      setData(result);
      if (result.organization.subscriptionPlan && PLANS.some((item) => item.value === result.organization.subscriptionPlan)) {
        setPlan(result.organization.subscriptionPlan as (typeof PLANS)[number]['value']);
      }
      setExpiresAt(toDateInputValue(result.organization.subscriptionExpiresAt));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && user) void load();
  }, [authLoading, user]);

  const activate = async (event: FormEvent) => {
    event.preventDefault();
    if (!expiresAt) {
      setError('La date d’expiration est obligatoire.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/admin/subscription', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ACTIVATE', plan, expiresAt }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Impossible d’activer l’abonnement');

      setData((current) => current ? { ...current, organization: body.organization } : current);
      setExpiresAt(toDateInputValue(body.organization.subscriptionExpiresAt));
      setMessage('Abonnement OmniKès activé. L’identité de l’organisation peut maintenant apparaître sur les documents clients.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Activation impossible');
    } finally {
      setSaving(false);
    }
  };

  const cancel = async () => {
    if (!window.confirm('Annuler l’abonnement de cette organisation ?')) return;

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/admin/subscription', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CANCEL' }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Impossible d’annuler l’abonnement');

      setData((current) => current ? { ...current, organization: body.organization } : current);
      setMessage('Abonnement annulé. L’identité de l’organisation est de nouveau masquée sur les documents clients.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Annulation impossible');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) {
    return <main className="p-8">Chargement de l’administration…</main>;
  }

  if (!user) return null;

  if (error === 'Permission required') {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-semibold">Abonnement OmniKès</h1>
        <p className="mt-4 text-red-600">Vous n’avez pas l’autorisation de consulter l’état de l’abonnement.</p>
      </main>
    );
  }

  const organization = data?.organization;
  const active = organization?.subscriptionStatus === 'ACTIVE';

  return (
    <main className="p-6 md:p-8 space-y-6">
      <header>
        <p className="text-sm text-gray-500">Administration</p>
        <h1 className="text-3xl font-semibold">Abonnement OmniKès</h1>
        <p className="mt-1 text-gray-600">
          Activer ou annuler l’entitlement commercial de l’organisation courante.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2">
        <a href="/administration/users" className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50">Utilisateurs</a>
        <a href="/administration/roles" className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50">Rôles & permissions</a>
        <a href="/administration/stores" className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50">Magasins</a>
        <a href="/administration/organization" className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50">Organisation</a>
        <a href="/administration/subscription" className="rounded-lg bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700">Abonnement</a>
      </nav>

      {error && <div className="rounded-lg bg-red-50 p-3 text-red-700">{error}</div>}
      {message && <div className="rounded-lg bg-green-50 p-3 text-green-700">{message}</div>}

      {organization && (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section className="rounded-xl border bg-white p-5">
            <h2 className="text-lg font-semibold">Activation commerciale</h2>
            <p className="mt-1 text-sm text-gray-500">
              Cette action ne déclenche aucun paiement automatique. Elle enregistre uniquement l’abonnement autorisé côté serveur.
            </p>

            {data?.canManage ? (
              <form onSubmit={activate} className="mt-5 space-y-5">
                <label className="block">
                  <span className="text-sm font-medium">Plan</span>
                  <select
                    value={plan}
                    onChange={(event) => setPlan(event.target.value as (typeof PLANS)[number]['value'])}
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                  >
                    {PLANS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-medium">Date d’expiration</span>
                  <input
                    required
                    type="date"
                    value={expiresAt}
                    onChange={(event) => setExpiresAt(event.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                  />
                </label>

                <button
                  disabled={saving}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-white disabled:opacity-50"
                >
                  {saving ? 'Traitement…' : active ? 'Renouveler / modifier l’abonnement' : 'Activer l’abonnement'}
                </button>

                {active && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={cancel}
                    className="w-full rounded-lg border border-red-300 px-4 py-2.5 text-red-700 disabled:opacity-50"
                  >
                    Annuler l’abonnement
                  </button>
                )}
              </form>
            ) : (
              <div className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
                Votre compte peut consulter l’état de l’abonnement, mais ne possède pas la permission
                <code className="mx-1 font-mono">organization.subscription.manage</code>.
                Cette permission doit être réservée à l’opérateur OmniKès autorisé à gérer les entitlements commerciaux.
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <section className="rounded-xl border bg-white p-5">
              <h2 className="text-lg font-semibold">État actuel</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-gray-500">Organisation</dt>
                  <dd className="mt-1 font-medium">{organization.name}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Statut</dt>
                  <dd className={`mt-1 font-semibold ${active ? 'text-green-700' : 'text-gray-700'}`}>
                    {organization.subscriptionStatus}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Plan</dt>
                  <dd className="mt-1">{planLabel(organization.subscriptionPlan)}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Expiration</dt>
                  <dd className="mt-1">{formatDate(organization.subscriptionExpiresAt)}</dd>
                </div>
              </dl>
            </section>

            <section className="rounded-xl border bg-gray-50 p-5">
              <h2 className="font-semibold">Effet sur les documents</h2>
              <p className="mt-2 text-sm text-gray-600">
                {active
                  ? 'L’identité de l’organisation est autorisée sur les proformas et tickets imprimés tant que la date d’expiration n’est pas dépassée.'
                  : 'L’identité de l’organisation reste masquée sur les proformas et tickets imprimés.'}
              </p>
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}
