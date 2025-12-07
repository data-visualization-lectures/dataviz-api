// lib/auth.ts
import type { VercelRequest } from "@vercel/node";
import { supabaseAdmin } from "./supabaseAdmin.js";

export type AuthenticatedUser = {
  id: string;
  email: string;
};

/**
 * Authorization: Bearer <access_token> を受け取り、
 * Supabase に問い合わせてユーザー情報を返す
 */
export async function getUserFromRequest(
  req: VercelRequest | Request
): Promise<AuthenticatedUser | null> {
  // ヘッダの取り方を両対応にする（Node/WHATWG Request）
  const authHeader =
    (req as any).headers?.authorization ??
    (typeof (req as any).headers?.get === "function"
      ? (req as any).headers.get("authorization")
      : undefined);

  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = authHeader.slice("bearer ".length);

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