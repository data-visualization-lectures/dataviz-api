import type { SubscriptionRecord } from "./types.js";

export function applyAcademiaSubscriptionOverride(params: {
  subscription: SubscriptionRecord | null | undefined;
  userId: string;
  isAcademia: boolean;
  now?: Date;
}): SubscriptionRecord | null {
  const { subscription, userId, isAcademia, now = new Date() } = params;

  if (!isAcademia) {
    return subscription ?? null;
  }
  if (subscription?.status === "active") {
    return subscription;
  }

  const timestamp = now.toISOString();
  return {
    ...(subscription ?? {}),
    user_id: subscription?.user_id ?? userId,
    status: "active",
    plan_id: "academia",
    current_period_end: null,
    created_at: subscription?.created_at ?? timestamp,
    updated_at: subscription?.updated_at ?? timestamp,
  };
}
