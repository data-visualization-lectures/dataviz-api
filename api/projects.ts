// api/projects.ts

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { setCors } from "./_lib/cors.js";
import { getUserFromRequest, supabaseAdmin } from "./_lib/supabase.js";
import { checkSubscription } from "./_lib/subscription.js";

// ================== ハンドラ本体 ==================
export default async function handler(req: VercelRequest, res: VercelResponse) {
    setCors(req, res);

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    try {
        const user = await getUserFromRequest(req);
        if (!user) {
            return res.status(401).json({ error: "not_authenticated" });
        }

        // サブスクリプションチェック
        const hasSubscription = await checkSubscription(user);
        if (!hasSubscription) {
            return res.status(403).json({ error: "subscription_required" });
        }

        // GET: プロジェクト一覧取得
        if (req.method === "GET") {
            const appName = req.query.app as string;
            if (!appName) {
                return res.status(400).json({ error: "missing_app_name" });
            }

            const { data: projects, error } = await supabaseAdmin
                .from("projects")
                .select("id, name, app_name, created_at, updated_at")
                .eq("user_id", user.id)
                .eq("app_name", appName)
                .order("updated_at", { ascending: false });

            if (error) {
                console.error("projects fetch error", error);
                throw error;
            }

            return res.status(200).json({ projects });
        }

        // POST: プロジェクト新規保存
        if (req.method === "POST") {
            const { name, app_name, data } = req.body;

            if (!name || !app_name || !data) {
                return res.status(400).json({ error: "missing_required_fields" });
            }

            // JSONデータの検証などをここで行うことも可能

            // 1. Storage へアップロード
            // ファイルパス: {user_id}/{uuid}.json
            // UUIDはここで生成する必要があるため、Supabase DBのgen_random_uuid()に頼らず、
            // Storageパスのためにcrypto.randomUUID()等を使うか、あるいはプロジェクトIDを先に確定させる必要がある。
            // ここではプロジェクトIDの発行をDBに任せる前に、パス用のユニークIDを生成する。
            const crypto = await import("crypto");
            const projectUuid = crypto.randomUUID();
            const storagePath = `${user.id}/${projectUuid}.json`;

            // Buffer化してアップロード
            const buffer = Buffer.from(JSON.stringify(data));
            const { error: storageError } = await supabaseAdmin.storage
                .from("user_projects")
                .upload(storagePath, buffer, {
                    contentType: "application/json",
                    upsert: false,
                });

            if (storageError) {
                console.error("storage upload error", storageError);
                throw storageError;
            }

            // 2. DB へ保存
            const { data: project, error: dbError } = await supabaseAdmin
                .from("projects")
                .insert({
                    id: projectUuid, // Storageと同じIDを使うと管理しやすい
                    user_id: user.id,
                    name,
                    storage_path: storagePath,
                    app_name,
                })
                .select()
                .single();

            if (dbError) {
                // DB保存に失敗したらStorageのごみ掃除をしたほうが丁寧だが、ここでは省略
                console.error("projects insert error", dbError);
                throw dbError;
            }

            return res.status(200).json({ project });
        }

        return res.status(405).json({ error: "Method not allowed" });
    } catch (err: any) {
        console.error("projects handler error", err);
        return res
            .status(500)
            .json({ error: "internal_error", detail: err?.message ?? String(err) });
    }
}
