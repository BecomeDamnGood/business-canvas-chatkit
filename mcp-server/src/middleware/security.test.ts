import test from "node:test";
import assert from "node:assert/strict";

import { buildCSPHeader } from "./security.js";

test("CSP header is strict enough for OpenAI app baseline", () => {
  const csp = buildCSPHeader();

  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self' 'unsafe-inline'/);
  assert.match(csp, /style-src 'self' 'unsafe-inline'/);
  assert.match(csp, /img-src 'self' data: blob: https:/);
  assert.match(csp, /object-src 'none'/);
  assert.match(
    csp,
    /frame-src 'self' https:\/\/www\.youtube\.com https:\/\/www\.youtube-nocookie\.com https:\/\/youtu\.be https:\/\/app\.heygen\.com/
  );
  assert.match(csp, /upgrade-insecure-requests/);
  assert.match(csp, /block-all-mixed-content/);

  assert.equal(csp.includes("'unsafe-eval'"), false);
  assert.equal(csp.includes("img-src *"), false);
  assert.equal(csp.includes("http:"), false);
});
