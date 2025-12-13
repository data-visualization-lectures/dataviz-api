// api/projects/[id].ts

import type { VercelRequest, VercelResponse } from "@vercel/node";
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
            const { error: storageError } = await supabaseAdmin.storage
                .from("user_projects")
                .remove([project.storage_path]);

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
