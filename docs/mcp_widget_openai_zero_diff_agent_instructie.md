# MCP Widget OpenAI Zero-Diff Agent Instructie (v3)

## Scope
Deze opdracht dekt de volledige MCP-app keten voor de widget:
`tool descriptor -> output template/resource -> tool result transport -> ingest -> render -> action lifecycle -> observability`.

In scope:
1. `mcp-server/src/server/mcp_registration.ts`
2. `mcp-server/src/server/run_step_transport.ts`
3. `mcp-server/src/server/run_step_transport_context.ts`
4. `mcp-server/src/server/run_step_transport_stale.ts`
5. `mcp-server/src/handlers/turn_contract.ts`
6. `mcp-server/ui/lib/main.ts`
7. `mcp-server/ui/lib/ui_actions.ts`
8. `mcp-server/ui/lib/ui_render.ts`
9. Testbestanden in `mcp-server/src/**/*.test.ts` die deze keten afdekken
10. Rapportagebestanden in `docs/`

## Achtergrond
Er zijn terugkerende regressies in startup en action-liveness. Daarnaast is vastgesteld dat delen van de implementatie afwijken van het patroon zoals beschreven in de OpenAI Apps SDK-documentatie.

Doel van deze opdracht:
- niet “beter” maken,
- maar **100% conform** maken aan OpenAI-richtlijnen,
- zodat een latere vergelijking “wat doen we anders dan OpenAI?” aantoonbaar uitkomt op: **0 verschillen**.

## Missie
Lever een structurele oplossing met deze harde eindtoestand:
1. Startup eindigt nooit in lege/half shell als eindtoestand.
2. Elke user action eindigt in exact 1 uitkomst:
   - `state_advanced`
   - `explicit_error` (met `reason_code` en zichtbare UX)
3. Geen semantische inconsistentie meer zoals “accepted + geen advance + impliciete success UX”.
4. **Zero-diff OpenAI compliance**: geen functionele of contractuele afwijkingen t.o.v. de relevante OpenAI Apps SDK-documentatie.

## Niet-doel
1. Geen cosmetische UI-fix zonder contractfix.
2. Geen workaround-only retry masking.
3. Geen start-only hardcodepaden.
4. Geen client-side business-state reconstructie buiten server-canonieke bron.

## Verplichte bronnen (eerst lezen)
1. `docs/mcp_widget_regressie_living_rapport.md`
2. `docs/mcp_widget_stabilisatie_run_resultaat.md`
3. `docs/mcp_widget_debug_agent_resultaat.md`
4. `mcp-server/docs/ui-interface-contract.md`
5. `mcp-server/docs/contracts/language-contract.md`
6. OpenAI Apps SDK:
   - https://developers.openai.com/apps-sdk/reference
   - https://developers.openai.com/apps-sdk/mcp-apps-in-chatgpt
   - https://developers.openai.com/apps-sdk/build/state-management
   - https://developers.openai.com/apps-sdk/deploy/testing
   - https://developers.openai.com/apps-sdk/deploy/troubleshooting

## OpenAI Zero-Diff Verplichting (hard)
Maak en onderhoud tijdens de implementatie een **compliance matrix** met per punt:
- OpenAI-doc uitspraak (kort)
- Bronlink
- Huidige code-locatie
- Gap ja/nee
- Fix-commit / fix-bestand
- Bewijs (test/log)

Minimaal deze checklistpunten moeten 100% “Geen gap” zijn:
1. Tool descriptor metadata en resource/template wiring.
2. Juiste scheiding tussen model-zichtbare data en component-only data.
3. Transport/bridge flow conform MCP apps patroon (geen concurrerende custom hoofdroute).
4. Deterministische ingest + render authority.
5. Uniform action lifecycle contract en verplichte velden.
6. Fail-closed foutpaden met expliciete reason codes.
7. Test/deploy/troubleshooting gedrag in lijn met OpenAI guidance.

## Reeds bekende risicogaten die je expliciet moet beoordelen
1. Gemengde ingestpaden (`ui/notifications/tool-result` versus `openai:set_globals` + `toolOutput`).
2. Dubbele kanaalinhoud die drift kan veroorzaken.
3. Lege `client_action_id_echo` op interactieve paden.
4. `accepted` zonder advance dat user-facing als fout/geen-progress uitkomt.

Je mag deze niet overslaan; je moet per punt bewijzen of het nog een gap is of opgelost is.

## Uitvoeringsstrategie (verplicht)
### Fase 1: Baseline zonder aannames
1. Leg huidige status vast met file/line bewijs.
2. Vul compliance matrix “as-is”.
3. Label elk gap als:
   - `spec_gap`
   - `implementation_gap`
   - `evidence_gap`

### Fase 2: Implementatie
1. Fix alleen via structurele ketenaanpassingen.
2. Verwijder of harmoniseer paden die OpenAI-conform gedrag ondermijnen.
3. Houd UI dom; servercontract blijft leidend.
4. Geen ad-hoc uitzonderingen per knop of per stap.

### Fase 3: Verificatie
Draai verplicht:
1. `cd mcp-server && npm run typecheck`
2. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts`
3. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts`

Voeg tests toe waar nodig tot alle relevante gaps gedekt zijn.

### Fase 4: Live bewijs (indien toegang beschikbaar)
Lever timestamp-bewijs voor:
1. `run_step_request` (o.a. `ACTION_START` en `TEXT_INPUT`)
2. `run_step_action_liveness_dispatch`
3. `run_step_action_liveness_ack`
4. `run_step_action_liveness_advance` of `run_step_action_liveness_explicit_error`
5. `run_step_response` (`contract_id`, `ui_view_mode`, `ack_status`, `state_advanced`, `reason_code`)
6. `run_step_render_source_selected`
7. startup markers (canonical hit/miss)

## Definition of Done (strikt)
1. Startup hangt niet meer in lege/half eindtoestand.
2. Geen silent no-op meer voor acties.
3. Elke actie eindigt aantoonbaar in `state_advanced` of `explicit_error`.
4. `client_action_id_echo` is non-empty op alle interactieve paden.
5. Verplichte tests groen.
6. Compliance matrix staat op **0 open gaps**.
7. Als gevraagd wordt “wat doen we anders dan OpenAI?”, is het antwoord onderbouwd: **0 verschillen**.

## Toegang en rapportageplicht living document
Je hebt expliciet lees/schrijftoegang nodig tot:
- `docs/mcp_widget_regressie_living_rapport.md`

Na afronding moet je daar verplicht toevoegen:
1. Hypothese
2. Waarom deze hypothese
3. Exacte wijziging(en)
4. Verwachte uitkomst
5. Testresultaten lokaal
6. Live observatie
7. AWS/logbewijs met timestamps
8. Uitkomst (`Bevestigd/Weerlegd/Onbeslist`)
9. Wat bleek achteraf onjuist
10. Wat was gemist
11. Besluit
12. **OpenAI zero-diff compliance matrix (eindstatus)**
13. **Waarom vorige aanpak niet zero-diff was**
14. **Welke laatste verschillen zijn verwijderd**

Daarnaast verplicht updaten:
- `docs/mcp_widget_stabilisatie_run_resultaat.md`

## Verboden
1. Geen claim “OpenAI-conform” zonder matrix + bewijs.
2. Geen “werkt lokaal dus klaar” zonder live/log of expliciete evidence-gap notitie.
3. Geen nieuwe workaroundlaag bovenop bestaand gedrag.
4. Geen afsluiting met open gaps.

## Copy-paste opdracht voor de uitvoerende agent
```text
Voer een zero-diff OpenAI Apps SDK herstel uit op de MCP-widget keten.

Start met:
1) Scope en achtergrond valideren
2) Baseline compliance matrix opstellen (OpenAI docs vs huidige code)
3) Alle gaps sluiten met structurele fixes
4) Verplichte tests draaien
5) Live/logbewijs verzamelen waar toegang bestaat
6) Living document + stabilisatie rapport volledig bijwerken

Hard doel:
- Als na afloop gevraagd wordt “wat doen we nog anders dan OpenAI?”, moet het aantoonbare antwoord zijn: 0 verschillen.

Verplicht te lezen:
- docs/mcp_widget_regressie_living_rapport.md
- docs/mcp_widget_stabilisatie_run_resultaat.md
- docs/mcp_widget_debug_agent_resultaat.md
- mcp-server/docs/ui-interface-contract.md
- mcp-server/docs/contracts/language-contract.md
- https://developers.openai.com/apps-sdk/reference
- https://developers.openai.com/apps-sdk/mcp-apps-in-chatgpt
- https://developers.openai.com/apps-sdk/build/state-management
- https://developers.openai.com/apps-sdk/deploy/testing
- https://developers.openai.com/apps-sdk/deploy/troubleshooting

Verplicht bewijs:
- file/line bewijs van elke opgeloste gap
- lokale test output
- CloudWatch timestamps (indien beschikbaar)
- finale compliance matrix met 0 open gaps

Verplicht na afloop:
- update docs/mcp_widget_regressie_living_rapport.md
- update docs/mcp_widget_stabilisatie_run_resultaat.md
```
