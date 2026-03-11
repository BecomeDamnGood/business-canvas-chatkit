import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import path from "node:path";

import {
  createProcessShutdownController,
  diagnosticsAccessAllowed,
  resolveAllowedMcpCorsOrigin,
  resolveUiAssetPath,
  startServer,
} from "./http_routes.js";

test("resolveUiAssetPath only serves the bundled widget entrypoint", () => {
  const uiDir = path.resolve("/tmp/widget-ui");
  assert.equal(resolveUiAssetPath("/ui/step-card", uiDir), path.join(uiDir, "step-card.bundled.html"));
  assert.equal(
    resolveUiAssetPath("/ui/step-card.bundled.html", uiDir),
    path.join(uiDir, "step-card.bundled.html")
  );
  assert.equal(resolveUiAssetPath("/ui/../secret.txt", uiDir), null);
  assert.equal(resolveUiAssetPath("/ui/%2e%2e/secret.txt", uiDir), null);
  assert.equal(resolveUiAssetPath("/ui/other.js", uiDir), null);
});

test("startServer returns a listening http.Server without monkey-patched listen", async () => {
  const server = await startServer({
    host: "127.0.0.1",
    port: 0,
    registerSignalHandlers: false,
    logger: { log() {}, warn() {}, error() {} },
  });

  try {
    assert.equal(typeof server.close, "function");
    assert.equal(server.listening, true);
    const address = server.address();
    assert.ok(address && typeof address === "object" && address.port > 0);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

test("createProcessShutdownController drains the server and exits cleanly", async () => {
  const server = createServer((_req, res) => {
    res.end("ok");
  });
  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.once("error", reject);
  });
  const exitCodes: number[] = [];
  const controller = createProcessShutdownController(server, {
    shutdownGraceMs: 250,
    exitProcess: (code) => {
      exitCodes.push(code);
    },
    logger: { log() {}, warn() {}, error() {} },
  });

  await controller.handleSignal("SIGTERM");

  assert.equal(server.listening, false);
  assert.deepEqual(exitCodes, [0]);
});

test("diagnosticsAccessAllowed permits local dev without auth", () => {
  assert.equal(
    diagnosticsAccessAllowed({
      isLocalDev: true,
      authorizationHeader: "",
      bearerToken: "",
    }),
    true
  );
});

test("diagnosticsAccessAllowed requires exact bearer token outside local dev", () => {
  assert.equal(
    diagnosticsAccessAllowed({
      isLocalDev: false,
      authorizationHeader: "Bearer secret-123",
      bearerToken: "secret-123",
    }),
    true
  );
  assert.equal(
    diagnosticsAccessAllowed({
      isLocalDev: false,
      authorizationHeader: "Bearer wrong-token",
      bearerToken: "secret-123",
    }),
    false
  );
  assert.equal(
    diagnosticsAccessAllowed({
      isLocalDev: false,
      authorizationHeader: "",
      bearerToken: "",
    }),
    false
  );
});

test("resolveAllowedMcpCorsOrigin only allows exact configured origins", () => {
  const allowed = ["https://claude.ai", "https://chat.example.com"];
  assert.equal(resolveAllowedMcpCorsOrigin("https://claude.ai", allowed), "https://claude.ai");
  assert.equal(resolveAllowedMcpCorsOrigin("https://evil.example.com", allowed), "");
  assert.equal(resolveAllowedMcpCorsOrigin("", allowed), "");
});
