import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@omnikes/lib/auth';
import { authService } from '@omnikes/services/auth.service';
import { errorLogger } from '@omnikes/lib/error-logger';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Le mot de passe actuel est obligatoire.'),
  newPassword: z.string().min(8, 'Le nouveau mot de passe doit contenir au moins 8 caractères.').max(128),
  confirmPassword: z.string().min(1, 'La confirmation est obligatoire.'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'La confirmation ne correspond pas au nouveau mot de passe.',
  path: ['confirmPassword'],
}).refine((data) => data.currentPassword !== data.newPassword, {
  message: 'Le nouveau mot de passe doit être différent du mot de passe actuel.',
  path: ['newPassword'],
});

/** POST /api/auth/change-password — changes only the authenticated user's password. */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const payload = changePasswordSchema.parse(await request.json());
    await authService.changePassword(user.id, payload.currentPassword, payload.newPassword);

    const response = NextResponse.json({
      success: true,
      message: 'Mot de passe modifié. Veuillez vous reconnecter.',
    });
    // changePassword revokes every session, including the current one.
    response.cookies.delete('auth_token');
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || 'Données invalides.' }, { status: 400 });
    }
    if (error instanceof Error && error.message === 'Invalid current password') {
      return NextResponse.json({ error: 'Le mot de passe actuel est incorrect.' }, { status: 400 });
    }
    errorLogger.auth(error, { endpoint: 'POST /api/auth/change-password' });
    return NextResponse.json({ error: 'Impossible de modifier le mot de passe.' }, { status: 500 });
  }
}
