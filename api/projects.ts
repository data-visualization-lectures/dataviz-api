// api/projects.ts

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleCorsAndMethods } from "./_lib/http.js";
import { supabaseAdmin } from "./_lib/supabase.js";
import { requireAuth, requireSubscription } from "./_lib/auth-guards.js";
import { logger } from "./_lib/logger.js";
import { config } from "./_lib/config.js";
import {
    buildProjectJsonPath,
    buildThumbnailPath,
    uploadProjectJson,
    uploadThumbnail,
    fileExists,
} from "./_lib/projects-storage.js";
import { getUserGroupIds, getLeaderGroupIds } from "./_lib/group.js";
import { resolveAppNameFromRequest } from "./_lib/request-app-context.js";

// ================== ハンドラ本体 ==================
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (handleCorsAndMethods(req, res, ["GET", "POST"])) {
        return;
    }

    try {
        const user = await requireAuth(req, res);
        if (!user) return;
        const requestAppName = resolveAppNameFromRequest(req);

        // 閲覧系(GET)は認証のみ。書き込み系(POST)は課金必須。
        if (req.method !== "GET") {
            const hasSubscription = await requireSubscription(req, res, user, {
                appName: requestAppName,
                source: "projects",
            });
            if (!hasSubscription) return;
        }

        const SELECT_COLUMNS =
            "id, name, app_name, thumbnail_path, storage_path, user_id, group_id, created_at, updated_at";

        // GET: プロジェクト一覧取得
        if (req.method === "GET") {
            const mode = req.query.mode as string | undefined;
            const source = req.query.source as string | undefined;
            const appName = req.query.app as string | undefined;

            // mode=count: 自分のプロジェクト件数（app フィルタ任意）
            if (mode === "count") {
                let countQuery = supabaseAdmin
                    .from("projects")
                    .select("*", { count: "exact", head: true })
                    .eq("user_id", user.id);

                if (appName) {
                    countQuery = countQuery.eq("app_name", appName);
                }

                const { count, error } = await countQuery;
                if (error) {
                    logger.error("Failed to count projects", error, { userId: user.id });
                    throw error;
                }

                return res.status(200).json({ count: count ?? 0 });
            }

            // source=public: パブリックプロジェクト一覧（app フィルタ任意）
            if (source === "public") {
                const publicUserId = config.publicProjects.userId;
                if (!publicUserId) {
                    return res.status(200).json({ projects: [] });
                }

                let query = supabaseAdmin
                    .from("projects")
                    .select(SELECT_COLUMNS)
                    .eq("user_id", publicUserId);

                if (appName) {
                    query = query.eq("app_name", appName);
                }

                const { data: projects, error } = await query.order("updated_at", { ascending: false });

                if (error) {
                    logger.error("Failed to fetch public projects", error);
                    throw error;
                }

                return res.status(200).json({ projects: projects ?? [] });
            }

            // source=group: グループプロジェクト一覧
            if (source === "group") {
                const groupIds = await getUserGroupIds(user.id);
                if (groupIds.length === 0) {
                    return res.status(200).json({ projects: [] });
                }

                let query = supabaseAdmin
                    .from("projects")
                    .select(SELECT_COLUMNS)
                    .in("group_id", groupIds)
                    .not("group_id", "is", null);

                if (appName) {
                    query = query.eq("app_name", appName);
                }

                const { data: projects, error } = await query.order("updated_at", { ascending: false });

                if (error) {
                    logger.error("Failed to fetch group projects", error, { userId: user.id });
                    throw error;
                }

                return res.status(200).json({ projects: projects ?? [] });
            }

            // 自分のプロジェクト一覧（app 未指定時は全 app を返す）
            let query = supabaseAdmin
                .from("projects")
                .select(SELECT_COLUMNS)
                .eq("user_id", user.id);

            if (appName) {
                query = query.eq("app_name", appName);
            }

            const { data: projects, error } = await query.order("updated_at", { ascending: false });

            if (error) {
                logger.error("Failed to fetch projects", error, { userId: user.id, appName });
                throw error;
            }

            return res.status(200).json({ projects: projects ?? [] });
        }

        // POST: プロジェクト新規保存
        if (req.method === "POST") {
            const { name, app_name, data, thumbnail, storage_uploaded, storage_path, project_id, group_id } = req.body;

            if (!name || !app_name) {
                return res.status(400).json({ error: "missing_required_fields" });
            }

            // group_id が指定された場合、ユーザーがそのグループのownerであることを検証
            let validatedGroupId: string | null = null;
            if (group_id) {
                const leaderGroups = await getLeaderGroupIds(user.id);
                if (!leaderGroups.includes(group_id)) {
                    return res.status(403).json({ error: "not_group_owner" });
                }
                validatedGroupId = group_id;
            }

            let projectUuid: string;
            let storagePath: string;

            if (storage_uploaded) {
                // 大容量フロー: クライアントが署名付きURLで直接アップロード済み
                if (!project_id || !storage_path) {
                    return res.status(400).json({ error: "missing_required_fields", detail: "storage_uploaded requires project_id and storage_path" });
                }
                projectUuid = project_id;
                storagePath = storage_path;

                // Storage にファイルが存在するか確認
                const exists = await fileExists(storagePath);
                if (!exists) {
                    return res.status(400).json({ error: "storage_file_not_found", detail: "Upload the file to storage before creating the project" });
                }
            } else {
                // 従来フロー: リクエストボディにデータ含む
                if (!data) {
                    return res.status(400).json({ error: "missing_required_fields" });
                }

                const crypto = await import("crypto");
                projectUuid = crypto.randomUUID();
                storagePath = buildProjectJsonPath(user.id, projectUuid);

                const { error: storageError } = await uploadProjectJson(storagePath, data, false);
                if (storageError) {
                    logger.error("Project storage upload failed", storageError, { userId: user.id, storagePath });
                    throw storageError;
                }
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

            // DB へ保存
            const { data: project, error: dbError } = await supabaseAdmin
                .from("projects")
                .insert({
                    id: projectUuid,
                    user_id: user.id,
                    name,
                    storage_path: storagePath,
                    thumbnail_path: thumbnailPath,
                    app_name,
                    group_id: validatedGroupId,
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
