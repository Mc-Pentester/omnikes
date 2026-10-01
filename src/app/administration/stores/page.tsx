'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '@omnikes/contexts/AuthContext';

interface Store {
  id: string;
  name: string;
  code: string;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  _count: { inventories: number; sales: number; proformas: number };
}

export default function AdministrationStoresPage() {
  const { user, loading: authLoading } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    code: '',
    address: '',
    city: '',
    country: '',
    phone: '',
    email: '',
    isActive: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const selected = stores.find((store) => store.id === selectedId) ?? null;

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/stores');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de charger les magasins');
      setStores(data.stores);
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

  const newStore = () => {
    setSelectedId(null);
    setForm({
      name: '',
      code: '',
      address: '',
      city: '',
      country: '',
      phone: '',
      email: '',
      isActive: true,
    });
    setMessage('');
    setError('');
  };

  const selectStore = (store: Store) => {
    setSelectedId(store.id);
    setForm({
      name: store.name,
      code: store.code,
      address: store.address ?? '',
      city: store.city ?? '',
      country: store.country ?? '',
      phone: store.phone ?? '',
      email: store.email ?? '',
      isActive: store.isActive,
    });
    setMessage('');
    setError('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(
        selectedId ? `/api/admin/stores/${selectedId}` : '/api/admin/stores',
        {
          method: selectedId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            email: form.email || undefined,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Opération impossible');

      setMessage(selectedId ? 'Magasin modifié.' : 'Magasin créé.');
      await load();
      if (!selectedId && data.store) selectStore(data.store);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opération impossible');
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (store: Store, active: boolean) => {
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/admin/stores/${store.id}`, {
        method: active ? 'POST' : 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Opération impossible');
      setMessage(active ? 'Magasin activé.' : 'Magasin désactivé.');
      await load();
      if (selectedId === store.id) setForm((current) => ({ ...current, isActive: active }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opération impossible');
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
        <p className="mt-4 text-red-600">Vous n’avez pas l’autorisation de gérer les magasins.</p>
      </main>
    );
  }

  return (
    <main className="p-6 md:p-8 space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">Administration</p>
          <h1 className="text-3xl font-semibold">Magasins</h1>
          <p className="mt-1 text-gray-600">Créer, modifier et activer les magasins de l’organisation.</p>
        </div>
        <div className="flex gap-2">
          <a href="/administration/users" className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50">
            Utilisateurs
          </a>
          <a href="/administration/roles" className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50">
            Rôles & permissions
          </a>
          <button onClick={newStore} className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
            + Nouveau magasin
          </button>
        </div>
      </header>

      {error && <div className="rounded-lg bg-red-50 p-3 text-red-700">{error}</div>}
      {message && <div className="rounded-lg bg-green-50 p-3 text-green-700">{message}</div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <section className="rounded-xl border bg-white">
          <div className="divide-y">
            {stores.map((store) => (
              <button
                key={store.id}
                onClick={() => selectStore(store)}
                className={`w-full p-4 text-left hover:bg-gray-50 ${selectedId === store.id ? 'bg-blue-50' : ''}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{store.name}</div>
                    <div className="text-sm text-gray-500">{store.code}{store.city ? ` · ${store.city}` : ''}</div>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs ${store.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {store.isActive ? 'Actif' : 'Inactif'}
                  </span>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  {store._count.sales} ventes · {store._count.inventories} inventaires · {store._count.proformas} proformas
                </div>
              </button>
            ))}
            {!stores.length && <div className="p-8 text-center text-gray-500">Aucun magasin.</div>}
          </div>
        </section>

        <section className="rounded-xl border bg-white p-5">
          <h2 className="text-lg font-semibold">{selected ? 'Modifier le magasin' : 'Créer un magasin'}</h2>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <label className="block">
              <span className="text-sm font-medium">Nom</span>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Code</span>
              <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Adresse</span>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium">Ville</span>
                <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Pays</span>
                <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
              </label>
            </div>
            <label className="block">
              <span className="text-sm font-medium">Téléphone</span>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Email</span>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
            </label>
            {selected && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                <span className="text-sm">Magasin actif</span>
              </label>
            )}
            <button disabled={saving} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-white disabled:opacity-50">
              {saving ? 'Enregistrement…' : selected ? 'Enregistrer les modifications' : 'Créer le magasin'}
            </button>
          </form>

          {selected && (
            <button
              type="button"
              onClick={() => void setActive(selected, !selected.isActive)}
              className="mt-3 w-full rounded-lg border px-4 py-2.5 hover:bg-gray-50"
            >
              {selected.isActive ? 'Désactiver le magasin' : 'Réactiver le magasin'}
            </button>
          )}
        </section>
      </div>
    </main>
  );
}
