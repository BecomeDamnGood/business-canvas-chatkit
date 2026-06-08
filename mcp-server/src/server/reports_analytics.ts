import {
  CloudWatchLogsClient,
  GetQueryResultsCommand,
  StartQueryCommand,
  type ResultField,
} from "@aws-sdk/client-cloudwatch-logs";

const DEFAULT_REGION =
  process.env.AWS_REGION ||
  process.env.AWS_DEFAULT_REGION ||
  "us-east-1";
const DEFAULT_LOG_GROUP =
  process.env.REPORTS_LOG_GROUP ||
  "/aws/apprunner/business-canvas-mcp/197c45cb9b3541f6b650a24162e706b3/application";
const DEFAULT_TIMEZONE = "Europe/Amsterdam";
const MAX_QUERY_WAIT_MS = 30_000;
const QUERY_POLL_INTERVAL_MS = 500;
const MAX_QUERY_ROWS = 10_000;

export const REPORT_STEP_ORDER = [
  { id: "step_0", label: "Stap 1" },
  { id: "dream", label: "Stap 2" },
  { id: "purpose", label: "Stap 3" },
  { id: "bigwhy", label: "Stap 4" },
  { id: "role", label: "Stap 5" },
  { id: "entity", label: "Stap 6" },
  { id: "strategy", label: "Stap 7" },
  { id: "targetgroup", label: "Stap 8" },
  { id: "productsservices", label: "Stap 9" },
  { id: "rulesofthegame", label: "Stap 10" },
  { id: "presentation", label: "Stap 11" },
] as const;

export type ReportStepId = (typeof REPORT_STEP_ORDER)[number]["id"];

export type ReportsSummary = {
  openedSessions: number;
  presentationSessions: number;
  steps: Array<{ id: ReportStepId; label: string; sessions: number }>;
};

export type ReportsDailyRow = {
  date: string;
  openedSessions: number;
  steps: Record<ReportStepId, number>;
};

export type ReportsPayload = {
  range: {
    from: string;
    to: string;
    timezone: string;
    startIso: string;
    endIso: string;
  };
  summary: ReportsSummary;
  daily: ReportsDailyRow[];
};

type ReportsDateRange = {
  from: string;
  to: string;
  timezone: string;
  startMs: number;
  endMs: number;
};

const logsClient = new CloudWatchLogsClient({ region: DEFAULT_REGION });

const dayFormatterCache = new Map<string, Intl.DateTimeFormat>();
const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getDayFormatter(timezone: string): Intl.DateTimeFormat {
  let formatter = dayFormatterCache.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dayFormatterCache.set(timezone, formatter);
  }
  return formatter;
}

function getPartsFormatter(timezone: string): Intl.DateTimeFormat {
  let formatter = partsFormatterCache.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    partsFormatterCache.set(timezone, formatter);
  }
  return formatter;
}

function clampDateLabel(value: string, fallback: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function getTimeZoneOffsetMs(timestampMs: number, timezone: string): number {
  const formatter = getPartsFormatter(timezone);
  const parts = formatter.formatToParts(new Date(timestampMs));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const utcLike = Date.UTC(
    Number(map.year || 0),
    Number(map.month || 1) - 1,
    Number(map.day || 1),
    Number(map.hour || 0),
    Number(map.minute || 0),
    Number(map.second || 0)
  );
  const rounded = Math.floor(timestampMs / 1000) * 1000;
  return utcLike - rounded;
}

function zonedDateTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
  timezone: string
): number {
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const offsetMs = getTimeZoneOffsetMs(utcMs, timezone);
    const nextUtcMs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond) - offsetMs;
    if (nextUtcMs === utcMs) break;
    utcMs = nextUtcMs;
  }
  return utcMs;
}

function resolveDateRange(params: {
  from?: string;
  to?: string;
  timezone?: string;
}): ReportsDateRange {
  const timezone = params.timezone?.trim() || DEFAULT_TIMEZONE;
  const todayLabel = getDayFormatter(timezone).format(new Date());
  const fallbackToDate = todayLabel;
  const fallbackFromDate = shiftDateLabel(fallbackToDate, -13);
  const from = clampDateLabel(params.from || "", fallbackFromDate);
  const to = clampDateLabel(params.to || "", fallbackToDate);
  const fromLabel = from <= to ? from : to;
  const toLabel = to >= from ? to : from;
  const [fromYear, fromMonth, fromDay] = fromLabel.split("-").map(Number);
  const [toYear, toMonth, toDay] = toLabel.split("-").map(Number);
  const startMs = zonedDateTimeToUtcMs(fromYear, fromMonth, fromDay, 0, 0, 0, 0, timezone);
  const endMs = zonedDateTimeToUtcMs(toYear, toMonth, toDay, 23, 59, 59, 999, timezone);
  return {
    from: fromLabel,
    to: toLabel,
    timezone,
    startMs,
    endMs,
  };
}

function shiftDateLabel(dateLabel: string, deltaDays: number): string {
  const [year, month, day] = dateLabel.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function listDateLabels(from: string, to: string): string[] {
  const labels: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    labels.push(cursor);
    cursor = shiftDateLabel(cursor, 1);
  }
  return labels;
}

function normalizeDayLabel(timestamp: string, timezone: string): string {
  const parsed = Date.parse(timestamp.includes("T") ? timestamp : `${timestamp.replace(" ", "T")}Z`);
  if (!Number.isFinite(parsed)) return "";
  return getDayFormatter(timezone).format(new Date(parsed));
}

function fieldsToRecord(fields: ResultField[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const field of fields) {
    if (field.field) record[field.field] = String(field.value ?? "");
  }
  return record;
}

async function runInsightsQuery(
  queryString: string,
  startMs: number,
  endMs: number
): Promise<Record<string, string>[]> {
  const started = await logsClient.send(
    new StartQueryCommand({
      logGroupName: DEFAULT_LOG_GROUP,
      startTime: Math.floor(startMs / 1000),
      endTime: Math.floor(endMs / 1000),
      queryString,
      limit: MAX_QUERY_ROWS,
    })
  );
  const queryId = String(started.queryId || "").trim();
  if (!queryId) {
    throw new Error("CloudWatch query did not return a queryId");
  }

  const deadline = Date.now() + MAX_QUERY_WAIT_MS;
  for (;;) {
    const result = await logsClient.send(new GetQueryResultsCommand({ queryId }));
    if (result.status === "Complete") {
      return (result.results || []).map(fieldsToRecord);
    }
    if (["Failed", "Cancelled", "Timeout", "Unknown"].includes(String(result.status || ""))) {
      throw new Error(`CloudWatch query failed with status ${result.status}`);
    }
    if (Date.now() > deadline) {
      throw new Error(`CloudWatch query timed out after ${MAX_QUERY_WAIT_MS}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, QUERY_POLL_INTERVAL_MS));
  }
}

function toSafeInt(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.trunc(parsed);
}

function buildDailySkeleton(from: string, to: string): ReportsDailyRow[] {
  return listDateLabels(from, to).map((date) => ({
    date,
    openedSessions: 0,
    steps: Object.fromEntries(
      REPORT_STEP_ORDER.map((step) => [step.id, 0])
    ) as Record<ReportStepId, number>,
  }));
}

function aggregateDailyOpened(
  rows: Record<string, string>[],
  timezone: string,
  target: Map<string, ReportsDailyRow>
): void {
  const daySessions = new Map<string, Set<string>>();
  for (const row of rows) {
    const sessionId = String(row.session_id || "").trim();
    const timestamp = String(row["@timestamp"] || "").trim();
    const dayLabel = normalizeDayLabel(timestamp, timezone);
    if (!sessionId || !dayLabel || !target.has(dayLabel)) continue;
    let sessions = daySessions.get(dayLabel);
    if (!sessions) {
      sessions = new Set<string>();
      daySessions.set(dayLabel, sessions);
    }
    sessions.add(sessionId);
  }
  for (const [dayLabel, sessions] of daySessions) {
    const row = target.get(dayLabel);
    if (row) row.openedSessions = sessions.size;
  }
}

function aggregateDailySteps(
  rows: Record<string, string>[],
  timezone: string,
  target: Map<string, ReportsDailyRow>
): void {
  const perDayStep = new Map<string, Map<ReportStepId, Set<string>>>();
  for (const row of rows) {
    const sessionId = String(row.session_id || "").trim();
    const timestamp = String(row["@timestamp"] || "").trim();
    const stepId = String(row.step_id || "").trim() as ReportStepId;
    const dayLabel = normalizeDayLabel(timestamp, timezone);
    if (!sessionId || !dayLabel || !target.has(dayLabel)) continue;
    if (!REPORT_STEP_ORDER.some((step) => step.id === stepId)) continue;
    let steps = perDayStep.get(dayLabel);
    if (!steps) {
      steps = new Map();
      perDayStep.set(dayLabel, steps);
    }
    let sessions = steps.get(stepId);
    if (!sessions) {
      sessions = new Set<string>();
      steps.set(stepId, sessions);
    }
    sessions.add(sessionId);
  }
  for (const [dayLabel, steps] of perDayStep) {
    const row = target.get(dayLabel);
    if (!row) continue;
    for (const step of REPORT_STEP_ORDER) {
      row.steps[step.id] = steps.get(step.id)?.size || 0;
    }
  }
}

export function resolveReportsDateRange(params: {
  from?: string;
  to?: string;
  timezone?: string;
}): ReportsPayload["range"] {
  const range = resolveDateRange(params);
  return {
    from: range.from,
    to: range.to,
    timezone: range.timezone,
    startIso: new Date(range.startMs).toISOString(),
    endIso: new Date(range.endMs).toISOString(),
  };
}

export async function loadReportsPayload(params: {
  from?: string;
  to?: string;
  timezone?: string;
}): Promise<ReportsPayload> {
  const range = resolveDateRange(params);

  const [
    openedSummaryRows,
    stepSummaryRows,
    presentationSummaryRows,
    openedDailyRows,
    stepDailyRows,
  ] = await Promise.all([
    runInsightsQuery(
      `fields session_id
| filter @message like /"event":"app_usage_session_started"/ and ispresent(session_id) and session_id != ""
| stats count_distinct(session_id) as opened_sessions`,
      range.startMs,
      range.endMs
    ),
    runInsightsQuery(
      `fields step_id, session_id
| filter @message like /"event":"app_usage_step_viewed"/ and ispresent(step_id) and step_id != "" and ispresent(session_id) and session_id != ""
| stats count_distinct(session_id) as sessions by step_id`,
      range.startMs,
      range.endMs
    ),
    runInsightsQuery(
      `fields session_id
| filter @message like /"event":"app_usage_presentation_generated"/ and ispresent(session_id) and session_id != ""
| stats count_distinct(session_id) as presentation_sessions`,
      range.startMs,
      range.endMs
    ),
    runInsightsQuery(
      `fields @timestamp, session_id
| filter @message like /"event":"app_usage_session_started"/ and ispresent(session_id) and session_id != ""
| sort @timestamp asc`,
      range.startMs,
      range.endMs
    ),
    runInsightsQuery(
      `fields @timestamp, step_id, session_id
| filter @message like /"event":"app_usage_step_viewed"/ and ispresent(step_id) and step_id != "" and ispresent(session_id) and session_id != ""
| sort @timestamp asc`,
      range.startMs,
      range.endMs
    ),
  ]);

  const openedSessions = toSafeInt(openedSummaryRows[0]?.opened_sessions);
  const presentationSessions = toSafeInt(presentationSummaryRows[0]?.presentation_sessions);
  const stepSummaryMap = new Map<ReportStepId, number>();
  for (const row of stepSummaryRows) {
    const stepId = String(row.step_id || "").trim() as ReportStepId;
    if (!REPORT_STEP_ORDER.some((step) => step.id === stepId)) continue;
    stepSummaryMap.set(stepId, toSafeInt(row.sessions));
  }

  const dailyRows = buildDailySkeleton(range.from, range.to);
  const dailyMap = new Map(dailyRows.map((row) => [row.date, row]));
  aggregateDailyOpened(openedDailyRows, range.timezone, dailyMap);
  aggregateDailySteps(stepDailyRows, range.timezone, dailyMap);

  return {
    range: {
      from: range.from,
      to: range.to,
      timezone: range.timezone,
      startIso: new Date(range.startMs).toISOString(),
      endIso: new Date(range.endMs).toISOString(),
    },
    summary: {
      openedSessions,
      presentationSessions,
      steps: REPORT_STEP_ORDER.map((step) => ({
        id: step.id,
        label: step.label,
        sessions: stepSummaryMap.get(step.id) || 0,
      })),
    },
    daily: dailyRows,
  };
}
