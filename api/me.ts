// /api/me.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { getUserFromRequest } from "../lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await getUserFromRequest(req as any as Request);
  if (!user) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }

  const { data: subscription } = await supabaseAdmin
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  res.status(200).json({
    user: {
      id: user.id,
      email: user.email
    },
    profile,
    subscription
  });
}