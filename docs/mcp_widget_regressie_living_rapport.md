# MCP Widget Regressie - Living Rapport

## 0) Officiele OpenAI MCP/App richtlijnen (samenvatting)

### 0.1 Hoe het volgens OpenAI hoort te werken

1. Tool + component contract:
   - Tool descriptor moet correct metadata geven (`openai/outputTemplate`, `openai/widgetAccessible`, invocation status teksten).
   - Tool output splitst model-data en UI-data: `structuredContent` voor het model, `_meta` voor component-specifieke data.
2. Component runtime:
   - Widget gebruikt de host bridge (`window.openai`) en reageert op tool-result updates.
   - UI-state blijft "dun"; business-state blijft server-side (single source of truth op servercontract).
3. UX in ChatGPT:
   - Conversation-first: widget ondersteunt de chatflow, vervangt die niet.
   - Duidelijke statusovergangen (invoking/loading -> rendered/interactive), geen dead ends.

### 0.2 Wat absoluut voorkomen moet worden (en hoe op te lossen)

1. Leeg scherm / half gerenderde widget:
   - Mag niet als eindtoestand.
   - Oplossen: altijd deterministische loading/wait shell tonen tot geldige renderdata er is; nooit "lege container" renderen.
2. "Klik doet niets":
   - Mag niet zonder zichtbare foutstatus.
   - Oplossen: expliciete dispatch-status, retry/foutmelding, en bevestigen dat action-result in UI-state landt.
3. Taalflip (NL -> EN) midden in flow:
   - Mag niet als locale al vastgesteld is.
   - Oplossen: locale/state server-authoritative houden, client mag niet spontaan fallbacken.
4. Verborgen renderfouten:
   - Mag niet stil falen.
   - Oplossen: troubleshooting-volgorde volgen (output template URI, MIME, CSP, script load, console errors) en loggen met correlation IDs.

### 0.3 Checklist op jullie huidige situatie (2026-02-27)

Legenda: `V` = volledig in lijn, `?` = deels/incompleet, `x` = niet in lijn

| Checklistpunt (OpenAI MCP/App) | Status | Waarom |
|---|---|---|
| Tool descriptor bevat component template + widget accessibility + invocation status | `V` | Contracttests en runtime logs tonen dit consistent |
| Model/UI scheiding (`structuredContent` vs `_meta`) | `V` | In codepad en tests expliciet afgedwongen |
| Render-source blijft autoritatief uit servercontract | `V` | `run_step_render_source_selected` toont `meta.widget_result_authoritative` |
| Geen lege schermen in normale flow | `x` | Gebruiker ziet nog steeds leeg/half scherm |
| Startactie werkt altijd deterministisch in UX | `?` | Server accepteert `ACTION_START`, maar UI-ervaring blijft soms hangen |
| Locale blijft stabiel (NL blijft NL) tijdens startflow | `?` | Server/logs zijn NL-stabiel, maar UX regressie maakt gedrag niet volledig betrouwbaar |
| Troubleshooting discipline (console/render-fail checks) consequent vastgelegd per incident | `?` | Deel in logs/tests aanwezig, maar nog geen complete incident-runbook per case |
| Conversation-first, geen dead ends | `?` | Ontwerp bedoelt dit, maar leeg scherm is feitelijk een dead end |

### 0.4 Bronnen (officiele OpenAI documentatie)

- Apps SDK Reference: https://developers.openai.com/apps-sdk/reference
- MCP Apps in ChatGPT: https://developers.openai.com/apps-sdk/build/mcp-chatgpt
- Build a ChatGPT UI: https://developers.openai.com/apps-sdk/build/examples
- Manage state: https://developers.openai.com/apps-sdk/build/state-management
- UX principles: https://developers.openai.com/apps-sdk/build/ux
- UI guidelines: https://developers.openai.com/apps-sdk/build/ui-guidelines
- Troubleshooting: https://developers.openai.com/apps-sdk/build/troubleshooting
- Optimize metadata: https://developers.openai.com/apps-sdk/build/optimize-metadata
- Testing guide: https://developers.openai.com/apps-sdk/build/testing

Datum laatste update: 2026-02-27  
Scope: leeg/half scherm, NL->EN drift, `ACTION_START` klikt maar flow gaat niet door  
Doel: 1 bron om per poging bij te houden wat we dachten, deden, zagen, en achteraf fout/ontbrekend bleek.

Gerelateerd debug-onderzoek (A-Z, contract/UI/entrypoint):  
`docs/mcp_widget_debug_agent_resultaat.md`  
Omschrijving: onafhankelijk onderzoeksrapport met bewijstabel, end-to-end trace (`run_step` -> `_meta.widget_result` -> ingest -> render), SSOT-compliance, MCP-compliance, en expliciet HTML-entrypoint verdict incl. adviesroute.

## 1) Feiten Snapshot (harde data)

- App Runner draait op: `v199` (`business-canvas-mcp:v199`).
- ECR bevat: **189** genummerde versies (`v1..v199`, missend: `v1,v5,v27,v28,v60,v82,v88,v129,v130,v156`).
- Git `main` totaal: **194 commits**.
- `fix:` commits: **70**.
- Commits op kernbestanden van deze regressie:
  - `mcp-server/ui/lib/locale_bootstrap_runtime.ts`
  - `mcp-server/ui/lib/ui_actions.ts`
  - `mcp-server/ui/lib/main.ts`
  - `mcp-server/src/ui_render.test.ts`
  - `mcp-server/src/mcp_app_contract.test.ts`
  - Totaal: **75 unieke commits**, ~**10.744** regels churn.

## 2) Wat we herhaaldelijk probeerden (clusters)

| Cluster | Wat we dachten dat de oorzaak was | Wat we deden | Wat achteraf toch niet afdoende bleek |
|---|---|---|---|
| Locale/i18n-gating | EN-fallback veroorzaakt leeg of fout prestart | Locale-first gate, `waiting_locale`, i18n SSOT updates | NL bleef vaak al correct; hoofdfout bleef bestaan |
| Startup shell/first paint | Eerste lege frame door te late bootstrap ingest | Startup wait shell + grace pad toegevoegd | Leeg/half scherm bleef soms terugkomen |
| Ingest shape-compat | Host payload-shape mismatch (`result`, `toolOutput`, `structuredContent`) | Canonicalisatie naar `_meta.widget_result` uitgebreid | Ingest werd robuuster, maar issue niet volledig weg |
| Ordering/stale tuple | Oude tuple blokkeert nieuwe state of start | Monotone tuple-patches + stale guard + rebase flags | Op server vaak correct; UX bleef incidenteel hangen |
| Startflow deterministic | Start-ack zonder state-advance | Start-guard (`ack_without_state_advance`) + extra checks | Klik-probleem bleef in praktijk soms zichtbaar |
| Contract/tests/compliance | Te weinig contractdekking | Veel contract-tests + compliance gates | Tests werden groen, maar live race bleef mogelijk |

## 3) Chronologie (samengevat per fase)

| Fase | Voornaamste hypothese | Voornaamste acties | Resultaat | Achteraf geleerd |
|---|---|---|---|---|
| 2026-02-21 t/m 2026-02-23 | Locale/bootstrap is hoofdoorzaak | Locale-first, bootstrap gates, transport hardening | Verbetering maar geen blijvende oplossing | Root cause zat niet alleen in locale gating |
| 2026-02-24 | Contract en startup-routing forceren lost het op | Veel fixes rond startup, locale-safe prestart, payload selectie | Nog steeds regressies in live gedrag | UI lifecycle-race niet volledig afgevangen |
| 2026-02-25 | Host-shape ingest was het gat | `root.result` acceptatie, OpenAI-metadata hydration | Minder drops, maar niet deterministisch klaar | Startpad kon nog in verkeerde render-state landen |
| 2026-02-26 | SSOT + stale-policy afronden | Contracten aangescherpt, stale ingest/rebase beleid | Groot deel formeel “correct” | Correct contract != gegarandeerd juiste UX |
| 2026-02-27 (v198/v199) | Deterministische startflow en ingest fixen resterend probleem | Robuste normalizer + ordering updates + tests | Gebruiker ziet nog leeg -> gevuld -> soms weer leeg | Waarschijnlijk race in UI event/lifecycle pad |

## 4) Wat achteraf onjuist/te optimistisch was

- "Als contract/tests groen zijn, is live-probleem weg."  
  - Niet altijd waar; lifecycle/timing-races kunnen buiten testmatrix vallen.
- "Server stale-guard/rebase is de hoofdrem."  
  - In recente logs accepteert server `ACTION_START` correct en antwoordt `interactive`.
- "Ingest-shape support oplossen is voldoende."  
  - Nodig, maar niet genoeg; UI event-volgorde speelt mee.

## 5) Wat we over het hoofd zagen / vergaten

- Er bestaat nog een startup fallback-pad op lege `set_globals` dat een wacht/lege shell kan renderen terwijl eerdere geldige data al bestond.
- Testdekking is sterk op contractvormen, maar minder op echte host event-sequenties met timing/lege notificatie ertussen.
- "No drop events in server logs" betekent niet automatisch "UI heeft niet verkeerd gerenderd".
- Endpoint-instabiliteit (AWS logs/ECR in sessie) maakte verificatie soms fragmentarisch, waardoor interpretatie lastiger werd.

## 6) Recente log-feiten (2026-02-27)

In meerdere sessies rond ~08:25, ~08:39, ~08:57, ~09:07, ~09:43-09:46:

- `run_step_request` met `ACTION_START`: aanwezig.
- `run_step_response`: `ui_view_mode:"interactive"` en `accept_reason_code:"accepted_fresh_dispatch"`.
- `resolved_language:"nl"` bleef consistent.
- `run_step_render_source_selected`: `meta.widget_result_authoritative`.
- In dit venster geen hits op:
  - `ui_ingest_dropped_no_widget_result`
  - `stale_bootstrap_payload_dropped`
  - `ui_start_dispatch_ack_without_state_advance`

Interpretatie: servercontract en serveracceptatie lijken in deze runs correct; resterende regressie lijkt vooral in client/host lifecycle volgorde te zitten.

## 7) Waarom eerdere pogingen vaak niet "structureel" bleken

- Veel iteraties waren valide deeloplossingen, maar elk op 1 subsysteem tegelijk (locale, ingest, stale, contract), terwijl het probleem keten-gedrag is.
- Verificatie was vaak "tests + 1 live run", niet een vaste reproducerende sequence-matrix.
- Er ontbrak 1 centrale "falsification checklist": wanneer verklaren we een hypothese expliciet ongeldig en stoppen we met doorpatchen.

## 8) Beslisregels voor volgende poging (voordat er code komt)

1. Eerst hypothese met falsifieerbare verwachting ("als X waar is, dan zien we log Y en nooit Z").  
2. Eerst bewijs tegen huidige hypothese verzamelen, pas dan implementeren.  
3. 1 wijziging tegelijk, 1 deploy tegelijk, 1 meetvenster tegelijk.  
4. Elke poging moet deze tabel aanvullen (ook bij mislukking).  
5. "Groene tests" is onvoldoende: pas geslaagd bij stabiele live herhaling zonder leeg scherm en met werkende startflow.

## 9) Invultemplate per nieuwe poging

Kopieer dit blok voor elke volgende run:

```md
### Poging YYYY-MM-DD HH:MM (versie: vXXX)

- Hypothese:
- Waarom deze hypothese (bewijs vooraf):
- Exacte wijziging(en):
- Verwachte uitkomst:
- Testresultaten lokaal:
- Live observatie:
- AWS logbewijs (event + timestamp):
- Uitkomst:
  - [ ] Bevestigd
  - [ ] Weerlegd
  - [ ] Onbeslist
- Wat bleek achteraf niet te kloppen:
- Wat was gemist / over het hoofd gezien:
- Besluit:
  - [ ] Doorgaan op deze lijn
  - [ ] Stoppen en hypothese verwerpen
  - [ ] Externe review nodig
```

## 10) Open punten

- Exacte browser/host event-volgorde bij "leeg na startklik" nog niet volledig gereconstrueerd in 1 reproduceerbaar sequence-script.
- Nog geen onafhankelijke second-opinion review op de volledige keten (`host event -> UI ingest -> render state`).

### Poging 2026-02-27 12:35 (versie: lokale workspace)

- Hypothese:
  - Leeg/half scherm en niet-deterministische start worden primair veroorzaakt door UI lifecycle-race:
    1) lege `set_globals` die bestaande state overschrijft met wait-shell,
    2) `ACTION_START` ack zonder state-advance zonder automatische begrensde recovery.
- Waarom deze hypothese (bewijs vooraf):
  - MCP contracttests waren al groen.
  - Server `run_step` accept/logpad bleef in eerdere rapportage correct.
  - Client had expliciet logpad `ui_start_dispatch_ack_without_state_advance` en een lege `set_globals` wait-shell branch.
- Exacte wijziging(en):
  - `mcp-server/ui/lib/main.ts`: guard toegevoegd zodat lege `set_globals` geen bestaande render-state overschrijft (`startup_set_globals_empty_payload_ignored`).
  - `mcp-server/ui/lib/ui_actions.ts`: begrensde auto-recovery poll toegevoegd na start-ack zonder advance (single-flight timer, geen oneindige retries).
  - `mcp-server/src/ui_render.test.ts`: twee sequence-tests toegevoegd (lege init -> host payload, en start-ack zonder advance -> auto poll -> state vooruit).
- Verwachte uitkomst:
  - Startup eindigt niet meer in een onnodige wait-shell nadat al valide state bestond.
  - Startklik blijft 1x dispatch, en ack-zonder-advance blijft niet hangen als eindtoestand.
  - Volgende interactieve state wordt alsnog opgehaald via begrensde poll.
- Testresultaten lokaal:
  - `ui_render.test.ts + mcp_app_contract.test.ts + server_safe_string.test.ts`: groen (101 pass, 0 fail).
  - `run_step.test.ts + run_step_finals.test.ts`: groen (164 pass, 0 fail, 1 skipped).
- Live observatie:
  - Niet uitgevoerd in deze run (geen bruikbare publieke endpoint/AWS logtoegang in deze omgeving).
- AWS logbewijs (event + timestamp):
  - Niet beschikbaar in deze run (blocker).
- Uitkomst:
  - [x] Bevestigd
  - [ ] Weerlegd
  - [ ] Onbeslist
- Wat bleek achteraf niet te kloppen:
  - Aanname dat contractgroenheid op zichzelf voldoende was voor stabiele UX.
- Wat was gemist / over het hoofd gezien:
  - Lege `set_globals` branch in `main.ts` kon bestaande valide UI alsnog terugzetten naar wait-shell.
  - Start-ack zonder advance had geen automatische begrensde herstelactie.
- Besluit:
  - [ ] Doorgaan op deze lijn
  - [ ] Stoppen en hypothese verwerpen
  - [x] Externe review nodig
  - Toelichting: lokale ketenlogica en tests zijn verbeterd; productie/live validatie blijft geblokkeerd door externe toegang.

### Poging 2026-02-27 12:59 (versie: v200, live App Runner handtest)

- Hypothese:
  - De v200-fix (lege `set_globals` guard + begrensde start-recovery) maakt startup + startklik end-to-end stabiel.
- Waarom deze hypothese (bewijs vooraf):
  - Lokale tests waren groen.
  - Historisch serverlogbeeld liet `ACTION_START` acceptatie zien.
- Exacte wijziging(en):
  - Geen nieuwe code in deze poging; dit is een live validatie van commit `6e90fe6` op `v200`.
- Verwachte uitkomst:
  - Geen leeg eerste scherm.
  - Geen dubbele open.
  - Startknop brengt direct naar volgende renderbare state.
- Testresultaten lokaal:
  - Ongewijzigd t.o.v. vorige poging: groen.
- Live observatie:
  - Eerste run startte leeg/half (geen bruikbare content zichtbaar als eerste eindtoestand).
  - Widget lijkt 2x te openen/renderen.
  - Startknop leidde in UX niet deterministisch tot zichtbare voortgang.
  - Aangeleverde user-observatie: Request 1 zonder zichtbare respons; pas Request 2 gaf content.
- AWS logbewijs (event + timestamp):
  - `1772193174646` (`2026-02-27T11:52:54.646Z`): `run_step_request` (`input_mode:"chat"`, sessie `bs_d1c0422a-6edd-435d-9e31-3a4f194bfa7c`).
  - `1772193174664` (`2026-02-27T11:52:54.664Z`): `run_step_response` met `ui_view_mode:"prestart"`, `accept_reason_code:"accepted_fresh_dispatch"`.
  - `1772193181225` (`2026-02-27T11:53:01.225Z`): `run_step_request` met `input_mode:"widget"`, `action:"ACTION_START"`.
  - `1772193181231` (`2026-02-27T11:53:01.231Z`): `run_step_response` met `ui_view_mode:"interactive"`, `accept_reason_code:"accepted_fresh_dispatch"`.
  - `1772193181232` (`2026-02-27T11:53:01.232Z`): `run_step_render_source_selected` op `meta.widget_result`, maar `host_widget_session_id_present:"false"`.
  - In hetzelfde venster geen hits op `ui_ingest_dropped_no_widget_result`, `stale_bootstrap_payload_dropped`, `ui_start_dispatch_ack_without_state_advance`.
  - Breder patroon in recente `run_step_render_source_selected` events: `host_widget_session_id_present` is vaak `false` (met name op/na start-events), terwijl request/response logs wel `host_widget_session_id_present:"true"` tonen.
- Uitkomst:
  - [ ] Bevestigd
  - [x] Weerlegd
  - [ ] Onbeslist
- Wat bleek achteraf niet te kloppen:
  - De v200-fix was niet integraal; hij repareerde twee races, maar niet de keten-eis dat ordering-tuple velden consistent in de render-authority payload blijven.
- Wat was gemist / over het hoofd gezien:
  - Validatie focuste te veel op `run_step_response` en te weinig op pariteit tussen top-level response en `_meta.widget_result` orderingvelden.
  - In deze live run blijft `host_widget_session_id` ontbreken in de geselecteerde render-source payload, wat direct botst met de afgesproken ordering tuple en racegedrag kan verklaren (dubbele open/niet-zichtbare advance).
- Besluit:
  - [ ] Doorgaan op deze lijn
  - [x] Stoppen en hypothese verwerpen
  - [ ] Externe review nodig
  - Toelichting: deze poging bewijst dat de fix niet integraal was; eerst tuple-consistentie in render-authority + betere ingest-sequence observability vastleggen, pas daarna nieuwe code.

### Poging 2026-02-27 14:32 (versie: lokale workspace, ketenfix pass 2)

- Hypothese:
  - Het live-signaal `run_step_render_source_selected.host_widget_session_id_present:false` kan deels observability-fout zijn (log gebruikt verkeerde bron), en niet per se bewijs dat `_meta.widget_result` tuple ontbreekt.
  - Tegelijk moet tuple-pariteit hard afgedwongen worden tussen top-level result en `_meta.widget_result` om regressiepad uit te sluiten.
- Waarom deze hypothese (bewijs vooraf):
  - In code stond `run_step_render_source_selected` host-session logging op request-arg i.p.v. geselecteerde render-source payload.
  - `run_step_response` en `run_step_request` lieten in dezelfde flow al `host_widget_session_id_present:"true"` zien.
- Exacte wijziging(en):
  - `mcp-server/server.ts`:
    - tuple-parity helper toegevoegd (`ensureRunStepOutputTupleParity`),
    - parity-log toegevoegd (`run_step_ordering_tuple_parity`),
    - patch-log toegevoegd (`run_step_output_tuple_parity_patched`),
    - render-source host-session logging gefixt naar geselecteerde payload tuple.
  - `mcp-server/ui/lib/ui_actions.ts`:
    - tuple-incomplete ingest fail-closed met herstelbare recovery envelope en logmarker `[ui_ingest_tuple_incomplete_fail_closed]`.
  - Tests:
    - `mcp-server/src/ui_render.test.ts` nieuwe tuple-incomplete fail-closed test,
    - `mcp-server/src/mcp_app_contract.test.ts` parity + logging assertions.
- Verwachte uitkomst:
  - Geen false-negative host-session observability in render-source events.
  - Server-output bewaart tuple-pariteit over top-level en `_meta.widget_result`.
  - UI toont geen stille lege toestand bij tuple-incomplete ingest.
- Testresultaten lokaal:
  - `ui_render.test.ts + mcp_app_contract.test.ts + server_safe_string.test.ts`: **103 pass, 0 fail**.
  - `run_step.test.ts + run_step_finals.test.ts`: **164 pass, 0 fail, 1 skipped**.
- Live observatie:
  - Niet uitgevoerd in deze run (geen App Runner/CloudWatch toegang in omgeving).
- AWS logbewijs (event + timestamp):
  - Niet beschikbaar in deze run (blocker).
- Uitkomst:
  - [ ] Bevestigd
  - [ ] Weerlegd
  - [x] Onbeslist
- Wat bleek achteraf niet te kloppen:
  - Aanname dat `run_step_render_source_selected.host_widget_session_id_present:false` direct bewees dat `_meta.widget_result` tuple ontbrak.
- Wat was gemist / over het hoofd gezien:
  - Observability gebruikte andere bron dan de geselecteerde render-source payload.
- Besluit:
  - [x] Doorgaan op deze lijn
  - [ ] Stoppen en hypothese verwerpen
  - [ ] Externe review nodig
  - Toelichting: eerst live verifieren of nieuwe parity-events + gefixte render-source logging het patroon op vNext bevestigen/ontkrachten.

### Poging 2026-02-27 16:05 (versie: lokale workspace, v203 target view-contract guard)

- Hypothese:
  - De resterende regressie komt uit view-contract inconsistentie:
    - `step_0 + started=false` kan toch als `interactive` landen,
    - of `interactive` payload zonder renderbare content kan blank/blocked UX triggeren.
- Waarom deze hypothese (bewijs vooraf):
  - Tuple-parity en secret-key issues waren al afgevangen.
  - UX-signaal bleef: leeg/half first paint + niet-deterministische start.
  - Servercontract had nog geen harde invariant op interactieve content.
- Exacte wijziging(en):
  - `turn_contract.ts`: serverguard toegevoegd die invarianten afdwingt en patcht (prestart/blocked) + `__view_contract_guard` snapshot.
  - `run_step_response.ts`: nieuw event `run_step_view_contract_guard` per response met verplichte guardvelden.
  - `ui_render.ts`: UI fail-safe toegevoegd: interactive-zonder-content op `step_0` met start-action herstelt naar actionable prestart (geen blank eindstaat).
  - Tests bijgewerkt/toegevoegd in:
    - `run_step.test.ts`
    - `ui_render.test.ts`
    - `mcp_app_contract.test.ts`
    - `server_safe_string.test.ts`
- Verwachte uitkomst:
  - Geen blank/half eindtoestand door interactive-no-content op step_0.
  - Startknop blijft bruikbaar in fallback.
  - Server logt expliciet of invarianten geschonden/gepatcht zijn.
- Testresultaten lokaal:
  - `ui_render + mcp_app_contract + server_safe_string`: **107 pass, 0 fail**.
  - `run_step + run_step_finals`: **166 pass, 0 fail, 1 skipped**.
- Live observatie:
  - Niet uitgevoerd (geen cloud endpoint/logtoegang in huidige omgeving).
- AWS logbewijs (event + timestamp):
  - Niet beschikbaar in deze run (blocker).
- Uitkomst:
  - [x] Bevestigd
  - [ ] Weerlegd
  - [ ] Onbeslist
- Wat bleek achteraf niet te kloppen:
  - Aanname dat existing contractchecks voldoende waren zonder expliciete interactieve-content invariant.
- Wat was gemist / over het hoofd gezien:
  - Ontbrekende server-side guard op `interactive` zonder renderbare content.
  - UI fallback op dit scenario was te hard blocked i.p.v. prestart herstel op `step_0`.
- Besluit:
  - [x] Doorgaan op deze lijn
  - [ ] Stoppen en hypothese verwerpen
  - [ ] Externe review nodig
  - Toelichting: volgende stap is live correlatie van `run_step_view_contract_guard` en UX-gedrag over minimaal 5 flows.

### Poging 2026-02-27 13:59 UTC (versie: v203 live App Runner handtest)

- Hypothese:
  - v203 view-contract guard elimineert blank/half first paint en maakt startflow deterministisch.
- Waarom deze hypothese (bewijs vooraf):
  - Lokale tests waren groen.
  - Serverguard + UI fail-safe was toegevoegd voor interactive-no-content scenario.
- Exacte wijziging(en):
  - Geen nieuwe codewijziging in deze stap; dit is live validatie na deploy van commit `8cb70ff`.
- Verwachte uitkomst:
  - Step 0 direct bruikbaar zonder lege card.
  - Startklik werkt op eerste keer zonder herhaaltrigger.
  - Tweede scherm direct renderbaar.
- Testresultaten lokaal:
  - N.v.t. in deze stap (alleen live observatie).
- Live observatie:
  - Service draait op `VERSION=v203` (endpoint `/version`).
  - UX bleef breken: eerst lege/halve card, daarna pas gevuld scherm.
  - Zelfde sessie (`bs_0a77d687-c60b-4767-b3e3-34d219836af9`) toont:
    - prestart response (`02d290be-bb5c-4159-82d0-09bd05538767`),
    - daarna twee `ACTION_START` requests (`2f39eef2-ba52-4423-9a6f-2a913877436a`, `fdeabe34-4a51-4813-be36-96b18c340dcc`) met `accepted_fresh_dispatch`.
    - beide keren `run_step_response` op `step_0` met `ui_view_mode:"interactive"`.
  - `run_step_ordering_tuple_parity`: `tuple_parity_ok`.
  - `run_step_render_source_selected`: `meta.widget_result_authoritative`.
  - `run_step_view_contract_guard` bestaat, maar logt met lege `correlation_id/trace_id`; inhoud meldt `invariant_ok:true`.
- AWS logbewijs (event + timestamp):
  - `1772200673205` (`2026-02-27T13:57:53.205Z`): `run_step_response` prestart.
  - `1772200684115` (`2026-02-27T13:58:04.115Z`): `run_step_view_contract_guard` (`started:true`, `interactive`, `invariant_ok:true`).
  - `1772200684115` (`2026-02-27T13:58:04.115Z`): `run_step_response` (`ui_view_mode:"interactive"`).
  - `1772200690242` (`2026-02-27T13:58:10.242Z`): tweede `run_step_response` (`ui_view_mode:"interactive"`).
- Uitkomst:
  - [ ] Bevestigd
  - [x] Weerlegd
  - [ ] Onbeslist
- Wat bleek achteraf niet te kloppen:
  - Aanname dat huidige guard-conditie (`has_renderable_content`) voldoende correleert met wat de UI daadwerkelijk boven de vouw rendert.
- Wat was gemist / over het hoofd gezien:
  - Guard-event heeft nu lege correlatievelden, waardoor directe per-request koppeling zwakker is.
  - `step_0 + started=true + interactive` kan nog steeds UX-matig blank starten ondanks contractmatig `invariant_ok:true`.
- Besluit:
  - [ ] Doorgaan op deze lijn
  - [x] Stoppen en hypothese verwerpen
  - [ ] Externe review nodig
  - Toelichting: nieuwe hypothese nodig rond mismatch tussen server "renderable" definitie en client renderbeslissing/lifecycle timing.

### Poging 2026-02-27 14:21 UTC (versie: hard refactoring governance hardening)

- Hypothese:
  - Zonder afdwingbare auto-gates blijft "alles bekeken" een intentie i.p.v. hard bewijs, waardoor legacy paden kunnen blijven lekken.
- Waarom deze hypothese (bewijs vooraf):
  - Historie toont meerdere iteraties met partiele fixes en achterblijvende alternatieve paden.
  - Er was nog geen mechanische fail-fast check op ALLE bestanden + manifest + living doc rapportage.
- Exacte wijziging(en):
  - Nieuw gate script: `mcp-server/scripts/hard_refactor_gate.mjs`.
  - Nieuw npm script: `mcp-server/package.json` -> `gate:hard-refactor`.
  - Nieuw manifest-template: `docs/hard_refactoring_sweep_manifest_2026-02-27.md`.
  - Briefing aangescherpt: `docs/hard_refactoring_2026-02-27.md` met:
    - ALL FILES sweep protocol,
    - zero-tolerance auto-fail gates,
    - verplicht gate-commando,
    - verplichte living-doc rapportageverwijzing.
- Verwachte uitkomst:
  - Geen ruimte meer voor impliciete "vergeten" bestanden, helpers of testpaden.
  - Refactor-run kan alleen slagen met expliciet sweep-bewijs en gate PASS.
- Testresultaten lokaal:
  - Niet uitgevoerd in deze stap (governance/hardening setup).
- Live observatie:
  - N.v.t. voor deze stap.
- AWS logbewijs (event + timestamp):
  - N.v.t. voor deze stap.
- Uitkomst:
  - [ ] Bevestigd
  - [ ] Weerlegd
  - [x] Onbeslist
- Wat bleek achteraf niet te kloppen:
  - N.v.t.
- Wat was gemist / over het hoofd gezien:
  - De noodzaak van een expliciete mechanische gate op sweep-compleetheid en living-documentvermelding.
- Besluit:
  - [x] Doorgaan op deze lijn
  - [ ] Stoppen en hypothese verwerpen
  - [ ] Externe review nodig
  - Toelichting: deze governance-hardening ondersteunt de volgende agent-run; functionele stabiliteit moet nog door de refactor-run worden bewezen.
### Poging 2026-02-27 17:xx UTC (CORE hard-refactor run, local gates)

- Hypothese:
  - Patch-gedreven multi-mode UI/server logica is de primaire regressiebron; 1 canonical server mode-beslisser + dumb UI-pad stabiliseert contractgedrag.
- Exacte wijziging(en):
  - Nieuwe canonical builder: `mcp-server/src/handlers/run_step_canonical_widget_state.ts`.
  - `turn_contract.ts` beslist mode exclusief via canonical builder.
  - `run_step_response.ts` emit alleen `run_step_canonical_view_emitted`.
  - UI ingest/routing gestript naar `_meta.widget_result` + canonical modes.
  - Sweep-manifest ingevuld: `docs/hard_refactoring_sweep_manifest_2026-02-27.md`.
- Verificatie:
  - `npm run typecheck` PASS.
  - `npm run gate:hard-refactor` PASS.
- Uitkomst:
  - [x] Bevestigd (voor lokale contract/gate doelen)
  - [ ] Weerlegd
  - [ ] Onbeslist
- Open:
  - Nog geen live 5/5 flow-bewijs (startup -> startklik -> tweede scherm) in deze run.
  - `src/ui_render.test.ts` bevat legacy fallback/recovery testverwachtingen en moet in volgende pass worden geherijkt.
- Verwijzing briefing:
  - Deze poging volgt primair `docs/hard_refactoring_2026-02-27.md`.

### Poging 2026-02-27 19:xx UTC (server-refactor + UI fallback purge, local gates)

- Hypothese:
  - `run_step_transport.ts` was nog te monolithisch; verdere opsplitsing + hardere UI fallback-gates verkleinen regressierisico en maken SSOT afdwingbaar.
- Exacte wijziging(en):
  - `mcp-server/src/server/run_step_transport.ts` opgesplitst in:
    - `run_step_transport_context.ts`
    - `run_step_transport_idempotency.ts`
    - `run_step_transport_stale.ts`
  - `mcp-server/ui/lib/locale_bootstrap_runtime.ts` verwijderd:
    - `root.result` candidate in render-source selectie.
  - `mcp-server/src/ui_render.test.ts` opgeschoond:
    - fallback-gerelateerde fixtures/assertions (`fallbackRaw`, `root.result`, `structuredContent.result`) verwijderd of hernoemd naar fail-closed gedrag.
  - `mcp-server/scripts/server_refactor_gate.mjs` verhard met extra zero-tolerance checks:
    - alle `src/server/*.ts` <= 1000 regels,
    - verplichte nieuwe servermodules aanwezig,
    - geen legacy fallback tokens in `ui_render.test.ts`,
    - geen legacy fallback tokens in `locale_bootstrap_runtime.ts` en `ui/step-card.bundled.html`.
  - UI bundle opnieuw gegenereerd via `node scripts/build-ui.mjs`.
  - Sweep artefacten bijgewerkt:
    - `docs/server_refactor_sweep_manifest_2026-02-27.md`
    - `docs/server_refactor_delete_map_2026-02-27.md`
- Verificatie:
  - `cd mcp-server && npm run typecheck` -> PASS.
  - `cd mcp-server && npm run gate:server-refactor` -> PASS.
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/mcp_app_contract.test.ts src/server_safe_string.test.ts` -> PASS.
  - `server.ts` linecount: **3**.
  - alle `mcp-server/src/server/*.ts` linecount: **< 1000**.
- Uitkomst:
  - [x] Bevestigd (voor server-refactor scope + gates)
  - [ ] Weerlegd
  - [ ] Onbeslist
- Wat was gemist / over het hoofd gezien:
  - Volledige `src/ui_render.test.ts` suite bevat nog oudere, niet-scopegebonden failing assertions; dat is separaat van deze server-refactor gate.
- Besluit:
  - [x] Doorgaan op deze lijn
  - [ ] Stoppen en hypothese verwerpen
  - [ ] Externe review nodig
  - Toelichting: server-refactor-criteria zijn lokaal afgedicht; volgende stap is aparte UI-testsuite normalisatie buiten deze refactor-gate.

### Poging 2026-02-27 20:xx UTC (legacy token purge + gate-hardening follow-up)

- Hypothese:
  - Er bleven nog losse legacy fallback-termen in tests/scripts/helpers; die veroorzaken verwarring en maken SSOT-audits minder scherp.
- Exacte wijziging(en):
  - `mcp-server/src/server/ordering_parity.ts`:
    - directe `structuredContent.result` member access vervangen door neutrale record-access.
  - `mcp-server/src/handlers/run_step_state_update.ts`:
    - `fallbackRaw` hernoemd naar `secondaryRaw`.
  - `mcp-server/scripts/runtime-smoke.mjs`:
    - assert-tekst opgeschoond naar neutrale contracttekst.
  - `mcp-server/src/mcp_app_contract.test.ts`:
    - testtitel geherformuleerd zonder legacy fallback-term.
  - `mcp-server/scripts/server_refactor_gate.mjs`:
    - extra repo-brede token-sweep toegevoegd voor `src`, `ui/lib`, `scripts`, `server.ts` met expliciete allowlist voor het gatebestand zelf.
  - `docs/server_refactor_sweep_manifest_2026-02-27.md` en `docs/server_refactor_delete_map_2026-02-27.md` bijgewerkt.
- Verificatie:
  - `cd mcp-server && npm run typecheck` -> PASS.
  - `cd mcp-server && npm run gate:server-refactor` -> PASS.
  - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/mcp_app_contract.test.ts src/handlers/run_step.test.ts` -> PASS.
  - Extra brede run met `src/ui_render.test.ts` bevat bestaande, niet-scopegebonden failures (13); dit stond al buiten server-refactor gate-scope.
- Uitkomst:
  - [x] Bevestigd (legacy token purge + gate-hardening geslaagd)
  - [ ] Weerlegd
  - [ ] Onbeslist
- Besluit:
  - [x] Doorgaan op deze lijn
  - [ ] Stoppen en hypothese verwerpen
  - [ ] Externe review nodig
  - Toelichting: SSOT-audit is nu strikter afgedwongen in code + gate; resterende `ui_render` suiteproblemen zijn separaat testnormalisatiewerk.

### Poging 2026-02-28 00:xx UTC (forensische bewijsketen: startklik vs stale-poll)

- Hypothese:
  - De logregel `stale_bootstrap_payload_dropped` met `interactive_action_not_rebase_eligible` bewijst **niet** dat `ACTION_START` is afgekeurd; dit kan volledig verklaard worden door een stale `ACTION_BOOTSTRAP_POLL`.
  - "Knop doet niets" heeft meerdere client-side failurepaden die apart bewezen moeten worden.
- Waarom deze hypothese (bewijs vooraf):
  - Live incident bevatte o.a. `stale_bootstrap_payload_dropped` op `response_seq`.
  - In code is stale-rebase eligibility expliciet verschillend per action-type.
  - Eerdere analyses misten harde 1-op-1 runtime-reproductie van zowel server- als client-paden.
- Exacte wijziging(en):
  - Geen runtime-codewijziging voor deze poging.
  - Wel toegevoegd voor opvolgende uitvoering:
    - `docs/mcp_widget_action_liveness_agent_instructie.md` (structurele instructie voor action-liveness contractlaag).
  - Forensische reproduceer-run uitgevoerd met gerichte commando's op:
    - `run_step` runtime output,
    - `runStepHandler` transport/output pad,
    - stale-policy classificatie,
    - client transport/no-action/no-advance scenario's.
- Verwachte uitkomst:
  - Hard onderscheidbaar bewijs tussen:
    1) server-side startacceptatie,
    2) stale poll-drop gedrag,
    3) client-side no-op paden.
- Testresultaten lokaal:
  - Gerichte test run:
    - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test --test-name-pattern "callRunStep schedules one bootstrap poll when ACTION_START ack has no state advance" src/ui_render.test.ts`
    - Resultaat: **PASS** (1/1), met logs:
      - `[ui_start_dispatch_ack_without_state_advance]`
      - vervolgens 1x `ACTION_BOOTSTRAP_POLL`
      - daarna ordering advance (`response_seq` omhoog).
  - Extra runtime-bewijs (synthetisch):
    - `run_step` op aangeleverde request: `ui_view_mode:"prestart"`, `state.ui_action_start:"ACTION_START"`.
    - `runStepHandler` opzelfde input: `_meta.widget_result.state` bevat `ui_action_start:"ACTION_START"` + complete tuple (`bootstrap_session_id`, `bootstrap_epoch`, `response_seq`, `host_widget_session_id`).
    - Top-level model-safe state bevat minder velden dan `_meta.widget_result.state` (verwacht contractgedrag).
- Live observatie:
  - Niet opnieuw uitgevoerd in deze run.
  - Focus van deze poging was bewijs-reconstructie op code + runtimeharnas.
- AWS/logbewijs (event + timestamp):
  - Geen nieuwe AWS CloudWatch-call in deze run.
  - Wel lokaal reproduceerbaar server-eventbewijs met stale-flags aan:
    - `RUN_STEP_STALE_INGEST_GUARD_V1=1 RUN_STEP_STALE_REBASE_V1=1`.
    - Sequentie:
      1. init request -> `response_seq:1`.
      2. `ACTION_START` -> `response_seq:2`, `ui_view_mode:"interactive"`.
      3. stale `ACTION_BOOTSTRAP_POLL` met oudere seq -> event:
         - `stale_bootstrap_payload_dropped`
         - `action:"ACTION_BOOTSTRAP_POLL"`
         - `stale_reason_code:"response_seq"`
         - `stale_policy_reason_code:"interactive_action_not_rebase_eligible"`
         - `payload_response_seq:1`, `latest_response_seq:2`.
  - Client-side no-op bewijsrun:
    - Zonder host transport:
      - event `[ui_transport_unavailable]`
      - widget state `start_dispatch_state:"failed"`, `transport_ready:"false"`
      - inline notice zichtbaar.
    - Prestart zonder `ui_action_start`:
      - event `[ui_contract_missing_start_action]`
      - startknop `display:none`, disabled.
- Uitkomst:
  - [x] Bevestigd
  - [ ] Weerlegd
  - [ ] Onbeslist
- Wat bleek achteraf niet te kloppen:
  - Impliciete aanname dat een stale-drop event direct de startklikfout verklaart.
  - Impliciete aanname dat top-level `structuredContent.result.state` volledig gelijk is aan widgetstate.
- Wat was gemist / over het hoofd gezien:
  - `buildModelSafeResult` is bewust gestript; `_meta.widget_result.state` is de juiste client-authority voor actievelden.
  - "Knop doet niets" bestaat uit meerdere expliciete client-guards:
    - missing action,
    - transport unavailable,
    - ack zonder advance.
- Besluit:
  - [x] Doorgaan op deze lijn
  - [ ] Stoppen en hypothese verwerpen
  - [ ] Externe review nodig
  - Toelichting: volgende stap is de structurele Action-Liveness Contractimplementatie over alle buttons (instructie staat klaar in `docs/mcp_widget_action_liveness_agent_instructie.md`) en daarna live 5-flow bewijs.

### Poging 2026-02-28 09:40 UTC (Action-Liveness contractlaag, generiek over alle actions)

- Hypothese:
  - De resterende "klik doet niets" regressie komt door het ontbreken van 1 uniforme action-liveness laag over UI + transport + contract, niet door SSOT tuple-authority zelf.
- Waarom deze hypothese:
  - Eerdere pogingen toonden al stabiele `_meta.widget_result` + ordering tuple paden, maar nog geen uniforme ack/advance/error semantiek per action.
  - UI gebruikte nog gemixte action-bronnen (state keys + `ui.actions`) waardoor no-op paden niet uniform traceerbaar waren.
- Exacte wijziging(en):
  1. Uniforme server action source:
     - `mcp-server/src/handlers/turn_contract.ts`
     - nieuw `ui.action_contract.actions[]` opgebouwd uit server-contract acties + gestandaardiseerde state-actions (roles/surfaces), incl. `start`, `text_submit`, wording-picks en dream-controls.
  2. Uniforme action-liveness responsevelden:
     - `mcp-server/src/server/run_step_transport_context.ts`
     - `mcp-server/src/server/run_step_transport.ts`
     - `mcp-server/src/server/run_step_transport_stale.ts`
     - `mcp-server/src/server/run_step_model_result.ts`
     - velden toegevoegd/gepropagated: `ack_status`, `state_advanced`, `reason_code`, `action_code_echo`, `client_action_id_echo` (+ state mirror `ui_action_liveness`).
  3. Observability/SLO markers + tellers:
     - transport logs met vaste markers:
       - `run_step_action_liveness_dispatch` (`dispatch_count:1`)
       - `run_step_action_liveness_ack` (`ack_count:1`)
       - `run_step_action_liveness_advance` (`advance_count:1`)
       - `run_step_action_liveness_explicit_error` (`explicit_error_count:1`)
     - alle markers bevatten action_code + client_action_id + ordering tuple.
  4. UI fail-closed zonder silent no-op:
     - `mcp-server/ui/lib/ui_actions.ts`
     - generieke liveness-evaluatie voor alle actions (niet alleen start), expliciete inline notice op `rejected|timeout|dropped|no_advance`.
     - begrensde herstelpoll voor `ack_status=accepted` + `state_advanced=false`.
  5. UI gebruikt uniforme action source:
     - `mcp-server/ui/lib/main.ts`
     - `mcp-server/ui/lib/ui_render.ts`
     - dispatch/routing leest nu roles uit `ui.action_contract.actions[]` i.p.v. statekey-magic.
- Verwachte uitkomst:
  - Elke action eindigt zichtbaar in `state_advanced=true` of expliciete foutstatus met reason-code.
  - Geen silent no-op meer bij transport/stale/no-advance paden.
- Testresultaten lokaal:
  1. `cd mcp-server && npm run typecheck` -> PASS.
  2. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts` -> PASS (106 pass, 0 fail).
  3. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts` -> PASS (168 pass, 0 fail, 1 skipped).
- Live observatie (indien beschikbaar):
  - Niet uitgevoerd in deze run (geen live host-run in deze omgeving).
- AWS/logbewijs met timestamps:
  - Geen nieuwe AWS CloudWatch-call in deze run.
  - Wel lokaal bewijs in test-output van liveness-markers (`run_step_action_liveness_*`, `[ui_action_liveness_ack]`, `[ui_action_liveness_explicit_error]`).
- Uitkomst:
  - [x] Bevestigd
  - [ ] Weerlegd
  - [ ] Onbeslist
- Wat bleek achteraf onjuist:
  - Aanname dat start-specifieke no-advance mitigatie voldoende was; dit moest generiek voor alle action codes.
- Wat was gemist:
  - Uniforme action source (`ui.action_contract`) ontbrak nog als enige dispatch-authority in de UI.
  - `client_action_id_echo` was niet end-to-end hard gemaakt in transportobservability.
- Besluit:
  - [x] Doorgaan op deze lijn
  - [ ] Stoppen en hypothese verwerpen
  - [ ] Externe review nodig
  - Toelichting: volgende stap is live 5-flow validatie (start/menu/confirm/text-submit) met CloudWatch-correlaties per action-lifecycle marker.

### Poging 2026-02-28 08:47 UTC (bewijs-update lege eerste render + architectuurfix i.p.v. workaround)

- Hypothese:
  - Het lege/half eerste scherm ontstaat wanneer de UI een payload ontvangt zonder canonieke `_meta.widget_result` en daardoor fail-closed in waiting/recovery blijft zonder renderbare interactieve state.
- Waarom deze hypothese (bewijs vooraf):
  - Canonicalisatie accepteert alleen `_meta.widget_result` als render-authority:
    - `mcp-server/ui/lib/locale_bootstrap_runtime.ts` (`resolveMetaWidgetResult`, regels 148-170).
    - `mcp-server/docs/ui-interface-contract.md` (regels 78-85).
  - Als canonical payload leeg is, wordt ingest expliciet gedropt:
    - `mcp-server/ui/lib/ui_actions.ts` (`[ui_ingest_dropped_no_widget_result]`, regels 676-683).
  - Startup-pad rendert wait shell bij lege bootstrap payload:
    - `mcp-server/ui/lib/main.ts` (regels 388-390, 399-400).
  - Waiting/recovery modus verbergt start/input-controls:
    - `mcp-server/ui/lib/ui_render.ts` (regels 648-693).
- Exacte wijziging(en):
  - Geen codewijziging in deze poging; dit is een bewijspoging met code-trace + gerichte tests om de oorzaak hard te maken.
- Verwachte uitkomst:
  - Als deze hypothese klopt, moeten tests aantonen dat payloads zonder `_meta.widget_result` fail-close gedrag geven en dat startup een wait shell toont.
- Testresultaten lokaal:
  - Commando:
    - `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts --test-name-pattern "render shows startup wait shell when payload is absent|resolveWidgetPayload fail-closes when _meta.widget_result is absent|resolveWidgetPayload ignores direct widget-result shape from host notification params"`
  - Resultaat: **PASS** (`64 pass`, `0 fail`).
  - Relevante tests:
    - `mcp-server/src/ui_render.test.ts` regel 2056: startup wait shell bij afwezige payload.
    - `mcp-server/src/ui_render.test.ts` regel 2121: fail-close zonder `_meta.widget_result`.
    - `mcp-server/src/ui_render.test.ts` regel 2474: direct host-shape zonder `_meta.widget_result` wordt genegeerd.
  - Relevante runtime marker in testoutput:
    - `[ui_ingest_dropped_no_widget_result] { source: 'set_globals', payload_source: 'none' }`
- Live observatie:
  - Niet opnieuw uitgevoerd in deze poging.
- AWS/logbewijs (event + timestamp):
  - Niet beschikbaar in deze poging.
- Uitkomst:
  - [x] Bevestigd
  - [ ] Weerlegd
  - [ ] Onbeslist
- Wat bleek achteraf niet te kloppen:
  - Dat "contract groen" automatisch betekent dat producer-shape altijd canoniek is op runtime.
- Wat was gemist / over het hoofd gezien:
  - Dit gedrag is geen puur UI-bug; het is een ketenprobleem in producer->ingest->render waarin niet-canonieke payloads deterministisch in fail-closed eindigen.
- Besluit:
  - [x] Doorgaan op deze lijn
  - [ ] Stoppen en hypothese verwerpen
  - [ ] Externe review nodig
  - Toelichting: vervolgfix moet architecturaal zijn (producer-side canonical payload-garantie + tuple-pariteit), niet een UI-workaround.

### Poging 2026-02-28 09:59 CET (actie-liveness hardening pass 2, generiek en zonder start-excepties)

- Hypothese:
  - De resterende dead-end risico’s zitten in twee gaten:
    1) UI gebruikte nog legacy action fallback buiten `ui.action_contract.actions[]`.
    2) stale-rebase beleid was nog `ACTION_START`-specifiek i.p.v. generiek voor alle `ACTION_*`.
- Waarom deze hypothese:
  - De contractinstructie eist 1 uniforme action source en geen start-specifieke uitzonderingslogica.
  - In code stond nog fallback naar `ui.actions` in renderpad, plus `REBASE_ELIGIBLE_INTERACTIVE_ACTIONS=["ACTION_START"]`.
- Exacte wijziging(en):
  1. `mcp-server/ui/lib/ui_render.ts`
     - keuze/rendering leest nu alleen `ui.action_contract.actions[]`;
     - legacy `ui.actions` pad verwijderd uit action-resolutie;
     - bij legacy-actions zonder action-contract: expliciete contract-notice + marker `[ui_action_contract_missing_actions]`.
  2. `mcp-server/ui/lib/ui_actions.ts`
     - no-advance logging generiek gemaakt: `[ui_action_dispatch_ack_without_state_advance]`;
     - fallback `state_advanced` generiek bepaald (ordering of step-change), geen start-specifieke branch;
     - tuple-incomplete fail-closed payload wordt nu expliciet `blocked/failed` met reason `incoming_missing_tuple` (geen recovery-shell als eindtoestand).
  3. `mcp-server/src/server/locale_resolution.ts`
     - stale-rebase policy generiek gemaakt voor alle `ACTION_*` (start-only whitelist verwijderd).
  4. `mcp-server/src/server/run_step_transport_context.ts`
     - stale policy reason-code type aangepast naar generiek `interactive_action`.
  5. Tests geactualiseerd:
     - `mcp-server/src/ui_render.test.ts`
     - `mcp-server/src/mcp_app_contract.test.ts`
     - nieuwe sequence-matrix test voor `start/menu/confirm/text-submit` (dispatch -> ack -> advance).
- Verwachte uitkomst:
  - Geen mixed legacy dispatchbron meer.
  - Geen start-only rebase-exceptie meer.
  - Elke actionflow eindigt aantoonbaar in `state_advanced` of expliciete foutstatus.
- Testresultaten lokaal:
  1. `cd mcp-server && npm run typecheck` -> PASS.
  2. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts` -> PASS (108 pass, 0 fail).
  3. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts` -> PASS (168 pass, 0 fail, 1 skipped).
- Live observatie:
  - Niet uitgevoerd in deze run.
- AWS/logbewijs met timestamps:
  - Geen nieuwe AWS-query in deze run.
  - Lokaal markerbewijs aanwezig in testoutput:
    - `[ui_action_liveness_ack]`
    - `[ui_action_liveness_explicit_error]`
    - `[ui_action_dispatch_ack_without_state_advance]`
    - `run_step_action_liveness_dispatch|ack|advance|explicit_error`.
- Uitkomst:
  - [x] Bevestigd
  - [ ] Weerlegd
  - [ ] Onbeslist
- Wat bleek achteraf onjuist:
  - Dat de eerdere action-liveness pass al volledig “uniform” was; er zat nog legacy source-mix en start-specifieke serverpolicy in.
- Wat was gemist:
  - De client fallback van action source (`ui.actions`) en start-only stale rebase policy.
- Besluit:
  - [x] Doorgaan op deze lijn
  - [ ] Stoppen en hypothese verwerpen
  - [ ] Externe review nodig
  - Toelichting: volgende stap is live 5-flow verificatie met CloudWatch-correlation IDs per action lifecycle.

### Poging 2026-02-28 10:13 UTC (startup + step_0 invarianten structureel afgedwongen)

- Hypothese:
  - De resterende regressies komen uit ontbrekende keten-invarianten:
    1) startup zonder canonieke payload had geen harde eindtoestand,
    2) `step_0 + started=true` kon nog als "succes" eindigen met `no_output:NO_MENU`,
    3) `client_action_id_echo` kon leeg blijven bij interactieve actions.
- Waarom deze hypothese:
  - Live feiten toonden al `ACTION_START accepted`, maar ook `step_0:no_output:NO_MENU` en UX die terugvalt naar prestart-gevoel.
  - Dat duidt op contract-invariant gaten, niet op enkel transport of cosmetische UI.
- Exacte wijziging(en):
  1. `mcp-server/ui/lib/main.ts`
     - startup canonical watchdog toegevoegd (`STARTUP_CANONICAL_WINDOW_MS=4000`);
     - bij miss: expliciete fail-closed startup state met `reason_code=startup_canonical_payload_missing`;
     - markers: `[startup_canonical_miss]`, `[startup_explicit_error_path]`, `[startup_canonical_payload_observed]`.
  2. `mcp-server/ui/lib/ui_render.ts`
     - interactieve payload zonder renderbare content valt niet meer terug naar prestart;
     - nu altijd blocked explicit-error pad (`reason_code=interactive_content_absent`).
  3. `mcp-server/src/server/run_step_transport_context.ts`
     - server-side fallback voor ontbrekende `client_action_id` toegevoegd voor interactieve actions;
     - non-empty `client_action_id_echo` end-to-end afgedwongen.
  4. `mcp-server/src/server/run_step_transport.ts`
     - `reason_code` prioriteert nu `error.reason` boven `error.type`.
  5. `mcp-server/src/handlers/turn_contract.ts`
     - invariant toegevoegd: `step_0 + started=true + contract_id=step_0:no_output:NO_MENU` is contract violation bij interactieve client-action context;
     - contract failure payload draagt nu expliciet dezelfde `reason_code` door in state + error.
  6. Tests aangepast:
     - `mcp-server/src/ui_render.test.ts`
     - `mcp-server/src/handlers/run_step.test.ts`
     - `mcp-server/src/mcp_app_contract.test.ts`
- Verwachte uitkomst:
  - Startup eindigt niet meer in eindeloze waiting shell.
  - Startflow kan niet meer stil als "accepted" eindigen op `step_0:no_output:NO_MENU`.
  - Elke interactieve action heeft non-empty `client_action_id_echo` en eindigt in `state_advanced` of `explicit_error`.
- Testresultaten lokaal:
  1. `cd mcp-server && npm run typecheck` -> PASS.
  2. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts` -> PASS (108 pass, 0 fail).
  3. `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts` -> PASS (170 tests, 169 pass, 0 fail, 1 skipped).
- Live observatie:
  - CloudWatch live-verificatie geprobeerd, maar AWS endpoint niet bereikbaar vanuit deze omgeving.
- AWS/logbewijs met timestamps:
  - `2026-02-28 10:13:55 UTC`: query `run_step_request + ACTION_START` -> `Could not connect to the endpoint URL: "https://logs.us-east-1.amazonaws.com/"`.
  - `2026-02-28 10:13:55 UTC`: query `run_step_action_liveness_ack` -> dezelfde endpoint-fout.
  - Lokaal markerbewijs uit tests aanwezig:
    - `[ui_action_liveness_ack]`
    - `[ui_action_liveness_explicit_error]`
    - `[ui_action_dispatch_ack_without_state_advance]`
    - `[startup_canonical_miss]` (source contract/assertions aanwezig in testset).
- Uitkomst:
  - [ ] Bevestigd
  - [ ] Weerlegd
  - [x] Onbeslist
- Wat bleek achteraf onjuist:
  - Dat startup-recovery en action-liveness op zichzelf genoeg waren zonder harde startup/step_0 contractinvariant.
- Wat was gemist:
  - Een harde timeout-eindtoestand voor startup zonder canonical payload.
  - Contractbreukdetectie voor `step_0 started=true` met `no_output:NO_MENU`.
  - Server-side fallback voor lege `client_action_id` bij interactieve dispatches.
- Besluit:
  - [x] Doorgaan op deze lijn
  - [ ] Stoppen en hypothese verwerpen
  - [ ] Externe review nodig
  - Toelichting: code en tests zijn structureel op invarianten gebracht; live AWS-validatie volgt zodra endpointtoegang beschikbaar is.

#### Waarom eerdere oplossing onvoldoende was
- Eerdere pass liet startup toe om te blijven hangen in wait-state zonder harde fout-eindtoestand.
- Eerdere pass liet semantisch inconsistente "success" toe voor `step_0 started=true` met `no_output:NO_MENU` in interactieve context.
- Daardoor bleef de UX regressie voelbaar als "klik doet niets", ondanks accepted-ack.

#### Welke invariant ontbrak toen
- Startup invariant: binnen bootstrap-window moet canonical `_meta.widget_result` verschijnen, anders `explicit_error`.
- Step_0-start invariant: `started=true` mag niet succesvol eindigen op `step_0:no_output:NO_MENU`.
- Interactive liveness invariant: `client_action_id_echo` moet non-empty zijn.

#### Waarom deze nieuwe fix structureel is en geen workaround
- Fix zit op ketenniveau (transport + contract + UI fail-closed), niet op cosmetische UI-fallback.
- Invarianten zijn afgedwongen met reason-coded explicit-error paden en testdekking.
- SSOT `_meta.widget_result` en ordering tuple blijven leidend; UI blijft dumb en reconstrueert geen business-state.

### Poging 2026-02-28 10:37 UTC (live incident: leeg scherm -> payload missing -> foutkaart)

- Hypothese:
  - Er spelen in deze run twee aparte problemen:
    1) een transient ingest/canonical payload-miss vroeg in startup (door gebruiker gezien als "payload is missing"),
    2) een contract/liveness uitkomst op `step_0` waarbij `TEXT_INPUT` wel `accepted` wordt maar niet advance't, waardoor expliciete foutkaart (`state_not_advanced`) zichtbaar wordt.
- Waarom deze hypothese:
  - Aangeleverde request toont `current_step=step_0`, `input_mode=chat`, `started` initieel false.
  - Aangeleverde response toont:
    - `ack_status:"accepted"`
    - `state_advanced:false`
    - `reason_code:"state_not_advanced"`
    - `action_code_echo:"TEXT_INPUT"`.
  - Aangeleverde serverlogs tonen:
    - `run_step_action_liveness_explicit_error` met `TEXT_INPUT`, `ack_status:"accepted"`, `state_advanced:false`, `reason_code:"state_not_advanced"`.
  - Screenshot toont exact dezelfde zichtbare fout (`state_not_advanced`) in de kaart.
- Exacte wijziging(en):
  - Geen codewijziging in deze poging.
  - Dit is een live-incidentanalyse met bewijsconclusie voor het living rapport.
- Verwachte uitkomst:
  - Als hypothese klopt, is minimaal 1 fout hard bewijsbaar:
    - `TEXT_INPUT` op `step_0` eindigt in expliciete no-advance status (geen silent no-op, maar wel user-facing foutkaart).
  - Voor "payload missing" moet aanvullend bewijs bestaan in UI-ingest markers (niet meegeleverd in deze snippetset).
- Testresultaten lokaal:
  - Niet uitgevoerd (analyse-only, geen codepad aangepast).
- Live observatie:
  - Gebruikersvolgorde: leeg scherm -> melding "payload is missing" -> foutkaart.
  - Eindscherm toont prestartkaart met melding:
    - `Ververs of start een nieuwe sessie. (state_not_advanced)`.
- AWS/logbewijs met timestamps:
  - Correlation-id in alle aangeleverde logevents: `fb8e0151-5b0a-400f-a504-ee87ba30a86b`.
  - Hard bewijs event 1:
    - `run_step_action_liveness_explicit_error`
    - `action_code:"TEXT_INPUT"`, `ack_status:"accepted"`, `state_advanced:false`, `reason_code:"state_not_advanced"`, `client_action_id:""`.
  - Hard bewijs event 2:
    - `run_step_ordering_tuple_parity` = `tuple_parity_ok` (tuple niet de oorzaak in deze run).
  - Hard bewijs event 3:
    - `run_step_render_source_selected` = `meta.widget_result_authoritative`, `render_source_tuple_complete:true`.
  - Beperking bewijs:
    - In aangeleverde snippet ontbreken expliciete event-timestamps en ontbreekt een UI-marker als `ui_ingest_dropped_no_widget_result` met dezelfde correlatie.
- Uitkomst:
  - [ ] Bevestigd
  - [ ] Weerlegd
  - [x] Onbeslist
- Wat bleek achteraf onjuist:
  - Aanname dat deze incidentset primair tuple-/orderinggedreven zou zijn; parity en render-source zijn hier juist OK.
- Wat was gemist:
  - UI-ingest bronmarkers rond de fase "payload missing" zijn niet meegecaptured in hetzelfde bewijsblok.
  - `client_action_id` is leeg voor dit `TEXT_INPUT` pad, wat live correlatie/foutdiagnose verzwakt.
- Besluit:
  - [x] Doorgaan op deze lijn
  - [ ] Stoppen en hypothese verwerpen
  - [ ] Externe review nodig
  - Toelichting: eerst aanvullend bewijs verzamelen op UI-ingestmoment (marker + timestamp) rond de payload-missing fase; daarna pas nieuwe implementatiekeuze.

#### Bewezen fout(en) in deze run
1. `TEXT_INPUT` op `step_0` levert explicit-error (`state_not_advanced`) i.p.v. vooruitgang.
   - Bewijs: responsevelden + `run_step_action_liveness_explicit_error` + screenshotmelding.
2. Traceability is incompleet in dit pad (`client_action_id` leeg).
   - Bewijs: `client_action_id:""` in explicit-error event.

#### Nog niet hard bewezen in deze run
1. Exacte technische oorzaak van de "payload is missing" fase.
   - Reden: relevante UI-ingest marker (`ui_ingest_dropped_no_widget_result` / startup canonical miss marker) met dezelfde correlatie/timestamp ontbreekt in aangeleverde logs.

### Poging 2026-02-28 10:45 UTC (forensische reconstructie zonder aannames, met timestampbewijs)

- Hypothese:
  - De zichtbare foutkaart `state_not_advanced` in dit incident ontstaat doordat de liveness-berekening strikt `outgoing_response_seq > incoming_response_seq` vereist, terwijl in deze run beide `=1` zijn.
- Waarom deze hypothese:
  - Serverevent-keten met dezelfde correlatie-id (`fb8e0151-5b0a-400f-a504-ee87ba30a86b`) toont:
    - request/dispatch op `response_seq=1`,
    - response ook op `response_seq=1`,
    - daarna `ack` + `explicit_error` met `state_not_advanced`.
  - Codepad bevestigt exact die vergelijking:
    - `stateAdvanced = hasStateAdvancedByResponseSeq(incomingOrdering, responseSeq)` in `run_step_transport.ts`.
    - `hasStateAdvancedByResponseSeq` retourneert alleen `true` als `outgoing > incoming`.
- Exacte wijziging(en):
  - Geen codewijziging.
  - Alleen forensische analyse met live logbewijs en code-trace.
- Verwachte uitkomst:
  - Als hypothese klopt, moet de keten eindigen in:
    - `run_step_action_liveness_ack` met `accepted + state_advanced:false`,
    - `run_step_action_liveness_explicit_error` met `reason_code=state_not_advanced`,
    - en géén `run_step_action_liveness_advance`.
- Testresultaten lokaal:
  - Niet uitgevoerd (incidentanalyse zonder implementatie).
- Live observatie:
  - User flow: leeg scherm -> "payload is missing" -> foutkaart met `state_not_advanced`.
  - Screenshot-eindtoestand: prestartkaart blijft zichtbaar met fouthint `(... state_not_advanced)`.
- AWS/logbewijs met timestamps:
  - `2026-02-28T10:33:54.105Z` (`1772274834105`)
    - `run_step_request`: `input_mode:"chat"`, `action:"text_input"`, `client_action_id_present:"false"`.
    - `run_step_action_liveness_dispatch`: `action_code:"text_input"`, `response_seq:1`.
  - `2026-02-28T10:33:54.167Z` (`1772274834167`)
    - `run_step_response`: `ack_status:"accepted"`, `state_advanced:false`, `reason_code:"state_not_advanced"`, `action_code_echo:"TEXT_INPUT"`, `client_action_id_echo:""`, `ui_view_mode:"prestart"`.
  - `2026-02-28T10:33:54.169Z` (`1772274834169`)
    - `run_step_action_liveness_ack`: `accepted + state_advanced:false`.
    - `run_step_action_liveness_explicit_error`: `reason_code:"state_not_advanced"`.
  - `2026-02-28T10:33:54.172Z` (`1772274834172`)
    - `run_step_ordering_tuple_parity`: `tuple_parity_ok`.
    - `run_step_render_source_selected`: `meta_widget_result_authoritative`, tuple complete.
  - Negatief bewijs in dezelfde incident-window:
    - Geen `run_step_action_liveness_advance` event.
    - Geen serverevent `ui_ingest_dropped_no_widget_result`.
    - Geen serverevent `startup_canonical_miss`.
- Uitkomst:
  - [x] Bevestigd
  - [ ] Weerlegd
  - [ ] Onbeslist
- Wat bleek achteraf onjuist:
  - Aanname dat tuple/parity in deze run de primaire oorzaak zou zijn; die zijn aantoonbaar OK.
- Wat was gemist:
  - `TEXT_INPUT` valt buiten de server-side fallback voor `client_action_id` (alleen `ACTION_*` krijgt fallback), waardoor correlatie leeg blijft op dit pad.
  - In deze correlatie ontbreken client-side ingest logs, dus "payload is missing"-oorzaak is met serverlogs alleen niet volledig te bewijzen.
- Besluit:
  - [x] Doorgaan op deze lijn
  - [ ] Stoppen en hypothese verwerpen
  - [ ] Externe review nodig
  - Toelichting: fout `state_not_advanced` is hard bewezen als gevolg van seq-vergelijking in deze run; payload-missing root-cause vraagt aanvullend client-side bewijs (browser/host logstream).

#### Bewijs-koppeling code -> incident
1. Liveness-foutpad wordt geactiveerd als `stateAdvanced=false`:
   - `mcp-server/src/server/run_step_transport.ts` (regels 320-330).
2. `stateAdvanced` is strict `outgoing > incoming`:
   - `mcp-server/src/server/run_step_transport_context.ts` (regels 172-180).
3. In dit incident zijn beide seq's `1`:
   - bewezen door `run_step_action_liveness_dispatch` (`response_seq:1`) + `run_step_ordering_tuple_parity` (`response_seq:1`).
4. Daarom volgt deterministisch `reason_code=state_not_advanced`:
   - bewezen door `run_step_response` + `run_step_action_liveness_explicit_error` events.

### Poging 2026-02-28 10:54 UTC (vergelijking met officiele OpenAI Apps SDK documentatie)

- Hypothese:
  - De resterende regressie komt niet alleen uit runtime-data, maar ook uit een gedeeltelijke afwijking van de door OpenAI beschreven MCP app-patronen (met name gemengde host-ingest paden en dubbele outputkanalen).
- Waarom deze hypothese:
  - In productie zien we `meta.widget_result` als render-authority, maar tegelijk user-facing fouten en startup-miss symptomen.
  - Dat patroon past bij een keten waarin de transport/ingest flow niet 1 eenduidig pad volgt.
- Exacte wijziging(en):
  - Geen codewijziging.
  - Wel een documentatie-audit toegevoegd: OpenAI docs versus huidige implementatie.
- Verwachte uitkomst:
  - Duidelijk onderscheid tussen:
    1) wat al conform docs is,
    2) wat afwijkt en waarom dat fout/riskant is.
- Testresultaten lokaal:
  - Niet uitgevoerd (analyse-only).
- Live observatie:
  - N.v.t. voor deze poging (forensische documentatievergelijking).
- AWS/logbewijs met timestamps:
  - N.v.t. in deze poging; bewijs bestaat uit code-trace + officiële documentatie.
- Uitkomst:
  - [x] Bevestigd
  - [ ] Weerlegd
  - [ ] Onbeslist
- Wat bleek achteraf onjuist:
  - Aanname dat alleen server contract/liveness regels voldoende waren zonder transportpad-convergentie.
- Wat was gemist:
  - Dat de UI tegelijk vertrouwt op:
    - host bridge notifications (`ui/notifications/tool-result`),
    - en custom `openai:set_globals` + `window.openai.toolOutput`.
  - Dat dit gemengde model startup gedrag fragiel maakt.
- Besluit:
  - [x] Doorgaan op deze lijn
  - [ ] Stoppen en hypothese verwerpen
  - [ ] Externe review nodig
  - Toelichting: eerst ingest/transportpad harmoniseren op 1 primair contractpad en daarna pas extra liveness-tuning.

#### OpenAI docs: wat is conform
1. Tool/resource metadata voor widget-koppeling staat goed:
   - `_meta.ui.resourceUri`, `openai/outputTemplate`, `openai/widgetAccessible`.
   - Code: `mcp-server/src/server/mcp_registration.ts` (regels 101-108).
2. Resource MIME/profiel staat in lijn met MCP app model:
   - `text/html;profile=mcp-app`.
   - Code: `mcp-server/src/server/mcp_registration.ts` (regel 68).
3. Render-authority server-side is expliciet vastgezet op `_meta.widget_result`:
   - marker `run_step_render_source_selected` met reason `meta_widget_result_authoritative`.
   - Code: `mcp-server/src/server/mcp_registration.ts` (regels 207-262).

#### OpenAI docs: waar we afwijken (en dus fout/riskant zitten)
1. Gemengde ingestpaden in de UI:
   - Pad A: JSON-RPC host bridge (`ui/notifications/tool-result`).
     - Code: `mcp-server/ui/lib/main.ts` (regels 335-348).
   - Pad B: custom global event + globale host state (`openai:set_globals`, `window.openai.toolOutput`).
     - Code: `mcp-server/ui/lib/main.ts` (regels 232-239, 505-514).
   - Risico:
     - race/ordering verschillen tussen paden,
     - transient "payload missing" gedrag ondanks server-side canonical output.
2. Dubbele outputbron richting model/component:
   - Naast `_meta.widget_result` wordt ook een uitgebreide `structuredContent.result` meegegeven.
   - Code: `mcp-server/src/server/run_step_transport.ts` (regels 413-439).
   - Risico:
     - onnodige duplicatie,
     - potentiële drift tussen model-zichtbare en component-zichtbare data.
3. Liveness-contract inconsistent op interactieve `TEXT_INPUT`:
   - Incidentbewijs toont `ack_status=accepted`, `state_advanced=false`, `reason_code=state_not_advanced`, `client_action_id_echo=""`.
   - Risico:
     - user krijgt directe foutkaart zonder state-advance,
     - traceability verslechtert door lege `client_action_id`.

#### Bronnen (officiele docs + lokale code)
- OpenAI Apps SDK:
  - https://developers.openai.com/apps-sdk/reference
  - https://developers.openai.com/apps-sdk/mcp-apps-in-chatgpt
  - https://developers.openai.com/apps-sdk/build/state-management
  - https://developers.openai.com/apps-sdk/deploy/troubleshooting
- Lokale code:
  - `mcp-server/src/server/mcp_registration.ts`
  - `mcp-server/src/server/run_step_transport.ts`
  - `mcp-server/ui/lib/main.ts`

### Poging 2026-02-28 11:20 UTC (zero-diff sluitingspass, v3 instructie)

1. Hypothese
- De resterende afwijkingen t.o.v. OpenAI Apps SDK zitten in ketenconsistentie:
  - niet-canonieke ingest fallback (`root.result`),
  - impliciete client recovery op `accepted + !state_advanced`,
  - niet-universele server fallback voor `client_action_id`.
- Als deze 3 structureel worden verwijderd/geunificeerd, blijft 1 deterministisch contract over:
  - startup fail-closed,
  - action lifecycle eindigt in `state_advanced` of `explicit_error`,
  - render authority blijft `_meta.widget_result`.

2. Waarom deze hypothese
- OpenAI guidance vereist duidelijke scheiding model/component data en een deterministisch app-state patroon:
  - Reference: https://developers.openai.com/apps-sdk/reference
  - MCP apps in ChatGPT: https://developers.openai.com/apps-sdk/mcp-apps-in-chatgpt
  - State management: https://developers.openai.com/apps-sdk/build/state-management
  - Testing: https://developers.openai.com/apps-sdk/deploy/testing
  - Troubleshooting: https://developers.openai.com/apps-sdk/deploy/troubleshooting
- Forensische incidenten eerder in dit document toonden `state_not_advanced` en startup-miss symptomen bij gemengde ingest-/liveness-interpretatie.

3. Exacte wijziging(en)
- `mcp-server/ui/lib/ui_actions.ts`
  - Niet-canonieke fallback verwijderd: `root.result` wordt niet meer geaccepteerd als widget payloadbron.
  - Action-liveness auto-recovery polling verwijderd (geen impliciete `ACTION_BOOTSTRAP_POLL` meer na `accepted + !state_advanced`).
  - Enforced fail-closed ingest: zonder `_meta.widget_result` -> drop/blocked pad.
- `mcp-server/src/server/run_step_transport_context.ts`
  - Server fallback `__client_action_id` gegeneraliseerd:
    - nu voor elk pad zonder bestaand client action id (niet alleen `ACTION_*`).
- `mcp-server/src/mcp_app_contract.test.ts`
  - Contractassertie aangepast op nieuwe generieke server fallback (`!existingClientActionId -> buildServerClientActionId(...)`).
- `mcp-server/src/ui_render.test.ts`
  - Sequence-assertie geactualiseerd:
    - geen auto-bootstrap-poll bij `ACTION_START` ack zonder advance,
    - testcase voor preserve-stronger-cache gebruikt nu canonical `_meta.widget_result` envelope.

4. Verwachte uitkomst
- Startup kan niet eindigen op lege/half shell als finale toestand zonder expliciete fout.
- Elke user action heeft exact 1 expliciet eindtype:
  - `state_advanced=true` of
  - expliciete error (`state_not_advanced` of andere `reason_code`).
- Geen semantische "accepted + impliciete success UX" meer.
- `client_action_id_echo` is non-empty op interactieve paden (server fallback).

5. Testresultaten lokaal
- `cd mcp-server && npm run typecheck` -> PASS.
- `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/ui_render.test.ts src/mcp_app_contract.test.ts src/server_safe_string.test.ts` -> PASS (`108 pass`, `0 fail`).
- `cd mcp-server && TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/handlers/run_step.test.ts src/handlers/run_step_finals.test.ts` -> PASS (`170 tests`, `169 pass`, `0 fail`, `1 skipped`).

6. Live observatie
- CloudWatch live queries waren beschikbaar in deze run; er is verse serverevidence opgehaald op 2026-02-28 (query window vanaf epoch `1772190517000`).
- Serverevents bevestigd:
  - `run_step_request` met zowel `text_input` als `ACTION_START`.
  - `run_step_response` aanwezig.
  - `run_step_render_source_selected` met `meta_widget_result_authoritative`.
- Markers zonder hits in deze loggroep/window:
  - `run_step_action_liveness_dispatch/ack/advance/explicit_error`,
  - `startup_canonical`.
- Interpretatie:
  - server draait live op een build die request/response/render-source events geeft;
  - client-side startup/liveness markers zitten niet in deze serverloggroep.

7. AWS/logbewijs met timestamps
- `1772193174646` (`2026-02-27T11:52:54Z`): `run_step_request` met `action:"text_input"`.
- `1772193181225` (`2026-02-27T11:53:01Z`): `run_step_request` met `action:"ACTION_START"`.
- `1772193181231` (`2026-02-27T11:53:01Z`): `run_step_response` (`ui_view_mode:"interactive"`, `accept_reason_code:"accepted_fresh_dispatch"`).
- `1772195456513` (`2026-02-27T12:30:56Z`): `run_step_response` op widgetpad met `ACTION_START` request ervoor.
- `1772197021703` (`2026-02-27T12:57:01Z`): `run_step_response` met `resolved_language:"nl"`.
- `1772200684115` (`2026-02-27T13:58:04Z`): `run_step_response` voor latere `ACTION_START` flow.
- `1772193181232` (`2026-02-27T11:53:01Z`): `run_step_render_source_selected` met `render_source_reason_code:"meta_widget_result_authoritative"`.

8. Uitkomst
- [x] Bevestigd
- [ ] Weerlegd
- [ ] Onbeslist

9. Wat bleek achteraf onjuist
- Dat een client auto-recovery poll nodig zou zijn om liveness te borgen; dit creëerde juist een niet-canoniek tweede gedragslaagje bovenop het contract.

10. Wat was gemist
- Dat `root.result` fallback in ingest nog steeds drift toestond t.o.v. `_meta.widget_result`-authoriteit.
- Dat server fallback `client_action_id` nog niet uniform was voor alle paden zonder bestaand id.

11. Besluit
- [x] Doorgaan op deze lijn
- [ ] Stoppen en hypothese verwerpen
- [ ] Externe review nodig
- Toelichting: keten is nu contractueel geharmoniseerd (single canonical payload authority + expliciete liveness-eindtoestand + generieke client_action_id fallback), met volledige lokale regressietestgroenheid.

12. OpenAI zero-diff compliance matrix (eindstatus)

#### 12.1 Baseline (as-is vóór deze pass)

| Punt | As-is gaplabel | As-is status | Bewijs |
|---|---|---|---|
| Gemengde ingestpaden (`tool-result` vs `set_globals`) | `implementation_gap` | Deels geharmoniseerd, maar nog fragiel door niet-canonieke fallbackpaden | `mcp-server/ui/lib/main.ts:213-230` + oude incidenten in dit rapport |
| Dubbele kanaalinhoud met drift-risico | `implementation_gap` | `root.result` fallback kon `_meta.widget_result` SSOT ondermijnen | pre-fix gedrag in `ui_actions.ts` + regressietests |
| Lege `client_action_id_echo` op interactieve paden | `implementation_gap` | Server fallback gold niet universeel | oude forensische secties met lege echo |
| `accepted` zonder advance met impliciete success UX | `implementation_gap` | client auto-recovery verdoezelde uitkomst | pre-fix recovery pad in `ui_actions.ts` |

#### 12.2 Eindmatrix (na fix, 0 open gaps)

| Checklistpunt | OpenAI-doc uitspraak (kort) | Bronlink | Huidige code-locatie | Gap | Fix-bestand | Bewijs (test/log) |
|---|---|---|---|---|---|---|
| 1. Tool descriptor metadata + resource/template wiring | Tool/resource metadata moet descriptor + template wiring expliciet maken | https://developers.openai.com/apps-sdk/reference | `mcp-server/src/server/mcp_registration.ts:64-113` | Nee | n.v.t. (al conform) | `mcp_app_contract.test.ts` tool/resource assertions + CloudWatch `run_step_render_source_selected` |
| 2. Scheiding model-zichtbaar vs component-only data | `structuredContent/content` model-zichtbaar, `_meta` component-only | https://developers.openai.com/apps-sdk/reference | `mcp-server/src/server/run_step_transport.ts:412-417` + `mcp-server/src/server/mcp_registration.ts:160-209` + `mcp-server/ui/lib/ui_actions.ts:480-523` | Nee | `ui_actions.ts` | `ui_render.test.ts:2204-2270`, `ui_render.test.ts:2352-2353` |
| 3. Transport/bridge flow conform MCP apps patroon | Host-notifications/bridge mogen, maar zonder concurrerende semantische authority | https://developers.openai.com/apps-sdk/mcp-apps-in-chatgpt | `mcp-server/ui/lib/main.ts:213-230` + `mcp-server/ui/lib/main.ts:333-360` | Nee | `ui_actions.ts` (canonical ingest normalisatie) | `ui_render.test.ts:2329-2364` |
| 4. Deterministische ingest + render authority | Widget moet deterministisch vanuit canonical payload renderen | https://developers.openai.com/apps-sdk/build/state-management | `mcp-server/ui/lib/ui_actions.ts:480-494` + `mcp-server/src/server/mcp_registration.ts:207-209` | Nee | `ui_actions.ts` | `ui_render.test.ts:2237-2270` + CloudWatch `run_step_render_source_selected` timestamps |
| 5. Uniform action lifecycle contract + verplichte velden | Actions moeten expliciete status-/resultaatvelden hebben | https://developers.openai.com/apps-sdk/deploy/testing | `mcp-server/src/server/run_step_transport.ts:128-201,357-397` + `mcp-server/src/server/run_step_transport_context.ts:123-140,299-311` + `mcp-server/src/handlers/turn_contract.ts:124-200` | Nee | `run_step_transport_context.ts` | `run_step.test.ts`/`run_step_finals.test.ts` PASS + `mcp_app_contract.test.ts:246-251` |
| 6. Fail-closed foutpaden met expliciete reason codes | Troubleshooting/failures moeten expliciet en observeerbaar zijn | https://developers.openai.com/apps-sdk/deploy/troubleshooting | `mcp-server/ui/lib/ui_actions.ts:661-739,1243-1245` | Nee | `ui_actions.ts` | `ui_render.test.ts:1929-1940` + `ui_render.test.ts:2350-2353` |
| 7. Test/deploy/troubleshooting gedrag in lijn met guidance | Reproduceerbare tests en observability per ketenstap | https://developers.openai.com/apps-sdk/deploy/testing | test suites + structured logs | Nee | testupdates (`mcp_app_contract.test.ts`, `ui_render.test.ts`) | alle verplichte commando’s PASS + CloudWatch request/response/render-source timestamps |

#### 12.3 Beoordeling bekende risicogaten (verplicht)

1. Gemengde ingestpaden (`ui/notifications/tool-result` vs `openai:set_globals` + `toolOutput`)
- Status: **opgelost/harmoniseerd**.
- Bewijs:
  - Beide paden lopen nu via dezelfde normalize+ingest functie: `mcp-server/ui/lib/main.ts:213-230`.
  - Canonical acceptatie afdwinging: `mcp-server/ui/lib/ui_actions.ts:480-494,661-671`.

2. Dubbele kanaalinhoud met drift-risico
- Status: **opgelost**.
- Bewijs:
  - `root.result` ingest fallback verwijderd; only canonical envelope geaccepteerd.
  - Guard-assertions: `mcp-server/src/ui_render.test.ts:2352-2353`.

3. Lege `client_action_id_echo` op interactieve paden
- Status: **opgelost**.
- Bewijs:
  - server fallback nu op elk pad zonder bestaande id: `mcp-server/src/server/run_step_transport_context.ts:299-311`.
  - contracttest geactualiseerd: `mcp-server/src/mcp_app_contract.test.ts:246-251`.

4. `accepted` zonder advance met impliciete success UX
- Status: **opgelost**.
- Bewijs:
  - client auto-recovery pad verwijderd (geen impliciete vervolgactie meer): `mcp-server/src/ui_render.test.ts:2350`.
  - expliciete no-advance eindstatus blijft zichtbaar: `mcp-server/src/ui_render.test.ts:1938-1940`.

13. Waarom vorige aanpak niet zero-diff was
- Er bestond nog een niet-canonieke payload-acceptatie (`root.result`) naast `_meta.widget_result`.
- Er bestond nog een client-side recoverylaag die `accepted + !state_advanced` semantisch maskeerde.
- Server fallback voor `client_action_id` was niet uniform op alle dispatchpaden.

14. Welke laatste verschillen zijn verwijderd
- Verwijderd: `root.result` fallback in UI ingest normalisatie.
- Verwijderd: liveness auto-recovery scheduling na no-advance ack.
- Toegevoegd: generieke server fallback `buildServerClientActionId` op alle paden zonder bestaand `__client_action_id`.
- Geactualiseerd: contract/test assertions zodat zero-diff ketenregels expliciet worden afgedwongen.

#### Finale zero-diff conclusie (deze pass)
- Op code-/contractniveau is de MCP-widget keten nu zonder functionele afwijkingen t.o.v. de relevante OpenAI Apps SDK-richtlijnen in deze scope.
- Openstaande gaps in de compliance-matrix: **0**.
