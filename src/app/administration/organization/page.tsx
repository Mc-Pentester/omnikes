'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '@omnikes/contexts/AuthContext';
import { AdminPageShell } from '@omnikes/components/layout/AdminPageShell';

interface Organization {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  currency: string | null;
  locale: string | null;
  timezone: string | null;
  cloudEnabled: boolean;
  onlineStoreEnabled: boolean;
  taxConfigurationId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FormState {
  name: string;
  country: string;
  currency: string;
  locale: string;
  timezone: string;
  cloudEnabled: boolean;
  onlineStoreEnabled: boolean;
}

export default function AdministrationOrganizationPage() {
  const { user, loading: authLoading } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [form, setForm] = useState<FormState>({
    name: '',
    country: '',
    currency: '',
    locale: '',
    timezone: '',
    cloudEnabled: false,
    onlineStoreEnabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/organization');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de charger l’organisation');
      const item = data.organization as Organization;
      setOrganization(item);
      setForm({
        name: item.name ?? '',
        country: item.country ?? '',
        currency: item.currency ?? '',
        locale: item.locale ?? '',
        timezone: item.timezone ?? '',
        cloudEnabled: item.cloudEnabled,
        onlineStoreEnabled: item.onlineStoreEnabled,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && user) {
      setTimeout(() => void load(), 0);
    }
  }, [authLoading, user]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/admin/organization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          country: form.country,
          currency: form.currency,
          locale: form.locale,
          timezone: form.timezone,
          cloudEnabled: form.cloudEnabled,
          onlineStoreEnabled: form.onlineStoreEnabled,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible d’enregistrer les paramètres');

      const item = data.organization as Organization;
      setOrganization(item);
      setForm({
        name: item.name ?? '',
        country: item.country ?? '',
        currency: item.currency ?? '',
        locale: item.locale ?? '',
        timezone: item.timezone ?? '',
        cloudEnabled: item.cloudEnabled,
        onlineStoreEnabled: item.onlineStoreEnabled,
      });
      setMessage('Paramètres de l’organisation enregistrés.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opération impossible');
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
        <h1 className="text-2xl font-semibold">Administration</h1>
        <p className="mt-4 text-red-600">Vous n’avez pas l’autorisation de consulter les paramètres de l’organisation.</p>
      </main>
    );
  }

  return (
    <AdminPageShell><main className="p-6 md:p-8 space-y-6">
      <header>
        <p className="text-sm text-muted">Administration</p>
        <h1 className="text-3xl font-semibold">Organisation & paramètres</h1>
        <p className="mt-1 text-muted">
          Configurer l’identité et les paramètres généraux de l’organisation courante.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2">
        <a href="/administration/users" className="rounded-lg border px-4 py-2 text-sm hover:bg-surface-muted">Utilisateurs</a>
        <a href="/administration/roles" className="rounded-lg border px-4 py-2 text-sm hover:bg-surface-muted">Rôles & permissions</a>
        <a href="/administration/stores" className="rounded-lg border px-4 py-2 text-sm hover:bg-surface-muted">Magasins</a>
        <a href="/administration/organization" className="rounded-lg bg-info-soft px-4 py-2 text-sm font-medium text-info">Organisation</a>
        <a href="/administration/platform-subscriptions" className="rounded-lg border px-4 py-2 text-sm hover:bg-surface-muted">Abonnement</a>
      </nav>

      {error && <div className="rounded-lg bg-danger-soft p-3 text-danger">{error}</div>}
      {message && <div className="rounded-lg bg-success-soft p-3 text-success">{message}</div>}

      {organization && (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section className="rounded-xl border bg-white p-5">
            <h2 className="text-lg font-semibold">Paramètres généraux</h2>
            <form onSubmit={submit} className="mt-5 space-y-5">
              <label className="block">
                <span className="text-sm font-medium">Nom de l’organisation</span>
                <input
                  required
                  maxLength={255}
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium">Pays (ISO 3166-1)</span>
                  <input
                    required
                    maxLength={2}
                    value={form.country}
                    onChange={(event) => setForm({ ...form, country: event.target.value.toUpperCase() })}
                    placeholder="HT"
                    className="mt-1 w-full rounded-lg border px-3 py-2 uppercase"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Devise (ISO 4217)</span>
                  <input
                    required
                    maxLength={3}
                    value={form.currency}
                    onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })}
                    placeholder="HTG"
                    className="mt-1 w-full rounded-lg border px-3 py-2 uppercase"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium">Locale</span>
                  <input
                    required
                    maxLength={20}
                    value={form.locale}
                    onChange={(event) => setForm({ ...form, locale: event.target.value })}
                    placeholder="fr-HT"
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Fuseau horaire</span>
                  <input
                    required
                    maxLength={100}
                    value={form.timezone}
                    onChange={(event) => setForm({ ...form, timezone: event.target.value })}
                    placeholder="America/Port-au-Prince"
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                  />
                </label>
              </div>

              <div className="space-y-3 rounded-lg border p-4">
                <h3 className="font-medium">Fonctionnalités optionnelles</h3>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={form.cloudEnabled}
                    onChange={(event) => setForm({ ...form, cloudEnabled: event.target.checked })}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-medium">Cloud activé</span>
                    <span className="block text-xs text-muted">Active uniquement le paramètre d’organisation. Aucun hébergement ou synchronisation n’est déclenché par cette page.</span>
                  </span>
                </label>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={form.onlineStoreEnabled}
                    onChange={(event) => setForm({ ...form, onlineStoreEnabled: event.target.checked })}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-medium">Boutique en ligne activée</span>
                    <span className="block text-xs text-muted">Active uniquement le paramètre d’organisation. La boutique reste un module optionnel.</span>
                  </span>
                </label>
              </div>

              <button disabled={saving} className="w-full rounded-lg bg-primary px-4 py-2.5 text-white disabled:opacity-50">
                {saving ? 'Enregistrement…' : 'Enregistrer les paramètres'}
              </button>
            </form>
          </section>

          <aside className="space-y-4">
            <section className="rounded-xl border bg-white p-5">
              <h2 className="text-lg font-semibold">Identité technique</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-muted">Slug</dt>
                  <dd className="mt-1 break-all font-mono">{organization.slug}</dd>
                </div>
                <div>
                  <dt className="text-muted">Identifiant</dt>
                  <dd className="mt-1 break-all font-mono">{organization.id}</dd>
                </div>
                <div>
                  <dt className="text-muted">Configuration fiscale</dt>
                  <dd className="mt-1 font-mono">{organization.taxConfigurationId ?? 'Non définie'}</dd>
                </div>
              </dl>
              <p className="mt-4 text-xs text-muted">
                Le slug et l’identifiant sont en lecture seule. La configuration fiscale reste gérée par le mécanisme fiscal existant.
              </p>
            </section>

            <section className="rounded-xl border bg-surface-muted p-5">
              <h2 className="font-semibold">Mode de fonctionnement</h2>
              <p className="mt-2 text-sm text-muted">
                OmniKès reste local-first. Les options Cloud et Boutique en ligne sont explicites et ne sont jamais activées automatiquement.
              </p>
            </section>
          </aside>
        </div>
      )}
    </main>
    </AdminPageShell>
  );
}
