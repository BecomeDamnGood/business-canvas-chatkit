import { DescribeTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

import { safeString } from "../server_safe_string.js";

import {
  BOOTSTRAP_SESSION_REGISTRY_TTL_MS,
  IDEMPOTENCY_ENTRY_TTL_MS,
  SESSION_STATE_TABLE_NAME,
  isLocalDev,
} from "./server_config.js";

export type SharedActionEntry = {
  requestHash: string;
  status: "inflight" | "completed";
  resultForClient?: Record<string, unknown>;
};

export type SharedSessionSnapshot = {
  sessionId: string;
  hostWidgetSessionId: string;
  epoch: number;
  lastResponseSeq: number;
  updatedAtMs: number;
  lastWidgetResult: Record<string, unknown>;
};

type MemoryEntry = Record<string, unknown>;

const useMemoryStore = isLocalDev || process.env.NODE_ENV === "test";
const memoryStore = new Map<string, MemoryEntry>();
let documentClient: DynamoDBDocumentClient | null = null;

function client(): DynamoDBDocumentClient {
  if (!documentClient) {
    documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return documentClient;
}

function expiresAtSeconds(nowMs: number, ttlMs: number): number {
  return Math.floor((nowMs + ttlMs) / 1000);
}

function actionKey(registryKey: string): string {
  return `ACTION#${registryKey}`;
}

function sessionKey(sessionId: string): string {
  return `SESSION#${sessionId}`;
}

function parseJsonRecord(raw: unknown): Record<string, unknown> | undefined {
  const value = safeString(raw).trim();
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function isConditionalFailure(error: unknown): boolean {
  return safeString((error as { name?: unknown } | null)?.name) === "ConditionalCheckFailedException";
}

export async function claimSharedAction(params: {
  registryKey: string;
  scopeKey: string;
  idempotencyKey: string;
  requestHash: string;
  nowMs: number;
}): Promise<{ claimed: boolean; existing: SharedActionEntry | null }> {
  const pk = actionKey(params.registryKey);
  const item = {
    pk,
    record_type: "action",
    scope_key: params.scopeKey,
    idempotency_key: params.idempotencyKey,
    request_hash: params.requestHash,
    status: "inflight",
    updated_at_ms: params.nowMs,
    expires_at: expiresAtSeconds(params.nowMs, IDEMPOTENCY_ENTRY_TTL_MS),
  };

  if (useMemoryStore) {
    const existing = memoryStore.get(pk);
    if (!existing || Number(existing.expires_at) < Math.floor(params.nowMs / 1000)) {
      memoryStore.set(pk, item);
      return { claimed: true, existing: null };
    }
    return {
      claimed: false,
      existing: {
        requestHash: safeString(existing.request_hash),
        status: existing.status === "completed" ? "completed" : "inflight",
        resultForClient: parseJsonRecord(existing.result_json),
      },
    };
  }

  try {
    await client().send(new PutCommand({
      TableName: SESSION_STATE_TABLE_NAME,
      Item: item,
      ConditionExpression: "attribute_not_exists(pk) OR expires_at < :now",
      ExpressionAttributeValues: { ":now": Math.floor(params.nowMs / 1000) },
    }));
    return { claimed: true, existing: null };
  } catch (error) {
    if (!isConditionalFailure(error)) throw error;
  }

  const response = await client().send(new GetCommand({
    TableName: SESSION_STATE_TABLE_NAME,
    Key: { pk },
    ConsistentRead: true,
  }));
  const existing = response.Item;
  if (!existing) {
    return claimSharedAction(params);
  }
  return {
    claimed: false,
    existing: {
      requestHash: safeString(existing.request_hash),
      status: existing.status === "completed" ? "completed" : "inflight",
      resultForClient: parseJsonRecord(existing.result_json),
    },
  };
}

export async function completeSharedAction(params: {
  registryKey: string;
  requestHash: string;
  resultForClient: Record<string, unknown>;
  nowMs: number;
}): Promise<void> {
  const pk = actionKey(params.registryKey);
  const resultJson = JSON.stringify(params.resultForClient);
  if (useMemoryStore) {
    const existing = memoryStore.get(pk);
    if (!existing || existing.request_hash !== params.requestHash) return;
    memoryStore.set(pk, {
      ...existing,
      status: "completed",
      result_json: resultJson,
      updated_at_ms: params.nowMs,
      expires_at: expiresAtSeconds(params.nowMs, IDEMPOTENCY_ENTRY_TTL_MS),
    });
    return;
  }

  try {
    await client().send(new UpdateCommand({
      TableName: SESSION_STATE_TABLE_NAME,
      Key: { pk },
      UpdateExpression:
        "SET #status = :completed, result_json = :result, updated_at_ms = :updated, expires_at = :expires",
      ConditionExpression: "request_hash = :hash",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":completed": "completed",
        ":result": resultJson,
        ":updated": params.nowMs,
        ":expires": expiresAtSeconds(params.nowMs, IDEMPOTENCY_ENTRY_TTL_MS),
        ":hash": params.requestHash,
      },
    }));
  } catch (error) {
    if (!isConditionalFailure(error)) throw error;
  }
}

export async function releaseSharedAction(params: {
  registryKey: string;
  requestHash: string;
}): Promise<void> {
  const pk = actionKey(params.registryKey);
  if (useMemoryStore) {
    const existing = memoryStore.get(pk);
    if (existing?.request_hash === params.requestHash) memoryStore.delete(pk);
    return;
  }
  try {
    await client().send(new DeleteCommand({
      TableName: SESSION_STATE_TABLE_NAME,
      Key: { pk },
      ConditionExpression: "request_hash = :hash AND #status = :inflight",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":hash": params.requestHash, ":inflight": "inflight" },
    }));
  } catch (error) {
    if (!isConditionalFailure(error)) throw error;
  }
}

export async function readSharedSession(sessionId: string): Promise<SharedSessionSnapshot | null> {
  if (!sessionId) return null;
  const pk = sessionKey(sessionId);
  const item = useMemoryStore
    ? memoryStore.get(pk)
    : (await client().send(new GetCommand({
        TableName: SESSION_STATE_TABLE_NAME,
        Key: { pk },
        ConsistentRead: true,
      }))).Item;
  if (!item) return null;
  const lastWidgetResult = parseJsonRecord(item.result_json);
  if (!lastWidgetResult) return null;
  return {
    sessionId,
    hostWidgetSessionId: safeString(item.host_widget_session_id),
    epoch: Number(item.epoch) || 0,
    lastResponseSeq: Number(item.response_seq) || 0,
    updatedAtMs: Number(item.updated_at_ms) || 0,
    lastWidgetResult,
  };
}

export async function nextSharedResponseSeq(sessionId: string, nowMs: number): Promise<number> {
  const pk = sessionKey(sessionId);
  if (useMemoryStore) {
    const existing = memoryStore.get(pk) || { pk, record_type: "session", response_seq: 0 };
    const next = (Number(existing.response_seq) || 0) + 1;
    memoryStore.set(pk, {
      ...existing,
      response_seq: next,
      updated_at_ms: nowMs,
      expires_at: expiresAtSeconds(nowMs, BOOTSTRAP_SESSION_REGISTRY_TTL_MS),
    });
    return next;
  }
  const response = await client().send(new UpdateCommand({
    TableName: SESSION_STATE_TABLE_NAME,
    Key: { pk },
    UpdateExpression:
      "SET record_type = if_not_exists(record_type, :type), updated_at_ms = :updated, expires_at = :expires ADD response_seq :one",
    ExpressionAttributeValues: {
      ":type": "session",
      ":updated": nowMs,
      ":expires": expiresAtSeconds(nowMs, BOOTSTRAP_SESSION_REGISTRY_TTL_MS),
      ":one": 1,
    },
    ReturnValues: "UPDATED_NEW",
  }));
  return Number(response.Attributes?.response_seq) || 1;
}

export async function writeSharedSession(snapshot: SharedSessionSnapshot): Promise<void> {
  const pk = sessionKey(snapshot.sessionId);
  const values = {
    ":type": "session",
    ":host": snapshot.hostWidgetSessionId,
    ":epoch": snapshot.epoch,
    ":seq": snapshot.lastResponseSeq,
    ":updated": snapshot.updatedAtMs,
    ":expires": expiresAtSeconds(snapshot.updatedAtMs, BOOTSTRAP_SESSION_REGISTRY_TTL_MS),
    ":result": JSON.stringify(snapshot.lastWidgetResult),
  };
  if (useMemoryStore) {
    const existing = memoryStore.get(pk);
    const existingEpoch = Number(existing?.epoch) || 0;
    const existingSeq = Number(existing?.response_seq) || 0;
    if (existing && (existingEpoch > snapshot.epoch || existingSeq > snapshot.lastResponseSeq)) return;
    memoryStore.set(pk, {
      pk,
      record_type: "session",
      host_widget_session_id: snapshot.hostWidgetSessionId,
      epoch: snapshot.epoch,
      response_seq: snapshot.lastResponseSeq,
      updated_at_ms: snapshot.updatedAtMs,
      expires_at: values[":expires"],
      result_json: values[":result"],
    });
    return;
  }
  try {
    await client().send(new UpdateCommand({
      TableName: SESSION_STATE_TABLE_NAME,
      Key: { pk },
      UpdateExpression:
        "SET record_type = :type, host_widget_session_id = :host, epoch = :epoch, response_seq = :seq, updated_at_ms = :updated, expires_at = :expires, result_json = :result",
      ConditionExpression:
        "attribute_not_exists(pk) OR attribute_not_exists(epoch) OR epoch < :epoch OR (epoch = :epoch AND response_seq <= :seq)",
      ExpressionAttributeValues: values,
    }));
  } catch (error) {
    if (!isConditionalFailure(error)) throw error;
  }
}

export function sharedStoreBackend(): "memory" | "dynamodb" {
  return useMemoryStore ? "memory" : "dynamodb";
}

export async function assertSharedStoreReady(): Promise<void> {
  if (useMemoryStore) return;
  const response = await client().send(new DescribeTableCommand({
    TableName: SESSION_STATE_TABLE_NAME,
  }));
  if (response.Table?.TableStatus !== "ACTIVE") {
    throw new Error(
      `DynamoDB table ${SESSION_STATE_TABLE_NAME} is not active (status: ${response.Table?.TableStatus || "unknown"})`
    );
  }
}

export function __resetSharedStoreForTests(): void {
  memoryStore.clear();
}
