import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Buffer } from "node:buffer";
import { handleCorsAndMethods } from "../../_lib/http.js";
import { getUserFromRequest, supabaseAdmin } from "../../_lib/supabase.js";
import { requireSubscription } from "../../_lib/auth-guards.js";
import { logger } from "../../_lib/logger.js";
import { config } from "../../_lib/config.js";
import { getUserGroupIds } from "../../_lib/group.js";
import { resolveAppNameFromRequest } from "../../_lib/request-app-context.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (handleCorsAndMethods(req, res, ["GET"])) {
        return;
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

        const hasSubscription = await requireSubscription(req, res, user, {
            appName: resolveAppNameFromRequest(req),
            source: "project-thumbnail",
        });
        if (!hasSubscription) {
            return;
        }

        const publicUserId = config.publicProjects.userId;
        const userGroupIds = await getUserGroupIds(user.id);

        let query = supabaseAdmin
            .from("projects")
            .select("thumbnail_path")
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

        if (!project.thumbnail_path) {
            return res.status(404).json({ error: "thumbnail_not_found" });
        }

        const { data: fileData, error: downloadError } = await supabaseAdmin.storage
            .from("user_projects")
            .download(project.thumbnail_path);

        if (downloadError) {
            logger.error("thumbnail download error", downloadError, { projectId: id, userId: user.id });
            return res.status(500).json({ error: "download_failed" });
        }

        const arrayBuffer = await fileData.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        res.setHeader("Content-Type", "image/png");
        res.setHeader("Content-Length", buffer.length);
        res.setHeader("Cache-Control", "public, max-age=3600");

        return res.status(200).send(buffer);
    } catch (err: any) {
        logger.error("thumbnail handler error", err as Error, { projectId: id });
        return res.status(500).json({ error: "internal_error", detail: err?.message ?? String(err) });
    }
}
