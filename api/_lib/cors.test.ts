import test from "node:test";
import assert from "node:assert/strict";

import { setCors } from "./cors.ts";

function createMockResponse() {
  const headers = new Map<string, string>();
  return {
    headers,
    ended: false,
    statusCode: null as number | null,
    setHeader(name: string, value: string) {
      headers.set(name, value);
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    end() {
      this.ended = true;
    },
  };
}

test("setCors allows dataviz and dataprep service origins", () => {
  for (const origin of [
    "https://app.dataviz.jp",
    "https://rawgraphs.dataviz.jp",
    "https://app.dataprep.jp",
    "https://open-refine.dataprep.jp",
  ]) {
    const res = createMockResponse();
    setCors({ headers: { origin }, method: "GET" } as never, res as never);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), origin);
    assert.equal(res.headers.get("Access-Control-Allow-Credentials"), "true");
    assert.match(
      res.headers.get("Access-Control-Allow-Headers") ?? "",
      /\bX-Service-Scope\b/,
    );
  }
});

test("setCors does not allow unrelated origins", () => {
  const res = createMockResponse();
  setCors(
    { headers: { origin: "https://example.com" }, method: "GET" } as never,
    res as never,
  );
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), undefined);
});

test("setCors ends OPTIONS preflight requests", () => {
  const res = createMockResponse();
  const handled = setCors(
    { headers: { origin: "https://app.dataprep.jp" }, method: "OPTIONS" } as never,
    res as never,
  );
  assert.equal(handled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.ended, true);
});
