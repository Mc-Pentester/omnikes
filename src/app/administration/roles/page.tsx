'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@omnikes/contexts/AuthContext';

interface Permission {
  id: string;
  code: string;
  description: string | null;
  module: string;
}

interface Role {
  id: string;
  name: string;
  description: string | null;
  isGlobal: boolean;
  storeId: string | null;
  permissions: Permission[];
  userCount: number;
}

interface Store {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}

export default function AdministrationRolesPage() {
  const { user, loading: authLoading } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    isGlobal: true,
    storeId: '',
    permissionIds: [] as string[],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === selectedId) ?? null,
    [roles, selectedId],
  );

  const groupedPermissions = useMemo(() => {
    return permissions.reduce<Record<string, Permission[]>>((groups, permission) => {
      (groups[permission.module] ??= []).push(permission);
      return groups;
    }, {});
  }, [permissions]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/roles');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de charger les rôles');
      setRoles(data.roles);
      setPermissions(data.permissions);
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
  }, [authLoading, user]);

  const newRole = () => {
    setSelectedId(null);
    setForm({
      name: '',
      description: '',
      isGlobal: true,
      storeId: '',
      permissionIds: [],
    });
    setMessage('');
    setError('');
  };

  const selectRole = (role: Role) => {
    setSelectedId(role.id);
    setForm({
      name: role.name,
      description: role.description ?? '',
      isGlobal: role.isGlobal,
      storeId: role.storeId ?? '',
      permissionIds: role.permissions.map((permission) => permission.id),
    });
    setMessage('');
    setError('');
  };

  const togglePermission = (permissionId: string) => {
    setForm((current) => ({
      ...current,
      permissionIds: current.permissionIds.includes(permissionId)
        ? current.permissionIds.filter((id) => id !== permissionId)
        : [...current.permissionIds, permissionId],
    }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const payload = {
        name: form.name,
        description: form.description || undefined,
        isGlobal: form.isGlobal,
        ...(form.isGlobal ? {} : { storeId: form.storeId }),
        permissionIds: form.permissionIds,
      };

      const response = await fetch(
        selectedId ? `/api/admin/roles/${selectedId}` : '/api/admin/roles',
        {
          method: selectedId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Opération impossible');

      setMessage(selectedId ? 'Rôle modifié.' : 'Rôle créé.');
      await load();
      if (!selectedId && data.role?.id) setSelectedId(data.role.id);
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
        <p className="mt-4 text-red-600">Vous n’avez pas l’autorisation de gérer les rôles.</p>
      </main>
    );
  }

  return (
    <main className="p-6 md:p-8 space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-gray-500">Administration</p>
          <h1 className="text-3xl font-semibold">Rôles & permissions</h1>
          <p className="text-gray-600 mt-1">
            Les permissions sont attribuées aux rôles. Elles ne sont jamais attribuées directement aux utilisateurs.
          </p>
        </div>
        <button onClick={newRole} className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
          + Nouveau rôle
        </button>
      </header>

      <nav className="flex gap-2">
        <a href="/administration/users" className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50">Utilisateurs</a>
        <a href="/administration/roles" className="rounded-lg bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700">Rôles & permissions</a>
        <a href="/administration/stores" className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50">Magasins</a>
        <a href="/administration/organization" className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50">Organisation</a>
          <a href="/administration/organization" className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50">Organisation</a>
      </nav>

      {error && <div className="rounded-lg bg-red-50 p-3 text-red-700">{error}</div>}
      {message && <div className="rounded-lg bg-green-50 p-3 text-green-700">{message}</div>}

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <section className="rounded-xl border bg-white">
          <div className="border-b p-4 font-semibold">Rôles de l’organisation</div>
          <div className="divide-y">
            {roles.map((role) => (
              <button
                key={role.id}
                onClick={() => selectRole(role)}
                className={`w-full p-4 text-left hover:bg-gray-50 ${selectedId === role.id ? 'bg-blue-50' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{role.name}</span>
                  <span className="text-xs text-gray-500">{role.userCount} utilisateur(s)</span>
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {role.isGlobal ? 'Tous les magasins' : `Magasin: ${stores.find((store) => store.id === role.storeId)?.name ?? 'inconnu'}`}
                </div>
                <div className="mt-2 text-xs text-gray-500">{role.permissions.length} permission(s)</div>
              </button>
            ))}
            {!roles.length && <div className="p-6 text-center text-gray-500">Aucun rôle.</div>}
          </div>
        </section>

        <section className="rounded-xl border bg-white p-5">
          <h2 className="text-lg font-semibold">{selectedRole ? 'Modifier le rôle' : 'Créer un rôle'}</h2>

          <form onSubmit={submit} className="mt-5 space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium">Nom du rôle</span>
                <input required maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Description</span>
                <input maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" />
              </label>
            </div>

            <div className="rounded-lg border p-4">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.isGlobal} onChange={(e) => setForm({ ...form, isGlobal: e.target.checked, storeId: '' })} />
                <span className="text-sm font-medium">Accès à tous les magasins de l’organisation</span>
              </label>

              {!form.isGlobal && (
                <label className="mt-3 block">
                  <span className="text-sm font-medium">Magasin</span>
                  <select required value={form.storeId} onChange={(e) => setForm({ ...form, storeId: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2">
                    <option value="">Sélectionner…</option>
                    {stores.filter((store) => store.isActive).map((store) => (
                      <option key={store.id} value={store.id}>{store.name} ({store.code})</option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Permissions</h3>
                  <p className="text-xs text-gray-500">Seules les permissions que votre rôle possède peuvent être déléguées.</p>
                </div>
                <span className="text-sm text-gray-500">{form.permissionIds.length} sélectionnée(s)</span>
              </div>

              <div className="space-y-4">
                {Object.entries(groupedPermissions).map(([module, items]) => (
                  <div key={module} className="rounded-lg border p-4">
                    <h4 className="mb-3 font-medium capitalize">{module}</h4>
                    <div className="grid gap-2 md:grid-cols-2">
                      {items.map((permission) => (
                        <label key={permission.id} className="flex items-start gap-2 rounded-lg p-2 hover:bg-gray-50">
                          <input
                            type="checkbox"
                            checked={form.permissionIds.includes(permission.id)}
                            onChange={() => togglePermission(permission.id)}
                            className="mt-1"
                          />
                          <span>
                            <span className="block text-sm">{permission.code}</span>
                            {permission.description && <span className="block text-xs text-gray-500">{permission.description}</span>}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button disabled={saving} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-white disabled:opacity-50">
              {saving ? 'Enregistrement…' : selectedRole ? 'Enregistrer les modifications' : 'Créer le rôle'}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
