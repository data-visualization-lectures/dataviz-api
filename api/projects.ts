// api/projects.ts

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleCorsAndMethods } from "./_lib/http.js";
import { supabaseAdmin } from "./_lib/supabase.js";
import { requireAuth, requireSubscription } from "./_lib/auth-guards.js";
import { logger } from "./_lib/logger.js";
import {
    buildProjectJsonPath,
    buildThumbnailPath,
    uploadProjectJson,
    uploadThumbnail,
} from "./_lib/projects-storage.js";

// ================== ハンドラ本体 ==================
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (handleCorsAndMethods(req, res, ["GET", "POST"])) {
        return;
    }

    try {
        const user = await requireAuth(req, res);
        if (!user) return;

        // サブスクリプションチェック
        const hasSubscription = await requireSubscription(req, res, user);
        if (!hasSubscription) return;

        // GET: プロジェクト一覧取得
        if (req.method === "GET") {
            const appName = req.query.app as string;
            if (!appName) {
                return res.status(400).json({ error: "missing_app_name" });
            }

            const { data: projects, error } = await supabaseAdmin
                .from("projects")
                .select("id, name, app_name, thumbnail_path, created_at, updated_at")
                .eq("user_id", user.id)
                .eq("app_name", appName)
                .order("updated_at", { ascending: false });

            if (error) {
                logger.error("Failed to fetch projects", error, { userId: user.id, appName });
                throw error;
            }

            return res.status(200).json({ projects });
        }

        // POST: プロジェクト新規保存
        if (req.method === "POST") {
            const { name, app_name, data, thumbnail } = req.body;

            if (!name || !app_name || !data) {
                return res.status(400).json({ error: "missing_required_fields" });
            }

            const crypto = await import("crypto");
            const projectUuid = crypto.randomUUID();
            const storagePath = buildProjectJsonPath(user.id, projectUuid);

            // Buffer化してアップロード
            const { error: storageError } = await uploadProjectJson(storagePath, data, false);

            if (storageError) {
                logger.error("Project storage upload failed", storageError, { userId: user.id, storagePath });
                throw storageError;
            }

            // 画像保存処理
            let thumbnailPath: string | null = null;
            if (thumbnail) {
                const imagePath = buildThumbnailPath(user.id, projectUuid);
                const { path, error: imageUploadError } = await uploadThumbnail(
                    thumbnail,
                    imagePath,
                    false
                );

                if (imageUploadError) {
                    logger.warn("Thumbnail upload failed", { error: imageUploadError, userId: user.id });
                } else {
                    thumbnailPath = path;
                }
            }

            // 2. DB へ保存
            const { data: project, error: dbError } = await supabaseAdmin
                .from("projects")
                .insert({
                    id: projectUuid,
                    user_id: user.id,
                    name,
                    storage_path: storagePath,
                    thumbnail_path: thumbnailPath,
                    app_name,
                })
                .select()
                .single();

            if (dbError) {
                logger.error("Project DB insertion failed", dbError, { userId: user.id, projectUuid });
                throw dbError;
            }

            logger.info("Project created successfully", { userId: user.id, projectUuid });
            return res.status(200).json({ project });
        }

        return res.status(405).json({ error: "Method not allowed" });
    } catch (err: any) {
        logger.error("Projects handler error", err as Error);
        return res
            .status(500)
            .json({ error: "internal_error", detail: err?.message ?? String(err) });
    }
}
