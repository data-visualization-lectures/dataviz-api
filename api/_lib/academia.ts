// api/_lib/academia.ts
// アカデミア（大学）ドメイン判定 — Supabase テーブルから取得、インメモリキャッシュ付き

import { supabaseAdmin } from "./supabase.js";
import { logger } from "./logger.js";

/** キャッシュの有効期間（ミリ秒） */
const CACHE_TTL_MS = 5 * 60 * 1000; // 5分

/** ドメインリストのキャッシュ */
let cachedDomains: string[] | null = null;
let cacheExpiresAt = 0;

/**
 * Supabase の academia_domains テーブルから有効なドメインリストを取得する。
 * TTL 付きのインメモリキャッシュで、毎リクエストの DB アクセスを回避する。
 */
async function getAcademiaDomains(): Promise<string[]> {
    const now = Date.now();

    if (cachedDomains !== null && now < cacheExpiresAt) {
        return cachedDomains;
    }

    const { data, error } = await supabaseAdmin
        .from("academia_domains")
        .select("domain")
        .eq("is_active", true);

    if (error) {
        logger.error("Failed to fetch academia_domains", error as unknown as Error);
        // DB エラー時はキャッシュが残っていればそれを使う（フォールバック）
        if (cachedDomains !== null) {
            logger.warn("Using stale academia_domains cache due to DB error");
            return cachedDomains;
        }
        return [];
    }

    cachedDomains = data.map((row) => row.domain as string);
    cacheExpiresAt = now + CACHE_TTL_MS;

    return cachedDomains;
}

/**
 * 指定されたメールアドレスがアカデミアドメインに属するかを判定する。
 *
 * サポートするドメインパターン:
 * - `*@example.com`    — ドメイン完全一致
 * - `*@*.example.com`  — 任意のサブドメイン（`example.com` 自体は含まない）
 * - `@example.com`     — 既存形式（後方互換・末尾一致）
 */
export async function isAcademiaEmail(email: string): Promise<boolean> {
    if (!email) return false;
    const normalized = email.toLowerCase();
    const atIdx = normalized.lastIndexOf("@");
    if (atIdx < 0) return false;
    const emailDomain = normalized.substring(atIdx + 1);
    const patterns = await getAcademiaDomains();
    return patterns.some((pattern) =>
        matchDomainPattern(pattern.toLowerCase(), normalized, emailDomain)
    );
}

function matchDomainPattern(pattern: string, email: string, emailDomain: string): boolean {
    if (pattern.startsWith("*@*.")) {
        const suffix = pattern.substring(3);
        return emailDomain.endsWith(suffix) && emailDomain.length > suffix.length;
    }
    if (pattern.startsWith("*@")) {
        return emailDomain === pattern.substring(2);
    }
    return email.endsWith(pattern);
}
