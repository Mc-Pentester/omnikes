const DELIVERY_TIMEOUT_MS = 5_000;

function getWebhookUrl(): string | null {
  const value = process.env.PASSWORD_RESET_WEBHOOK_URL?.trim();
  return value ? value : null;
}

function getAllowedWebhookHosts(): Set<string> {
  return new Set(
    (process.env.PASSWORD_RESET_WEBHOOK_ALLOWED_HOSTS ?? '')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '::1';
}

function validateWebhookUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('PASSWORD_RESET_WEBHOOK_URL must be a valid absolute URL');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('PASSWORD_RESET_WEBHOOK_URL must use HTTP or HTTPS');
  }

  if (url.username || url.password) {
    throw new Error('PASSWORD_RESET_WEBHOOK_URL must not contain embedded credentials');
  }

  const hostname = url.hostname.toLowerCase();
  const allowedHosts = getAllowedWebhookHosts();

  if (allowedHosts.size > 0 && !allowedHosts.has(hostname)) {
    throw new Error('PASSWORD_RESET_WEBHOOK_URL host is not in PASSWORD_RESET_WEBHOOK_ALLOWED_HOSTS');
  }

  const allowLocalHttp = process.env.PASSWORD_RESET_WEBHOOK_ALLOW_HTTP_LOCAL === 'true';
  if (
    process.env.NODE_ENV === 'production'
    && url.protocol !== 'https:'
    && !(allowLocalHttp && isLoopbackHost(hostname))
  ) {
    throw new Error('Production password-reset webhook must use HTTPS');
  }

  return url;
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

  const validatedWebhookUrl = validateWebhookUrl(webhookUrl);
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

    const response = await fetch(validatedWebhookUrl, {
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
      redirect: 'error',
    });

    if (!response.ok) {
      throw new Error(`Password reset delivery failed with HTTP ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}
