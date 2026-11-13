'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@omnikes/components/branding/Logo';
import { Button } from '@omnikes/components/ui/button';
import { Card } from '@omnikes/components/ui/card';
import { Input } from '@omnikes/components/ui/input';

type RegistrationMode = 'initial' | 'join';

export default function RegisterPage() {
  const router = useRouter();
  const [mode, setMode] = useState<RegistrationMode | null>(null);
  const [organizationName, setOrganizationName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [country, setCountry] = useState('HT');
  const [currency, setCurrency] = useState('HTG');
  const [locale, setLocale] = useState('fr-HT');
  const [timezone, setTimezone] = useState('America/Port-au-Prince');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/registration-status', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Impossible de vérifier la disponibilité de l’inscription.');
        return response.json() as Promise<{ mode: RegistrationMode }>;
      })
      .then((data) => { if (active) setMode(data.mode); })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Service d’inscription indisponible.');
      });
    return () => { active = false; };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(mode === 'initial' ? { organizationName, country, currency, locale, timezone } : {}),
          name, email, password, confirmPassword,
        }),
      });
      const data = await response.json();
      if (response.status === 202 && data.pendingApproval) {
        setSuccess(data.message || 'Votre demande a été envoyée à l’administrateur.');
        return;
      }
      if (!response.ok) throw new Error(data.error || `Inscription échouée (HTTP ${response.status})`);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inscription échouée.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-8">
          <Logo size={80} />
          <h1 className="text-2xl font-bold text-foreground mt-4">OmniKès</h1>
          <p className="text-sm text-muted">Créer votre compte</p>
        </div>

        {mode === null ? (
          <div className="py-8 text-center text-sm text-muted">
            {error || 'Vérification de la configuration de l’installation…'}
          </div>
        ) : success ? (
          <div className="space-y-4 text-center">
            <h2 className="text-lg font-semibold">Demande envoyée</h2>
            <p className="text-sm text-muted">{success}</p>
            <Button className="w-full" onClick={() => router.push('/login')}>Retour à la connexion</Button>
          </div>
        ) : (
          <>
            {mode === 'initial' ? (
              <div className="mb-5 rounded-lg border border-border p-3 text-sm text-muted">
                Première configuration : cette inscription créera l’organisation et le compte administrateur initial.
              </div>
            ) : (
              <div className="mb-5 rounded-lg border border-border p-3 text-sm text-muted">
                Une organisation existe déjà sur cette installation. Vous pouvez demander un compte dans cette organisation, mais vous ne pouvez pas en créer une autre. L’administrateur devra attribuer vos rôles et activer votre compte.
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'initial' && (
                <>
                  <div>
                    <label htmlFor="organizationName" className="mb-2 block text-sm font-medium text-foreground">Nom de l’organisation</label>
                    <Input id="organizationName" value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} placeholder="Ma Boutique" required disabled={loading} />
                  </div>
                  <details className="rounded-lg border border-border p-3">
                    <summary className="cursor-pointer text-sm font-medium">Paramètres régionaux de l’organisation</summary>
                    <p className="mt-2 text-xs text-muted">Les valeurs haïtiennes sont proposées par défaut.</p>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div><label htmlFor="country" className="mb-1 block text-xs font-medium">Pays (ISO)</label><Input id="country" value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} maxLength={2} required disabled={loading} /></div>
                      <div><label htmlFor="currency" className="mb-1 block text-xs font-medium">Devise (ISO)</label><Input id="currency" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} required disabled={loading} /></div>
                      <div><label htmlFor="locale" className="mb-1 block text-xs font-medium">Langue / région</label><Input id="locale" value={locale} onChange={(e) => setLocale(e.target.value)} maxLength={20} required disabled={loading} /></div>
                      <div><label htmlFor="timezone" className="mb-1 block text-xs font-medium">Fuseau horaire</label><Input id="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} maxLength={100} required disabled={loading} /></div>
                    </div>
                  </details>
                </>
              )}

              <div><label htmlFor="name" className="mb-2 block text-sm font-medium text-foreground">Votre nom</label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jean Dupont" required disabled={loading} /></div>
              <div><label htmlFor="email" className="mb-2 block text-sm font-medium text-foreground">Email</label><Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="votre@email.com" required disabled={loading} /></div>
              <div><label htmlFor="password" className="mb-2 block text-sm font-medium text-foreground">Mot de passe</label><Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" minLength={8} required disabled={loading} /></div>
              <div><label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium text-foreground">Confirmer le mot de passe</label><Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" minLength={8} required disabled={loading} /></div>

              {error && <div className="text-sm text-danger">{error}</div>}
              <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Création…' : 'Créer un compte'}</Button>
            </form>
          </>
        )}

        {!success && <div className="mt-6 text-center text-sm text-muted">Vous avez déjà un compte ? <a href="/login" className="text-primary hover:text-primary-hover">Se connecter</a></div>}
      </Card>
    </div>
  );
}
