# Productiecode Split-Map - 2026-02-27

## 1) Doel en scope
- Doel: **alle productiecode <= 1000 regels per bestand**.
- Scope productiecode:
  - `mcp-server/server.ts`
  - `mcp-server/src/**/*.ts` (exclusief `*.test.ts`)
  - `mcp-server/ui/lib/**/*.ts`
- Huidige overschrijders:
  - `src/handlers/run_step_runtime.ts` (2127)
  - `ui/lib/ui_actions.ts` (1438)
  - `ui/lib/ui_render.ts` (1126)
  - `src/core/turn_policy_renderer.ts` (1105)
  - `src/i18n/ui_strings_catalog.ts` (1104)
  - `src/handlers/specialist_dispatch.ts` (1019)

## 2) Anti-glue regels (hard)
- Maximaal 1 facade per domeinbestand (bijv. `ui_actions.ts`, `ui_render.ts`, `turn_policy_renderer.ts`).
- Geen pass-through bestanden die alleen doorgeven/re-exporten in runtime-pad.
- Nieuwe modules moeten **eigen logica** bevatten (geen wrappers van <30 regels), behalve expliciete entrypoints (`server.ts`).
- Geen barrel-spaghetti in kritieke paden (`handlers`, `ui/lib`): imports moeten direct naar ownership-modules wijzen.
- Elke split moet tests/gates in dezelfde PR-slice meenemen.

## 3) Concrete split-map per overschrijder

### A. `src/handlers/run_step_runtime.ts` (2127 -> target facade <= 700)
Te splitsen concerns:
- runtime idempotency helpers (`runtimeIdempotencyDelayMs`, `stableHashValue`, registry mark/purge/attach)
- main `run_step(...)` orchestratie
- specialist-safe gateway wrapper (`callSpecialistStrictSafe`)

Nieuwe modules:
- `src/handlers/run_step_runtime_idempotency.ts` (target 250-350)
  - verhuist: hash/scope/registry helpers + diagnostics attach.
- `src/handlers/run_step_runtime_orchestrator.ts` (target 500-700)
  - verhuist: hoofdflow uit `run_step(...)` (preflight -> routing -> special routes -> pipeline).
- `src/handlers/run_step_runtime_specialist_gateway.ts` (target 120-220)
  - verhuist: `callSpecialistStrictSafe` wrapper + type-bridging naar `RunStepError`.

Resultaat:
- `run_step_runtime.ts` houdt alleen wiring + export `run_step`.

### B. `src/handlers/specialist_dispatch.ts` (1019 -> target facade <= 350)
Te splitsen concerns:
- grote specialist-branching (`if specialist === ...`)
- transient fallback/error payload builders
- safe wrapper/factory exports

Nieuwe modules:
- `src/handlers/specialist_dispatch_registry.ts` (target 450-650)
  - bevat specialist-specifieke call-configs (step_0, dream, purpose, ... presentation).
- `src/handlers/specialist_dispatch_fallbacks.ts` (target 220-320)
  - `buildTransientFallbackSpecialist`, `buildRateLimitErrorPayload`, `buildTimeoutErrorPayload`.
- `src/handlers/specialist_dispatch_safe.ts` (target 180-280)
  - `callSpecialistStrictSafe` + routing/shadow logging.

Resultaat:
- `specialist_dispatch.ts` blijft API-facade met concrete exports, zonder duplicated logic.

### C. `ui/lib/ui_actions.ts` (1438 -> target facade <= 500)
Te splitsen concerns:
- bridge/origin/security/sanitize/postMessage transport
- ingest/order/hydration/cache decision engine
- dispatch runner (`callRunStep`) en UI loading/notices

Nieuwe modules:
- `ui/lib/actions/bridge_transport.ts` (target 350-500)
  - origin resolve, trust checks, bridge response map, `callToolViaBridge`.
- `ui/lib/actions/payload_ingest.ts` (target 350-500)
  - ordering tuple checks, quality scoring, fail-closed ingest/cache update.
- `ui/lib/actions/dispatch_run_step.ts` (target 300-450)
  - `callRunStep` flow: payload opbouw, timeout, response ingest, ack handling.
- `ui/lib/actions/ui_feedback.ts` (target 120-220)
  - `setLoading`, `setInlineNotice`, rate-limit state.

Resultaat:
- `ui_actions.ts` blijft publiek contract (init/config + exports), geen lange interne branches meer.

### D. `ui/lib/ui_render.ts` (1126 -> target facade <= 450)
Te splitsen concerns:
- prestart/blocked rendering
- dream scoring view (grootste branch)
- interactieve standaard-render en DOM-updates

Nieuwe modules:
- `ui/lib/render/render_prestart_blocked.ts` (target 220-350)
  - prestart shell/content + blocked shell.
- `ui/lib/render/render_dream_scoring.ts` (target 350-550)
  - scoring panel + score input lifecycle + continue action.
- `ui/lib/render/render_interactive_main.ts` (target 300-450)
  - interactieve body/prompt/actions/panels.
- `ui/lib/render/render_shared_dom.ts` (target 120-220)
  - gedeelde DOM helperfuncties (`appendTextNode`, stepper helpers, etc.).

Resultaat:
- `ui_render.ts` houdt alleen `render(...)` orchestratie en high-level mode switching.

### E. `src/core/turn_policy_renderer.ts` (1105 -> target facade <= 450)
Te splitsen concerns:
- status-engine per step
- menu/action contract resolver
- message/headline composition incl. off-topic en strategy context
- step_0 specifieke contractflow

Nieuwe modules:
- `src/core/turn_policy/status_engine.ts` (target 350-500)
  - `computeStatus`, strategy statement parsing/deduping.
- `src/core/turn_policy/menu_resolver.ts` (target 280-420)
  - `resolveMenuContract`, labels/key mapping, confirm filtering.
- `src/core/turn_policy/message_builder.ts` (target 220-340)
  - headline/prompt/message construction.
- `src/core/turn_policy/step0_policy.ts` (target 180-260)
  - step_0 confirm/question/menu logic.

Resultaat:
- `turn_policy_renderer.ts` blijft publieke policy-entry (`renderFreeTextTurnPolicy`).

### F. `src/i18n/ui_strings_catalog.ts` (1104 -> target index <= 220)
Te splitsen concerns:
- momenteel 11 locale-blokken in 1 bestand.

Nieuwe modules:
- `src/i18n/ui_strings/locales/ui_strings_en.ts`
- `src/i18n/ui_strings/locales/ui_strings_es.ts`
- `src/i18n/ui_strings/locales/ui_strings_pt_br.ts`
- `src/i18n/ui_strings/locales/ui_strings_fr.ts`
- `src/i18n/ui_strings/locales/ui_strings_de.ts`
- `src/i18n/ui_strings/locales/ui_strings_hi.ts`
- `src/i18n/ui_strings/locales/ui_strings_ja.ts`
- `src/i18n/ui_strings/locales/ui_strings_id.ts`
- `src/i18n/ui_strings/locales/ui_strings_it.ts`
- `src/i18n/ui_strings/locales/ui_strings_nl.ts`
- `src/i18n/ui_strings/locales/ui_strings_ko.ts`
- `src/i18n/ui_strings/locales/ui_strings_zh_hans.ts`
- `src/i18n/ui_strings_catalog.ts` als index/assembler.

Resultaat:
- indexbestand klein en leesbaar; locale data per file onderhoudbaar.

## 4) Glue-reductie (gericht opruimen)
Deze bestanden zijn klein en mogen niet vermeerderen:
- `src/core/menu_contract.ts` (6 regels): re-export-only -> **opruimen** door directe imports op `ui_contract_matrix.ts`.
- `src/handlers/run_step_runtime_post_pipeline.ts` (11 regels): wrapper -> **inlijnen** in `run_step_pipeline.ts` of `run_step_runtime_orchestrator.ts`.

Bewust te behouden:
- `server.ts` (entrypoint wrapper) blijft klein.
- `src/handlers/run_step.ts` mag klein blijven als publieke runtime-entry.

## 5) Uitvoering in PR-slices
1. Slice A: `ui_strings_catalog` locale split (laag risico, veel LOC winst).
2. Slice B: `specialist_dispatch` + `run_step_runtime` idempotency/gateway extract.
3. Slice C: `run_step_runtime` orchestrator extract + wrapper cleanup.
4. Slice D: `ui_actions` split (transport/ingest/dispatch/feedback).
5. Slice E: `ui_render` + `turn_policy_renderer` split.

## 5.1) Voortgang
- [done] Slice A
  - `src/i18n/ui_strings_catalog.ts` -> locale modules opgesplitst.
- [done] Slice B
  - `src/handlers/specialist_dispatch.ts` opgesplitst met:
    - `specialist_dispatch_fallbacks.ts`
    - `specialist_dispatch_safe.ts`
  - `src/handlers/run_step_runtime.ts` idempotency extract:
    - `run_step_runtime_idempotency.ts`
- [todo] Slice C
- [todo] Slice D
- [todo] Slice E

## 6) Gates voor deze split-run
- Typecheck:
  - `cd mcp-server && npm run typecheck`
- Server-refactor gate:
  - `cd mcp-server && npm run gate:server-refactor`
- Productiecode >1000 check:
  - `rg --files mcp-server -g '*.ts' -g '!**/node_modules/**' | rg -v '\\.test\\.ts$' | xargs wc -l | awk '$1>1000 {print $1\" \"$2}'`
- Tiny-wrapper check (anti-glue):
  - `rg --files mcp-server/src mcp-server/ui/lib -g '*.ts' | xargs wc -l | awk '$1<30 {print $1\" \"$2}'`

## 7) Acceptatiecriteria
- Geen productie `.ts` bestand >1000 regels.
- Geen nieuwe re-export-only runtime bestanden.
- `server.ts` blijft entrypoint-only.
- SSOT contracten/gates blijven groen.
