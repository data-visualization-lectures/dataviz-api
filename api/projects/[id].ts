// api/projects/[id].ts

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleCorsAndMethods } from "../_lib/http.js";
import { supabaseAdmin } from "../_lib/supabase.js";
import { logger } from "../_lib/logger.js";
import {
    buildThumbnailPath,
    downloadProjectJson,
    removeProjectFiles,
    uploadProjectJson,
    uploadThumbnail,
} from "../_lib/projects-storage.js";
import { requireAuth, requireSubscription } from "../_lib/auth-guards.js";
import { config } from "../_lib/config.js";
import { getUserGroupIds } from "../_lib/group.js";
import { resolveAppNameFromRequest } from "../_lib/request-app-context.js";

// ================== ハンドラ本体 ==================
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (handleCorsAndMethods(req, res, ["GET", "PUT", "DELETE"])) {
        return;
    }

    const { id } = req.query;
    if (!id || typeof id !== "string") {
        return res.status(400).json({ error: "invalid_id" });
    }

    try {
        const user = await requireAuth(req, res);
        if (!user) return;
        const requestAppName = resolveAppNameFromRequest(req);

        // サブスクリプションチェック
        const hasSubscription = await requireSubscription(req, res, user, {
            appName: requestAppName,
            source: "projects-detail",
        });
        if (!hasSubscription) return;

        // GET: パブリックプロジェクト・グループプロジェクトも読み取り可能
        if (req.method === "GET") {
            const publicUserId = config.publicProjects.userId;
            const userGroupIds = await getUserGroupIds(user.id);

            let query = supabaseAdmin
                .from("projects")
                .select("*")
                .eq("id", id);

            const orConditions = [`user_id.eq.${user.id}`];
            if (publicUserId) {
                orConditions.push(`user_id.eq.${publicUserId}`);
            }
            if (userGroupIds.length > 0) {
                orConditions.push(`group_id.in.(${userGroupIds.join(",")})`);
            }
            query = query.or(orConditions.join(","));

            const { data: project, error: fetchError } = await query.single();

            if (fetchError || !project) {
                return res.status(404).json({ error: "project_not_found" });
            }
            const { data, error: downloadError, parseError } = await downloadProjectJson(project.storage_path);

            if (downloadError && !parseError) {
                logger.error("Project file download failed", downloadError, { userId: user.id, storagePath: project.storage_path });
                throw downloadError;
            }

            if (parseError) {
                logger.error("Invalid file format in storage", downloadError as Error, { userId: user.id, storagePath: project.storage_path });
                return res.status(500).json({ error: "invalid_file_format" });
            }

            return res.status(200).json(data);
        }

        // PUT/DELETE: 所有者のみ（パブリックプロジェクトは編集・削除不可）
        const { data: project, error: fetchError } = await supabaseAdmin
            .from("projects")
            .select("*")
            .eq("id", id)
            .eq("user_id", user.id)
            .single();

        if (fetchError || !project) {
            logger.error("Project not found or access denied", fetchError ?? undefined, { userId: user.id, projectId: id });
            return res.status(404).json({ error: "project_not_found" });
        }

        // PUT: プロジェクト更新 (名前, データ, サムネイル)
        if (req.method === "PUT") {
            const { name, data, thumbnail, storage_uploaded } = req.body;
            const updates: any = {
                updated_at: new Date().toISOString(),
            };

            if (name) {
                updates.name = name;
            }

            // データ(JSON)更新
            if (storage_uploaded) {
                // 大容量フロー: クライアントが署名付きURLで直接アップロード済み — Storage操作不要
                logger.info("Storage upload confirmed (direct upload)", { userId: user.id, projectId: id });
            } else if (data) {
                const { error: storageError } = await uploadProjectJson(project.storage_path, data, true);

                if (storageError) {
                    logger.error("Project file update failed", storageError, { userId: user.id, storagePath: project.storage_path });
                    throw storageError;
                }
            }

            // サムネイル更新
            if (thumbnail) {
                const imagePath = project.thumbnail_path || buildThumbnailPath(user.id, project.id);
                const { path, error: imageUploadError } = await uploadThumbnail(
                    thumbnail,
                    imagePath,
                    true
                );

                if (imageUploadError) {
                    logger.warn("Thumbnail update failed", { error: imageUploadError, userId: user.id });
                } else {
                    updates.thumbnail_path = path;
                }
            }

            // DB 更新
            const { data: updatedProject, error: updateError } = await supabaseAdmin
                .from("projects")
                .update(updates)
                .eq("id", id)
                .eq("user_id", user.id)
                .select()
                .single();

            if (updateError) {
                logger.error("Project DB update failed", updateError, { userId: user.id, projectId: id });
                throw updateError;
            }

            logger.info("Project updated successfully", { userId: user.id, projectId: id });
            return res.status(200).json({ project: updatedProject });
        }

        // DELETE: プロジェクト削除
        if (req.method === "DELETE") {
            const filesToRemove = [project.storage_path];
            if (project.thumbnail_path) {
                filesToRemove.push(project.thumbnail_path);
            }

            const { error: storageError } = await removeProjectFiles(filesToRemove);

            if (storageError) {
                logger.error("Project storage removal failed", storageError as Error, { userId: user.id, projectId: id, filesToRemove });
                return res.status(500).json({ error: "storage_delete_failed" });
            }

            const { error: deleteError } = await supabaseAdmin
                .from("projects")
                .delete()
                .eq("id", id)
                .eq("user_id", user.id);

            if (deleteError) {
                logger.error("Project DB deletion failed", deleteError, { userId: user.id, projectId: id });
                throw deleteError;
            }

            logger.info("Project deleted successfully", { userId: user.id, projectId: id });
            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: "Method not allowed" });
    } catch (err: any) {
        logger.error("Projects detail handler error", err as Error, { projectId: id });
        return res
            .status(500)
            .json({ error: "internal_error", detail: err?.message ?? String(err) });
    }
}
