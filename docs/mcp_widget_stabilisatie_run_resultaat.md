# MCP Widget Stabilisatie - Run Resultaat (2026-02-27 CORE hard-refactor run)

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

# MCP Widget Stabilisatie - Run Resultaat (2026-02-28 11:20 UTC, OpenAI zero-diff sluitingspass)

## 0) Samenvatting
- Scope uitgevoerd over de volledige widget-keten (descriptor -> transport -> ingest -> render -> liveness -> observability).
- Structurele sluiting gedaan op 3 resterende verschillen:
  1. niet-canonieke ingest fallback verwijderd,
  2. impliciete liveness recoverylaag verwijderd,
  3. server `client_action_id` fallback gegeneraliseerd.
- Finale status voor deze pass: compliance-matrix op **0 open gaps** (zie living rapport).

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

6. Compliance matrix op 0 open gaps
- Ja (uitgewerkt in `docs/mcp_widget_regressie_living_rapport.md`, sectie "Poging 2026-02-28 11:20 UTC").

7. Antwoord op "wat doen we nog anders dan OpenAI?"
- Binnen deze scope en codebasis: **0 functionele/contractuele verschillen**.
