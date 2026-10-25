'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@omnikes/components/branding/Logo';
import { Button } from '@omnikes/components/ui/button';
import { Card } from '@omnikes/components/ui/card';
import { Input } from '@omnikes/components/ui/input';

export default function SetupPage() {
  const router = useRouter();
  const [organizationName, setOrganizationName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const checkSetup = async () => {
      try {
        const response = await fetch('/api/setup/status', { cache: 'no-store' });
        if (!response.ok) throw new Error('Impossible de vérifier l’état de l’installation');
        const data = await response.json();
        if (!cancelled && data.configured) {
          router.replace('/login');
          return;
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Impossible de vérifier l’état de l’installation');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    checkSetup();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationName,
          name,
          email,
          password,
          confirmPassword,
        }),
      });

      const raw = await response.text();
      let data: { error?: string } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = {};
      }

      if (!response.ok) {
        throw new Error(data.error || `Configuration échouée (HTTP ${response.status})`);
      }

      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Configuration échouée');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted">Vérification de la configuration...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-8">
          <Logo size={80} />
          <h1 className="text-2xl font-bold text-foreground mt-4">Bienvenue sur OmniKès</h1>
          <p className="text-sm text-muted text-center mt-2">
            Première configuration de cette installation
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="organizationName" className="block text-sm font-medium text-foreground mb-2">
              Nom de l&apos;organisation
            </label>
            <Input
              id="organizationName"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              placeholder="Ma Boutique"
              required
              disabled={submitting}
            />
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">
              Nom de l&apos;administrateur principal
            </label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jean Dupont"
              required
              disabled={submitting}
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
              Email de l&apos;administrateur
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@exemple.com"
              required
              disabled={submitting}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">
              Mot de passe administrateur
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              disabled={submitting}
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground mb-2">
              Confirmer le mot de passe
            </label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              disabled={submitting}
            />
          </div>

          {error && <div className="text-danger text-sm">{error}</div>}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Configuration...' : 'Créer l’organisation et le compte administrateur'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          Après cette étape, l’administrateur pourra créer les autres comptes utilisateurs et leurs rôles depuis l’administration.
        </p>
      </Card>
    </div>
  );
}
