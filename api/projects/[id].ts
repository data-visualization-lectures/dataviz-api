// api/projects/[id].ts

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Buffer } from "node:buffer";
import { setCors } from "../_lib/cors.js";
import { getUserFromRequest, supabaseAdmin } from "../_lib/supabase.js";
import { checkSubscription } from "../_lib/subscription.js";
import { logger } from "../_lib/logger.js";

// ================== ハンドラ本体 ==================
export default async function handler(req: VercelRequest, res: VercelResponse) {
    setCors(req, res);

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    const { id } = req.query;
    if (!id || typeof id !== "string") {
        return res.status(400).json({ error: "invalid_id" });
    }

    try {
        const user = await getUserFromRequest(req);
        if (!user) {
            logger.warn("Unauthenticated request to project detail API", { projectId: id });
            return res.status(401).json({ error: "not_authenticated" });
        }

        // サブスクリプションチェック
        const hasSubscription = await checkSubscription(user);
        if (!hasSubscription) {
            logger.info("Subscription required for project detail access", { userId: user.id, projectId: id });
            return res.status(403).json({ error: "subscription_required" });
        }

        // 対象プロジェクトの所有権確認と情報取得
        const { data: project, error: fetchError } = await supabaseAdmin
            .from("projects")
            .select("*")
            .eq("id", id)
            .eq("user_id", user.id) // 所有権チェック
            .single();

        if (fetchError || !project) {
            logger.error("Project not found or access denied", fetchError ?? undefined, { userId: user.id, projectId: id });
            return res.status(404).json({ error: "project_not_found" });
        }

        // GET: プロジェクト詳細(実データ)取得
        if (req.method === "GET") {
            const { data: fileData, error: downloadError } = await supabaseAdmin.storage
                .from("user_projects")
                .download(project.storage_path);

            if (downloadError) {
                logger.error("Project file download failed", downloadError, { userId: user.id, storagePath: project.storage_path });
                throw downloadError;
            }

            const text = await fileData.text();
            let json;
            try {
                json = JSON.parse(text);
            } catch (e) {
                logger.error("Invalid file format in storage", e as Error, { userId: user.id, storagePath: project.storage_path });
                return res.status(500).json({ error: "invalid_file_format" });
            }

            return res.status(200).json(json);
        }

        // PUT: プロジェクト更新 (名前, データ, サムネイル)
        if (req.method === "PUT") {
            const { name, data, thumbnail } = req.body;
            const updates: any = {
                updated_at: new Date().toISOString(),
            };

            if (name) {
                updates.name = name;
            }

            // データ(JSON)更新
            if (data) {
                const buffer = Buffer.from(JSON.stringify(data));
                const { error: storageError } = await supabaseAdmin.storage
                    .from("user_projects")
                    .upload(project.storage_path, buffer, {
                        contentType: "application/json",
                        upsert: true,
                    });

                if (storageError) {
                    logger.error("Project file update failed", storageError, { userId: user.id, storagePath: project.storage_path });
                    throw storageError;
                }
            }

            // サムネイル更新
            if (thumbnail) {
                try {
                    const base64Data = thumbnail.replace(/^data:image\/\w+;base64,/, "");
                    const imageBuffer = Buffer.from(base64Data, "base64");

                    const imagePath = project.thumbnail_path || `${user.id}/${project.id}.png`;

                    const { error: imageUploadError } = await supabaseAdmin.storage
                        .from("user_projects")
                        .upload(imagePath, imageBuffer, {
                            contentType: "image/png",
                            upsert: true,
                        });

                    if (imageUploadError) {
                        logger.warn("Thumbnail update failed", { error: imageUploadError, userId: user.id });
                    } else {
                        updates.thumbnail_path = imagePath;
                    }
                } catch (e) {
                    logger.error("Thumbnail processing error", e as Error, { userId: user.id });
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
            const { error: deleteError } = await supabaseAdmin
                .from("projects")
                .delete()
                .eq("id", id)
                .eq("user_id", user.id);

            if (deleteError) {
                logger.error("Project DB deletion failed", deleteError, { userId: user.id, projectId: id });
                throw deleteError;
            }

            const filesToRemove = [project.storage_path];
            if (project.thumbnail_path) {
                filesToRemove.push(project.thumbnail_path);
            }

            const { error: storageError } = await supabaseAdmin.storage
                .from("user_projects")
                .remove(filesToRemove);

            if (storageError) {
                logger.warn("Project storage removal failed (after DB delete)", { error: storageError, filesToRemove });
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

