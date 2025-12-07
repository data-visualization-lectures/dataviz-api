import type { VercelResponse } from "@vercel/node";

export function setCors(res: VercelResponse) {
  // 許可するオリジンを固定（auth.dataviz.jp）
  res.setHeader("Access-Control-Allow-Origin", "https://auth.dataviz.jp");

  // 許可するメソッド
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

  // 許可するヘッダ（Authorization が重要）
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
}