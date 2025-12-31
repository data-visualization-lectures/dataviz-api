import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * CORS 設定を適用する共通関数
 */
export function setCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin;

  // 許可するドメインの正規表現
  // 1. *.dataviz.jp
  // 2. dataviz.jp
  // 3. localhost: (開発用)
  // 4. *-yuichiyazaki.vercel.app (プレビュー環境)
  const allowedOriginRegex = /^(https:\/\/(.*\.dataviz\.jp|dataviz\.jp)|http:\/\/localhost(:\d+)?|https:\/\/.*-yuichiyazaki\.vercel\.app)$/;

  if (origin && allowedOriginRegex.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  // OPTIONS メソッド（プリフライト）用のヘッダー
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,Authorization,X-Requested-With"
  );

  // OPTIONS リクエストには 200 OK を返して即座に終了させる必要がある（呼び出し側でも処理しているが二重の安全策）
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return true;
  }
  return false;
}
