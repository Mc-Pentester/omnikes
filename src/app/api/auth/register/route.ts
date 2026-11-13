import { NextRequest, NextResponse } from 'next/server';
import { registrationService, RateLimitError } from '@omnikes/services/registration.service';
import { getClientIP } from '@omnikes/lib/rate-limiter';
import { registrationSchema } from '@omnikes/lib/validation';
import { RegistrationConcurrencyError } from '@omnikes/services/registration.service';
import { z } from 'zod';

export async function POST(request: NextRequest) {
  try {
    const validatedData = registrationSchema.parse(await request.json());
    const result = await registrationService.register({
      organizationName: validatedData.organizationName,
      name: validatedData.name,
      email: validatedData.email,
      password: validatedData.password,
      country: validatedData.country,
      currency: validatedData.currency,
      locale: validatedData.locale,
      timezone: validatedData.timezone,
    }, getClientIP(request.headers), request.headers.get('user-agent') || undefined);

    if (result.pendingApproval) {
      return NextResponse.json({
        pendingApproval: true,
        message: 'Votre demande de compte a été enregistrée. Un administrateur doit attribuer vos accès et activer votre compte avant votre première connexion.',
      }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
    }

    const response = NextResponse.json({ user: result.user, expiresAt: result.expiresAt });
    if (result.token && result.expiresAt) {
      response.cookies.set('auth_token', result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        expires: result.expiresAt,
      });
    }
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    if (error instanceof RegistrationConcurrencyError) {
      return NextResponse.json({ error: error.message }, {
        status: 503,
        headers: { 'Retry-After': '2', 'Cache-Control': 'no-store' },
      });
    }
    if (error instanceof RateLimitError) {
      const response = NextResponse.json({ error: error.message }, { status: 429 });
      if (error.resetTime) {
        const retryAfter = Math.ceil((error.resetTime - Date.now()) / 1000);
        if (retryAfter > 0) response.headers.set('Retry-After', retryAfter.toString());
      }
      return response;
    }
    if (error instanceof Error) {
      if (error.message === 'Cette adresse email est déjà utilisée') return NextResponse.json({ error: error.message }, { status: 409 });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
