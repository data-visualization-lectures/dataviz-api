// /api/me.ts

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { setCors } from "./_lib/cors.js";

// ================== Supabase 管理クライアント ==================
const supabaseUrl = process.env.SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// ================== ユーザー取得ヘルパー ==================
type AuthenticatedUser = {
  id: string;
  email: string;
};

async function getUserFromRequest(
  req: VercelRequest
): Promise<AuthenticatedUser | null> {
  const header =
    (req.headers["authorization"] as string | undefined) ??
    (req.headers["Authorization"] as string | undefined);

  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = header.slice("bearer ".length);

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    console.error("getUserFromRequest error", error);
    return null;
  }

  return {
    id: data.user.id,
    email: data.user.email ?? "",
  };
}

// ================== ハンドラ本体 ==================
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS は一番最初に
  setCors(res);

  // Preflight (OPTIONS)
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: "not_authenticated" });
    }

    const { data: subscription, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (subError) {
      console.error("subscriptions error", subError);
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("profiles error", profileError);
    }

    return res.status(200).json({
      user: { id: user.id, email: user.email },
      profile,
      subscription,
    });
  } catch (err: any) {
    console.error("me handler error", err);
    return res
      .status(500)
      .json({ error: "internal_error", detail: err?.message ?? String(err) });
  }
}
