# Agent Instructie - Context & Instruction Efficiency Audit

## Doel
Breng tot op detailniveau in kaart waarom er per LLM-call onnodig veel context/instructies worden meegestuurd, en lever een rapport waarmee een andere agent direct gerichte optimalisaties kan uitvoeren.

## Scope
- Focus op token-efficiency van runtime calls (vooral input/prompt tokens).
- Focus op stapflow `step_0` t/m `presentation`, inclusief specialist calls, wording flows en explain-more paden.
- Focus op structurele oorzaken (shared promptbouw, state-injectie, duplicatie), niet op incidentele losse cases.

## Harde regels
1. Fase 1: alleen analyse, geen codewijzigingen.
2. Elk inzicht moet bewijs hebben:
   - lokale repo-evidence (bestand + regel)
   - sessie-log evidence (sessie-id + turn-id + tokens)
3. Geen aannames zonder verificatie in code/logs.
4. Verplicht cross-step onderzoek; niet alleen 1 stap optimaliseren.
5. Geen quick-fix advies dat alleen symptomen maskeert.
6. Adviezen moeten uitvoerbaar zijn door een andere agent zonder extra interpretatie.

## Verplichte lokale inspectie
- `mcp-server/src/handlers/run_step_runtime_execute.ts`
- `mcp-server/src/handlers/run_step_preflight.ts`
- `mcp-server/src/handlers/run_step_runtime_action_routing.ts`
- `mcp-server/src/handlers/run_step_pipeline.ts`
- `mcp-server/src/handlers/specialist_dispatch_safe.ts`
- `mcp-server/src/core/model_routing.ts`
- `mcp-server/config/model-routing.json`
- `mcp-server/src/core/actioncode_registry.ts`
- `mcp-server/src/core/session_token_log.ts`
- `mcp-server/src/steps/*.ts` (alle specialist-instructions)
- `mcp-server/session-logs/*.md`

## Onderzoeksopdracht
1. Maak een complete call-inventory
- Per runtime pad exact vastleggen waar LLM-calls starten.
- Kolommen:
  - `call_id`
  - `file:line`
  - `step_id`
  - `specialist`
  - `trigger` (action_code/intent/route)
  - `model`
  - `attempts`

2. Reconstructie promptopbouw per call
- Herleid per call exact welke inputblokken meegaan:
  - systeeminstructies
  - step-instructies
  - state/context blokken
  - recap/known facts
  - UI/i18n metadata
  - user message
  - route/action wrappers
- Label per blok:
  - `mandatory` of `optional`
  - `stable` of `volatile`
  - `cacheable` of `non-cacheable`

3. Token-attributie (detailniveau)
- Gebruik echte sessielogs voor totaal-token verbruik.
- Splits per model, step, specialist, intent en action_code.
- Bepaal top 20 duurste call-patronen op:
  - `totale tokens`
  - `frequentie`
  - `cumulatieve impact`

4. Waste-analyse
- Identificeer exact waar tokenwaste ontstaat:
  - dubbele contextinjectie
  - herhaalde lange instructies
  - onnodige explain-more calls
  - overbrede state snapshots
  - duplicate framing in message + recap + heading
  - retry/repair loops met vrijwel gelijke context

5. Optimalisatie-voorstel (structureel)
- Lever een “Efficiency vNext” matrix:
  - `pad` (step/specialist/intent/action)
  - `huidige contextblokken`
  - `voorgestelde contextset`
  - `tokenbesparing (schatting + onderbouwing)`
  - `latency impact`
  - `kwaliteitsrisico (laag/middel/hoog)`
  - `fallback/rollback strategie`

6. Implementatie-backlog voor andere agent
- Vertaal bevindingen naar uitvoerbare work items:
  - `ticket_id`
  - `doel`
  - `concrete wijziglocaties`
  - `acceptatiecriteria`
  - `testcases`
  - `risico`
  - `owner` (runtime/prompt/ui/i18n)

## Verplicht rapportformaat (in dit document)
Gebruik exact deze secties:

1. **Executive Summary**
- Max 15 regels.
- Noem huidige tokenbaseline en grootste verspillers.

2. **Meetmethodiek**
- Hoe tokendata is verzameld.
- Welke logs/sessies zijn gebruikt.
- Beperkingen van meting.

3. **Call Inventory**
- Tabel met alle call-paden.

4. **Tokenverbruik Analyse**
- Per model / step / specialist / action_code / intent.
- Top 20 duurste paden.

5. **Root Causes van Inefficiency**
- Per oorzaak: bewijs + impact + herhaalbaarheid over steps.

6. **Efficiency vNext Matrix**
- Huidig -> nieuw per pad, met verwachte besparing.

7. **Actieplan voor Implementatie-agent**
- Geprioriteerde backlog (P0/P1/P2), direct uitvoerbaar.

8. **Validatie & Guardrails**
- Tests om regressie te voorkomen:
  - contract-stabiliteit
  - kwaliteit
  - latency
  - tokenbudget

9. **Beslisdocument (owner approvals)**
- Wat moet expliciet worden goedgekeurd voordat implementatie start.

## Verplichte validatiecriteria
- Geen contract regressies in UI payload / specialist output.
- Tokenbudget-doel per callpad expliciet gedefinieerd.
- Max latency-doel per steppad expliciet gedefinieerd.
- Kwaliteitsbehoud: geen betekenisverlies in step-output.
- Meetbaar before/after plan met rollbackpad.

## Fase-gates
1. Stop na analyse + rapport (geen code).
2. Vraag expliciet akkoord op voorgestelde optimalisaties.
3. Na akkoord: maak implementatieplan (nog geen code).
4. Na tweede akkoord: pas implementatie uitvoeren.
5. Na implementatie: lever verificatierapport + rollback-resultaat.

## Definition of Done
- Rapport is volledig, evidence-based, en direct uitvoerbaar voor een implementatie-agent.
- Voor elke voorgestelde optimalisatie is duidelijk:
  - waar aanpassen
  - waarom
  - verwacht effect
  - risico
  - hoe te testen
