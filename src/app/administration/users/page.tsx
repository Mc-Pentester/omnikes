'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@omnikes/contexts/AuthContext';
import { AdminPageShell } from '@omnikes/components/layout/AdminPageShell';

interface Role {
  id: string;
  name: string;
  description: string | null;
  isGlobal: boolean;
  storeId: string | null;
}

interface Store {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}

interface UserItem {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  userRoles: { role: Role }[];
}

export default function AdministrationUsersPage() {
  const { user, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    roleId: '',
    storeId: '',
    isActive: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const selectedUser = useMemo(
    () => users.find((item) => item.id === selectedId) ?? null,
    [users, selectedId],
  );
  const selectedRole = roles.find((role) => role.id === form.roleId) ?? null;

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}&take=100` : '?take=100';
      const response = await fetch(`/api/admin/users${query}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de charger les utilisateurs');
      setUsers(data.users);
      setRoles(data.roles);
      setStores(data.stores);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && user) {
      setTimeout(() => {
        void load();
      }, 0);
    }
    // load intentionally captures the current search state; it is triggered by auth changes and manual search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  const selectUser = (item: UserItem) => {
    const role = item.userRoles[0]?.role;
    setSelectedId(item.id);
    setForm({
      name: item.name ?? '',
      email: item.email,
      password: '',
      roleId: role?.id ?? '',
      storeId: role?.storeId ?? '',
      isActive: item.isActive,
    });
    setMessage('');
    setError('');
  };

  const newUser = () => {
    const firstGlobal = roles.find((role) => role.isGlobal);
    setSelectedId(null);
    setForm({
      name: '',
      email: '',
      password: '',
      roleId: firstGlobal?.id ?? '',
      storeId: '',
      isActive: true,
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
      const payload: Record<string, unknown> = {
        name: form.name,
        email: form.email,
        roleId: form.roleId,
      };
      if (form.password) payload.password = form.password;
      if (selectedId) {
        payload.isActive = form.isActive;
      } else {
        payload.password = form.password;
      }
      if (selectedRole && !selectedRole.isGlobal && form.storeId) {
        payload.storeId = form.storeId;
      }

      const response = await fetch(
        selectedId ? `/api/admin/users/${selectedId}` : '/api/admin/users',
        {
          method: selectedId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Opération impossible');

      setMessage(selectedId ? 'Utilisateur modifié.' : 'Utilisateur créé.');
      if (!selectedId) newUser();
      await load();
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
        <p className="mt-4 text-danger">Vous n’avez pas l’autorisation d’administrer les utilisateurs.</p>
      </main>
    );
  }

  return (
    <AdminPageShell><main className="p-6 md:p-8 space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-muted">Administration</p>
          <h1 className="text-3xl font-semibold">Utilisateurs</h1>
          <p className="text-muted mt-1">Gérer les comptes, rôles et accès de l’organisation courante.</p>
        </div>
        <div className="flex gap-2">
          <a href="/administration/roles" className="rounded-lg border px-4 py-2 text-sm hover:bg-surface-muted">
            Rôles & permissions
          </a>
          <a href="/administration/stores" className="rounded-lg border px-4 py-2 text-sm hover:bg-surface-muted">
            Magasins
          </a>
          <a href="/administration/organization" className="rounded-lg border px-4 py-2 text-sm hover:bg-surface-muted">
            Organisation
          </a>
          <button onClick={newUser} className="rounded-lg bg-primary px-4 py-2 text-white hover:bg-primary-hover">
            + Nouvel utilisateur
          </button>
        </div>
      </header>

      {error && <div className="rounded-lg bg-danger-soft p-3 text-danger">{error}</div>}
      {message && <div className="rounded-lg bg-success-soft p-3 text-success">{message}</div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <section className="rounded-xl border bg-surface">
          <div className="border-b p-4">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void load();
              }}
              placeholder="Rechercher par nom ou email…"
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>
          <div className="divide-y">
            {users.map((item) => {
              const role = item.userRoles[0]?.role;
              return (
                <button
                  key={item.id}
                  onClick={() => selectUser(item)}
                  className={`w-full p-4 text-left hover:bg-surface-muted ${selectedId === item.id ? 'bg-info-soft' : ''}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{item.name || 'Sans nom'}</div>
                      <div className="text-sm text-muted">{item.email}</div>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-xs ${item.isActive ? 'bg-success-soft text-success' : 'bg-surface-muted text-muted'}`}>
                      {item.isActive ? 'Actif' : 'Inactif'}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-muted">
                    {role?.name ?? 'Sans rôle'}{role?.storeId ? ' · magasin limité' : ' · global'}
                  </div>
                </button>
              );
            })}
            {!users.length && <div className="p-8 text-center text-muted">Aucun utilisateur trouvé.</div>}
          </div>
        </section>

        <section className="rounded-xl border bg-surface p-5">
          <h2 className="text-lg font-semibold">{selectedUser ? 'Modifier le compte' : 'Créer un compte'}</h2>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <label className="block">
              <span className="text-sm font-medium">Nom complet</span>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
            </label>

            <label className="block">
              <span className="text-sm font-medium">Email</span>
              <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
            </label>

            <label className="block">
              <span className="text-sm font-medium">{selectedUser ? 'Nouveau mot de passe (optionnel)' : 'Mot de passe initial'}</span>
              <input required={!selectedUser} minLength={8} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
            </label>

            <label className="block">
              <span className="text-sm font-medium">Rôle</span>
              <select required value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value, storeId: '' })} className="mt-1 w-full rounded-lg border px-3 py-2">
                <option value="">Sélectionner…</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>{role.name}{role.isGlobal ? ' — global' : ' — magasin'}</option>
                ))}
              </select>
            </label>

            {selectedRole && !selectedRole.isGlobal && (
              <label className="block">
                <span className="text-sm font-medium">Magasin autorisé</span>
                <select required value={form.storeId} onChange={(e) => setForm({ ...form, storeId: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2">
                  <option value="">Sélectionner…</option>
                  {stores.filter((store) => store.isActive).map((store) => (
                    <option key={store.id} value={store.id}>{store.name} ({store.code})</option>
                  ))}
                </select>
              </label>
            )}

            {selectedUser && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                <span className="text-sm">Compte actif</span>
              </label>
            )}

            <button disabled={saving} className="w-full rounded-lg bg-primary px-4 py-2.5 text-white disabled:opacity-50">
              {saving ? 'Enregistrement…' : selectedUser ? 'Enregistrer les modifications' : 'Créer le compte'}
            </button>
          </form>
        </section>
      </div>
    </main>
    </AdminPageShell>
  );
}
