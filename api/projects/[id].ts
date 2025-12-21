// api/projects/[id].ts

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Buffer } from "node:buffer";
import { setCors } from "../_lib/cors.js";
import { getUserFromRequest, supabaseAdmin } from "../_lib/supabase.js";
import { checkSubscription } from "../_lib/subscription.js";

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
            return res.status(401).json({ error: "not_authenticated" });
        }

        // サブスクリプションチェック
        const hasSubscription = await checkSubscription(user);
        if (!hasSubscription) {
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
            return res.status(404).json({ error: "project_not_found" });
        }

        // GET: プロジェクト詳細(実データ)取得
        if (req.method === "GET") {
            // Storageからダウンロード
            const { data: fileData, error: downloadError } = await supabaseAdmin.storage
                .from("user_projects")
                .download(project.storage_path);

            if (downloadError) {
                console.error("storage download error", downloadError);
                throw downloadError;
            }

            // ファイルの中身をテキスト(JSON)として取得
            const text = await fileData.text();
            let json;
            try {
                json = JSON.parse(text);
            } catch (e) {
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

            // 名前更新
            if (name) {
                updates.name = name;
            }

            // データ(JSON)更新
            if (data) {
                // Buffer化してStorage上書き
                const buffer = Buffer.from(JSON.stringify(data));
                const { error: storageError } = await supabaseAdmin.storage
                    .from("user_projects")
                    .upload(project.storage_path, buffer, {
                        contentType: "application/json",
                        upsert: true, // 上書き許可
                    });

                if (storageError) {
                    console.error("storage update error", storageError);
                    throw storageError;
                }
            }

            // サムネイル更新
            if (thumbnail) {
                try {
                    // "data:image/png;base64,..." 除去
                    const base64Data = thumbnail.replace(/^data:image\/\w+;base64,/, "");
                    const imageBuffer = Buffer.from(base64Data, "base64");

                    // パス決定: 既存があればそれを使う、なければ新規生成 (基本は {user_id}/{project_id}.png)
                    const imagePath =
                        project.thumbnail_path || `${user.id}/${project.id}.png`;

                    const { error: imageUploadError } = await supabaseAdmin.storage
                        .from("user_projects")
                        .upload(imagePath, imageBuffer, {
                            contentType: "image/png",
                            upsert: true, // 上書き許可
                        });

                    if (imageUploadError) {
                        console.error("thumbnail update error", imageUploadError);
                        // 更新失敗時はログのみ (要件次第でthrow)
                    } else {
                        updates.thumbnail_path = imagePath;
                    }
                } catch (e) {
                    console.error("thumbnail processing error", e);
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
                console.error("project update error", updateError);
                throw updateError;
            }

            return res.status(200).json({ project: updatedProject });
        }

        // DELETE: プロジェクト削除
        if (req.method === "DELETE") {
            // 1. DBから削除
            const { error: deleteError } = await supabaseAdmin
                .from("projects")
                .delete()
                .eq("id", id)
                .eq("user_id", user.id);

            if (deleteError) {
                console.error("project delete error", deleteError);
                throw deleteError;
            }

            // 2. Storageから削除
            // DB削除が成功していれば、Storage削除に失敗しても整合性は致命的ではないがログは残す
            const filesToRemove = [project.storage_path];
            if (project.thumbnail_path) {
                filesToRemove.push(project.thumbnail_path);
            }

            const { error: storageError } = await supabaseAdmin.storage
                .from("user_projects")
                .remove(filesToRemove);

            if (storageError) {
                console.error("storage remove error (after db delete)", storageError);
            }

            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: "Method not allowed" });
    } catch (err: any) {
        console.error("projects/[id] handler error", err);
        return res
            .status(500)
            .json({ error: "internal_error", detail: err?.message ?? String(err) });
    }
}
