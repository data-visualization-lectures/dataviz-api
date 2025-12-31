// api/_lib/config.ts
// 環境変数の型安全な管理

/**
 * 必須の環境変数を取得し、存在しない場合はエラーをスロー
 */
function getRequiredEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
}

/**
 * オプショナルな環境変数を取得し、デフォルト値を返す
 */
function getOptionalEnv(key: string, defaultValue: string): string {
    return process.env[key] ?? defaultValue;
}

/**
 * アプリケーション設定
 * 起動時に一度だけ環境変数を読み込み、型安全にアクセス可能にする
 */
export const config = {
    // Supabase 設定
    supabase: {
        url: getRequiredEnv("SUPABASE_URL"),
        serviceRoleKey: getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    },

    // Stripe 設定
    stripe: {
        secretKey: getRequiredEnv("STRIPE_SECRET_KEY"),
        webhookSecret: getRequiredEnv("STRIPE_WEBHOOK_SECRET"),
        proMonthlyPriceId: getRequiredEnv("STRIPE_PRO_MONTHLY_PRICE_ID"),
        apiVersion: "2024-06-20" as const,
    },

    // フロントエンド設定
    frontend: {
        baseUrl: getOptionalEnv("FRONTEND_BASE_URL", "https://auth.dataviz.jp"),
    },
} as const;

/**
 * 設定の型
 */
export type Config = typeof config;

/**
 * 環境変数が正しく設定されているか検証
 * アプリケーション起動時に呼び出すことを推奨
 */
export function validateConfig(): void {
    try {
        // config オブジェクトにアクセスすることで、全ての必須環境変数をチェック
        const requiredKeys = [
            config.supabase.url,
            config.supabase.serviceRoleKey,
            config.stripe.secretKey,
            config.stripe.webhookSecret,
            config.stripe.proMonthlyPriceId,
        ];

        console.log("✅ All required environment variables are set");
    } catch (error) {
        console.error("❌ Environment variable validation failed:", error);
        throw error;
    }
}
