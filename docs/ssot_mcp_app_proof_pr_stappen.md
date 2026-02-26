# SSOT MCP App Proof - PR Stappen (Codex Instructies)

## Step 1 - SSOT contract/ADR

```md
Werk op branch: feature/ssot-pr1-adr-widget-result

Doel:
Leg SSOT formeel vast: `_meta.widget_result` + `(bootstrap_session_id, bootstrap_epoch, response_seq, host_widget_session_id)` is de enige autoriteit voor UI-state.

Branch-actie:
- `git checkout -b feature/ssot-pr1-adr-widget-result` (of checkout bestaande branch met dezelfde naam).

Scope:
- docs/adr/*
- mcp-server/docs/*
- strikt noodzakelijke contract-testbestanden

Exacte startbestanden:
- `docs/adr/ADR-005-ssot-actioncode-governance.md` (referentie)
- `docs/adr/ADR-006-widget-result-ssot.md` (nieuw of update als al aanwezig)
- `mcp-server/docs/ui-interface-contract.md`
- `mcp-server/docs/contracts/contract-purity-inventory.md`
- `mcp-server/src/mcp_app_contract.test.ts` (alleen als contract-assertions nodig zijn)

Te doen:
- Schrijf/actualiseer ADR met SSOT-besluit, motivatie, migratiepad, rollback.
- Update UI-contract docs met expliciete “single source of truth”.
- Voeg/actualiseer contract-test die alternate bronnen voor render-state afkeurt.

Niet doen:
- Geen runtime code wijzigen.
- Geen scope buiten contract/ADR/docs.
- Verboden bestanden: `mcp-server/server.ts`, `mcp-server/ui/lib/*`, `mcp-server/src/handlers/*`.

Compatibiliteit:
- Backward compatible documenteren in ADR (oude payloadvormen alleen tijdelijk ondersteund, met duidelijke uitfaseerstrategie).

Validatie:
- Draai:
  - `cd mcp-server`
  - `TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/mcp_app_contract.test.ts`
- Controleer dat docs en testverwachtingen consistent zijn.

Definition of Done:
- ADR bevat expliciet: SSOT-besluit, anti-patterns, migratie, rollback.
- UI-contract doc benoemt `_meta.widget_result` als autoritatief.
- Contract-test faalt wanneer alternate render-bronnen als truth worden gebruikt.

Output:
1. Gedaan.
2. Nog te doen.
3. Risico’s/open vragen.
4. Geen vervolgprompt nodig (als klaar).
```

## Step 2 - UI ingest single-source

```md
Werk op branch: feature/ssot-pr2-ui-ingest-single-source

Doel:
Maak UI ingest single-source: renderpad leest alleen gehydrateerde host payload gebaseerd op `_meta.widget_result`.

Branch-actie:
- `git checkout -b feature/ssot-pr2-ui-ingest-single-source` (of checkout bestaande branch met dezelfde naam).

Scope:
- mcp-server/ui/lib/*
- mcp-server/src/ui_render.test.ts
- strikt noodzakelijke imports

Exacte startbestanden:
- `mcp-server/ui/lib/main.ts`
- `mcp-server/ui/lib/ui_actions.ts`
- `mcp-server/ui/lib/locale_bootstrap_runtime.ts`
- `mcp-server/ui/lib/ui_render.ts`
- `mcp-server/src/ui_render.test.ts`

Te doen:
- Verwijder dubbele waarheid in ingest/renderpaden.
- Behandel `callTool` return alleen als dispatch/ack, niet als primaire render-source.
- Zorg dat ordering tuple-consistentie overal gelijk wordt toegepast.
- Voeg tests toe voor race/reorder ingest scenarios.

Niet doen:
- Geen server stale-policy aanpassen (dat is step 3).
- Geen docs buiten UI-contract aanpassen.
- Verboden bestanden: `mcp-server/server.ts`, `mcp-server/src/handlers/*`.

Compatibiliteit:
- Houd host-notification en set_globals compatibel; geen breaking wijziging in transport API.

Validatie:
- Draai:
  - `cd mcp-server`
  - `TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts`
- Geen regressie in bestaande ingest tests.

Definition of Done:
- UI gebruikt 1 truth-source voor render-state.
- Geen pad meer waar ongehydrateerde callTool-return als blijvende state wordt behandeld.
- Nieuwe race/reorder tests groen.

Output:
1. Gedaan.
2. Nog te doen.
3. Risico’s/open vragen.
4. Geen vervolgprompt nodig (als klaar).
```

## Step 3 - Server stale rebase voor interactieve acties

```md
Werk op branch: feature/ssot-pr3-server-stale-rebase

Doel:
Zorg dat interactieve acties (minimaal `ACTION_START`) niet verloren gaan bij stale payloads; rebase op latest snapshot en voer alsnog uit.

Branch-actie:
- `git checkout -b feature/ssot-pr3-server-stale-rebase` (of checkout bestaande branch met dezelfde naam).

Scope:
- mcp-server/server.ts
- mcp-server/src/handlers/*
- bijbehorende tests

Exacte startbestanden:
- `mcp-server/server.ts`
- `mcp-server/src/handlers/run_step_runtime.ts`
- `mcp-server/src/handlers/run_step_routes.ts`
- `mcp-server/src/handlers/run_step.test.ts`
- `mcp-server/src/handlers/run_step_finals.test.ts`

Te doen:
- Classificeer rebase-eligible interactieve actions.
- Pas stale handling aan: geen blind drop voor die actions.
- Houd fail-closed gedrag voor ongeldige contractstate.
- Voeg tests toe voor stale/race/reorder met ACTION_START.

Niet doen:
- Geen UI ingest refactors.
- Geen brede architectuurwijziging buiten stale-policy.
- Verboden bestanden: `mcp-server/ui/lib/*`.

Compatibiliteit:
- Behoud bestaande stale-drop voor niet-interactieve/ongewenste replay-cases.

Validatie:
- Draai:
  - `cd mcp-server`
  - `TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts`
- Logs tonen expliciet rebase vs drop reden.

Definition of Done:
- `ACTION_START` gaat deterministisch door bij stale input.
- Geen regressie in contract fail-closed gedrag.
- Rebase/drop reason-codes zichtbaar in logs.

Output:
1. Gedaan.
2. Nog te doen.
3. Risico’s/open vragen.
4. Geen vervolgprompt nodig (als klaar).
```

## Step 4 - Startup zonder leeg scherm

```md
Werk op branch: feature/ssot-pr4-startup-deterministic-shell

Doel:
Elimineer blank first paint door deterministic startup shell.

Branch-actie:
- `git checkout -b feature/ssot-pr4-startup-deterministic-shell` (of checkout bestaande branch met dezelfde naam).

Scope:
- mcp-server/ui/lib/main.ts
- mcp-server/ui/lib/ui_render.ts
- relevante UI tests

Exacte startbestanden:
- `mcp-server/ui/lib/main.ts`
- `mcp-server/ui/lib/ui_render.ts`
- `mcp-server/src/ui_render.test.ts`

Te doen:
- Definieer expliciete startup init-state (`waiting_locale` of prestart shell).
- Voorkom renderpad dat tijdelijk niets toont.
- Voeg test toe die blank first frame voorkomt.

Niet doen:
- Geen server code.
- Geen stale-policy changes.
- Verboden bestanden: `mcp-server/server.ts`, `mcp-server/src/handlers/*`.

Compatibiliteit:
- Geen functionele wijziging in run_step contract; alleen startup-render gedrag.

Validatie:
- Draai:
  - `cd mcp-server`
  - `TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts`
- Deterministisch startup gedrag in test-output bevestigd.

Definition of Done:
- Geen blank first paint pad meer.
- Startup shell verschijnt altijd direct.
- Tests voor startup view-state zijn groen.

Output:
1. Gedaan.
2. Nog te doen.
3. Risico’s/open vragen.
4. Geen vervolgprompt nodig (als klaar).
```

## Step 5 - Observability lifecycle

```md
Werk op branch: feature/ssot-pr5-observability-lifecycle

Doel:
Volledige lifecycle-observability voor dispatch/accept/drop/rebase/render-source.

Branch-actie:
- `git checkout -b feature/ssot-pr5-observability-lifecycle` (of checkout bestaande branch met dezelfde naam).

Scope:
- mcp-server/server.ts
- mcp-server/src/core/* (logging/diagnostics gerelateerd)
- mcp-server/src/handlers/* (waar nodig)
- docs/operations_failure_playbook.md (waar nodig)

Exacte startbestanden:
- `mcp-server/server.ts`
- `mcp-server/src/core/session_token_log.ts` (indien relevant)
- `mcp-server/src/handlers/run_step_runtime.ts`
- `mcp-server/src/mcp_app_contract.test.ts`
- `docs/operations_failure_playbook.md`

Te doen:
- Harmoniseer structured logs met correlation_id + trace_id in volledige flow.
- Log reason-codes voor accept/drop/rebase.
- Breid diagnostics/ready informatie uit of documenteer expliciet waarom niet.

Niet doen:
- Geen functionele flow-wijzigingen buiten logging/diagnostics.
- Verboden bestanden: `mcp-server/ui/lib/*` (tenzij strikt noodzakelijk voor logging-contract).

Compatibiliteit:
- Logschema uitbreiden zonder bestaande keys te verwijderen (append-only waar mogelijk).

Validatie:
- Draai:
  - `cd mcp-server`
  - `TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/mcp_app_contract.test.ts src/server_safe_string.test.ts`
- Structured log schema consistent.

Definition of Done:
- End-to-end lifecycle events bevatten correlation_id/trace_id.
- Drop/rebase/accept reason-codes zijn expliciet.
- Diagnostics/ready status is aantoonbaar gedocumenteerd of geïmplementeerd.

Output:
1. Gedaan.
2. Nog te doen.
3. Risico’s/open vragen.
4. Geen vervolgprompt nodig (als klaar).
```

## Step 6 - MCP-proof testmatrix

```md
Werk op branch: feature/ssot-pr6-contract-race-testmatrix

Doel:
Maak harde testgarantie voor race/reorder/stale/duplicate gedrag in MCP app-context.

Branch-actie:
- `git checkout -b feature/ssot-pr6-contract-race-testmatrix` (of checkout bestaande branch met dezelfde naam).

Scope:
- mcp-server/src/handlers/*.test.ts
- mcp-server/src/ui_render.test.ts
- strikt noodzakelijke test fixtures

Exacte startbestanden:
- `mcp-server/src/handlers/run_step.test.ts`
- `mcp-server/src/handlers/run_step_finals.test.ts`
- `mcp-server/src/ui_render.test.ts`
- `mcp-server/src/mcp_app_contract.test.ts`

Te doen:
- Voeg tests toe voor stale ACTION_START, out-of-order responses, duplicate dispatch.
- Test source-of-truth contract enforcement.
- Test dat startflow deterministisch naar interactieve step gaat.

Niet doen:
- Geen nieuwe featureontwikkeling.
- Alleen test code + mini-fixes nodig voor testbaarheid.
- Verboden bestanden: productieruntime buiten strikt noodzakelijke testability hooks.

Compatibiliteit:
- Testuitbreiding mag bestaand gedrag alleen aanscherpen, niet semantisch wijzigen zonder expliciete reden.

Validatie:
- Draai:
  - `cd mcp-server`
  - `TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts src/ui_render.test.ts src/mcp_app_contract.test.ts`
- Geen flaky tests.

Definition of Done:
- Race/reorder/stale/duplicate scenario’s afgedekt met duidelijke assertions.
- Startflow determinisme onder stress aantoonbaar.
- Nieuwe tests stabiel groen.

Output:
1. Gedaan.
2. Nog te doen.
3. Risico’s/open vragen.
4. Geen vervolgprompt nodig (als klaar).
```

## Step 7 - Flags + canary rollout support

```md
Werk op branch: feature/ssot-pr7-rollout-flags-canary

Doel:
Maak gecontroleerde rollout mogelijk met feature flags en duidelijke rollback criteria.

Branch-actie:
- `git checkout -b feature/ssot-pr7-rollout-flags-canary` (of checkout bestaande branch met dezelfde naam).

Scope:
- mcp-server/server.ts
- relevante config/flag plekken
- docs/operations*

Exacte startbestanden:
- `mcp-server/server.ts`
- `mcp-server/src/handlers/run_step_runtime.ts`
- `docs/operations_failure_playbook.md`
- `docs/ready-for-composer.md` (indien rollout-notes daar thuishoren)

Te doen:
- Voeg gerichte flags toe voor nieuwe ingest/stale rebase gedrag.
- Definieer canary metrics en alertdrempels.
- Documenteer rollback procedure.

Niet doen:
- Geen ongeflagde breaking changes.
- Geen brede infra-herbouw.
- Verboden bestanden: niet-gerelateerde business logic buiten feature-flag gating.

Compatibiliteit:
- Default flagstand moet huidige productiegedrag behouden tot canary-enable.

Validatie:
- Draai:
  - `cd mcp-server`
  - `TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/mcp_app_contract.test.ts src/handlers/run_step.test.ts`
- Flag on/off gedrag testbaar en gedocumenteerd.

Definition of Done:
- Flags zijn aanwezig en veilig default-off/on volgens rolloutplan.
- Canary KPI’s + rollback criteria staan expliciet in docs.
- Geen onverwachte gedragsswitch zonder flag.

Output:
1. Gedaan.
2. Nog te doen.
3. Risico’s/open vragen.
4. Geen vervolgprompt nodig (als klaar).
```

## Step 8 - Failure playbook final

```md
Werk op branch: docs/ssot-pr8-failure-playbook-final

Doel:
Finaliseer operationeel playbook met top failure modes en directe koppeling naar contract/ADR.

Branch-actie:
- `git checkout -b docs/ssot-pr8-failure-playbook-final` (of checkout bestaande branch met dezelfde naam).

Scope:
- docs/operations_failure_playbook.md
- mcp-server/docs/contracts/*
- docs/adr/* (referenties)

Exacte startbestanden:
- `docs/operations_failure_playbook.md`
- `mcp-server/docs/contracts/contract-purity-inventory.md`
- `docs/adr/ADR-005-ssot-actioncode-governance.md`
- `docs/adr/ADR-006-widget-result-ssot.md` (als in step 1 toegevoegd)

Te doen:
- Lever top 10 failure modes met trigger/symptoom, detectie, eerste mitigatie, duurzame fix.
- Koppel per mode naar log events/metrics.
- Link naar relevante ADR/contract inventory.

Niet doen:
- Geen runtime code wijzigingen.
- Alleen docs/playbook afronden.
- Verboden bestanden: `mcp-server/server.ts`, `mcp-server/ui/lib/*`, `mcp-server/src/handlers/*`.

Compatibiliteit:
- Incident- en mitigatietekst moet aansluiten op live telemetrynamen.

Validatie:
- Draai:
  - `rg -n \"stale_bootstrap_payload_dropped|run_step_response|run_step_error|unknown_action_code\" docs/operations_failure_playbook.md mcp-server/docs/contracts/contract-purity-inventory.md`
- Playbook is uitvoerbaar voor on-call zonder extra context.
- Alle referenties bestaan en kloppen.

Definition of Done:
- 10 failure modes compleet ingevuld.
- Elke mode bevat detectie + eerste mitigatie + duurzame fix.
- ADR/contract-links zijn valide en relevant.

Output:
1. Gedaan.
2. Nog te doen.
3. Risico’s/open vragen.
4. Geen vervolgprompt nodig.
```
