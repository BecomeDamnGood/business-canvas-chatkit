import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { appendSessionTokenLog, __parseSessionLogDataForTests } from "./session_token_log.js";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bsc-session-log-"));
}

test("session token log creates markdown file and appends turns", () => {
  const dir = tempDir();
  const sessionId = "session-abc";
  const startedAt = "2026-02-17T10:56:00.000Z";

  const first = appendSessionTokenLog({
    sessionId,
    sessionStartedAt: startedAt,
    logDir: dir,
    turn: {
      turn_id: "turn-1",
      timestamp: "2026-02-17T10:56:01.000Z",
      step_id: "step_0",
      specialist: "ValidationAndBusinessName",
      model: "gpt-4o-mini",
      attempts: 1,
      usage: {
        input_tokens: 120,
        output_tokens: 40,
        total_tokens: 160,
        provider_available: true,
      },
    },
  });

  assert.ok(fs.existsSync(first.filePath), "session markdown should exist");
  assert.ok(first.filePath.includes("session-2026-02-17-105600-session-abc.md"));

  const second = appendSessionTokenLog({
    sessionId,
    sessionStartedAt: startedAt,
    filePath: first.filePath,
    turn: {
      turn_id: "turn-2",
      timestamp: "2026-02-17T10:56:10.000Z",
      step_id: "dream",
      specialist: "Dream",
      model: "gpt-4.1",
      attempts: 2,
      usage: {
        input_tokens: 200,
        output_tokens: 100,
        total_tokens: 300,
        provider_available: true,
      },
    },
  });

  assert.equal(second.duplicate, false);
  assert.equal(second.filePath, first.filePath);

  const parsed = __parseSessionLogDataForTests(first.filePath);
  assert.ok(parsed, "machine marker should be parsable");
  assert.equal(parsed?.turns.length, 2);

  const markdown = fs.readFileSync(first.filePath, "utf-8");
  assert.match(markdown, /\| step_0 \| 1 \| 120 \| 40 \| 160 \|/);
  assert.match(markdown, /\| dream \| 1 \| 200 \| 100 \| 300 \|/);
  assert.match(markdown, /- total_tokens: 460/);
});

test("session token log is idempotent for duplicate turn_id", () => {
  const dir = tempDir();
  const sessionId = "session-dedupe";
  const startedAt = "2026-02-17T11:00:00.000Z";

  const first = appendSessionTokenLog({
    sessionId,
    sessionStartedAt: startedAt,
    logDir: dir,
    turn: {
      turn_id: "same-turn",
      timestamp: "2026-02-17T11:00:01.000Z",
      step_id: "purpose",
      specialist: "Purpose",
      model: "gpt-4.1",
      attempts: 1,
      usage: {
        input_tokens: 10,
        output_tokens: 20,
        total_tokens: 30,
        provider_available: true,
      },
    },
  });

  const second = appendSessionTokenLog({
    sessionId,
    sessionStartedAt: startedAt,
    filePath: first.filePath,
    turn: {
      turn_id: "same-turn",
      timestamp: "2026-02-17T11:00:02.000Z",
      step_id: "purpose",
      specialist: "Purpose",
      model: "gpt-4.1",
      attempts: 1,
      usage: {
        input_tokens: 999,
        output_tokens: 999,
        total_tokens: 999,
        provider_available: true,
      },
    },
  });

  assert.equal(second.duplicate, true);
  const parsed = __parseSessionLogDataForTests(first.filePath);
  assert.equal(parsed?.turns.length, 1);
});

test("session token log shows unknown when provider usage is missing", () => {
  const dir = tempDir();
  const result = appendSessionTokenLog({
    sessionId: "session-unknown",
    sessionStartedAt: "2026-02-17T12:00:00.000Z",
    logDir: dir,
    turn: {
      turn_id: "turn-unknown",
      timestamp: "2026-02-17T12:00:05.000Z",
      step_id: "bigwhy",
      specialist: "BigWhy",
      model: "gpt-4.1",
      attempts: 1,
      usage: {
        input_tokens: null,
        output_tokens: null,
        total_tokens: null,
        provider_available: false,
      },
    },
  });

  const markdown = fs.readFileSync(result.filePath, "utf-8");
  assert.match(markdown, /\| bigwhy \| 1 \| unknown \| unknown \| unknown \|/);
  assert.match(markdown, /- total_tokens: unknown/);
});
