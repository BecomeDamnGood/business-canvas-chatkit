# Pre-Deploy Checklist v2 (MCP Bootstrap + Locale Stabilisatie)

Gebruik deze checklist als harde release-gate voor ChatGPT Apps/MCP.
Alle items zijn `pass/fail`.

## 0) Golden Invariants (moet altijd groen zijn)

- [x] Geen lege interactieve kaart: nooit `prompt.body=""` + `options=[]` zonder expliciete waiting/recovery view.
- [x] `ui_gate_status` en `ui.flags` zijn consistent (geen `waiting_locale` met `bootstrap_interactive_ready=true` tenzij expliciet interactive fallback).
- [x] `ACTION_BOOTSTRAP_POLL` zet nooit `state.started="true"`.
- [x] Eenmaal gekozen taal in widget-flow blijft stabiel (geen flip door latere host locale hint).
- [x] `language_locked="true"` wordt nooit overschreven door een locale hint, op geen enkele input mode.
- [x] `ready` betekent renderbaar: prompt of opties of expliciet prestart/welcome view.
- [x] Als incoming state `ui_strings_status="ready"` + `language=X` rapporteert en critical-ready bewijs aanwezig is (`ui_strings_critical_ready="true"` of renderbare critical keys), geeft server niet `waiting_locale` terug voor taal `X`; ontbrekend critical-ready bewijs forceert bewust `pending` + `waiting_locale`.
- [x] `getDefaultState()` is intern consistent: `ui_strings_status` en `ui_strings_critical_ready` zijn nooit tegenstrijdig.

## 1) MCP / JSON-RPC Correctheid

- [x] JSON-RPC envelope is geldig (`jsonrpc`, `id`, `result`/`error`).
- [x] `-32602` wordt alleen gebruikt voor echte protocol/input-schema fouten.
- [x] Herstelbare app-state issues worden als tool-result teruggegeven (niet als protocol-fout), of worden vóór parse genormaliseerd.

## 2) Tool Contract (Compat-First)

- [x] `open_canvas` is template owner (`openai/outputTemplate`) en `visibility=["model","app"]`.
- [x] `run_step` heeft geen `openai/outputTemplate`.
- [x] `run_step` visibility volgt de gekozen compat-first policy (`["model","app"]`) zolang host-hidden-template gedrag dat vereist.
- [x] Toolbeschrijvingen blijven app-first/no-content-in-chat.

## 3) Bootstrap Contract (open_canvas)

- [x] Bootstrap-state wordt via whitelist opgebouwd (geen blind `...sourceState` merge).
- [x] Transient velden worden gereset (`intro_shown_*`, `last_specialist_result`, retry internals).
- [x] `language_source` bevat alleen state-canonieke waarden (`explicit_override|locale_hint|message_detect|persisted|""`).
- [x] `ui_strings_status="ready"` mag alleen als critical keys renderbaar zijn (via state-map of ingebouwde taalfallback).
- [x] Als critical keys niet renderbaar zijn: forceer `pending` + `waiting_locale` (EN is exempt van `waiting_locale` omdat ingebouwde defaults altijd renderbaar zijn).
- [x] `waiting_locale` responses worden niet in de `open_canvas` deduplication-cache opgeslagen, of alleen met TTL `<= 500ms`.

## 4) Locale Chain en Drift-Blokkade

- [x] Prioriteit blijft expliciet: user override > locale seed > persisted > detectie.
- [x] Locale hint op widget-turn overschrijft bestaande/frozen taal niet.
- [x] `language_locked="true"` wordt nooit overschreven door een locale hint, op geen enkele input mode.
- [x] Locked taal wisselt alleen via expliciete user override.
- [x] Logging per turn bevat minimaal: `input_mode`, `locale_hint`, `locale_hint_source`, `resolved_language`, `language_source`, `action`.

## 5) UI Payload Scheiding (Model-safe)

- [x] `structuredContent.result` blijft minimaal en model-safe.
- [x] Widget krijgt rijke payload via `_meta.widget_result` (en/of afgesproken UI object).
- [x] Geen specialist/business/finals in model-zichtbare minimale result-shape.
- [x] Geen secrets/tokens in `structuredContent`, `_meta`, state of UI payload.
- [x] Error-fallback state in `_meta.widget_result.state` bevat geen velden buiten het canonieke `CanvasState` schema.

## 6) Ingest Parity (Bridge + Compat Layer)

- [x] `ui/notifications/tool-result` pad werkt.
- [x] `openai:set_globals` pad merged zowel `toolOutput` als `toolResponseMetadata`.
- [x] Resolver kiest richest-valid-first; freshness wordt alleen als tiebreaker gebruikt als beide kandidaten freshness hebben, en `meta.widget_result` behoudt prioriteit.
- [x] `needs_hydration` heeft precies 1 definitie en wordt gedeeld door render + scheduler.
- [x] `computeHydrationState` bevat geen redundante `needs_hydration` condities (één eenduidige definitie).

## 7) Waiting/Recovery UX

- [x] Waiting is zichtbaar (nooit onverklaarde lege kaart).
- [x] Na max retries verschijnt recovery panel met werkende retry-actie.
- [x] Retry-loop stopt deterministisch na limiet.
- [x] Waiting pad toont geen misleidende interactie-CTA als interactie nog niet mogelijk is.
- [x] Poll-loop stopt direct bij 2 opeenvolgende identieke `ui_gate_status + ui_strings_status` signatures (same-response circuit breaker) en hanteert `max retries <= 3`.
- [x] `ui_gate_since_ms` ouder dan 30s in combinatie met `waiting_locale` triggert server-side force-recover.

## 8) Startflow Contract

- [x] Startknop triggert deterministisch `run_step` met `input_mode="widget"`.
- [x] Poll-acties worden niet als start-intent behandeld.
- [x] Eerste scherm na start is gevuld (geen lege stap 2).
- [x] `ACTION_START` is expliciet afgehandeld in serverflow.
- [x] Eerste render gebruikt taal uit URL-param, meta-tag of `widgetState` en valt niet naar `"en"` terug wanneer locale al geïnjecteerd is.

## 9) Build/Artifact Parity

- [x] Bron en deploy artifacts zijn sync (`ui/lib/*` ↔ bundled html ↔ `dist/ui/*`).
- [x] Deploy gebruikt de juiste platformstring (`linux/amd64` indien amd64 vereist).
- [x] UI resource URI versie (`?v=...`) matcht uitgerolde versie.
- [x] CI faalt op parity mismatch.

## 10) Verplichte E2E Scenarios (staging)

- [x] NL open_canvas start in NL, CTA zichtbaar.
- [x] Startklik naar step_0 ask zonder leeg scherm.
- [x] Daarna host locale hint naar EN op widget-turn: taal blijft NL.
- [x] set_globals-only, bridge-only en mixed-order geven identiek gedrag.
- [x] Inconsistente inputstate (`ui_strings_status=ready` + lege map) wordt correct gerepareerd naar waiting.
- [x] Staging smoke-test meet elapsed time van app-open tot CTA zichtbaar; grenswaarde is `<= 3s`.
- [x] E2E NL-assertie: eerste zichtbare frame van widget bevat NL-tekst (geen EN flashscreen).

## 11) Go/No-Go

- [x] Alle bovenstaande items `pass`.
- [x] Geen stijging in:
  - `ready_without_renderable_ui_count`
  - `poll_started_session_count`
  - `locale_drift_override_blocked_count`/equivalent
  - `hydration_failed_max_retries`
- [x] Handmatige smoke in ChatGPT bevestigd zonder lege kaart, zonder EN-flip, zonder hidden-template warning regressie.
