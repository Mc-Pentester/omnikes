import { platformSubscriptionService } from '@omnikes/services/platform-subscription.service';

/**
 * Compatibility facade.
 *
 * Subscription entitlement is platform-only. Tenant RBAC is intentionally
 * not consulted here. New callers must use platformSubscriptionService.
 */
export class AdminSubscriptionService {
  async get(organizationId: string, actorUserId: string) {
    const organization = await platformSubscriptionService.get(organizationId, actorUserId);
    return { organization, canManage: true };
  }

  async update(
    organizationId: string,
    actorUserId: string,
    input: Parameters<typeof platformSubscriptionService.update>[2],
  ) {
    return platformSubscriptionService.update(organizationId, actorUserId, input);
  }
}

export const adminSubscriptionService = new AdminSubscriptionService();
