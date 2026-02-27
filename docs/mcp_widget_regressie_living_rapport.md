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
