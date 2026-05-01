// api/projects-upload-url.ts

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleCorsAndMethods } from "./_lib/http.js";
import { supabaseAdmin } from "./_lib/supabase.js";
import { requireAuth, requireSubscription } from "./_lib/auth-guards.js";
import { logger } from "./_lib/logger.js";
import {
    buildProjectJsonPath,
    buildThumbnailPath,
    createSignedUploadUrl,
    MAX_UPLOAD_BYTES,
} from "./_lib/projects-storage.js";
import { resolveAppNameFromRequest } from "./_lib/request-app-context.js";
import { resolveScopedAppName } from "./_lib/scope-enforcement.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (handleCorsAndMethods(req, res, ["POST"])) {
        return;
    }

    try {
        const user = await requireAuth(req, res);
        if (!user) return;
        const requestAppName = resolveAppNameFromRequest(req);

        const { project_id, type } = req.body ?? {};

        if (!type || (type !== "data" && type !== "thumbnail")) {
            return res.status(400).json({ error: "missing_or_invalid_type", detail: "type must be 'data' or 'thumbnail'" });
        }

        const hasSubscription = await requireSubscription(req, res, user, {
            appName: requestAppName,
            source: "projects-upload-url",
            enforceScope: false,
        });
        if (!hasSubscription) return;

        const crypto = await import("crypto");
        let projectUuid: string;
        let projectAppName: string | null = null;

        if (project_id) {
            // 既存プロジェクトの所有権チェック
            const { data: existing, error: fetchError } = await supabaseAdmin
                .from("projects")
                .select("id, app_name")
                .eq("id", project_id)
                .eq("user_id", user.id)
                .single();

            if (fetchError || !existing) {
                logger.warn("Upload URL requested for non-owned project", { userId: user.id, projectId: project_id });
                return res.status(404).json({ error: "project_not_found" });
            }

            projectUuid = project_id;
            projectAppName =
                typeof existing.app_name === "string" ? existing.app_name : null;
        } else {
            projectUuid = crypto.randomUUID();
        }

        const hasScopedWriteAccess = await requireSubscription(req, res, user, {
            appName: resolveScopedAppName({
                requestAppName,
                projectAppName,
            }),
            source: "projects-upload-url-write",
        });
        if (!hasScopedWriteAccess) return;

        const storagePath = type === "data"
            ? buildProjectJsonPath(user.id, projectUuid)
            : buildThumbnailPath(user.id, projectUuid);

        const { signedUrl, error: urlError } = await createSignedUploadUrl(storagePath);

        if (urlError || !signedUrl) {
            logger.error("Failed to create signed upload URL", urlError, { userId: user.id, storagePath });
            return res.status(500).json({ error: "signed_url_creation_failed" });
        }

        logger.info("Signed upload URL created", { userId: user.id, projectId: projectUuid, type });

        return res.status(200).json({
            upload_url: signedUrl,
            storage_path: storagePath,
            project_id: projectUuid,
            max_upload_bytes: MAX_UPLOAD_BYTES,
        });
    } catch (err: any) {
        logger.error("Upload URL handler error", err as Error);
        return res
            .status(500)
            .json({ error: "internal_error", detail: err?.message ?? String(err) });
    }
}
