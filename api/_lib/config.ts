// api/_lib/config.ts
// 環境変数の型安全な管理

// USE_ENV_FILE が指定されている場合、そのファイルから環境変数を読み込む
// vercel dev がクラウド環境変数を優先するため、ローカルテスト時に使用
if (process.env.USE_ENV_FILE) {
    const dotenv = await import("dotenv");
    dotenv.config({ path: process.env.USE_ENV_FILE, override: true });
}

import { logger } from "./logger.js";

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
        proYearlyPriceId: getRequiredEnv("STRIPE_PRO_YEARLY_PRICE_ID"),
        coachingMonthlyPriceId: getRequiredEnv("STRIPE_COACHING_MONTHLY_PRICE_ID"),
        coachingYearlyPriceId: getRequiredEnv("STRIPE_COACHING_YEARLY_PRICE_ID"),
        teamSmallMonthlyPriceId: getRequiredEnv("STRIPE_TEAM_SMALL_MONTHLY_PRICE_ID"),
        teamSmallYearlyPriceId: getRequiredEnv("STRIPE_TEAM_SMALL_YEARLY_PRICE_ID"),
        teamStandardMonthlyPriceId: getRequiredEnv("STRIPE_TEAM_STANDARD_MONTHLY_PRICE_ID"),
        teamStandardYearlyPriceId: getRequiredEnv("STRIPE_TEAM_STANDARD_YEARLY_PRICE_ID"),
        teamEnterpriseMonthlyPriceId: getRequiredEnv("STRIPE_TEAM_ENTERPRISE_MONTHLY_PRICE_ID"),
        teamEnterpriseYearlyPriceId: getRequiredEnv("STRIPE_TEAM_ENTERPRISE_YEARLY_PRICE_ID"),
        apiVersion: "2024-06-20" as const,
    },

    // フロントエンド設定
    frontend: {
        baseUrl: getOptionalEnv("FRONTEND_BASE_URL", "https://app.dataviz.jp"),
    },

    // トライアル設定
    trial: {
        inviteCode: getOptionalEnv("TRIAL_INVITE_CODE", ""),
    },

    // パブリックプロジェクト設定
    publicProjects: {
        userId: getOptionalEnv("PUBLIC_PROJECT_USER_ID", ""),
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
            config.stripe.proYearlyPriceId,
            config.stripe.coachingMonthlyPriceId,
            config.stripe.coachingYearlyPriceId,
            config.stripe.teamSmallMonthlyPriceId,
            config.stripe.teamSmallYearlyPriceId,
            config.stripe.teamStandardMonthlyPriceId,
            config.stripe.teamStandardYearlyPriceId,
            config.stripe.teamEnterpriseMonthlyPriceId,
            config.stripe.teamEnterpriseYearlyPriceId,
        ];

        logger.info("All required environment variables are set");
    } catch (error) {
        logger.error("Environment variable validation failed", error as Error);
        throw error;
    }
}
