#!/usr/bin/env node

import crypto from "node:crypto";
import { isDeepStrictEqual } from "node:util";

const DEFAULT_LIVE_BASE = "https://xp8hpu4mmw.us-east-1.awsapprunner.com";
const DEFAULT_LOCAL_BASE = "http://127.0.0.1:8789";

function stripTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function parseArgs(argv) {
  const args = {
    liveBase: DEFAULT_LIVE_BASE,
    localBase: DEFAULT_LOCAL_BASE,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const raw = String(argv[i] || "").trim();
    if (!raw) continue;
    if (raw === "--live-base" && argv[i + 1]) {
      args.liveBase = String(argv[i + 1]);
      i += 1;
      continue;
    }
    if (raw === "--local-base" && argv[i + 1]) {
      args.localBase = String(argv[i + 1]);
      i += 1;
      continue;
    }
    throw new Error(`unknown argument: ${raw}`);
  }
  return {
    liveBase: stripTrailingSlash(args.liveBase),
    localBase: stripTrailingSlash(args.localBase),
  };
}

function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map((item) => sortValue(item));
  if (!value || typeof value !== "object") return value;
  const record = value;
  return Object.keys(record)
    .sort()
    .reduce((acc, key) => {
      acc[key] = sortValue(record[key]);
      return acc;
    }, {});
}

function digest(text) {
  return crypto.createHash("sha256").update(String(text || ""), "utf8").digest("hex");
}

function escapeForRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeHtml(html, bases) {
  let normalized = String(html || "").replace(/\r\n/g, "\n");
  for (const base of bases) {
    if (!base) continue;
    normalized = normalized.replace(new RegExp(escapeForRegExp(base), "g"), "__BASE__");
  }
  normalized = normalized.replace(/https?:\/\/127\.0\.0\.1:\d+/g, "__BASE__");
  normalized = normalized.replace(/https:\/\/xp8hpu4mmw\.us-east-1\.awsapprunner\.com/g, "__BASE__");
  normalized = normalized.replace(/\?v=v\d+\b/g, "?v=__VERSION__");
  normalized = normalized.replace(/>\s+</g, "><");
  normalized = normalized.trim();
  return normalized;
}

function parseVersionText(text) {
  const pairs = {};
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) pairs[key] = value;
  }
  return pairs;
}

async function fetchResource(url, init = undefined) {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${url} -> ${response.status} ${response.statusText}${body ? ` :: ${body.slice(0, 240)}` : ""}`);
  }
  return response;
}

async function fetchVersion(base) {
  const response = await fetchResource(`${base}/version`);
  return {
    text: await response.text(),
  };
}

async function fetchStepCard(base) {
  const response = await fetchResource(`${base}/ui/step-card`);
  return {
    html: await response.text(),
    headers: {
      xUiVersion: String(response.headers.get("x-ui-version") || "").trim(),
    },
  };
}

async function fetchInitialRunStep(base) {
  const response = await fetchResource(`${base}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept": "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "parity-check",
      method: "tools/call",
      params: {
        name: "run_step",
        arguments: {
          current_step_id: "step_0",
          user_message: "",
          input_mode: "widget",
          state: {},
        },
      },
    }),
  });
  return response.json();
}

function summarizeToolResult(payload) {
  const toolResult = toRecord(toRecord(payload).result);
  const structuredContent = toRecord(toolResult.structuredContent);
  const meta = toRecord(toolResult._meta);
  const structuredResult = toRecord(structuredContent.result);
  const widgetResult = toRecord(meta.widget_result);
  const authoritative = Object.keys(widgetResult).length > 0 ? widgetResult : structuredResult;
  const state = toRecord(authoritative.state);
  const ui = toRecord(authoritative.ui);
  const view = toRecord(ui.view);
  const actionContract = toRecord(ui.action_contract);
  const pendingInteraction = toRecord(ui.pending_interaction);
  const actions = Array.isArray(actionContract.actions) ? actionContract.actions : [];

  return sortValue({
    render_source: Object.keys(widgetResult).length > 0 ? "meta.widget_result" : "structuredContent.result",
    current_step_id: String(authoritative.current_step_id || state.current_step || "").trim(),
    language: String(state.language || "").trim(),
    view_mode: String(view.mode || "").trim(),
    action_roles: actions
      .map((action) => String(toRecord(action).role || "").trim())
      .filter(Boolean),
    action_codes: actions
      .map((action) => String(toRecord(action).action_code || "").trim())
      .filter(Boolean),
    pending_interaction: {
      kind: String(pendingInteraction.kind || "").trim(),
      status: String(pendingInteraction.status || "").trim(),
      allowed_action_roles: (Array.isArray(pendingInteraction.allowed_actions) ? pendingInteraction.allowed_actions : [])
        .map((action) => String(toRecord(action).role || "").trim())
        .filter(Boolean),
    },
    canonical_shape: {
      has_structured_result: Object.keys(structuredResult).length > 0,
      has_meta_widget_result: Object.keys(widgetResult).length > 0,
      has_state: Object.keys(state).length > 0,
      has_ui: Object.keys(ui).length > 0,
      has_action_contract: actions.length > 0,
      has_pending_interaction: Object.keys(pendingInteraction).length > 0,
    },
  });
}

function formatMismatch(label, liveValue, localValue) {
  return [
    `[parity_mismatch] ${label}`,
    `  live : ${JSON.stringify(liveValue, null, 2)}`,
    `  local: ${JSON.stringify(localValue, null, 2)}`,
  ].join("\n");
}

async function main() {
  const { liveBase, localBase } = parseArgs(process.argv.slice(2));

  const [liveVersion, localVersion, liveStepCard, localStepCard, liveRunStep, localRunStep] = await Promise.all([
    fetchVersion(liveBase),
    fetchVersion(localBase),
    fetchStepCard(liveBase),
    fetchStepCard(localBase),
    fetchInitialRunStep(liveBase),
    fetchInitialRunStep(localBase),
  ]);

  const liveVersionPairs = sortValue(parseVersionText(liveVersion.text));
  const localVersionPairs = sortValue(parseVersionText(localVersion.text));
  const liveHtml = normalizeHtml(liveStepCard.html, [liveBase, localBase]);
  const localHtml = normalizeHtml(localStepCard.html, [liveBase, localBase]);
  const liveSummary = summarizeToolResult(liveRunStep);
  const localSummary = summarizeToolResult(localRunStep);

  const mismatches = [];

  if (!isDeepStrictEqual(liveVersionPairs, localVersionPairs)) {
    mismatches.push(formatMismatch("version", liveVersionPairs, localVersionPairs));
  }
  if (!isDeepStrictEqual(liveStepCard.headers, localStepCard.headers)) {
    mismatches.push(formatMismatch("ui_headers", liveStepCard.headers, localStepCard.headers));
  }
  if (digest(liveHtml) !== digest(localHtml)) {
    mismatches.push(
      formatMismatch("ui_step_card_sha256", digest(liveHtml), digest(localHtml))
    );
  }
  if (!isDeepStrictEqual(liveSummary, localSummary)) {
    mismatches.push(formatMismatch("run_step_summary", liveSummary, localSummary));
  }

  console.log("[parity_check_targets]", { liveBase, localBase });
  console.log("[parity_check_snapshot]", {
    live: {
      version: liveVersionPairs,
      headers: liveStepCard.headers,
      ui_step_card_sha256: digest(liveHtml),
      run_step_summary: liveSummary,
    },
    local: {
      version: localVersionPairs,
      headers: localStepCard.headers,
      ui_step_card_sha256: digest(localHtml),
      run_step_summary: localSummary,
    },
  });

  if (mismatches.length > 0) {
    console.error(mismatches.join("\n"));
    process.exit(1);
  }

  console.log("[parity_check_passed] live and local are aligned");
}

main().catch((error) => {
  console.error("[parity_check_failed]", error instanceof Error ? error.message : error);
  process.exit(1);
});
