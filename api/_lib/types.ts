// api/_lib/types.ts
// 共通型定義

/**
 * Supabase の subscription_status enum に対応
 */
export type SubscriptionStatus =
  | "none"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "trialing";

/**
 * 認証済みユーザー情報
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
}

/**
 * Supabase subscriptions テーブルのレコード型
 */
export interface SubscriptionRecord {
  id?: string;
  user_id: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  plan_id?: string | null;
  status: SubscriptionStatus;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Supabase profiles テーブルのレコード型
 */
export interface ProfileRecord {
  id: string;
  display_name?: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Supabase plans テーブルのレコード型
 */
export interface PlanRecord {
  id: string;
  stripe_price_id: string;
  name: string;
  description?: string | null;
  amount?: number | null;
  currency?: string | null;
}

/**
 * /api/me のレスポンス型
 */
export interface MeResponse {
  user: {
    id: string;
    email: string;
  };
  profile: ProfileRecord | null;
  subscription: SubscriptionRecord | null;
}

/**
 * Stripe Checkout セッション作成のレスポンス型
 */
export interface CheckoutSessionResponse {
  url: string | null;
  error?: string;
  redirect_url?: string;
}

/**
 * Stripe Portal セッション作成のレスポンス型
 */
export interface PortalSessionResponse {
  url: string;
}

/**
 * エラーレスポンスの型
 */
export interface ErrorResponse {
  error: string;
  detail?: string;
  redirect_url?: string;
}
