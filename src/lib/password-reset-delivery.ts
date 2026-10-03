import { NextRequest } from 'next/server';

const DELIVERY_TIMEOUT_MS = 5_000;

function getWebhookUrl(): string | null {
  const value = process.env.PASSWORD_RESET_WEBHOOK_URL?.trim();
  return value ? value : null;
}

function getAppUrl(): string {
  const value = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!value) {
    throw new Error('NEXT_PUBLIC_APP_URL is required for password-reset delivery');
  }
  return value.replace(/\/$/, '');
}

export function isPasswordResetDeliveryConfigured(): boolean {
  return Boolean(getWebhookUrl());
}

export async function deliverPasswordResetLink(params: {
  email: string;
  token: string;
  expiresAt: Date;
}): Promise<void> {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) return;

  const resetLink = `${getAppUrl()}/reset-password?token=${encodeURIComponent(params.token)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const webhookToken = process.env.PASSWORD_RESET_WEBHOOK_TOKEN?.trim();
    if (webhookToken) {
      headers.Authorization = `Bearer ${webhookToken}`;
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        event: 'password_reset',
        to: params.email,
        subject: 'OmniKès — Réinitialisation du mot de passe',
        resetLink,
        expiresAt: params.expiresAt.toISOString(),
      }),
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Password reset delivery failed with HTTP ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}
