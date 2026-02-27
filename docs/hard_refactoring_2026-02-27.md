# Hard Refactoring Briefing - 2026-02-27

## Context
Deze briefing vervangt patch-gedreven stabilisatie voor de MCP widget met een rigoureuze CORE-reset.
Doel: 1 server-gestuurde waarheid, 1 renderpad, 0 fallback-spaghetti.

Probleemstatus op 2026-02-27:
- Tuple parity en render-source authority zijn in live logs vaak correct.
- UX kan nog steeds breken (blank/half first paint) ondanks `invariant_ok:true` in guard-events.
- Conclusie: huidige laag-op-laag ondervanging is onvoldoende; architectuur moet worden versimpeld.

## Niet-onderhandelbare uitgangspunten
1. SSOT blijft hard: `_meta.widget_result` is render-authority.
2. Ordering tuple blijft leidend: `bootstrap_session_id`, `bootstrap_epoch`, `response_seq`, `host_widget_session_id`.
3. UI blijft dumb: render + action dispatch, geen business-routing.
4. MCP/OpenAI compatibiliteit moet intact blijven (`openai/outputTemplate`, `openai/widgetAccessible`, tool-result shape).
5. Delete-first aanpak: oude alternatieve paden worden verwijderd, niet “ook nog ondersteund”.

## Target Architectuur (CORE-only)
1. Exact 1 centrale serverfunctie bepaalt view-state: `buildCanonicalWidgetState(...)`.
2. Toegestane modes: alleen `prestart`, `interactive`, `blocked`.
3. Elke mode is altijd direct renderbaar (dus nooit blank/half als eindtoestand).
4. UI volgt server-output 1-op-1; geen client-side mode-correcties.
5. Alle view-beslislogica buiten de centrale functie wordt verwijderd.

## Centrale Verantwoordelijkheden (Server-Only)
Alles hieronder moet centraal op serverniveau afgehandeld worden (1 plek, 1 waarheid):

1. Sessies en ordering
- `bootstrap_session_id`, `bootstrap_epoch`, `response_seq`, `host_widget_session_id`
- stale/out-of-order accept/drop policy
- monotone sequence policy
- idempotency/dedupe policy

2. Flow state machine
- `current_step`, `started`
- toegestane step-transities
- ack-zonder-advance policy
- blocked/terminal states

3. Language en locale
- detectiebron + prioriteit
- `language`, `locale`
- `ui_strings_requested_lang`, `ui_strings_lang`
- fallback policy en vertaalstatus-gating

4. Step registry en contract mapping
- step lijst en step-eisen
- specialist-selectie
- `contract_id`/menu mapping per step

5. Canonical view builder
- enige plek die `ui.view.mode` bepaalt
- alleen `prestart|interactive|blocked`
- renderbaarheidsgarantie per mode
- start-action verplichting waar van toepassing

6. UI actions contract
- action codes als bron van waarheid
- toegestane actions per step/mode
- label keys en volgorde
- onbekende action fail-closed

7. Invariants en contract-validatie
- `step_0 + started=false => prestart + ACTION_START`
- `interactive => prompt/body/actions minimaal 1`
- hard fail-closed bij contractbreuk

8. MCP output contract
- `_meta.widget_result` als enige render-authority
- correcte `structuredContent` vs `_meta` scheiding
- `openai/outputTemplate` en `openai/widgetAccessible` compatibel

9. Observability en audit
- 1 canonical decision event per response
- correlation/session/trace altijd gevuld
- reason-codes voor accept/drop/block

10. Safety en sanitization
- log redaction (secrets/tokens)
- veilige outputvelden
- contract-safe error payloads

11. Versioning en migration policy
- state/contract version checks
- expliciete upgrade-required policy

12. Test-autoriteit
- sequence tests op echte flow (`startup -> start -> next render`)
- out-of-order/duplicate tuple tests
- invariant tests per mode

Niet toegestaan in UI:
- mode-beslissingen
- business-routing/fallback transities
- servercontract-reparaties

## Hard Delete Scope
Verwijder alle code die:
1. `ui.view.mode` buiten de centrale serverfunctie bepaalt of corrigeert.
2. “fallback/recovery/special handling” uitvoert voor lege payloads in UI.
3. parallelle render-authority creëert naast `_meta.widget_result`.
4. post-hoc guard patches doet in meerdere lagen.
5. dubbele contractbeslissingen logt die niet uit de centrale functie komen.

## ALL FILES Sweep Protocol (Verplicht)
Deze run is pas geldig als **alle relevante codebestanden** zijn bekeken, inclusief tests en helpers.

1. Scope voor volledige sweep:
- `mcp-server/src/**`
- `mcp-server/ui/lib/**`
- `mcp-server/server.ts`
- `mcp-server/scripts/**` (waar relevant voor UI/build/contract)
- `mcp-server/src/**/*.test.ts` (tests mogen geen legacy pad normaliseren of maskeren)

2. Verplicht artefact:
- Maak een bestand met de volledige file-inventory van de sweep en markeer per bestand: `reviewed`, `changed`, of `deleted`.
- Naam: `docs/hard_refactoring_sweep_manifest_2026-02-27.md`.

3. Geen uitzonderingen:
- Helpers, testcode en tijdelijke compat-lagen vallen onder dezelfde delete-first regel.
- “Alleen in test nog laten staan” is niet toegestaan als het legacy gedrag legitimeert.

## Zero-Tolerance Gates (Auto-Fail)
De refactor-run faalt als een van deze condities waar is:

1. Meer dan 1 codepad bepaalt `ui.view.mode`.
2. UI bevat nog mode-correctie/fallback logica op client.
3. Er bestaan nog alternatieve render-authority paden naast `_meta.widget_result`.
4. Testen dekken nog oude fallbackpaden als “acceptabel gedrag”.

Minimale grep-gates (na refactor, door agent uit te voeren en te rapporteren):
- `rg -n \"interactive_missing_content|forced_prestart|forced_blocked|guard_patch_applied|fallback|recovery\" mcp-server/src mcp-server/ui/lib`
- `rg -n \"ui\\.view\\.mode\\s*=|mode:\\s*['\\\"](prestart|interactive|blocked)['\\\"]\" mcp-server/src mcp-server/ui/lib`
- `rg -n \"render_source|widget_result|meta\\.widget_result\" mcp-server/src mcp-server/ui/lib`

Alle resterende matches moeten expliciet verklaard worden als canonical core-code; anders verwijderen.

## Verplicht Automated Gate Commando
Voor oplevering moet onderstaande command succesvol draaien:

```bash
cd mcp-server && npm run gate:hard-refactor
```

Regel:
- Zonder `gate:hard-refactor` PASS is de run ongeldig.

## Uitvoering in 3 Snedes
1. Server Consolidatie
- Introduceer centrale canonical builder.
- Routeer alle bestaande server view-decision paden erdoorheen.
- Verwijder oude decision branches in `turn_contract.ts`, `run_step_runtime.ts`, `run_step_ui_payload.ts`, `server.ts`.

2. UI Stripdown
- Reduceer `main.ts`, `ui_actions.ts`, `ui_render.ts`, `locale_bootstrap_runtime.ts` tot:
  - ingest van `_meta.widget_result`,
  - pure rendering van canonical mode,
  - action dispatch.
- Verwijder alle client-side fallback/recovery/business branches.

3. Legacy Purge + Evidence
- Verwijder resterende dode/alternatieve paden.
- Centraliseer observability op 1 event: `run_step_canonical_view_emitted`.
- Lever bewijs via tests + 5 live flows.

## Hard Invariants
1. `step_0 + started=false` => mode `prestart` + start action aanwezig.
2. `interactive` => minimaal 1 renderbaar element (`prompt` of `body` of `actions`).
3. Geen mode behalve `prestart|interactive|blocked`.
4. Geen UI pad dat zelf mode wisselt zonder server-output.

## Done Criteria (Hard)
1. In hele codebase bestaat exact 1 plek die view mode beslist.
2. Geen blank/half eindtoestand in 5/5 live flows.
3. Startknop werkt deterministisch op eerste klik.
4. Tweede scherm is direct renderbaar.
5. Geen SSOT/MCP regressie.
6. Sweep-manifest is compleet en toont dat ALLES in scope is beoordeeld.

## Brongebruik voor volgende agent (tegen verwarring)
Gebruik **niet** het volledige living document als primaire instructiebron.

Wel doen:
1. Gebruik deze briefing als primaire execution-context.
2. Gebruik `docs/mcp_widget_regressie_living_rapport.md` alleen als bewijsarchief (laatste 2 pogingen + log IDs), niet als oplossingsrichtlijn.
3. Gebruik `docs/mcp_widget_stabilisatie_run_resultaat.md` voor feitelijke wijzigingshistorie.
4. Gebruik `docs/mcp_widget_stabilisatie_next_agent_prompt.md` alleen als handoff-checklist.

Waarom:
- Het living document bevat veel historische hypotheses en zijpaden; nuttig voor bewijs, maar risico op nieuwe patch-lagen.
- Deze run vraagt expliciet om architectuur-simplificatie, niet incrementele mitigatie.

## Eerste 3 Acties voor de agent
1. Maak een expliciete delete-map per bestand (welke branches/fallbacks eruit gaan).
2. Implementeer centrale canonical builder en routeer alle serverbeslissingen daar doorheen.
3. Strip UI naar pure renderer/dispatcher en verwijder alle mode-correctielogica.

## Copy-Paste Prompt (Ultra Kort)
Gebruik dit als startprompt voor de volgende agent:

```text
Volg strikt: docs/hard_refactoring_2026-02-27.md als primaire instructie.
Doel: CORE-only refactor, geen patches.
Regels:
1) 1 centrale serverfunctie bepaalt altijd de canonieke view-state.
2) UI is dumb: alleen render + dispatch.
3) Delete-first: alle fallback/recovery/alternatieve mode-paden verwijderen.
4) SSOT/MCP contract blijft hard compliant via _meta.widget_result + ordering tuple.
Brongebruik:
- Primary: docs/hard_refactoring_2026-02-27.md
- Evidence-only: laatste 2 pogingen in docs/mcp_widget_regressie_living_rapport.md
Lever op:
- codewijzigingen + delete-map
- tests
- update van run_resultaat, living_rapport, next_agent_prompt
- gate-output van: `cd mcp-server && npm run gate:hard-refactor`
Stop bij 70%-contextbudget of externe blocker met volledige handoff.
```

## Verplichte Afsluiter Na Deze Run
Na afronding van de refactor-run moet de agent altijd een concrete instructie voor de volgende agent opleveren, gericht op:
1. Volledige “done” validatie met live 5/5 bewijs.
2. Exacte live-check stappen (flow-per-flow: startup -> startklik -> tweede scherm).
3. Vereiste correlatie-events en acceptatiecriteria per flow.
4. Duidelijke pass/fail matrix en beslisregel voor definitief “done” of vervolgactie.
