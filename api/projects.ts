// api/projects.ts

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Buffer } from "node:buffer";
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
            const { name, app_name, data, thumbnail } = req.body;

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

            // 画像保存処理
            let thumbnailPath: string | null = null;
            if (thumbnail) {
                try {
                    // "data:image/png;base64,..." 形式を想定して除去
                    const base64Data = thumbnail.replace(/^data:image\/\w+;base64,/, "");
                    const imageBuffer = Buffer.from(base64Data, "base64");
                    const imagePath = `${user.id}/${projectUuid}.png`;

                    const { error: imageUploadError } = await supabaseAdmin.storage
                        .from("user_projects")
                        .upload(imagePath, imageBuffer, {
                            contentType: "image/png",
                            upsert: false,
                        });

                    if (imageUploadError) {
                        console.error("thumbnail upload error", imageUploadError);
                        // 画像アップロード失敗は致命的エラーにせず、ログに残して続行するか、
                        // もしくはエラーとして返すか。ここでは一旦続行し、DBにはnullを入れる方針も考えられるが、
                        // クライアント側でエラーハンドリングできるようにthrowするのが無難か。
                        // ただし、既にJSONはアップロードされているため、ロールバックが必要になる。
                        // 簡略化のため、ログのみ出力し thumbnailPath は null のまま進める。
                    } else {
                        thumbnailPath = imagePath;
                    }
                } catch (e) {
                    console.error("thumbnail processing error", e);
                }
            }

            // 2. DB へ保存
            const { data: project, error: dbError } = await supabaseAdmin
                .from("projects")
                .insert({
                    id: projectUuid, // Storageと同じIDを使うと管理しやすい
                    user_id: user.id,
                    name,
                    storage_path: storagePath,
                    thumbnail_path: thumbnailPath,
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
