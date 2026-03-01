# Simplicity PR Rollout 2026-03-01 (Copy-Paste Agent Steps)

Status: Promptarchief + voortgangslog (niet normatief voor runtime/build-contract sinds 2026-03-01).  
Leidende actieve normbron: `mcp-server/docs/ui-interface-contract.md`.

## PR-1 (Transport convergentie)

```text
PR-ID: PR-1
Titel: Runtime ingress convergentie naar /mcp

DOEL
- Verwijder parallel runtime transport via POST /run_step en GET /test.
- /mcp wordt het enige actieve runtime tool-ingress pad.

HARD RULES
1) Delete-first, geen nieuwe lagen.
2) Elke claim met file:line.
3) Geen productiegedrag verbreden; alleen convergentie.
4) Bij onzekerheid: markeer onbeslist.

BEWIJS (LEES EERST)
- mcp-server/src/server/http_routes.ts:278
- mcp-server/src/server/http_routes.ts:281
- mcp-server/src/server/http_routes.ts:452
- mcp-server/src/server/http_routes.ts:544
- mcp-server/src/server/run_step_transport.ts:210
- mcp-server/scripts/runtime-smoke.mjs:41
- mcp-server/scripts/release_proof_verification.mjs:196
- mcp-server/src/mcp_app_contract.test.ts:63
- mcp-server/docs/ui-interface-contract.md:5

SCOPE IN
- mcp-server/src/server/http_routes.ts
- mcp-server/scripts/runtime-smoke.mjs
- mcp-server/scripts/release_proof_verification.mjs
- mcp-server/src/mcp_app_contract.test.ts
- mcp-server/docs/ui-interface-contract.md

SCOPE OUT
- Idempotency internals
- UI ownership
- Ordering/parity logic

UIT TE VOEREN VOLGORDE
1) Verwijder /run_step route en /test route uit http_routes.ts.
2) Migreer runtime smoke/release checks van /run_step naar MCP-pad.
3) Update contracttests zodat ze /run_step bridge niet meer als runtime-eis hebben.
4) Update ui-interface-contract doc naar MCP-ingress werkelijkheid.

VERIFICATIE (VERPLICHT)
- cd mcp-server && npm run typecheck
- cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/mcp_app_contract.test.ts src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts
- cd mcp-server && npm test

ACCEPTATIE
- Geen actieve route met pathname "/run_step".
- Geen actieve route met pathname "/test".
- Verificatiecommando’s PASS.

VERPLICHTE OUTPUT
1) Gewijzigde files
2) Delete-first lijst met file:line
3) Keep-lijst met file:line
4) Risico’s
5) Verificatie PASS/FAIL
6) Rollback-stappen

70% CONTEXT HANDOVER
- Klaar
- Open TODO per file
- Reeds gedraaide checks
- Blokkers
- Volgende eerste actie
```

---

## PR-2 (Idempotency SSOT)

```text
PR-ID: PR-2
Titel: Idempotency ownership naar server-only

DOEL
- Elimineer runtime idempotency registry/branches in handlers.
- Maak server transport de enige idempotency owner.

HARD RULES
1) Delete-first.
2) Geen nieuwe registry-laag.
3) Elke claim met file:line.

BEWIJS (LEES EERST)
- mcp-server/src/server/idempotency_registry.ts:21
- mcp-server/src/server/run_step_transport_idempotency.ts:139
- mcp-server/src/handlers/run_step_runtime_idempotency.ts:22
- mcp-server/src/handlers/run_step_runtime_execute.ts:175
- mcp-server/src/handlers/run_step_runtime_execute.ts:218
- mcp-server/src/handlers/run_step_runtime_execute.ts:586
- mcp-server/src/handlers/run_step.test.ts:1310
- mcp-server/src/handlers/run_step.test.ts:1352
- mcp-server/src/handlers/run_step.test.ts:1384

SCOPE IN
- mcp-server/src/handlers/run_step_runtime_idempotency.ts
- mcp-server/src/handlers/run_step_runtime_execute.ts
- mcp-server/src/handlers/run_step.test.ts
- mcp-server/src/server/run_step_transport_idempotency.ts
- mcp-server/src/server/idempotency_registry.ts

SCOPE OUT
- Transport ingress
- UI payload source

UIT TE VOEREN VOLGORDE
1) Verwijder runtime idempotency module en imports.
2) Verwijder runtime replay/conflict/inflight branches in execute.
3) Zorg dat idempotency-uitkomst uit server transport blijft komen.
4) Herschrijf/normaliseer tests naar server ownership.

VERIFICATIE (VERPLICHT)
- cd mcp-server && npm run typecheck
- cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts src/mcp_app_contract.test.ts

ACCEPTATIE
- Geen runtime registry map in src/handlers/*.
- Idempotency outcome enkel server-gedreven.
- Verificatie PASS.

VERPLICHTE OUTPUT
1) Gewijzigde files
2) Delete-first met file:line
3) Keep met file:line
4) Risico’s
5) Verificatie PASS/FAIL
6) Rollback

70% CONTEXT HANDOVER
- Klaar
- Open TODO per file
- Checks
- Blokkers
- Volgende eerste actie
```

---

## PR-3 (Output envelope SSOT)

```text
PR-ID: PR-3
Titel: _meta.widget_result als enige UI render authority

DOEL
- Verwijder parallelle _widget_result alias/compat ingestpaden.
- UI accepteert alleen _meta.widget_result.

HARD RULES
1) Delete-first.
2) Geen nieuwe fallback wrappers.
3) Fail-closed behouden.
4) Elke claim met file:line.

BEWIJS (LEES EERST)
- mcp-server/src/server/mcp_registration.ts:268
- mcp-server/src/server/mcp_registration.ts:270
- mcp-server/src/server/http_routes.ts:429
- mcp-server/ui/step-card.bundled.html:804
- mcp-server/ui/step-card.bundled.html:810
- mcp-server/ui/step-card.bundled.html:1045
- mcp-server/ui/step-card.bundled.html:1047
- mcp-server/ui/lib/locale_bootstrap_runtime.ts:152
- mcp-server/ui/lib/locale_bootstrap_runtime.ts:167
- mcp-server/src/server/run_step_transport.ts:445

SCOPE IN
- mcp-server/src/server/mcp_registration.ts
- mcp-server/ui/step-card.bundled.html
- mcp-server/ui/lib/locale_bootstrap_runtime.ts
- mcp-server/src/ui_render.test.ts
- mcp-server/src/mcp_app_contract.test.ts

SCOPE OUT
- Idempotency ownership
- CI/gates

UIT TE VOEREN VOLGORDE
1) Verwijder _widget_result alias injectie uit MCP registration output.
2) Verwijder multi-candidate extractie/legacy notification compat in bundled runtime.
3) Verwijder compat zoekpaden in locale_bootstrap_runtime.
4) Update tests op strict _meta.widget_result authority.

VERIFICATIE (VERPLICHT)
- cd mcp-server && npm run typecheck
- cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts

ACCEPTATIE
- Geen actief _widget_result aliaspad als render truth.
- Alleen _meta.widget_result source.
- Verificatie PASS.

VERPLICHTE OUTPUT
1) Gewijzigde files
2) Delete-first met file:line
3) Keep met file:line
4) Risico’s
5) Verificatie PASS/FAIL
6) Rollback

70% CONTEXT HANDOVER
- Klaar
- Open TODO per file
- Checks
- Blokkers
- Volgende eerste actie
```

---

## PR-4 (Ordering authority simplificatie)

```text
PR-ID: PR-4
Titel: Single ordering authority (server), client zonder semantische repair

DOEL
- Verwijder multi-layer tuple parity patch/backfill/repair semantiek.
- Houd alleen monotonic accept/drop op client.

HARD RULES
1) Delete-first.
2) Geen nieuwe tuple-repair laag.
3) Elke claim met file:line.

BEWIJS (LEES EERST)
- mcp-server/src/server/ordering_parity.ts:393
- mcp-server/src/server/ordering_parity.ts:452
- mcp-server/src/server/mcp_registration.ts:149
- mcp-server/src/server/http_routes.ts:408
- mcp-server/ui/lib/ui_actions.ts:1147
- mcp-server/ui/lib/ui_actions.ts:1186
- mcp-server/ui/lib/ui_actions.ts:1223
- mcp-server/src/server/run_step_transport_stale.ts:33

SCOPE IN
- mcp-server/src/server/ordering_parity.ts
- mcp-server/src/server/mcp_registration.ts
- mcp-server/src/server/http_routes.ts
- mcp-server/ui/lib/ui_actions.ts
- relevante tests in src/mcp_app_contract.test.ts src/ui_render.test.ts src/handlers/run_step.test.ts

SCOPE OUT
- UI ownership cut
- Gate consolidatie

UIT TE VOEREN VOLGORDE
1) Verwijder server tuple parity patch/backfill pad waar dubbeling zit.
2) Verwijder client rehydrate/same-seq-upgrade semantiek; behoud monotonic drop/accept.
3) Behoud stale guard/drop/rebase beslissingen in server transport.
4) Update tests op nieuwe single authority.

VERIFICATIE (VERPLICHT)
- cd mcp-server && npm run typecheck
- cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/mcp_app_contract.test.ts src/ui_render.test.ts src/handlers/run_step.test.ts

ACCEPTATIE
- Geen multi-layer tuple semantische repair meer.
- Monotonic gedrag blijft correct.
- Verificatie PASS.

VERPLICHTE OUTPUT
1) Gewijzigde files
2) Delete-first met file:line
3) Keep met file:line
4) Risico’s
5) Verificatie PASS/FAIL
6) Rollback

70% CONTEXT HANDOVER
- Klaar
- Open TODO per file
- Checks
- Blokkers
- Volgende eerste actie
```

---

## PR-5 (UI ownership hard-cut)

```text
PR-ID: PR-5
Titel: Eén UI runtime owner (bundled)

DOEL
- Maak ui/step-card.bundled.html de enige actieve runtime owner.
- Verwijder parallelle actieve runtime-ownership via ui/lib in tests/contracts/gates.

HARD RULES
1) Delete-first.
2) Geen tweede runtime owner behouden.
3) Elke claim met file:line.

BEWIJS (LEES EERST)
- mcp-server/src/server/run_step_transport.ts:48
- mcp-server/src/server/http_routes.ts:485
- mcp-server/ui/step-card.bundled.html:1083
- mcp-server/ui/lib/main.ts:353
- mcp-server/src/ui_render.test.ts:1049
- mcp-server/src/ui_sanitize.test.ts:3
- mcp-server/src/server_safe_string.test.ts:120
- mcp-server/src/mcp_app_contract.test.ts:23

SCOPE IN
- mcp-server/ui/step-card.bundled.html
- mcp-server/ui/lib/* (alleen voor ownership cut)
- mcp-server/src/ui_render.test.ts
- mcp-server/src/ui_sanitize.test.ts
- mcp-server/src/server_safe_string.test.ts
- mcp-server/src/mcp_app_contract.test.ts

SCOPE OUT
- Idempotency/ordering
- CI gate consolidatie

UIT TE VOEREN VOLGORDE
1) Verwijder parallel runtime-event/transport ownership in ui/lib.
2) Houd bundled runtime als enige event ingest/runtime owner.
3) Update tests die nu ui/lib source-assertions als actieve runtime aannemen.
4) Zorg dat /ui/step-card route + bundled load onaangetast blijven.

VERIFICATIE (VERPLICHT)
- cd mcp-server && npm run typecheck
- cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/ui_sanitize.test.ts src/mcp_app_contract.test.ts

ACCEPTATIE
- 1 actieve UI runtime owner.
- Geen parallelle runtime-ownership asserts in tests.
- Verificatie PASS.

VERPLICHTE OUTPUT
1) Gewijzigde files
2) Delete-first met file:line
3) Keep met file:line
4) Risico’s
5) Verificatie PASS/FAIL
6) Rollback

70% CONTEXT HANDOVER
- Klaar
- Open TODO per file
- Checks
- Blokkers
- Volgende eerste actie
```

---

## PR-6 (Contract/finalize overlap)

```text
PR-ID: PR-6
Titel: Contract/finalize overlap reduceren

DOEL
- Verminder dubbele contract/liveness mutaties over server/handlers/client.
- Houd één fail-closed contractguard als kern.

HARD RULES
1) Delete-first.
2) Geen nieuwe normalize/recover laag.
3) Elke claim met file:line.

BEWIJS (LEES EERST)
- mcp-server/src/server/run_step_transport.ts:62
- mcp-server/src/handlers/turn_contract.ts:124
- mcp-server/src/handlers/turn_contract.ts:717
- mcp-server/ui/lib/ui_actions.ts:1732
- mcp-server/src/handlers/run_step_runtime_preflight.ts:201
- mcp-server/src/handlers/turn_contract.ts:472

SCOPE IN
- mcp-server/src/handlers/turn_contract.ts
- mcp-server/src/server/run_step_transport.ts
- mcp-server/src/handlers/run_step_runtime_preflight.ts
- mcp-server/ui/lib/ui_actions.ts
- relevante tests in src/handlers/step_contracts.test.ts src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts

SCOPE OUT
- Build/artifact
- CI workflows

UIT TE VOEREN VOLGORDE
1) Verwijder overlappende liveness mutatiepunten.
2) Verwijder legacy preflight branches zonder actuele waarde.
3) Behoud 1 centrale fail-closed guard.
4) Update tests op conflictvrije contractbeslissingen.

VERIFICATIE (VERPLICHT)
- cd mcp-server && npm run typecheck
- cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/step_contracts.test.ts src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts

ACCEPTATIE
- Geen conflicterende contractbeslissingen tussen lagen.
- Fail-closed blijft intact.
- Verificatie PASS.

VERPLICHTE OUTPUT
1) Gewijzigde files
2) Delete-first met file:line
3) Keep met file:line
4) Risico’s
5) Verificatie PASS/FAIL
6) Rollback

70% CONTEXT HANDOVER
- Klaar
- Open TODO per file
- Checks
- Blokkers
- Volgende eerste actie
```

---

## PR-7 (Build/artifact minimalisatie)

```text
PR-ID: PR-7
Titel: Build/deploy artifact minimalisatie

DOEL
- Beperk runtime artifacts tot wat echt nodig is.
- Verwijder build/deploy ballast die complexiteit in stand houdt.

HARD RULES
1) Delete-first.
2) Geen nieuwe artifactlaag.
3) Elke claim met file:line.

BEWIJS (LEES EERST)
- mcp-server/scripts/copy-ui-dist.mjs:19
- mcp-server/Dockerfile:59
- mcp-server/Dockerfile:20
- mcp-server/Dockerfile:60
- mcp-server/src/server/http_routes.ts:485
- docs/mcp_widget_stabilisatie_run_resultaat.md:197
- docs/mcp_widget_stabilisatie_run_resultaat.md:233

SCOPE IN
- mcp-server/scripts/copy-ui-dist.mjs
- mcp-server/Dockerfile
- mcp-server/package.json
- mcp-server/src/server/http_routes.ts (alleen indien artifactpad moet worden versmald)
- docs/mcp_widget_stabilisatie_run_resultaat.md

SCOPE OUT
- Contract/finalize logica
- Idempotency

UIT TE VOEREN VOLGORDE
1) Verminder copy-ui-dist van volledige ui tree naar minimale runtime set.
2) Align Dockerfile checks/copy met minimale runtime set.
3) Verwijder verwijzingen naar verdwenen build artifacts in actieve docs.
4) Verifieer dat /ui/step-card runtime intact blijft.

VERIFICATIE (VERPLICHT)
- cd mcp-server && npm run build
- cd mcp-server && npm run typecheck
- cd mcp-server && node --loader ts-node/esm scripts/contract-smoke.mjs

ACCEPTATIE
- Runtime image bevat alleen noodzakelijke UI artifacts.
- Geen actieve afhankelijkheid van ballast artifacts.
- Verificatie PASS.

VERPLICHTE OUTPUT
1) Gewijzigde files
2) Delete-first met file:line
3) Keep met file:line
4) Risico’s
5) Verificatie PASS/FAIL
6) Rollback

70% CONTEXT HANDOVER
- Klaar
- Open TODO per file
- Checks
- Blokkers
- Volgende eerste actie
```

---

## PR-8 (Gate + CI consolidatie)

```text
PR-ID: PR-8
Titel: Gate en CI consolidatie

DOEL
- Elimineer overlap tussen hard/server/agent/arch gates.
- Maak actieve CI consistent met bestaande scripts en minimale kwaliteitsset.

HARD RULES
1) Delete-first.
2) Geen extra gate-laag toevoegen.
3) Elke claim met file:line.

BEWIJS (LEES EERST)
- mcp-server/package.json:13
- mcp-server/package.json:27
- mcp-server/package.json:28
- mcp-server/package.json:29
- mcp-server/scripts/hard_refactor_gate.mjs:61
- mcp-server/scripts/server_refactor_gate.mjs:107
- mcp-server/scripts/agent_strict_guard.mjs:77
- .github/workflows/ci.yml:134

SCOPE IN
- mcp-server/package.json
- mcp-server/scripts/hard_refactor_gate.mjs
- mcp-server/scripts/server_refactor_gate.mjs
- mcp-server/scripts/agent_strict_guard.mjs
- .github/workflows/ci.yml

SCOPE OUT
- Runtime business logic
- UI render code

UIT TE VOEREN VOLGORDE
1) Definieer 1 geconsolideerde gate-entrypoint.
2) Verwijder of deactiveer overlappende gate scripts/commands.
3) Repareer CI referentie naar niet-bestaand script.
4) Houd typecheck + contractkritische tests + minimale artifacts checks over.

VERIFICATIE (VERPLICHT)
- cd mcp-server && npm run typecheck
- cd mcp-server && npm test
- valideer workflow syntactisch en script-referenties

ACCEPTATIE
- Geen triple-overlap gates meer.
- CI refereert alleen naar bestaande scripts.
- Verificatie PASS.

VERPLICHTE OUTPUT
1) Gewijzigde files
2) Delete-first met file:line
3) Keep met file:line
4) Risico’s
5) Verificatie PASS/FAIL
6) Rollback

70% CONTEXT HANDOVER
- Klaar
- Open TODO per file
- Checks
- Blokkers
- Volgende eerste actie
```

---

## PR-9 (Docs hard alignment)

```text
PR-ID: PR-9
Titel: Docs hard alignment + archivering

DOEL
- Active docs exact laten matchen met minimale architectuur.
- Historische stukken expliciet archiveren i.p.v. actief normerend houden.

HARD RULES
1) Geen generieke tekst zonder bewijs.
2) Alleen actieve docs als norm; historie markeren.
3) Elke claim met file:line.

BEWIJS (LEES EERST)
- docs/mcp_widget_ui_dumbdown_resoluut_execution_plan.dm:10
- docs/mcp_widget_ui_dumbdown_resoluut_execution_plan.dm:32
- docs/mcp_widget_ui_dumbdown_resoluut_execution_plan.dm:35
- mcp-server/docs/ui-interface-contract.md:5
- docs/mcp_widget_stabilisatie_run_resultaat.md:197
- docs/mcp_widget_stabilisatie_run_resultaat.md:233
- .github/workflows/ci.yml:134

SCOPE IN
- docs/mcp_widget_ui_dumbdown_resoluut_execution_plan.dm
- docs/mcp_widget_stabilisatie_run_resultaat.md
- docs/mcp_widget_regressie_living_rapport.md
- mcp-server/docs/ui-interface-contract.md
- docs/simplicity_pr_rollout_2026-03-01.md (status/afsluiting)

SCOPE OUT
- Production code
- CI logic

UIT TE VOEREN VOLGORDE
1) Verwijder actieve instructies die verwijzen naar verwijderde paden/artifacts.
2) Maak 1 actieve simplicity/architecture bron leidend.
3) Label historische runlogs als archief met datum.
4) Controleer op resterende drift-tokens met rg.

VERIFICATIE (VERPLICHT)
- rg -n "step-card.template.html|build-ui.mjs|ui_artifact_parity_check.mjs|/run_step|/test" docs mcp-server .github/workflows

ACCEPTATIE
- Geen conflicterende actieve runtime/build instructies.
- Historie en actieve norm zijn gescheiden.
- Drift-scan schoon of expliciet gemotiveerd.

VERPLICHTE OUTPUT
1) Gewijzigde files
2) Delete-first met file:line
3) Keep met file:line
4) Risico’s
5) Verificatie PASS/FAIL
6) Rollback

70% CONTEXT HANDOVER
- Klaar
- Open TODO per file
- Checks
- Blokkers
- Volgende eerste actie
```

---

## PR-9 status en afsluiting (2026-03-01)

- Status: Uitgevoerd (docs alignment + archivering).
- Leidende actieve normbron (architectuur + contract): `mcp-server/docs/ui-interface-contract.md`.
- Dit rollout-document is procesadministratie; de PR-1 t/m PR-9 promptblokken blijven historisch naslagmateriaal.

### Actief vs archief

- Actief normatief:
  - `mcp-server/docs/ui-interface-contract.md`
- Actief processtatus:
  - deze sectie (`PR-9 status en afsluiting`)
- Archief (niet normerend):
  - `docs/mcp_widget_ui_dumbdown_resoluut_execution_plan.dm`
  - `docs/mcp_widget_stabilisatie_run_resultaat.md`
  - `docs/mcp_widget_regressie_living_rapport.md`

### Drift-token beleid na PR-9

- Hits op oude tokens zijn alleen toegestaan in expliciet gelabelde archief-/historische secties.
- Nieuwe actieve normteksten mogen geen oude runtime/build instructies herintroduceren.
