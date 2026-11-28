// api/_lib/checkout-guard.ts

import { isLiveSubscriptionStatus } from "./webhook-subscription-identity.js";
import type { SubscriptionStatus } from "./types.js";

/**
 * Stripe 上の契約が active / trialing / past_due のまま残っているか。
 * 残っている間に新しい Checkout を作ると、Stripe に subscription が 2 本でき二重課金になる。
 */
export function hasLiveStripeSubscription(
  sub:
    | {
        stripe_subscription_id?: string | null;
        status?: SubscriptionStatus | string | null;
      }
    | null
    | undefined,
): boolean {
  return (
    typeof sub?.stripe_subscription_id === "string" &&
    sub.stripe_subscription_id.length > 0 &&
    isLiveSubscriptionStatus(sub.status as SubscriptionStatus | null | undefined)
  );
}
