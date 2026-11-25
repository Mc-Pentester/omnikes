import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@omnikes/lib/auth';
import { roleRepository } from '@omnikes/repositories/role.repository';
import { errorLogger } from '@omnikes/lib/error-logger';

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const [
      canManageUsers,
      canManageStores,
      canManageRoles,
      canCreateStores,
      canUpdateStores,
      canActivateStores,
      canDeactivateStores,
      canAuthorizeCredit,
      canRequestCredit,
      canManageCreditLimit,
      canManageCreditSettings,
      canViewCredit,
      canViewCreditHistory,
      canReceiveCreditPayment,
      canRefundCreditPayment,
      canReturnSale,
      canReadHardwareBridge,
    ] = await Promise.all([
      roleRepository.hasPermission(user.id, 'user.read'),
      roleRepository.hasPermission(user.id, 'store.read'),
      roleRepository.hasPermission(user.id, 'role.read'),
      roleRepository.hasPermission(user.id, 'store.create'),
      roleRepository.hasPermission(user.id, 'store.update'),
      roleRepository.hasPermission(user.id, 'store.activate'),
      roleRepository.hasPermission(user.id, 'store.deactivate'),
      roleRepository.hasPermission(user.id, 'credit.approve'),
      roleRepository.hasPermission(user.id, 'credit.request'),
      roleRepository.hasPermission(user.id, 'credit.limit.manage'),
      roleRepository.hasPermission(user.id, 'credit.settings.manage'),
      roleRepository.hasPermission(user.id, 'credit.view'),
      roleRepository.hasPermission(user.id, 'credit.history.view'),
      roleRepository.hasPermission(user.id, 'credit.payment.receive'),
      roleRepository.hasPermission(user.id, 'payment.refund'),
      roleRepository.hasPermission(user.id, 'sale.return'),
      roleRepository.hasPermission(user.id, 'hardware.bridge.read'),
    ]);

    return NextResponse.json({
      user: {
        ...user,
        canManageUsers,
        canManageStores,
        canManageRoles,
        canCreateStores,
        canUpdateStores,
        canActivateStores,
        canDeactivateStores,
        canAuthorizeCredit,
        canRequestCredit,
        canManageCreditLimit,
        canManageCreditSettings,
        canViewCredit,
        canViewCreditHistory,
        canReceiveCreditPayment,
        canRefundCreditPayment,
        canReturnSale,
        canReadHardwareBridge,
      },
    });
  } catch (error) {
    errorLogger.auth(error, { endpoint: 'GET /api/auth/me' });
    return NextResponse.json(
      { error: 'Failed to get current user' },
      { status: 500 }
    );
  }
}