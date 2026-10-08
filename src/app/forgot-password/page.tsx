'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from '@omnikes/components/branding/Logo';
import { Button } from '@omnikes/components/ui/button';
import { Card } from '@omnikes/components/ui/card';
import { Input } from '@omnikes/components/ui/input';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    try {
      setLoading(true);
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
      } else {
        setError(data.error || 'Failed to request password reset');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to request password reset';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-8">
          <Logo size={80} />
          <h1 className="text-2xl font-bold text-foreground mt-4">OmniKès</h1>
          <p className="text-sm text-muted">Système de Gestion Commerciale</p>
        </div>

        {!success ? (
          <>
            <h2 className="text-xl font-semibold text-foreground mb-6">Forgot Password</h2>
            <p className="text-sm text-muted mb-6">
              Enter your email address and we&apos;ll send you a link to reset your password.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="votre@email.com"
                  required
                  disabled={loading}
                />
              </div>

              {error && (
                <div className="text-danger text-sm">{error}</div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={loading}
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-muted">
              <a href="/login" className="text-primary hover:text-primary-hover">
                Back to Login
              </a>
            </div>
          </>
        ) : (
          <div className="text-center">
            <div className="mb-4">
              <svg
                className="mx-auto h-12 w-12 text-success"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Check Your Email</h2>
            <p className="text-sm text-muted mb-6">
              If an account exists with this email, a password reset link has been sent.
            </p>
            <div className="text-sm text-muted mb-4">
              In development mode, check the server console for the reset token.
            </div>
            <Button
              onClick={() => router.push('/login')}
              className="w-full"
            >
              Back to Login
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
