# OpenAI Submission Evidence Pack (2026-03-07)

## 1) structuredContent dataminimalisatie
- Implementatie:
  - `src/server/run_step_transport.ts` (`buildStructuredContentResult`)
  - `src/server/run_step_model_result.ts` (`buildModelSafeResult`)
- Bewijs:
  - `structuredContent.result` is model-safe, geen rijke widgetvelden.
  - Rijke payload blijft in `_meta.widget_result`.
- Tests:
  - `src/server/run_step_transport.security.test.ts`
  - `src/server/run_step_transport_idempotency.test.ts`

## 2) _meta component-only gebruik
- Implementatie:
  - `src/server/run_step_transport.ts`
  - `src/server/run_step_transport_idempotency.ts`
- Bewijs:
  - `_meta.widget_result` bevat render-authority payload.
  - `structuredContent.result` bevat alleen model-safe subset.
- Tests:
  - `src/server/run_step_transport_idempotency.test.ts`

## 3) input/state validatie hardening
- Implementatie:
  - `src/handlers/ingress.ts`
  - `src/handlers/run_step_preflight.ts`
- Bewijs:
  - server-owned transient keys worden gestript uit client-state.
  - session-id/started_at/turn-index worden genormaliseerd.
  - client `__session_log_file` wordt niet vertrouwd.
- Tests:
  - `src/handlers/ingress.test.ts`

## 4) runtime secrets policy
- Implementatie:
  - `src/server/server_config.ts`
  - `src/server/http_routes.ts`
- Bewijs:
  - `.env` loading alleen local dev/test.
  - productie vereist `OPENAI_API_KEY` + geldige secret source.
  - challenge endpoint heeft geen hardcoded fallback token.
- Documentatie:
  - `docs/security/runtime-secrets-policy.md`

## 5) CSP / security headers
- Implementatie:
  - `src/middleware/security.ts`
- Bewijs:
  - `img-src` geen wildcard/http.
  - `unsafe-eval` uit.
  - mixed-content blokkade aan.
- Tests:
  - `src/middleware/security.test.ts`

## 6) rate-limit trust boundary
- Implementatie:
  - `src/middleware/rateLimit.ts`
- Bewijs:
  - proxy headers alleen bij expliciete trust policy.
  - source (`socket` vs proxy headers) wordt gelogd.
- Tests:
  - `src/middleware/rateLimit.test.ts`

## 7) privacy/retentie sessielogs
- Implementatie:
  - `src/core/session_token_log.ts`
- Bewijs:
  - automatische purge op `BSC_SESSION_LOG_RETENTION_DAYS`.
  - expliciete filePath wordt alleen geaccepteerd als exact expected path.
- Tests:
  - `src/core/session_token_log.test.ts`
- Documentatie:
  - `docs/security/session-log-privacy-retention.md`

## 8) tool metadata/annotaties verificatie
- Implementatie:
  - `src/server/mcp_registration.ts`
- Bewijs:
  - metadata is gecentraliseerd in constants en getest.
- Tests:
  - `src/server/mcp_registration.test.ts`

## 9) Test command
- `npm run test:security:compliance`
