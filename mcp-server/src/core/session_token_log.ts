import fs from "node:fs";
import path from "node:path";

export type SessionTurnTokenUsage = {
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  provider_available: boolean;
};

export type SessionTurnLogEntry = {
  turn_id: string;
  timestamp: string;
  step_id: string;
  specialist: string;
  model: string;
  action_code?: string;
  intent_type?: string;
  routing_source?: string;
  latency_ms?: number | null;
  company_name?: string;
  attempts: number;
  usage: SessionTurnTokenUsage;
};

type SessionLogData = {
  session_id: string;
  started_at: string;
  turns: SessionTurnLogEntry[];
};

export type AppendSessionTokenLogParams = {
  sessionId: string;
  sessionStartedAt: string;
  turn: SessionTurnLogEntry;
  logDir?: string;
  filePath?: string;
};

export type AppendSessionTokenLogResult = {
  filePath: string;
  duplicate: boolean;
};

const DATA_MARKER_PREFIX = "SESSION_LOG_DATA:";
const SESSION_LOG_FILE_RE = /^session-\d{4}-\d{2}-\d{2}-\d{6}-[a-zA-Z0-9_-]{1,80}\.md$/;

function normalizeToken(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0) return null;
  return Math.round(value);
}

function normalizeTurn(turn: SessionTurnLogEntry): SessionTurnLogEntry {
  const latencyMsRaw = (turn as any)?.latency_ms;
  const latencyMs =
    typeof latencyMsRaw === "number" && Number.isFinite(latencyMsRaw) && latencyMsRaw >= 0
      ? Math.round(latencyMsRaw)
      : null;
  return {
    turn_id: String(turn.turn_id || "").trim(),
    timestamp: String(turn.timestamp || new Date().toISOString()).trim() || new Date().toISOString(),
    step_id: String(turn.step_id || "").trim() || "unknown",
    specialist: String(turn.specialist || "").trim() || "unknown",
    model: String(turn.model || "").trim() || "unknown",
    action_code: String((turn as any)?.action_code || "").trim(),
    intent_type: String((turn as any)?.intent_type || "").trim(),
    routing_source: String((turn as any)?.routing_source || "").trim(),
    latency_ms: latencyMs,
    company_name: String((turn as any)?.company_name || "").trim() || "UnknownCompany",
    attempts: Number.isFinite(turn.attempts) ? Math.max(0, Math.trunc(turn.attempts)) : 0,
    usage: {
      input_tokens: normalizeToken(turn.usage?.input_tokens),
      output_tokens: normalizeToken(turn.usage?.output_tokens),
      total_tokens: normalizeToken(turn.usage?.total_tokens),
      provider_available: Boolean(turn.usage?.provider_available),
    },
  };
}

function safeSessionId(sessionId: string): string {
  return String(sessionId || "session")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .slice(0, 80) || "session";
}

function toDateParts(iso: string): { yyyyMmDd: string; hhmmss: string } {
  const parsed = new Date(iso);
  const d = Number.isFinite(parsed.getTime()) ? parsed : new Date();
  const yyyy = String(d.getUTCFullYear());
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return { yyyyMmDd: `${yyyy}-${mm}-${dd}`, hhmmss: `${hh}${mi}${ss}` };
}

function defaultLogDir(): string {
  const raw = String(process.env.BSC_SESSION_LOG_DIR || "").trim();
  if (!raw) return path.resolve(process.cwd(), "session-logs");
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

function resolveDefaultFilePath(sessionId: string, startedAt: string, explicitDir?: string): string {
  const logDir = explicitDir && String(explicitDir).trim() ? String(explicitDir).trim() : defaultLogDir();
  const resolvedDir = path.isAbsolute(logDir) ? logDir : path.resolve(process.cwd(), logDir);
  const parts = toDateParts(startedAt);
  const fileName = `session-${parts.yyyyMmDd}-${parts.hhmmss}-${safeSessionId(sessionId)}.md`;
  return path.join(resolvedDir, fileName);
}

function resolveFilePath(sessionId: string, startedAt: string, explicitPath?: string, explicitDir?: string): string {
  const expected = resolveDefaultFilePath(sessionId, startedAt, explicitDir);
  if (!explicitPath || !String(explicitPath).trim()) return expected;
  const candidate = path.resolve(String(explicitPath).trim());
  const expectedResolved = path.resolve(expected);
  const expectedBaseName = path.basename(expectedResolved);
  if (!SESSION_LOG_FILE_RE.test(path.basename(candidate))) return expectedResolved;
  if (path.basename(candidate) !== expectedBaseName) return expectedResolved;
  if (explicitDir && path.dirname(candidate) !== path.dirname(expectedResolved)) return expectedResolved;
  return candidate;
}

function resolveRetentionDays(): number {
  const raw = Number(process.env.BSC_SESSION_LOG_RETENTION_DAYS || 30);
  if (!Number.isFinite(raw) || raw <= 0) return 30;
  return Math.max(1, Math.trunc(raw));
}

function purgeExpiredSessionLogs(logDir: string): void {
  const retentionDays = resolveRetentionDays();
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const resolvedDir = path.isAbsolute(logDir) ? logDir : path.resolve(process.cwd(), logDir);
  if (!fs.existsSync(resolvedDir)) return;
  const names = fs.readdirSync(resolvedDir);
  for (const name of names) {
    if (!SESSION_LOG_FILE_RE.test(name)) continue;
    const filePath = path.join(resolvedDir, name);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      continue;
    }
    if (!Number.isFinite(stat.mtimeMs) || stat.mtimeMs >= cutoffMs) continue;
    try {
      fs.unlinkSync(filePath);
    } catch {
      // best-effort purge; ignore unlink failures
    }
  }
}

function parseDataFromFile(filePath: string): SessionLogData | null {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, "utf-8");
  const marker = content.match(/<!--\s*SESSION_LOG_DATA:([\s\S]*?)\s*-->/);
  if (!marker || !marker[1]) return null;
  try {
    const parsed = JSON.parse(marker[1]) as SessionLogData;
    if (!parsed || typeof parsed !== "object") return null;
    if (!Array.isArray(parsed.turns)) return null;
    return {
      session_id: String(parsed.session_id || "").trim(),
      started_at: String(parsed.started_at || "").trim(),
      turns: parsed.turns.map((turn) => normalizeTurn(turn)),
    };
  } catch {
    return null;
  }
}

function formatToken(value: number | null): string {
  return value === null ? "unknown" : String(value);
}

function formatNullableNumber(value: number | null): string {
  return value === null ? "unknown" : String(value);
}

function aggregateTurnsByStep(turns: SessionTurnLogEntry[]): Map<string, {
  turns: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_unknown: boolean;
  output_unknown: boolean;
  total_unknown: boolean;
}> {
  const map = new Map<string, {
    turns: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    input_unknown: boolean;
    output_unknown: boolean;
    total_unknown: boolean;
  }>();

  for (const turn of turns) {
    const key = String(turn.step_id || "unknown");
    const current = map.get(key) || {
      turns: 0,
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      input_unknown: false,
      output_unknown: false,
      total_unknown: false,
    };

    current.turns += 1;

    if (turn.usage.input_tokens === null) current.input_unknown = true;
    else current.input_tokens += turn.usage.input_tokens;

    if (turn.usage.output_tokens === null) current.output_unknown = true;
    else current.output_tokens += turn.usage.output_tokens;

    if (turn.usage.total_tokens === null) current.total_unknown = true;
    else current.total_tokens += turn.usage.total_tokens;

    map.set(key, current);
  }

  return map;
}

function aggregateGrandTotals(turns: SessionTurnLogEntry[]): {
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
} {
  let input = 0;
  let output = 0;
  let total = 0;
  let inputUnknown = false;
  let outputUnknown = false;
  let totalUnknown = false;

  for (const turn of turns) {
    if (turn.usage.input_tokens === null) inputUnknown = true;
    else input += turn.usage.input_tokens;

    if (turn.usage.output_tokens === null) outputUnknown = true;
    else output += turn.usage.output_tokens;

    if (turn.usage.total_tokens === null) totalUnknown = true;
    else total += turn.usage.total_tokens;
  }

  return {
    input_tokens: inputUnknown ? null : input,
    output_tokens: outputUnknown ? null : output,
    total_tokens: totalUnknown ? null : total,
  };
}

function renderMarkdown(data: SessionLogData): string {
  const updatedAt = new Date().toISOString();
  const turns = [...data.turns].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const stepTotals = aggregateTurnsByStep(turns);
  const grand = aggregateGrandTotals(turns);

  const turnRows = turns.length
    ? turns
      .map((turn) => {
        return `| ${turn.timestamp} | ${turn.turn_id} | ${turn.step_id} | ${turn.specialist} | ${turn.model} | ${turn.action_code} | ${turn.intent_type} | ${turn.routing_source} | ${formatNullableNumber(turn.latency_ms ?? null)} | ${turn.company_name} | ${turn.attempts} | ${formatToken(turn.usage.input_tokens)} | ${formatToken(turn.usage.output_tokens)} | ${formatToken(turn.usage.total_tokens)} |`;
      })
      .join("\n")
    : "| - | - | - | - | - | - | - | - | - | - | - | - | - | - |";

  const stepRows = stepTotals.size
    ? [...stepTotals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([step, totals]) => {
        return `| ${step} | ${totals.turns} | ${formatToken(totals.input_unknown ? null : totals.input_tokens)} | ${formatToken(totals.output_unknown ? null : totals.output_tokens)} | ${formatToken(totals.total_unknown ? null : totals.total_tokens)} |`;
      })
      .join("\n")
    : "| - | 0 | 0 | 0 | 0 |";

  const machineData = JSON.stringify(data);

  return [
    `<!-- ${DATA_MARKER_PREFIX}${machineData} -->`,
    "# Session Token Report",
    "",
    `- session_id: ${data.session_id}`,
    `- started_at: ${data.started_at}`,
    `- updated_at: ${updatedAt}`,
    "",
    "## Turn Log",
    "",
    "| timestamp | turn_id | step | specialist | model | action_code | intent_type | routing_source | latency_ms | company_name | attempts | input_tokens | output_tokens | total_tokens |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    turnRows,
    "",
    "## Step Summary",
    "",
    "| step | turns | input_tokens | output_tokens | total_tokens |",
    "| --- | --- | --- | --- | --- |",
    stepRows,
    "",
    "## Totals",
    "",
    `- input_tokens: ${formatToken(grand.input_tokens)}`,
    `- output_tokens: ${formatToken(grand.output_tokens)}`,
    `- total_tokens: ${formatToken(grand.total_tokens)}`,
    "",
  ].join("\n");
}

function parseSummaryTimestamp(iso: string): string {
  const parsed = new Date(iso);
  const d = Number.isFinite(parsed.getTime()) ? parsed : new Date();
  const yyyy = String(d.getUTCFullYear());
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss} UTC`;
}

function aggregateModelsForSummary(turns: SessionTurnLogEntry[]): {
  modelParts: string[];
  totalTokens: number | null;
  companyName: string;
} {
  const byModel = new Map<string, { total: number; unknown: boolean }>();
  let companyName = "UnknownCompany";
  let totalTokens = 0;
  let totalUnknown = false;
  for (const turn of turns) {
    if (companyName === "UnknownCompany") {
      const candidate = String(turn.company_name || "").trim();
      if (candidate) companyName = candidate;
    }
    const model = String(turn.model || "unknown").trim() || "unknown";
    const current = byModel.get(model) || { total: 0, unknown: false };
    if (turn.usage.total_tokens === null) current.unknown = true;
    else current.total += turn.usage.total_tokens;
    byModel.set(model, current);
    if (turn.usage.total_tokens === null) totalUnknown = true;
    else totalTokens += turn.usage.total_tokens;
  }
  const modelParts = [...byModel.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([model, value]) => `${model} <${value.unknown ? "unknown" : String(value.total)}>`);
  return {
    modelParts,
    totalTokens: totalUnknown ? null : totalTokens,
    companyName,
  };
}

function refreshTempSessionSummary(logDir: string): void {
  const resolvedDir = path.isAbsolute(logDir) ? logDir : path.resolve(process.cwd(), logDir);
  const files = fs.existsSync(resolvedDir)
    ? fs.readdirSync(resolvedDir).filter((name) => /^session-\d{4}-\d{2}-\d{2}-\d{6}-.+\.md$/i.test(name))
    : [];
  const entries = files
    .map((name) => {
      const filePath = path.join(resolvedDir, name);
      const parsed = parseDataFromFile(filePath);
      if (!parsed) return null;
      const turns = [...parsed.turns].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const summary = aggregateModelsForSummary(turns);
      const timestamp = parseSummaryTimestamp(parsed.started_at);
      const models = summary.modelParts.length > 0 ? summary.modelParts.join(" - ") : "unknown <unknown>";
      const totalPart = `Total tokens <${summary.totalTokens === null ? "unknown" : String(summary.totalTokens)}>`;
      return {
        started_at: parsed.started_at,
        line: `${timestamp} - ${summary.companyName || "UnknownCompany"} - ${models} - ${totalPart}`,
      };
    })
    .filter((item): item is { started_at: string; line: string } => Boolean(item))
    .sort((left, right) => left.started_at.localeCompare(right.started_at));
  const summaryFilePath = path.join(resolvedDir, "TEMP-session-summary.log");
  const body = ["TEMP - remove before go-live", ...entries.map((entry) => entry.line), ""].join("\n");
  fs.writeFileSync(summaryFilePath, body, "utf-8");
}

export function appendSessionTokenLog(params: AppendSessionTokenLogParams): AppendSessionTokenLogResult {
  const sessionId = String(params.sessionId || "").trim();
  if (!sessionId) {
    throw new Error("appendSessionTokenLog requires sessionId");
  }
  const sessionStartedAt = String(params.sessionStartedAt || "").trim() || new Date().toISOString();
  const normalizedTurn = normalizeTurn(params.turn);
  if (!normalizedTurn.turn_id) {
    throw new Error("appendSessionTokenLog requires turn.turn_id");
  }

  const filePath = resolveFilePath(sessionId, sessionStartedAt, params.filePath, params.logDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  purgeExpiredSessionLogs(path.dirname(filePath));

  const existing = parseDataFromFile(filePath);
  const base: SessionLogData =
    existing && existing.session_id === sessionId
      ? existing
      : {
        session_id: sessionId,
        started_at: sessionStartedAt,
        turns: [],
      };

  const duplicate = base.turns.some((turn) => turn.turn_id === normalizedTurn.turn_id);
  if (!duplicate) {
    base.turns.push(normalizedTurn);
  }

  fs.writeFileSync(filePath, renderMarkdown(base), "utf-8");
  refreshTempSessionSummary(path.dirname(filePath));
  return { filePath, duplicate };
}

export function __parseSessionLogDataForTests(filePath: string): SessionLogData | null {
  return parseDataFromFile(filePath);
}
