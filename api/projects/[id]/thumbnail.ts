import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Buffer } from "node:buffer";
import { setCors } from "../../_lib/cors.js";
import { getUserFromRequest, supabaseAdmin } from "../../_lib/supabase.js";
import { checkSubscription } from "../../_lib/subscription.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
    setCors(req, res);

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
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

        const hasSubscription = await checkSubscription(user);
        if (!hasSubscription) {
            return res.status(403).json({ error: "subscription_required" });
        }

        const { data: project, error: fetchError } = await supabaseAdmin
            .from("projects")
            .select("thumbnail_path")
            .eq("id", id)
            .eq("user_id", user.id)
            .single();

        if (fetchError || !project) {
            return res.status(404).json({ error: "project_not_found" });
        }

        if (!project.thumbnail_path) {
            return res.status(404).json({ error: "thumbnail_not_found" });
        }

        const { data: fileData, error: downloadError } = await supabaseAdmin.storage
            .from("user_projects")
            .download(project.thumbnail_path);

        if (downloadError) {
            console.error("thumbnail download error", downloadError);
            return res.status(500).json({ error: "download_failed" });
        }

        const arrayBuffer = await fileData.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        res.setHeader("Content-Type", "image/png");
        res.setHeader("Content-Length", buffer.length);
        res.setHeader("Cache-Control", "public, max-age=3600");

        return res.status(200).send(buffer);
    } catch (err: any) {
        console.error("thumbnail handler error", err);
        return res.status(500).json({ error: "internal_error", detail: err?.message ?? String(err) });
    }
}
