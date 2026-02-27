# MCP Widget Stabilisatie - Run Resultaat (2026-02-27 12:35 CET)

## 1) Hypothese en falsificatie
- Start-hypothese: resterende regressie zit primair in lifecycle/timing/ordering tussen host-ingest en render-transities, niet in MCP metadata.
- Falsificatiepoging:
  - MCP-contract en wrapper-tests opnieuw groen (`mcp_app_contract.test.ts`, `server_safe_string.test.ts`).
  - Geen wijziging nodig in `openai/outputTemplate`, `openai/widgetAccessible`, of `_meta.widget_result` prioriteit.
- Uitkomst: hypothese **bevestigd** voor deze iteratie.
  - Oorzaakpad A: lege `set_globals` kon na eerdere valide state alsnog wait-shell forceren.
  - Oorzaakpad B: `ACTION_START` ack zonder state-advance bleef eindtoestand zonder automatische begrensde recovery.

## 2) 70%-contextbudget (eerste pass)
- Context-universe U: 15 bestanden.
- Eerste pass diep gelezen: **10 bestanden** (binnen 70%-regel).
- Subset:
  1. `mcp-server/ui/lib/main.ts`
  2. `mcp-server/ui/lib/ui_actions.ts`
  3. `mcp-server/ui/lib/ui_render.ts`
  4. `mcp-server/ui/lib/locale_bootstrap_runtime.ts`
  5. `mcp-server/server.ts`
  6. `mcp-server/src/handlers/run_step_runtime.ts`
  7. `mcp-server/src/handlers/run_step_ui_payload.ts`
  8. `mcp-server/src/handlers/turn_contract.ts`
  9. `mcp-server/src/ui_render.test.ts`
  10. `mcp-server/src/mcp_app_contract.test.ts`

## 3) Exacte wijzigingen per bestand
1. `mcp-server/ui/lib/main.ts`
- Toegevoegd: `hasRenderedStateSnapshot()`.
- Gedrag: bij lege `openai:set_globals` payload wordt wait-shell **alleen** gerenderd als er nog geen bruikbare gerenderde state is.
- Bij bestaande state: event wordt gelogd als `[startup_set_globals_empty_payload_ignored]` en bestaande UI blijft staan.

2. `mcp-server/ui/lib/ui_actions.ts`
- Toegevoegd: begrensd recoverypad voor start-ack zonder state-advance.
  - Nieuwe timer/single-flight guard: `START_ACK_RECOVERY_DELAY_MS`, `startAckRecoveryTimer`, `startAckRecoverySignature`.
  - Nieuwe helpers: `clearStartAckRecoveryTimer()`, `scheduleStartAckRecoveryPoll()`.
- Gedrag: bij `[ui_start_dispatch_ack_without_state_advance]` wordt exact 1 automatische `ACTION_BOOTSTRAP_POLL` gepland (geen infinite retry).
- Bij succesvolle start-advance wordt recoverytimer expliciet gecleard.

3. `mcp-server/src/ui_render.test.ts`
- Uitgebreid met sequence-gedreven tests:
  - `handleToolResultAndMaybeScheduleBootstrapRetry converges after empty init payload followed by host payload`.
  - `callRunStep schedules one bootstrap poll when ACTION_START ack has no state advance`.
- Main-source contracttest uitgebreid met assertions op nieuwe startup-empty guard.

4. `mcp-server/ui/step-card.bundled.html`
- UI buildscript uitgevoerd (`node scripts/build-ui.mjs`) om runtime-bundle te synchroniseren met library-code.

## 4) Testresultaten
Lokaal uitgevoerd (verplicht):
1. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts`
- Resultaat: **pass** (101 tests, 0 fail).

2. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts`
- Resultaat: **pass** (164 pass, 0 fail, 1 skipped).

## 5) Ketenbewijs (startup -> start -> tweede scherm)
1. Startup first paint / ingest
- Nieuwe guard voorkomt regressiepad: lege `set_globals` overschrijft geen bestaande valide state.
- Sequence-test bevestigt convergentie: lege init payload gevolgd door host payload hydrateert naar renderbare prestart-state met geldige tuple.

2. Start click / dispatch
- `ACTION_START` blijft exact 1x per klik gedispatched.
- Bij ack zonder state-advance wordt dit niet meer eindtoestand: begrensde auto-recovery poll wordt ingepland.

3. Tweede scherm
- Sequence-test bevestigt dat recovery poll een nieuwere `response_seq` ingest (`6 -> 7`) en state naar volgende interactieve stap (`current_step: purpose`) brengt.
- UI blijft fail-closed bij contractafwijking (bestaand gedrag intact).

## 6) Live checks en blockers
- Live checks (`curl <public-url>`, CloudWatch events) zijn in deze run niet uitvoerbaar door ontbrekende live endpoint-/AWS logtoegang binnen deze omgeving.
- Dit is een externe blocker voor finale end-to-end productievalidatie.

## 7) Restrisico's
- Zonder live host-observatie blijft er residueel risico op host-specifieke eventvolgordes buiten lokale testharnas.
- Recoverypad gebruikt timer + poll; functioneel begrensd, maar gedrag moet nog in echte MCP hostsessies worden gevalideerd.

## 8) Rollback-notes
- Functionele rollback is beperkt tot 3 bestanden:
  - `mcp-server/ui/lib/main.ts`
  - `mcp-server/ui/lib/ui_actions.ts`
  - `mcp-server/src/ui_render.test.ts`
- Herbouw UI bundle na rollback: `cd mcp-server && node scripts/build-ui.mjs`.
