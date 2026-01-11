# dataviz-api (Supabase × Stripe × Vercel)

Supabase 認証と Stripe サブスクリプションを扱う Vercel サーバレスAPIです。フロントエンドは `https://auth.dataviz.jp` を想定しています。

## 特例組織

### 大学

api/_lib/academia.ts に以下のドメインが定義されており、これらを持っているユーザーには isAcademiaEmail 判定によって自動的にサブスクリプションが付与される仕組み（api/me.ts）が存在します。

- @tcu.ac.jp : 東京都市大学
- @tamabi.ac.jp : 多摩美術大学
- @fclt.tamabi.ac.jp : 多摩美術大学（教職員など）



## 環境変数
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (サービスロールで subscriptions/profiles を読み書き)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (Stripe Webhook 検証とAPI呼び出し)
- `STRIPE_PRO_MONTHLY_PRICE_ID` (Checkoutで使う価格ID)
- `FRONTEND_BASE_URL` (省略時 `https://auth.dataviz.jp`)

## Supabase スキーマ
- `profiles(id, display_name, created_at, updated_at)`
- `plans(id, stripe_price_id, name, description, amount, currency)`
- `subscription_status` enum: `none | active | past_due | canceled | incomplete | trialing`
- `subscriptions(id, user_id UNIQUE, stripe_customer_id, stripe_subscription_id, plan_id, status, current_period_end, created_at, updated_at)`

## エンドポイント
- `GET /api/me`  
  - 認証: `Authorization: Bearer <access_token>` (Supabaseセッション)  
  - 戻り値: `{ user, profile, subscription }`。未認証は401。CORSは `https://auth.dataviz.jp` のみ。

- `POST /api/billing-create-checkout-session`  
  - 認証必須。`subscriptions` から `stripe_customer_id` を取得/なければ作成して保存。  
  - `subscriptions.status === "active"` の場合は `200 { error: "already_subscribed", redirect_url: <FRONTEND_BASE_URL>/account }` を返し、Checkoutを作らない。  
  - それ以外はサブスク用 Checkout セッションを作成し `{ url }` を返す。

- `POST /api/billing-create-portal-session`  
  - 認証必須。`stripe_customer_id` がない場合は400 `no_stripe_customer`。  
  - Stripe Billing Portal セッションを作成し `{ url }` を返す。

- `POST /api/stripe-webhook`  
  - Stripe Webhook 受信用。raw body で署名検証。
  - イベントに応じて `subscriptions` を upsert:
    - `checkout.session.completed`: Stripe Subscription を取得し、`status`/`current_period_end`/`stripe_subscription_id`/`stripe_customer_id`/`plan_id` を保存。
    - `customer.subscription.updated`: status を `active/trialing/past_due/canceled/incomplete` にマップし更新。plan_id, period_end も更新。
    - `customer.subscription.deleted`: status を `canceled` にし、subscription_id と period_end は保持。
    - `invoice.payment_succeeded`: status を実際の Subscription 状態（なければ active）に更新し、period_end, plan_id を更新。
    - `invoice.payment_failed`: status を `past_due` に更新し、period_end, plan_id を更新。
  - user_id は `subscription.metadata.user_id` か Stripe Customer の `metadata.user_id` から取得する。取得できない場合は警告ログのみ。

## ステータス扱いの補足
- Stripeステータス → Supabase `subscription_status`:
  - active → active
  - trialing → trialing
  - past_due/unpaid → past_due
  - incomplete → incomplete
  - incomplete_expired/canceled → canceled
  - 未判定 → none
- `subscription_id` と `current_period_end` は解約後も保持。
- `plan_id` は Stripe Price ID と `plans.stripe_price_id` の一致で解決。見つからない場合は更新しない（デフォルトは `pro_monthly`）。

## 動作確認のヒント
- Stripe CLI: `stripe listen --forward-to <vercel-endpoint>/api/stripe-webhook`  
  - 例: `stripe trigger checkout.session.completed` / `customer.subscription.updated` / `customer.subscription.deleted` / `invoice.payment_succeeded` / `invoice.payment_failed`
- Supabase の `subscriptions` がイベントに応じて更新されることを確認する。
