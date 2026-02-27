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

---

# MCP Widget Stabilisatie - Run Resultaat (2026-02-27 14:32 CET, ketenfix pass 2)

## 1) Hypothese en falsificatie
- Werkhypothese uit live-fail v200:
  - Inconsistentie tussen top-level run_step output en `_meta.widget_result` op ordering tuple (met nadruk op `host_widget_session_id`) veroorzaakt lifecycle-race.
- Falsificatie-uitkomst in deze pass:
  - **Gedeeltelijk weerlegd** voor het specifieke bewijs uit `run_step_render_source_selected`.
  - Root-cause observatie: het veld `host_widget_session_id_present` in `run_step_render_source_selected` werd gelogd vanuit request-context i.p.v. de daadwerkelijk gekozen render-source payload.
  - Dat verklaart het patroon `run_step_response:true` + `run_step_render_source_selected:false` zonder dat `_meta.widget_result` per se fout was.
- Nieuwe aanpak in code:
  - Tuple-pariteit wordt nu server-side expliciet afgedwongen tussen `structuredContent.result` en `_meta.widget_result`.
  - Observability logt nu beide tuple-niveaus plus parity-status per response.

## 2) Wijzigingen per bestand
1. `mcp-server/server.ts`
- Toegevoegd:
  - `ensureRunStepOutputTupleParity(...)` om ordering tuple pariteit af te dwingen.
  - `run_step_ordering_tuple_parity` structured log met:
    - top-level tuple compleet ja/nee,
    - `_meta.widget_result` tuple compleet ja/nee,
    - parity match ja/nee.
  - `run_step_output_tuple_parity_patched` structured log wanneer patching nodig is.
- Aangepast:
  - `run_step_render_source_selected.host_widget_session_id_present` baseert nu op geselecteerde render-source tuple i.p.v. request-arg.
  - Zelfde parity-normalisatie toegepast op MCP toolpad en `POST /run_step` bridgepad.

2. `mcp-server/ui/lib/ui_actions.ts`
- Toegevoegd:
  - `buildTupleFailClosedEnvelope(...)`.
- Aangepast ingestpad:
  - Bij tuple-incomplete render-authority payload: logmarker `[ui_ingest_tuple_incomplete_fail_closed]`.
  - Als er al valide tuple-state bestaat: payload wordt gedropt zonder bestaande state te overschrijven.
  - Als er nog geen valide tuple-state bestaat: fail-closed recovery envelope wordt gerenderd (geen stille lege UI).

3. `mcp-server/src/ui_render.test.ts`
- Nieuwe test:
  - `handleToolResultAndMaybeScheduleBootstrapRetry fail-closes tupleless payload before ordering is established`.

4. `mcp-server/src/mcp_app_contract.test.ts`
- Contract/assertion uitbreiding op:
  - render-source tuple-completeness logging,
  - render-source host-session logging uit geselecteerde payload,
  - tuple parity observability en parity-patch helper gebruik.

## 3) Testresultaten
1. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts`
- Resultaat: **pass** (103 pass, 0 fail).

2. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts`
- Resultaat: **pass** (164 pass, 0 fail, 1 skipped).

3. `cd mcp-server && node scripts/build-ui.mjs`
- Resultaat: bundle succesvol opgebouwd.

## 4) Ketenbewijs (startup -> start -> tweede scherm)
1. Startup / ingest:
- Tuple-incomplete payloads gaan nu fail-closed met zichtbare recovery-state en logmarker.
- Bestaande valide state wordt niet weggegooid.

2. Start click / dispatch:
- Bestaande single-dispatch + begrensde start-recovery bleef intact (geen oneindige retry-loop).

3. Server response -> ingest -> volgende render:
- Server pad publiceert nu expliciet tuple-pariteit logs voor top-level vs `_meta.widget_result`.
- Bij mismatch wordt tuple gepatcht voordat response teruggaat naar host/client.

## 5) Live bewijs en blockerstatus
- Live verificatie op gedeployde App Runner en CloudWatch in deze run: **niet uitvoerbaar** binnen huidige omgeving (externe toegang ontbreekt).
- Daardoor is einduitkomst voor UX-definition of done nog **onbeslist**.

## 6) Restrisico en rollback
- Restrisico:
  - Zonder live herhaalruns blijft onzeker of de resterende UX-regressie volledig verdwijnt.
  - Als regressie blijft bestaan ondanks tuple-pariteit, is een nieuwe hypothese nodig rond host event-sequencing/dubbele open lifecycle.
- Rollback:
  - Terugzetten van:
    - `mcp-server/server.ts`
    - `mcp-server/ui/lib/ui_actions.ts`
    - `mcp-server/src/ui_render.test.ts`
    - `mcp-server/src/mcp_app_contract.test.ts`
  - Daarna `cd mcp-server && node scripts/build-ui.mjs`.
