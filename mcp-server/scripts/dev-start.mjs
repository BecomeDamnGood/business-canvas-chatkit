import { execSync, spawnSync } from "node:child_process";

const port = String(process.env.PORT || "8787").trim() || "8787";

const defaults = {
  LOCAL_DEV: "1",
  BSC_HOLISTIC_POLICY_V2: "1",
  BSC_OFFTOPIC_V2: "1",
  BSC_BULLET_RENDER_V2: "1",
  BSC_WORDING_CHOICE_V2: "1",
  BSC_TIMEOUT_GUARD_V2: "1",
};

function withDefaults(env) {
  const next = { ...env };
  for (const [key, value] of Object.entries(defaults)) {
    if (String(next[key] ?? "").trim() === "") next[key] = value;
  }
  return next;
}

function listListeningPids(targetPort) {
  try {
    const out = execSync(`lsof -nP -t -iTCP:${targetPort} -sTCP:LISTEN`, {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    });
    return String(out || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function commandForPid(pid) {
  try {
    return execSync(`ps -p ${pid} -o command=`, {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

function isLikelyMcpServerCommand(command) {
  const text = String(command || "");
  return text.includes("mcp-server") && (text.includes("server.ts") || text.includes("dist/server.js"));
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function freePortIfOwnedByMcpServer(targetPort) {
  const pids = listListeningPids(targetPort);
  if (!pids.length) return;

  for (const pid of pids) {
    const command = commandForPid(pid);
    if (!isLikelyMcpServerCommand(command)) {
      console.error(
        `[dev-start] Port ${targetPort} is in use by another process (pid=${pid}).\n` +
          `[dev-start] Command: ${command || "<unknown>"}\n` +
          "[dev-start] Stop that process first, then run npm run dev again."
      );
      process.exit(1);
    }
  }

  for (const pid of pids) {
    try {
      process.kill(Number(pid), "SIGTERM");
    } catch {}
  }

  const waitUntil = Date.now() + 5000;
  while (Date.now() < waitUntil) {
    if (!listListeningPids(targetPort).length) return;
    sleep(100);
  }

  console.error(`[dev-start] Could not free port ${targetPort} within timeout.`);
  process.exit(1);
}

function startServer() {
  const env = withDefaults(process.env);
  console.log(
    `[dev-start] Starting local server on port ${port} (LOCAL_DEV=${env.LOCAL_DEV}, policy_v2=${env.BSC_HOLISTIC_POLICY_V2}).`
  );
  const result = spawnSync("node", ["--loader", "ts-node/esm", "server.ts"], {
    stdio: "inherit",
    env: { ...env, PORT: port },
  });
  if (typeof result.status === "number") process.exit(result.status);
  process.exit(1);
}

freePortIfOwnedByMcpServer(port);
startServer();
