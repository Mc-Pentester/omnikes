import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@omnikes/lib/auth';
import { roleRepository } from '@omnikes/repositories/role.repository';
import { platformRoleRepository } from '@omnikes/repositories/platform-role.repository';
import { errorLogger } from '@omnikes/lib/error-logger';
import { prisma } from '@omnikes/lib/prisma';

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

    const organization = await prisma.organization.findUnique({ where: { id: user.organizationId }, select: { currency: true, currencySymbol: true } });
    const currency = organization?.currency || 'USD';
    const currencyDefinition = await prisma.currency.findUnique({ where: { code: currency }, select: { symbol: true } });
    const currencySymbol = organization?.currencySymbol?.trim() || currencyDefinition?.symbol || currency;

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
      canManagePlatformSubscriptions,
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
      roleRepository.hasPermission(user.id, 'credit.refund'),
      roleRepository.hasPermission(user.id, 'sale.return'),
      roleRepository.hasPermission(user.id, 'hardware.bridge.read'),
      platformRoleRepository.hasPermission(user.id, 'organization.subscription.manage'),
    ]);

    return NextResponse.json({
      user: {
        ...user,
        currency,
        currencySymbol,
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
        canManagePlatformSubscriptions,
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