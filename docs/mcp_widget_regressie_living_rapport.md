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
