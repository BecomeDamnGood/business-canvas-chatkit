# MCP Widget Stabilisatie - Run Resultaat (2026-02-27 CORE hard-refactor run)

> Status: ARCHIEF (niet normerend sinds 2026-03-01).
> Actieve normbron voor runtime/build-contract: `mcp-server/docs/ui-interface-contract.md`.
> Dit document blijft uitsluitend een historische runlog.

## 0) Samenvatting
- Primary instructie gebruikt: `docs/hard_refactoring_2026-02-27.md`.
- Server geconsolideerd naar 1 canonical mode-beslisser via `buildCanonicalWidgetState(...)`.
- UI gestript naar canonical ingest/renderpad op `_meta.widget_result`; client-side startup/recovery mode-fallbacks verwijderd.
- Observability gecentraliseerd op event `run_step_canonical_view_emitted`.
- Verplicht artefact geleverd: `docs/hard_refactoring_sweep_manifest_2026-02-27.md` (volledige inventory met status per bestand).

## 1) Kernwijzigingen
1. Server canonical mode
- Nieuw: `mcp-server/src/handlers/run_step_canonical_widget_state.ts`.
- `turn_contract.ts` gebruikt canonical builder als enige mode-authority en zet `ui.view.mode` canonical op `prestart|interactive|blocked`.
- Contractfinalisatie schrijft intern `__canonical_view_decision` i.p.v. legacy guard-patch metadata.

2. Response observability
- `run_step_response.ts` logt nu 1 canonical decision event:
  - `run_step_canonical_view_emitted`
  - inclusief mode/invariant/reason + tuple/context velden.

3. UI stripdown
- `ui/lib/locale_bootstrap_runtime.ts` accepteert alleen `_meta.widget_result` als render-authority.
- `ui/lib/main.ts` verwijdert client-side startup wait-shell/recovery bootstrap pad.
- `ui/lib/ui_render.ts` ondersteunt alleen canonical modes (`prestart|interactive|blocked`) en verwijdert client mode-routing op `waiting_locale/recovery/failed`.
- `ui/lib/ui_actions.ts` verwijdert start-ack recovery polling en tuple fail-closed recovery-mode rendering; fail-closed gaat naar blocked.

## 2) Gates en checks
- `cd mcp-server && npm run typecheck` -> PASS.
- `cd mcp-server && npm run gate:hard-refactor` -> PASS.
  - output:
    - `[hard_refactor_gate] passed`
    - `scope files: 115`
    - `manifest entries: 145`

## 3) Openstaand
- Live 5/5 flow-validatie is nog niet in deze omgeving uitgevoerd (geen live host-interactie in deze run).
- `src/ui_render.test.ts` bevat nog legacy fallback/recovery assertions die functioneel niet meer overeenkomen met de nieuwe CORE-only client; aparte testrefactor nodig.

# MCP Widget Stabilisatie - Run Resultaat (2026-02-27 16:05 CET, v203 target)

## 0) Live Update Na Deploy (2026-02-27 13:59 UTC, App Runner v203)
- Live `VERSION` check:
  - `https://xp8hpu4mmw.us-east-1.awsapprunner.com/version` => `VERSION=v203`.
- Geobserveerde failure in productieflow (zelfde sessie `bs_0a77d687-c60b-4767-b3e3-34d219836af9`):
  1. `02d290be-bb5c-4159-82d0-09bd05538767`: `run_step_response` op `step_0` met `ui_view_mode:"prestart"` (verwacht).
  2. `2f39eef2-ba52-4423-9a6f-2a913877436a`: `ACTION_START` accepted, daarna `run_step_response` op `step_0` met `ui_view_mode:"interactive"` (geen step advance).
  3. `fdeabe34-4a51-4813-be36-96b18c340dcc`: opnieuw `ACTION_START` accepted, weer `step_0 + interactive`.
  4. In alle genoemde responses: tuple parity `ok`, render source `meta.widget_result`.
- Nieuwe guard event aanwezig, maar met lege correlation/trace velden:
  - `run_step_view_contract_guard` toont `started:true`, `ui_view_mode:"interactive"`, `has_renderable_content:true`, `invariant_ok:true`, `guard_patch_applied:false`.
- Live UX observatie uit handtest:
  - first paint toont tijdelijk lege/halve card;
  - daarna pas gevuld scherm met startknop.
- Conclusie:
  - De v203 guard-fix is **niet voldoende** voor stabiele end-to-end UX.
  - Eerdere conclusie "bevestigd" is bij live bewijs deels weerlegd.

## 1) Hypothese en falsificatie
- Hypothese: regressie zit in view-contract inconsistentie tussen `started/current_step`, `ui.view.mode` en echte renderbare content.
- Falsificatiebewijs:
  - Guard-event toegevoegd per response: `run_step_view_contract_guard`.
  - Server corrigeert nu inconsistenties deterministisch voor contractcheck.
  - UI heeft laatste fail-safe voor `interactive` zonder content op `step_0`.
- Uitkomst:
  - lokaal contractmatig: **bevestigd**;
  - live UX-stabiliteit: **niet bevestigd / onvolledig** (blank-first-paint blijft reproduceerbaar).

## 2) 70%-contextbudget
- Eerste pass: 10/15 bestanden (verplichte subset).
- Uitbreiding wegens harde blokkade (response-opbouw locatie): +2 bestanden
  - `mcp-server/src/handlers/run_step_response.ts`
  - `mcp-server/src/handlers/run_step_runtime_action_helpers.ts`

## 3) Exacte wijzigingen per bestand
1. `mcp-server/src/handlers/turn_contract.ts`
- Nieuwe serverguard: `enforceRunStepViewContractGuard(...)`.
- Invarianten:
  - `step_0 && started=false` => `ui.view.mode="prestart"` + `ui_action_start="ACTION_START"`.
  - `ui.view.mode="interactive"` vereist renderbare content.
- Recovery:
  - `interactive` zonder content op `step_0` + start-action => force `prestart`.
  - anders force `blocked` + fail-closed statusvelden.
- Guard snapshot wordt aan response gehangen als `__view_contract_guard`.

2. `mcp-server/src/handlers/run_step_response.ts`
- Nieuw structured event per response: `run_step_view_contract_guard` met:
  - `correlation_id`, `session_id`, `step_id` (via log context),
  - `started`, `ui_view_mode`, `has_renderable_content`,
  - `has_start_action`, `invariant_ok`, `violation_reason_code`,
  - `guard_patch_applied`.
- Interne guard metadata wordt na logging verwijderd uit response.

3. `mcp-server/ui/lib/ui_render.ts`
- UI fail-safe toegevoegd:
  - bij `interactive` zonder renderbare content op `step_0` met start-action => render prestart i.p.v. blocked/blank.
  - startknop blijft actief zichtbaar.
  - buiten dit pad blijft blocked recovery-state actief.
- Observability uitgebreid met `recovery_mode` op `ui_contract_interactive_missing_content`.

4. Tests
- `mcp-server/src/handlers/run_step.test.ts`
  - test voor invariant `step_0 + started=false => prestart + ACTION_START`.
  - test voor serverguard patch van interactive-zonder-content.
- `mcp-server/src/ui_render.test.ts`
  - bronassertions voor nieuwe fallback branch.
  - gedragstest: interactive-no-content op `step_0` rendert actionable prestart.
  - gedragstest: start-dispatch vanaf fallback blijft exact 1x.
- `mcp-server/src/mcp_app_contract.test.ts`
  - nieuwe assertions op `run_step_view_contract_guard` event en view-guard contract.
- `mcp-server/src/server_safe_string.test.ts`
  - assertions geactualiseerd naar nieuwe guard/invariant strings.

## 4) Testresultaten
1. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts`
- Resultaat: **pass** (107 pass, 0 fail).

2. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts`
- Resultaat: **pass** (166 pass, 0 fail, 1 skipped).

## 5) Ketenbewijs startup -> start -> tweede scherm
1. Startup / first paint:
- Server forceert nu prestart-contract voor `step_0 + started=false`; UI krijgt geen interactieve lege eindstaat.

2. Start click:
- Bestaande single-dispatch + ack-recovery bleef intact; extra test bevestigt 1x `ACTION_START` dispatch vanuit fallback-prestart.

3. Tweede scherm:
- Bij valide interactieve payload blijft render normaal.
- Bij interactieve payload zonder content converteert keten nu deterministisch naar herstelbare prestart/blocked i.p.v. blank state.

## 6) Live ketenbewijs
- Live validatie is nu deels uitgevoerd op App Runner `v203` (minimaal 1 volledige flow met correlaties).
- Bevinding:
  - geen tuple/parity regressie zichtbaar;
  - geen render-source autoriteitsbreuk zichtbaar;
  - UX breekt nog steeds in first-paint fase (blank/half transient met late herstelrender).
- Openstaand:
  - nog 5-flow matrix nodig met expliciete UI-side events (`ui_contract_interactive_missing_content`, ingest markers) om definitieve root cause te isoleren.

## 7) Restrisico en rollback
- Restrisico:
  - productiehost lifecycle kan nog afwijkend gedrag tonen ondanks lokale contractstabiliteit.
  - `guard_patch_applied` events moeten in steady state naar 0 of incidenteel herstelbaar gaan.
- Rollback:
  - revert wijzigingen in:
    - `mcp-server/src/handlers/turn_contract.ts`
    - `mcp-server/src/handlers/run_step_response.ts`
    - `mcp-server/ui/lib/ui_render.ts`
    - bijbehorende testbestanden.

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
- UI buildpad uitgevoerd (`npm run build`) zodat alleen het minimale runtime artifact (`dist/ui/step-card.bundled.html`) wordt gesynchroniseerd.

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
- Herbouw runtime artifacts na rollback: `cd mcp-server && npm run build`.

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

3. `cd mcp-server && npm run build`
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
  - Daarna `cd mcp-server && npm run build`.

# MCP Widget Stabilisatie - Run Resultaat (2026-02-28 09:40 UTC, action-liveness contractlaag)

## 0) Samenvatting
- Geimplementeerd: structurele Action-Liveness Contractlaag over transport + contract + UI.
- Doel gehaald op code/testniveau:
  - uniforme action lifecycle handling,
  - uniforme server action source voor UI dispatch,
  - expliciete liveness responsevelden,
  - fail-closed UX zonder silent no-op,
  - observability markers/tellers per action.

## 1) Exacte wijzigingen
1. `mcp-server/src/server/run_step_transport_context.ts`
- Nieuwe liveness-types en helpers:
  - `ActionAckStatus`, `ActionLivenessContract`
  - `buildActionLivenessContract(...)`
  - `attachActionLivenessToResult(...)`
  - `hasStateAdvancedByResponseSeq(...)`
- `RunStepContext` uitgebreid met `clientActionId`.

2. `mcp-server/src/server/run_step_transport.ts`
- Liveness-instrumentatie toegevoegd op alle paden:
  - dispatch marker: `run_step_action_liveness_dispatch`
  - ack/advance/error markers: `run_step_action_liveness_ack`, `run_step_action_liveness_advance`, `run_step_action_liveness_explicit_error`
- Counters per marker toegevoegd (`dispatch_count`, `ack_count`, `advance_count`, `explicit_error_count`).
- Early-return paden (idempotency/stale) verrijkt met expliciete livenessvelden.
- Succes/foutpad verrijkt met `ack_status/state_advanced/reason_code/action_code_echo/client_action_id_echo`.

3. `mcp-server/src/server/run_step_transport_stale.ts`
- `StalePreflightResult` uitgebreid met `earlyDropReasonCode` zodat dropped-path expliciete reason-code teruggeeft.

4. `mcp-server/src/server/run_step_model_result.ts`
- Model-safe response verrijkt met livenessvelden (top-level + state mirror `ui_action_liveness`) wanneer aanwezig.

5. `mcp-server/src/handlers/turn_contract.ts`
- `ensureActionLivenessContract(...)` toegevoegd: default/normalisatie van livenessvelden op response/state.
- `ensureUnifiedUiActionContract(...)` toegevoegd:
  - bouwt `ui.action_contract.actions[]` als uniforme server action source met rollen/surfaces.
- Contractassertions uitgebreid:
  - validatie van ack-status domein,
  - reason-code verplicht bij `state_advanced=false`,
  - prestart vereist start-action in action_contract.

6. `mcp-server/ui/lib/main.ts`
- Client dispatch voor knoppen/text submit leest nu roles uit `ui.action_contract.actions[]` via `actionCodeFromRole(...)`.
- Legacy state-key dispatchpad verwijderd uit main-flow.

7. `mcp-server/ui/lib/ui_render.ts`
- Rendering leest choice/start/text-submit acties via action-contract helpers.
- Expliciete liveness-notice rendering toegevoegd (`readActionLiveness(...)`, `livenessNoticeMessage(...)`).

8. `mcp-server/ui/lib/ui_actions.ts`
- Generieke liveness-evaluatie voor alle action dispatches toegevoegd.
- `client_action_id` wordt nu altijd gegenereerd als die ontbreekt.
- Explicit-error handling en begrensde recovery-poll voor no-advance toegevoegd.

9. Testupdates
- `mcp-server/src/ui_render.test.ts`
- `mcp-server/src/mcp_app_contract.test.ts`
- `mcp-server/src/handlers/run_step.test.ts`
- Assertions en scenario's aangepast voor action-contract + livenessvelden.

## 2) Verplichte testcommando's
1. `cd mcp-server && npm run typecheck`
- Resultaat: PASS.

2. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts`
- Resultaat: PASS (106 pass, 0 fail).

3. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts`
- Resultaat: PASS (168 pass, 0 fail, 1 skipped).

## 3) Contract-/ketenbewijs
- Dispatch -> Ack -> Advance/Error is nu expliciet traceerbaar via vaste liveness-markers.
- `ack_status/state_advanced/reason_code/action_code_echo/client_action_id_echo` komt nu structureel mee in response/state.
- UI toont expliciete foutstatus op rejected/timeout/dropped/no-advance en laat geen stille disable/no-op als eindstatus staan.

## 4) Openstaand
- Live 5-flow bewijs (start/menu/confirm/text-submit) met CloudWatch timestamps is nog niet uitgevoerd in deze run.

# MCP Widget Stabilisatie - Run Resultaat (2026-02-28 09:59 CET, action-liveness pass 2)

## 0) Samenvatting
- Deze pass sluit resterende contractgaten:
  1) UI gebruikt nu 1 uniforme action source (`ui.action_contract.actions[]`).
  2) stale rebase policy is niet langer `ACTION_START`-specifiek.
  3) tuple-incomplete ingest fail-closed eindigt expliciet in `blocked` met reason-code.

## 1) Exacte wijzigingen
1. `mcp-server/ui/lib/ui_render.ts`
- Legacy fallback naar `ui.actions` verwijderd uit action-resolutie.
- Choice rendering leest alleen `ui.action_contract.actions[]`.
- Bij legacy actions zonder action-contract: marker `[ui_action_contract_missing_actions]` + expliciete contract-notice.

2. `mcp-server/ui/lib/ui_actions.ts`
- `fallbackStateAdvanced` generiek gemaakt (ordering advance of step-change), zonder start-specifieke uitzondering.
- Marker hernoemd/generaliseerd naar `[ui_action_dispatch_ack_without_state_advance]`.
- Tuple-incomplete fail-close envelope aangepast:
  - `ui_gate_status: "blocked"`,
  - `bootstrap_phase: "failed"`,
  - `reason_code: "incoming_missing_tuple"`,
  - `ui.view.mode: "blocked"`.

3. `mcp-server/src/server/locale_resolution.ts`
- `ACTION_START`-only rebase whitelist verwijderd.
- Rebase policy nu generiek voor alle `ACTION_*`.
- Reason-code genormaliseerd naar `interactive_action`.

4. `mcp-server/src/server/run_step_transport_context.ts`
- Type voor stale policy reason-code aangepast naar `text_input | interactive_action`.

5. Tests
- `mcp-server/src/ui_render.test.ts`
  - asserties aangepast voor generieke marker + blocked tuple-fail-close;
  - legacy action-source tests omgezet naar `ui.action_contract.actions[]`;
  - nieuwe sequence-matrix test: `start/menu/confirm/text-submit` bewijst `dispatch -> ack -> advance`;
  - nieuwe test: `transport_unavailable -> explicit liveness error`.
- `mcp-server/src/mcp_app_contract.test.ts`
  - stale rebase contractassertie aangepast van start-only naar generieke `ACTION_*` policy.

## 2) Verplichte testcommando's
1. `cd mcp-server && npm run typecheck`
- Resultaat: PASS.

2. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts`
- Resultaat: PASS (`108 pass`, `0 fail`).

3. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts`
- Resultaat: PASS (`168 pass`, `0 fail`, `1 skipped`).

## 3) Ketenbewijs
- UI sequence test dekt nu expliciet:
  - `start`,
  - `menu-choice`,
  - `confirm`,
  - `text-submit`.
- Voor elk type wordt bewezen:
  1. action wordt gedispatched (exact 1x),
  2. ack wordt ontvangen met livenessvelden,
  3. `state_advanced=true` of expliciete errorstatus.

## 4) Live/AWS bewijsstatus
- Live hostvalidatie en CloudWatch timestamps zijn in deze run niet uitgevoerd (omgeving zonder live endpoint/AWS toegang).

# MCP Widget Stabilisatie - Run Resultaat (2026-02-28 10:13 UTC, startup + action-liveness invarianten)

## 0) Samenvatting
- Doorgevoerd: structurele ketenfix voor beide regressies:
  1) startup mag niet eindigen in lege/half waiting eindtoestand,
  2) startactie kan niet meer stil "accepted" blijven op `step_0:no_output:NO_MENU`.
- Kernprincipe behouden:
  - SSOT blijft `_meta.widget_result`,
  - ordering tuple blijft leidend,
  - UI blijft dumb (server action-contract + fail-closed rendering).

## 1) Exacte wijzigingen
1. `mcp-server/ui/lib/main.ts`
- Startup canonical watchdog toegevoegd (`STARTUP_CANONICAL_WINDOW_MS=4000`).
- Bij canonical miss: expliciete startup error-state met `reason_code=startup_canonical_payload_missing`.
- Nieuwe observability markers:
  - `[startup_canonical_miss]`
  - `[startup_explicit_error_path]`
  - `[startup_canonical_payload_observed]`

2. `mcp-server/ui/lib/ui_render.ts`
- Interactive-zonder-renderbare-content valt niet meer terug naar prestart masking.
- Fail-closed pad forceert blocked expliciete fout met `reason_code=interactive_content_absent`.

3. `mcp-server/src/server/run_step_transport_context.ts`
- Server-side fallback `client_action_id` toegevoegd voor interactieve actions.
- `client_action_id_echo` wordt non-empty afgedwongen in transport/liveness keten.

4. `mcp-server/src/server/run_step_transport.ts`
- Liveness `reason_code` prioriteert nu `error.reason` boven `error.type` voor explicietere foutreden.

5. `mcp-server/src/handlers/turn_contract.ts`
- Invariant afgedwongen:
  - `step_0 + started=true + contract_id=step_0:no_output:NO_MENU` is contract violation in interactieve client-action context.
- Contract failure payload zet nu consistente `reason_code` in error en state (fail-closed zonder ambiguiteit).

6. Testaanpassingen
- `mcp-server/src/ui_render.test.ts`
- `mcp-server/src/handlers/run_step.test.ts`
- `mcp-server/src/mcp_app_contract.test.ts`
- Nieuwe/gewijzigde assertions dekken startup explicit-error pad, step_0 contract violation pad en non-empty client action echo.

## 2) Verplichte testcommando's
1. `cd mcp-server && npm run typecheck`
- Resultaat: PASS.

2. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts`
- Resultaat: PASS (`108 pass`, `0 fail`).

3. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts`
- Resultaat: PASS (`170 tests`, `169 pass`, `0 fail`, `1 skipped`).

## 3) Ketenbewijs tegen de twee regressies
1. Lege/half startup eindtoestand
- Startup zonder canonical payload blijft niet oneindig in wait shell.
- Binnen watchdog-window volgt deterministisch een expliciete error-state met reason-code.

2. Schijnbaar inactieve startknop
- `step_0 started=true` kan niet meer als succesvolle interactieve no-output respons doorlopen.
- Dit wordt contractueel explicit-error i.p.v. verborgen prestart-herhaling.

3. Uniforme action-liveness
- Interactieve actions hebben non-empty `client_action_id_echo`.
- Foutreden loopt consistent via `reason_code` (incl. `error.reason`).

## 4) Live/AWS bewijsstatus
- CloudWatch queries zijn geprobeerd op `2026-02-28 10:13:55 UTC` voor:
  1) `run_step_request` + `ACTION_START`
  2) `run_step_action_liveness_ack`
- Beide queries faalden met:
  - `Could not connect to the endpoint URL: "https://logs.us-east-1.amazonaws.com/"`
- Conclusie: live timestampbewijs blijft in deze omgeving geblokkeerd door endpointconnectiviteit; lokaal ketenbewijs is volledig geleverd via tests en markers.

# MCP Widget Stabilisatie - Run Resultaat (2026-02-28 11:20 UTC, OpenAI zero-diff sluitingspass, HISTORISCH SUPERSEDED)

## 0) Samenvatting
- Scope uitgevoerd over de volledige widget-keten (descriptor -> transport -> ingest -> render -> liveness -> observability).
- Structurele sluiting gedaan op 3 resterende verschillen:
  1. niet-canonieke ingest fallback verwijderd,
  2. impliciete liveness recoverylaag verwijderd,
  3. server `client_action_id` fallback gegeneraliseerd.
- Historische momentopname in deze pass: compliance-matrix op **0 open gaps**.
- Status is **superseded** door latere runs met aanvullende bewijsvereisten:
  - PR-6 closure gate (`2026-02-28 21:38 UTC`)
  - PR-7 audit (`2026-02-28 21:45 UTC`)
  - PR-8 failsluitingsstatus (`2026-02-28 21:52 UTC`)

## 1) Exacte wijzigingen
1. `mcp-server/ui/lib/ui_actions.ts`
- Canonical ingest-only afgedwongen via `canonicalizeWidgetPayload` zonder `root.result` fallback.
- Auto-recovery bij `accepted + !state_advanced` verwijderd.
- Fail-closed gedrag op missing widget payload blijft expliciet (`ui_ingest_dropped_no_widget_result`, tuple-fail-closed).

2. `mcp-server/src/server/run_step_transport_context.ts`
- Fallback `__client_action_id` nu generiek bij ontbrekende bestaande id:
  - `!existingClientActionId -> buildServerClientActionId({ action, correlationId })`.

3. Testupdates
- `mcp-server/src/mcp_app_contract.test.ts`
  - assertie aangepast naar generieke fallback-match.
- `mcp-server/src/ui_render.test.ts`
  - no-auto-poll verwachting op start no-advance scenario.
  - stronger-cache testcase omgezet naar canonical `_meta.widget_result` envelope.

## 2) Verplichte testcommando's
1. `cd mcp-server && npm run typecheck`
- Resultaat: PASS.

2. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts`
- Resultaat: PASS (`108 pass`, `0 fail`).

3. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts`
- Resultaat: PASS (`170 tests`, `169 pass`, `0 fail`, `1 skipped`).

## 3) Live/AWS observability bewijs (beschikbaar in deze run)
- Loggroep: `/aws/apprunner/business-canvas-mcp/197c45cb9b3541f6b650a24162e706b3/application`.
- Bevestigde timestamps:
  - `2026-02-27T11:52:54Z` (`1772193174646`): `run_step_request` met `action:"text_input"`.
  - `2026-02-27T11:53:01Z` (`1772193181225`): `run_step_request` met `action:"ACTION_START"`.
  - `2026-02-27T11:53:01Z` (`1772193181231`): `run_step_response`.
  - `2026-02-27T11:53:01Z` (`1772193181232`): `run_step_render_source_selected` met `meta_widget_result_authoritative`.
- Queries zonder hits in deze serverloggroep/window:
  - `run_step_action_liveness_dispatch/ack/advance/explicit_error`
  - `startup_canonical`
- Conclusie:
  - serverzijde request/response/render-source is traceerbaar;
  - client-side markers zitten niet in deze loggroep en zijn lokaal via tests afgedekt.

## 4) DoD status
1. Startup hangt niet meer in lege/half eindtoestand
- Gedekt door fail-closed startup/ingest pad + tests.

2. Geen silent no-op voor acties
- Gedekt door expliciete liveness no-advance/error UX; geen impliciete auto-recovery meer.

3. Elke actie eindigt in `state_advanced` of `explicit_error`
- Contractueel afgedwongen en regressietests groen.

4. `client_action_id_echo` non-empty op interactieve paden
- Server fallback gegeneraliseerd en contracttest aangepast.

5. Verplichte tests groen
- Ja (alle 3 commando’s PASS).

6. Historische claim "0 open gaps" in deze pass
- Ja, maar **superseded** door latere runs met strengere audit/evidence-eisen.
- Actuele status staat in:
  - `docs/mcp_widget_regressie_living_rapport.md`, sectie `### Poging 2026-02-28 21:52 UTC (PR-8 structurele failsluiting)`
  - deze file, sectie `## PR-8 failsluitingsstatus`

7. Antwoord op "wat doen we nog anders dan OpenAI?"
- Binnen deze scope en codebasis: **0 functionele/contractuele verschillen**.

# MCP Widget Stabilisatie - Run Resultaat (2026-02-28 20:19 UTC, single-agent onderzoeksrun)

## 0) Scope
- Volledige draaiboekrun uitgevoerd:
  - `3.1.1` t/m `3.3.5` in vaste volgorde.
  - Per item: codebewijs, testbewijs, live/logbewijs of expliciete `evidence_gap`, uitkomst, kansscore, gaplabel.
- Deze sectie is leidend voor actuele status en vervangt eerdere tussenconclusies met `0 open gaps`.

## 1) Verplichte verificatiecommando's
1. `cd mcp-server && npm run typecheck`
- Resultaat: **PASS** (`tsc -p tsconfig.build.json --noEmit && tsc -p tsconfig.ui.json --noEmit`).

2. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts`
- Resultaat: **PASS** (`110 pass`, `0 fail`).

3. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts`
- Resultaat: **PASS** (`170 tests`, `169 pass`, `0 fail`, `1 skipped`).

## 2) Aanvullend reproduceerbaar shape-bewijs
- Commando:
  - `cd mcp-server && node --loader ts-node/esm -e "<resolveWidgetPayload cases>"`
- Uitkomst:
  - `root_structuredContent_widget_result` => `source:"none"`.
  - `root_toolOutput_widget_result` => `source:"meta.widget_result"`.
  - `root_meta_widget_result` => `source:"meta.widget_result"`.
- Relevantie:
  - Bewijst item `3.1.1` (shape-mismatchpad) reproduceerbaar op code-niveau.

## 3) Live/logstatus in deze run
- Timestamp: `2026-02-28T20:19:29Z`.
- AWS queryresultaat:
  - `Could not connect to the endpoint URL: "https://logs.us-east-1.amazonaws.com/"`
- Conclusie:
  - Nieuwe CloudWatch-verificatie in deze omgeving geblokkeerd.
  - Items zonder bruikbaar timestamp-event uit eerdere incidentsets zijn expliciet als `evidence_gap` gelabeld.

## 4) Resultaatsamenvatting
- Totaal items: `15`
- Bevestigd: `2` (`3.1.1`, `3.1.5`)
- Weerlegd: `3` (`3.1.4`, `3.3.2`, `3.3.4`)
- Onbeslist: `10`
- Gapverdeling:
  - `implementation_gap`: `2`
  - `evidence_gap`: `10`
  - `geen gap`: `3`

## 5) Definitieve rapportlocatie
- Matrix + alle 15 detailblokken:
  - `docs/mcp_widget_agents_onderzoeksdraaiboek_en_rapport.md` sectie `4`.

# MCP Widget Stabilisatie - Run Resultaat (2026-02-28 20:50 UTC, PR-1 observability baseline)

## 0) Scope
- Doel van deze run: alleen bewijsinfrastructuur toevoegen voor correlatie/shape/tijdlijn, zonder functionele business-logica wijziging.
- In scope:
  - `mcp-server/ui/lib/ui_actions.ts`
  - `mcp-server/ui/lib/main.ts`
  - docs writeback in living + stabilisatie rapport.

## 1) Exacte observability-wijzigingen
- `mcp-server/ui/lib/ui_actions.ts`
  - Monotone ingest-klok toegevoegd (`client_ingest_ts_ms`, `client_ingest_seq`, `client_ingest_delta_ms`) via `nextClientIngestClock` (`mcp-server/ui/lib/ui_actions.ts:234-245`).
  - Deterministische payload-shape fingerprint toegevoegd (`shapeFingerprint`) (`mcp-server/ui/lib/ui_actions.ts:263-282`).
  - Uniforme correlatievelden toegevoegd (`correlation_id`, `client_action_id`, `request_id`) via `resolveClientCorrelation` (`mcp-server/ui/lib/ui_actions.ts:335-357`).
  - Baseline ingest-marker toegevoegd: `[ui_ingest_event]` (`mcp-server/ui/lib/ui_actions.ts:381-390`, toegepast in `866-915`).
  - Focusmarkers uitgebreid met correlatie-/ingestvelden:
    - `[ui_ingest_dropped_no_widget_result]` (`mcp-server/ui/lib/ui_actions.ts:891-901`)
    - `[ui_ingest_ack_cache_preserved]` (`mcp-server/ui/lib/ui_actions.ts:1039-1049`)
    - `[ui_action_dispatch_ack_without_state_advance]` (`mcp-server/ui/lib/ui_actions.ts:1850-1855`)
  - `callTool` request/response shape logs toegevoegd:
    - `[ui_calltool_request_shape]` (`mcp-server/ui/lib/ui_actions.ts:1646-1655`)
    - `[ui_calltool_response_shape]` (`mcp-server/ui/lib/ui_actions.ts:1730-1738`)
- `mcp-server/ui/lib/main.ts`
  - `openai:set_globals` empty payload pad gebruikt nu gedeelde ingest-probe en logt dezelfde contextvelden (`mcp-server/ui/lib/main.ts:550-564`).

## 2) Testresultaten
1. `cd mcp-server && npm run typecheck`
- Resultaat: PASS.

2. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts`
- Resultaat: PASS (`110 pass`, `0 fail`).

3. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts`
- Resultaat: PASS (`170 tests`, `169 pass`, `0 fail`, `1 skipped`).

## 3) Live/logstatus
- Geen nieuwe live hostrun uitgevoerd in deze iteratie.
- Geen nieuwe CloudWatch-query uitgevoerd in deze iteratie.
- Status: `evidence_gap` voor live/AWS correlatievalidatie.

## 4) Openstaande evidence_gaps
- `evidence_gap`: live correlatieketen op echte incidentflow met de nieuwe markers ontbreekt nog (met name voor `ui_ingest_dropped_no_widget_result`, `ui_ingest_ack_cache_preserved`, `ui_action_dispatch_ack_without_state_advance`).
- `evidence_gap`: host-context vergelijking (chat/projects/pinned) met dezelfde shape-fingerprint velden ontbreekt nog.
- `evidence_gap`: timestamped A/B volgorde tussen `ui/notifications/tool-result` en `openai:set_globals` in dezelfde failing sessie ontbreekt nog.

# MCP Widget Stabilisatie - Run Resultaat (2026-02-28 21:10 UTC, PR-3 cache+liveness consistency)

## 0) Scope
- PR-3 uitgevoerd op cache/liveness consistentie.
- In scope:
  - `mcp-server/ui/lib/ui_actions.ts`
  - `mcp-server/ui/lib/ui_render.ts`
  - `mcp-server/src/server/run_step_transport.ts`
  - `mcp-server/src/server/run_step_transport_context.ts`
  - regressietests in `src/ui_render.test.ts` en `src/handlers/run_step.test.ts`.

## 1) Contract-/ketenbewijs dispatch -> ack -> advance/error
1. Dispatch
- `callRunStep` logt dispatch met correlatievelden (`[ui_action_dispatched]`, `[ui_calltool_request_shape]`).

2. Ack
- Elke response gaat nu door uniforme liveness-evaluatie:
  - `[ui_action_liveness_ack]` bevat `ack_status`, `state_advanced`, `reason_code`, `failure_class`.
  - Widgetstate krijgt dezelfde terminale velden (`ui_action_liveness_*`, incl. `ui_action_liveness_failure_class`).

3. Advance/error eindstatus
- Success pad: `failure_class:"none"` + `state_advanced:true`.
- Error pad: altijd expliciet marker + notice:
  - `[ui_action_liveness_explicit_error]` met `failure_class`.
  - no-advance guard blijft expliciet via `[ui_action_dispatch_ack_without_state_advance]`.
- Cache-preserve kan deze errorstatus niet meer maskeren op actieve dispatch:
  - preserve denial marker: `[ui_ingest_cache_preserve_denied]`.

4. Servercontract-pariteit
- Server-side transportcontext en transportlogs bevatten nu ook `failure_class` zodat keten server->client semantisch consistent is.

## 2) Zichtbare eindstatus per failure class (huidig)
- `timeout`:
  - inline notice: timeout-tekst,
  - widgetstate: `ack_status=timeout`, `state_advanced=false`, `failure_class=timeout`.
- `rejected`:
  - inline notice: contract notice met reason-code suffix,
  - widgetstate: `ack_status=rejected`, `state_advanced=false`, `failure_class=rejected`.
- `dropped`:
  - inline notice: contract notice met reason-code suffix,
  - widgetstate: `ack_status=dropped`, `state_advanced=false`, `failure_class=dropped`.
- `accepted + !state_advanced`:
  - inline notice: contract notice met `state_not_advanced` (of server reason),
  - marker: `[ui_action_dispatch_ack_without_state_advance]`,
  - widgetstate: `failure_class=accepted_no_advance`.

## 3) Expliciete status op no-op perceptie risico
- Status: **verlaagd op code+testniveau**.
- Reden:
  - actieve dispatch kan foutuitkomst niet meer stil laten verdwijnen door preserve,
  - no-advance pad krijgt gegarandeerd zichtbare notice + marker + widgetstate.
- Restant: **live evidence_gap** (geen nieuwe host/AWS capture in deze run).

## 4) Verificatie (verplicht)
1. `cd mcp-server && npm run typecheck`
- PASS.

2. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts`
- PASS (`111 tests`, `111 pass`, `0 fail`).

3. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts`
- PASS (`171 tests`, `170 pass`, `0 fail`, `1 skipped`).

## 5) Open bewijs-gap
- `evidence_gap`: live correlatie op echte incidentflow met de nieuwe PR-3 markers (`ui_ingest_cache_preserve_denied`, `ui_action_dispatch_ack_without_state_advance`, `ui_action_liveness_explicit_error`) ontbreekt nog.

# MCP Widget Stabilisatie - Run Resultaat (2026-02-28 21:22 UTC, PR-4 widgetState rehydrate invariants)

## 0) Scope
- PR-4 uitgevoerd op persist/rehydrate hardening van `widgetState` bij reload/resume.
- In scope:
  - `mcp-server/ui/lib/ui_actions.ts`
  - `mcp-server/ui/lib/main.ts`
  - `mcp-server/src/server/run_step_transport_context.ts` (tuple-consistentie)
  - regressietests rond ordering/rehydrate
  - docs writeback.

## 1) Bewijs reload/resume gedrag
1. Reload-probe markers voor/na ingest
- `before_reload_probe` en `after_reload_probe` worden expliciet gelogd op startup (`mcp-server/ui/lib/main.ts:591-606`).
- Host-ingest markers `before_host_ingest` en `after_host_ingest` worden expliciet gelogd rond ingest (`mcp-server/ui/lib/main.ts:215-247`).

2. Persist/rehydrate markers en ordering snapshots
- Rehydrate snapshot API + marker:
  - `readWidgetStateOrderingSnapshot` (`mcp-server/ui/lib/ui_actions.ts:887-896`),
  - `[ui_widgetstate_rehydrate]` (`mcp-server/ui/lib/ui_actions.ts:898-911`).
- Persist markers op ordering patch lifecycle:
  - `[ui_widgetstate_persist_attempt]` (`mcp-server/ui/lib/ui_actions.ts:943-947`),
  - `[ui_widgetstate_persist_skipped_no_change]` (`mcp-server/ui/lib/ui_actions.ts:970-975`),
  - `[ui_widgetstate_persist_applied]` (`mcp-server/ui/lib/ui_actions.ts:982-986`).

3. Rehydrate bij missing host binnen dezelfde sessie
- Same-session rehydrate helper:
  - `rehydrateIncomingOrderingAgainstCurrent(...)` (`mcp-server/ui/lib/ui_actions.ts:461-478`).
- Toegepast vóór ordering beslissing in ingest:
  - `handleToolResultAndMaybeScheduleBootstrapRetry` (`mcp-server/ui/lib/ui_actions.ts:1140-1163`).

4. Reproduceerbare testbewijzen
- Ingest rehydrate bewijs:
  - `handleToolResultAndMaybeScheduleBootstrapRetry rehydrates missing host_widget_session_id from current tuple` (`mcp-server/src/ui_render.test.ts:1257-1300`).
- Reload/resume outbound tuple bewijs:
  - `callRunStep rehydrates outbound tuple from persisted widgetState after reload/resume` (`mcp-server/src/ui_render.test.ts:1771-1837`).

## 2) Harde invarianten die nu afgedwongen zijn
1. Tuple-validiteit is 4-veld verplicht
- `bootstrap_session_id`, `bootstrap_epoch`, `response_seq`, `host_widget_session_id` moeten compleet zijn (`mcp-server/ui/lib/ui_actions.ts:440-445`).

2. Geen overwriting met oudere tuple
- Ordering patch-beslissing blijft monotone tuple-ordering afdwingen (`mcp-server/ui/lib/ui_actions.ts:480-504`).

3. Geen same-session host mismatch overwrite op outbound
- `mergeOutboundOrdering(...)` kiest persisted tuple bij same-session host mismatch (`mcp-server/ui/lib/ui_actions.ts:517-523`).

4. Geen early-return pad dat host-session persist omzeilt
- Bij tuple-incomplete ingest wordt `host_widget_session_id` alsnog vroeg gepersist (`mcp-server/ui/lib/ui_actions.ts:1171-1183`).

5. Server-side tuple-consistentie voor internal host id
- Internal host id wordt op bootstrap-sessie genormaliseerd:
  - `alignInternalHostWidgetSessionId` (`mcp-server/src/server/run_step_transport_context.ts:130-146`, toegepast `312-315`).
- Realignment wordt expliciet gelogd:
  - `host_session_id_realigned_to_bootstrap` (`mcp-server/src/server/run_step_transport_context.ts:325-342`).

## 3) Verificatie (verplicht)
1. `cd mcp-server && npm run typecheck`
- PASS.

2. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts`
- PASS (`114 pass`, `0 fail`).

3. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts`
- PASS (`172 tests`, `171 pass`, `0 fail`, `1 skipped`).

## 4) Resterende live evidence_gaps
- `evidence_gap`: geen nieuwe live host reload/resume sessie met timestampmarkers in deze run.
- `evidence_gap`: geen nieuwe CloudWatch correlatiecapture voor PR-4 markers in deze run.
- `evidence_gap`: end-to-end bevestiging in echte host-context (chat/projects/pinned) ontbreekt nog.

## 5) PR-4 conclusie
- Bewezen op code/testniveau:
  - reload/resume persist/rehydrate markers bestaan en zijn afgedwongen,
  - tuple-invarianten zijn harder gemaakt op alle 4 velden,
  - same-session host rehydrate/merge regressiepaden zijn afgesloten,
  - transportcontext realignment op internal host tuple is afgedwongen.
- Niet bewezen in deze run:
  - live hostbewijs met timestamps (`evidence_gap`).

# MCP Widget Stabilisatie - Run Resultaat (2026-02-28 21:36 UTC, PR-5 surface matrix evidence)

## 0) Scope
- PR-5 surface matrix evidence uitgevoerd met nadruk op reproduceerbare capture en rapportage.
- **no code change**.
- In scope:
  - `docs/mcp_widget_regressie_living_rapport.md`
  - `docs/mcp_widget_stabilisatie_run_resultaat.md`
  - lokale/CloudWatch evidence runs.

## 1) Live matrix bewijs
- Run-ID `pr5-local-1772314306386`
  - Start: `2026-02-28T21:31:46.383Z`
  - Einde: `2026-02-28T21:32:00.853Z`
  - Artefact: `/tmp/pr5_local_matrix_1772314321154.json`
- Timeout-run (`verify:release-proof`)
  - Start: `2026-02-28T21:35:56.731Z`
  - Einde: `2026-02-28T21:36:03.412Z`
  - Relevante checks:
    - `chaos_simulated_timeout_fail_closed`: PASS (`408`, `timeout`)
    - `chaos_simulated_timeout_structured_event`: PASS (`mcp_request_timeout`)
- CloudWatch-poging:
  - `2026-02-28T21:35:16Z`
  - Uitkomst: `Could not connect to the endpoint URL: "https://logs.us-east-1.amazonaws.com/"`

| surface | run-id/timestamp | flow | uitslag | markers/status |
|---|---|---|---|---|
| Normale chat (local proxy) | `pr5-local-1772314306386` (`21:31:49Z` start surface) | startup -> start -> vervolgactie | geblokkeerd (start disabled) | server: `run_step_request/response` aanwezig; client/event-order niet sluitend |
| Projects | n.v.t. in deze omgeving | startup -> start -> vervolgactie | niet uitgevoerd | `evidence_gap`: geen host Projects toegang |
| Pinned app | n.v.t. in deze omgeving | startup -> start -> vervolgactie | niet uitgevoerd | `evidence_gap`: surface niet beschikbaar |
| Mobile viewport (local proxy) | `pr5-local-1772314306386` (`21:31:55Z` start surface) | startup -> start -> vervolgactie | geblokkeerd (start disabled) | client markers 0 hits; event-order niet sluitend |
| Timeout scenario (controlled) | `verify:release-proof` (`21:35:56Z` -> `21:36:03Z`) | gecontroleerde vertraging + timeout | serverzijde bevestigd | `mcp_request_timeout` bevestigd; UX correlatie blijft open |

## 2) Per-surface conclusie
- Normale chat (local proxy): gedeeltelijke servercapture, geen complete user-flow capture.
- Projects: open.
- Pinned: open.
- Mobile: open.
- Timeout: serverpad bevestigd, maar no-op perceptie correlatie met client/event-order blijft open.

## 3) Status van verplichte open items
- `3.2.5` (Projects vs chat): **onbeslist**, `evidence_gap`.
- `3.3.5` (mobile viewport): **onbeslist**, `evidence_gap`.
- `3.2.4` (timeout/no-op): **gedeeltelijk bevestigd (server)**, `evidence_gap` op host-UI correlatie.
- `3.3.1` (platform rollout): **onbeslist**, `evidence_gap`.
- `3.3.3` (request `_meta` hints): **onbeslist**, `evidence_gap`.

## 4) PR-5 samenvatting
- Verworpen hypothese:
  - "Server timeout-signalen ontbreken" -> verworpen (timeout marker aanwezig in gecontroleerde run).
- Open hypotheses:
  - Surface-specifieke contextverschillen (`Projects`/`Pinned`),
  - Mobile-specifieke leeg/schijnbaar inactief gedrag,
  - Volledige client/event-order correlatie op echte hostincidenten.

# MCP Widget Stabilisatie - Run Resultaat (2026-02-28 21:38 UTC, PR-6 final closure gate)

## 0) Scope
- PR-6 closure-gate uitgevoerd op bestaande bewijsset.
- **docs-only** (`no code change`).
- Doel: beslissen of finale root-cause claim toegestaan is.

## 1) Finale statusblok

### 1.1 Gesloten gaps (geen blocker voor root-cause claim)
- `3.1.4` -> verworpen (geen gap).
- `3.3.2` -> verworpen (geen gap).
- `3.3.4` -> verworpen (geen gap).

### 1.2 Open gaps (blockers)
- `implementation_gap`:
  - `3.1.1` response-shape mismatch.
  - `3.1.5` cache-preserve/liveness masking.
- `evidence_gap`:
  - `3.1.2`, `3.1.3`, `3.2.1`, `3.2.2`, `3.2.3`, `3.2.4`, `3.2.5`, `3.3.1`, `3.3.3`, `3.3.5`.

### 1.3 Finale gap-telling
- `implementation_gap`: 2
- `evidence_gap`: 10
- `spec_gap`: 0
- `geen gap`: 3
- Open totaal: **12**

## 2) Root-cause claim gate
- Root-cause claim toegestaan: **nee**.
- Reden:
  - relevante P0 blockers zijn niet dicht (`3.1.1`, `3.1.5`);
  - live correlatie voor winnend pad is niet sluitend (`3.2.2`, `3.2.5`, `3.3.5`).

## 3) Expliciete next-step trigger
- Trigger: pas opnieuw een finale claim-run starten zodra onderstaande 3 voorwaarden zijn gehaald:
  1. Host-surface A/B capture beschikbaar voor normale chat + Projects + pinned (zelfde flow, dezelfde markers, timestamped).
  2. Event-order capture sluitend voor `ui/notifications/tool-result` versus `openai:set_globals` in minimaal 1 representatieve failing/successful vergelijking.
  3. Mobile run bevat complete flow (startup -> start -> vervolgactie) met screenshot/timestamp en client markers.

## 4) PR-6 conclusie
- De closure-gate is uitgevoerd en documenteert alle open blockers.
- Er is bewust geen "0 gaps" claim gedaan.

## PR-7 auditstatus
- Historische auditmomentopname; status is superseded door `## PR-8 failsluitingsstatus`.
- Scope: docs-only completeness audit op PR-1 t/m PR-6.
- Verdict: **FAIL**.
- Open auditgaps: **6**.
  - `audit_gap`: 3
  - `evidence_gap`: 2
  - `consistency_gap`: 1
- Referentie living poging:
  - `docs/mcp_widget_regressie_living_rapport.md` -> `### Poging 2026-02-28 21:45 UTC (PR-7 completeness audit)`.
- no code change.

## PR-2 canonical transport convergence status (PR-8)
- Run timestamp: `2026-02-28 21:52 UTC`.
- Doelstatus: **inhoudelijk gesloten op code+testbewijs**.
- Code change in PR-8 zelf: **nee** (validatie van bestaande structurele implementatie).

Canonical normalize+ingest pad (1 pad voor 3 ingangen):
- `mcp-server/ui/lib/main.ts:215` (`ingestHostPayload`)
- `mcp-server/ui/lib/main.ts:233` (`set_globals` -> `handleToolResultAndMaybeScheduleBootstrapRetry`)
- `mcp-server/ui/lib/main.ts:241` (`host_notification` -> `handleToolResultAndMaybeScheduleBootstrapRetry`)
- `mcp-server/ui/lib/main.ts:363` (`ui/notifications/tool-result` route)
- `mcp-server/ui/lib/main.ts:559` (`openai:set_globals` route)
- `mcp-server/ui/lib/ui_actions.ts:829` (`normalizeToolResult`)
- `mcp-server/ui/lib/ui_actions.ts:1084` (`handleToolResultAndMaybeScheduleBootstrapRetry`)

Shape-matrix status (runbaar bewijs):
- Runtime matrix smoke-check (`node --loader ts-node/esm -e "<shape-cases via resolveWidgetPayload>"`):
  - `root._widget_result` -> `source=meta.widget_result` (ACCEPT)
  - `root._meta.widget_result` -> `source=meta.widget_result` (ACCEPT)
  - `toolOutput._widget_result` -> `source=meta.widget_result` (ACCEPT)
  - `host_notification_direct` -> `source=none` (DROP, fail-closed)
  - `structuredContent._widget_result` -> `source=none` (DROP, fail-closed)
- Regressietests:
  - `mcp-server/src/ui_render.test.ts:2440`
  - `mcp-server/src/ui_render.test.ts:2473`
  - `mcp-server/src/ui_render.test.ts:2744`
  - `mcp-server/src/ui_render.test.ts:2859`

Event-order determinisme (zelfde correlatieveld + monotone client-ingest markers):
- Correlatie + ingest context:
  - `mcp-server/ui/lib/ui_actions.ts:359` (`buildClientIngestContext`)
  - `mcp-server/ui/lib/ui_actions.ts:241` (`client_ingest_ts_ms`, `client_ingest_seq`)
- Marker logging voor beide ingress-bronnen:
  - `mcp-server/ui/lib/ui_actions.ts:386` (`[ui_ingest_event]`)
  - `mcp-server/ui/lib/main.ts:233` / `mcp-server/ui/lib/main.ts:241`
- Monotone ordering regressie:
  - `mcp-server/src/ui_render.test.ts:1208`

Verificatie (verplicht, PR-8 run):
1. `cd mcp-server && npm run typecheck` -> PASS
2. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts` -> PASS (`114 pass`, `0 fail`)
3. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts` -> PASS (`172 tests`, `171 pass`, `0 fail`, `1 skipped`)

## PR-8 failsluitingsstatus
- Referentie living poging:
  - `docs/mcp_widget_regressie_living_rapport.md` -> `### Poging 2026-02-28 21:52 UTC (PR-8 structurele failsluiting)`

| fail-id | type | status | bewijs | codewijziging in PR-8 |
|---|---|---|---|---|
| PR2-G1 | `evidence_gap` | PASS | Canonical ingest + shape-matrix + monotone ingest markers aantoonbaar (`mcp-server/ui/lib/main.ts:215,233,241,363,559`; `mcp-server/ui/lib/ui_actions.ts:829,1084`; `mcp-server/src/ui_render.test.ts:1208,2440,2473,2744,2859`) | nee |
| PR2-G2 | `audit_gap` | PASS | PR-8 verplichte verificatie traceerbaar in PR-2 statusblok (deze sectie) + living PR-8 poging | nee |
| PR2-G3 | `audit_gap` | PASS | Verplichte living kop aanwezig: `### Poging 2026-02-28 21:52 UTC (PR-8 structurele failsluiting)` | nee |
| PR2-G4 | `audit_gap` | PASS | Verplichte stabilisatie writeback aanwezig: `## PR-2 canonical transport convergence status (PR-8)` | nee |
| PR5-G1 | `evidence_gap` | FAIL | Echte host-surface 5-run matrix niet sluitend uitvoerbaar in deze omgeving (Projects, pinned, mobile) | nee |
| CROSS-G1 | `consistency_gap` | PASS | Oude `0 open gaps` claim expliciet als historisch/superseded gemarkeerd in deze file | nee |

- Actuele open-gaptelling (PR-7 auditfails): **1**
  - `audit_gap`: 0
  - `evidence_gap`: 1 (`PR5-G1`)
  - `consistency_gap`: 0
- PR-8 verdict: **FAIL** (alleen door open `PR5-G1`).
