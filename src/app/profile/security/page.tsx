'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminPageShell } from '@omnikes/components/layout/AdminPageShell';
import { useAuth } from '@omnikes/contexts/AuthContext';

export default function ProfileSecurityPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }
    if (currentPassword === newPassword) {
      setError('Le nouveau mot de passe doit être différent du mot de passe actuel.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de modifier le mot de passe.');

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await logout();
      router.replace('/login?passwordChanged=1');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de modifier le mot de passe.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  if (authLoading || !user) return <main className="p-8">Chargement du profil…</main>;

  return (
    <AdminPageShell>
      <main className="mx-auto w-full max-w-3xl space-y-6 p-6 md:p-8">
        <header>
          <p className="text-sm text-muted">Mon compte</p>
          <h1 className="text-3xl font-semibold">Profil et sécurité</h1>
          <p className="mt-1 text-muted">Gérez vos informations de compte et votre mot de passe personnel.</p>
        </header>

        <section className="rounded-xl border bg-surface p-5">
          <h2 className="text-lg font-semibold">Informations du compte</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted">Nom</dt>
              <dd className="mt-1 font-medium">{user.name || 'Non renseigné'}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Adresse e-mail</dt>
              <dd className="mt-1 font-medium">{user.email}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border bg-surface p-5">
          <h2 className="text-lg font-semibold">Changer mon mot de passe</h2>
          <p className="mt-1 text-sm text-muted">Cette action concerne uniquement votre compte. Par sécurité, toutes vos sessions ouvertes seront fermées et vous devrez vous reconnecter.</p>

          {error && <div role="alert" className="mt-4 rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</div>}

          <form onSubmit={submit} className="mt-5 max-w-xl space-y-4">
            <label className="block">
              <span className="text-sm font-medium">Mot de passe actuel</span>
              <input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-1 w-full rounded-lg border bg-background px-3 py-2" />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Nouveau mot de passe</span>
              <input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-1 w-full rounded-lg border bg-background px-3 py-2" />
              <span className="mt-1 block text-xs text-muted">8 caractères minimum.</span>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Confirmer le nouveau mot de passe</span>
              <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1 w-full rounded-lg border bg-background px-3 py-2" />
            </label>
            <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? 'Modification…' : 'Modifier mon mot de passe'}
            </button>
          </form>
        </section>
      </main>
    </AdminPageShell>
  );
}
