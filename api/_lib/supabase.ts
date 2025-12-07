import type { VercelRequest } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

export type AuthenticatedUser = {
  id: string;
  email: string;
};

const supabaseUrl = process.env.SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export async function getUserFromRequest(
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
