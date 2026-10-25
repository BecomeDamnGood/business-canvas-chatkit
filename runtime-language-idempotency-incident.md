# Runtime language and idempotency repair

## Scope

This document records two production defects found after the shared session-state deployment:

1. an explicit language command could fail after a session language had been selected;
2. an exact retry with the same idempotency key could be rejected as a different request.

The repair is deliberately limited to input preparation, request hashing, and regression coverage. It does not change the canvas steps, specialist prompts, confirmation rules, reporting events, UI, or deployment infrastructure.

## What was wrong

### Explicit language changes

The language parser itself correctly recognized commands such as `language: en`. The runtime did not give that parser the original command, however.

The previous order was:

1. receive the raw user input;
2. send that input to the AI surface corrector using the current session language;
3. replace the user input with the corrected output;
4. resolve the language from the replaced input.

In a Dutch session, the surface corrector could turn `language: en` into `taal: en`. The deterministic parser accepts the documented control syntax `language: en`, but not arbitrary translated control words. The language therefore remained Dutch even though the user had explicitly requested English.

There was a second path before surface correction: an existing session can classify control-like text as a meta instruction and clear it during preflight. A language command could therefore disappear before both surface correction and language resolution. On the prestart screen it could also be stored incorrectly as the latest business-description input.

The earlier repair only tested `resolveLanguageForTurn` directly. That proved the parser worked in isolation, but bypassed the production preprocessing order. Declaring the issue solved on that evidence was not justified.

### Idempotent retries

The shared DynamoDB action registry correctly stores and compares a request hash. The hash input was not stable.

When an incoming state contains no `__client_action_id`, `buildRunStepContext` generates one from a new correlation ID. A retry receives a new correlation ID and therefore a different generated action ID. The state canonicalizer allowed `__client_action_id`, so that temporary value entered the request hash. The same user request and the same idempotency key could consequently produce two different hashes and be rejected as `idempotency_conflict` with reason `payload_mismatch`.

The earlier shared-store tests passed a fixed hash directly to the store. They proved the storage primitive, but did not cover context construction followed by hashing. The existing runtime smoke exposed the defect, but it had not been run before the image was prepared.

## Why this was not acceptable

- Control intent must not be changed by probabilistic text correction before deterministic routing sees it.
- An idempotency comparison must contain stable user intent, not server-generated request metadata.
- Unit tests below the failing integration boundary cannot prove the complete production route.
- A retry rejected as a conflict can interrupt navigation and can make one user action appear as multiple or missing actions in operational data.

## The repair

### Language control before AI correction

`prepareUserInputSurface` now checks the original selected input with `parseExplicitLanguageOverride` before invoking the AI surface corrector. If it is an explicit language command, the original text is returned unchanged with source `language_control`.

Preflight uses that same parser to preserve explicit language commands through meta filtering and excludes them from the buffered business input. This also covers language commands submitted through the widget text action.

The normal language resolver then receives the exact command the user entered, applies the explicit override, refreshes the localized UI state, and lets the existing locale-continuity code discard incompatible cached specialist output.

This keeps one parser as the source of truth. No translated keyword lists or prompt-only guards were added.

### Stable semantic idempotency hash

`__client_action_id` is now excluded from recursive idempotency hash canonicalization, alongside `__request_id` and `__trace_id`.

The action ID remains available for liveness diagnostics and response metadata. It is excluded only from the semantic equality decision. The registry key already identifies the operation by session scope and explicit idempotency key.

User input, current step, input mode, locale hints, and the remaining canonical state still participate in the hash. Reusing a key with different user input therefore remains a conflict.

## Regression proof

The added language regressions exercise the same preflight and preparation functions used by the runtime. They verify that a language command survives meta filtering, does not replace the business input, and remains unchanged before language resolution.

The added idempotency regressions build two complete runtime contexts. They prove that:

- separately generated action IDs do not change the request hash for an otherwise identical retry;
- changing the user message does change the hash.

The runtime smoke is also required as final verification because it starts the server and repeats an actual MCP request through the complete transport path.

The smoke server now sets `LANGUAGE_MODE=detect_once`. Previously `LOCAL_DEV=1` implicitly forced English, so the smoke environment could not validate the production language-selection path.

## Deployment boundary

These are MCP server changes. They require a new AMD64 server image and an App Runner deployment of that image. They do not require publishing a new ChatGPT/OpenAI app version or changing Wix.
