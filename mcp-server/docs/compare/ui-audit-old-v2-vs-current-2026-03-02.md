# Volledige UI-audit: old code 2.0 vs huidige runtime

Datum: 2026-03-02
Repository: `/Users/MinddMacBen/business-canvas-chatkit`

## HARD POLICY — GEEN NIEUWE GUARDS/FALLBACKS/CHECKS

Bij conflict geldt dit blok boven alle andere instructies.

Dit traject is een vereenvoudigingstraject.
Doel: terug naar old 2.0 robuust gedrag zonder extra controlelagen.

### Verboden (absoluut)
- Geen nieuwe guards.
- Geen nieuwe fallbacks.
- Geen retries, polling of recovery-paden.
- Geen fail-close of fail-open logica.
- Geen extra contractstrictness.
- Geen state-gates, ingest-gates, order-gates of stale-gates.
- Geen mode-coercion die schermen forceert.
- Geen nieuwe veiligheids-branches.
- Geen nieuwe feature-flags.
- Geen architectuur-uitbreiding.

### Toegestaan
- Bestaande guard-, fallback- en check-code verwijderen.
- Flow terugzetten naar old 2.0 gedrag.
- Labels, layout en renderpaden herstellen naar old 2.0.
- Bestaande i18n (11 talen + EN fallback) en transportcontract behouden.

### Werkregel
Elke wijziging moet aantoonbaar:
1. complexiteit verlagen;
2. guard-, fallback- en check-oppervlak verkleinen.

Als een wijziging nieuw controle-oppervlak toevoegt: afkeuren.

### Definitie van klaar
- Netto resultaat: minder branches, minder checks, minder gates.
- Geen nieuwe guard-, fallback- of check-code toegevoegd.
- Open, start en render werkt direct zoals old 2.0.

## 1) Scope en bronset
Deze audit vergelijkt expliciet:

1. Old 2.0 runtime uit de door jou aangeleverde zip.
2. De old 2.0 compare-kopie in de repo.
3. De huidige actieve runtime in de repo.
4. Relevante server/contract/test-code die bepaalt wat wel/niet zichtbaar wordt.

Gebruikte hoofdbronnen:

- `mcp-server/ui/step-card.bundled.html` (huidige actieve runtime)
- `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html` (old 2.0)
- `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.template.html` (old 2.0 template)
- `mcp-server/src/handlers/run_step_routes.ts`
- `mcp-server/src/handlers/turn_contract.ts`
- `mcp-server/src/handlers/run_step_runtime_finalize.ts`
- `mcp-server/src/i18n/ui_strings_defaults.ts`
- `mcp-server/src/i18n/ui_strings/locales/ui_strings_*.ts`
- `mcp-server/src/handlers/__golden__/runtime/*.json`
- `mcp-server/src/mcp_app_contract.test.ts`
- `mcp-server/src/ui_render.test.ts`

## 2) Verificatie old 2.0 bronintegriteit (zip == compare-map)
De compare-map in de repo is byte-identiek aan jouw zip voor kernbestanden.

Geverifieerd met SHA-256:

1. `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html` == zip `mcp-server/ui/step-card.bundled.html`.
2. `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.template.html` == zip `mcp-server/ui/step-card.template.html`.
3. `mcp-server/docs/compare/old_v2_2026-02-14/root/button-contract.md` == zip `docs/button-contract.md`.

Conclusie: je compare-baseline is betrouwbaar.

## 3) Grootste feitelijke verschillen in één oogopslag

1. De huidige runtime is geen kleine variatie op old 2.0, maar een veel kleinere en inhoudelijk andere runtime.
2. De huidige runtime forceert een lokale fallback-render vóór de echte serverpayload binnen is.
3. De huidige runtime gebruikt externe logo-asset URL (`/ui/assets/...`) i.p.v. inline data-URI zoals old 2.0.
4. Old 2.0 had expliciete `btnOk`-flow; huidige runtime heeft dat element niet.
5. Servercontract + tests sturen nu op `prestart=start-only` en interactieve `text_submit`/contract-actions; step_0 “ready”-buttongedrag is niet meer old-2.0 directpad.
6. `ui/lib/*` en `ui/step-card.bundled.html` zijn functioneel uit sync, waardoor wijzigingen in `ui/lib` niet per se verklaren wat in ChatGPT zichtbaar is.

## 4) Hard bewijs: runtime-omvang en architectuur

### 4.1 Bestandsgrootte en complexiteit

- Huidig `step-card.bundled.html`: 1.611 regels, 59.347 bytes.
- Old 2.0 `step-card.bundled.html`: 2.905 regels, 162.652 bytes.

### 4.2 Functie-oppervlak

- Huidig runtime-functies: 31.
- Old 2.0 runtime-functies: 57.

Uniek in huidig (o.a.):

- `buildFallbackPrestartResult`
- `ingestSetGlobalsPayload`
- `renderResult`
- `renderActions`

Uniek in old 2.0 (o.a.):

- `buildStepper`
- `renderChoiceButtons`
- `prestartWelcomeForLang`
- `applyToolResult`
- `setSessionStarted`
- `setSessionWelcomeShown`
- `t`

Impact: kernlogica voor UI-opbouw en interactie is niet 1-op-1 old 2.0.

## 5) DOM- en elementverschillen die direct zichtbaar zijn

### 5.1 Buttons en controls

Old 2.0 had expliciet:

- `id="btnOk"` met label-switch (`btnOk`, `btnOk_step0_ready`, `btnOk_strategy`)
- aparte click-handler `ACTION_CONFIRM_CONTINUE`

Huidig runtime:

- `btnOk` bestaat niet
- rendering gebeurt via generieke `#actions` (action_contract) + `#inputForm`
- old-style controls zitten in `.legacy-panels` en zijn niet de primaire render-flow

Effect dat jij ziet:

- “Ja, ik ben er klaar voor. Let’s start!” verschijnt als tekst i.p.v. old-stijl doorgepositioneerde knop zodra action-contract/choice-interpretatie niet exact old-pad volgt.

### 5.2 Header/byline/logo

Old 2.0:

- logo inline data-URI in HTML
- robuust tegen host/sandbox asset-resolutie

Huidig:

- logo via `src="/ui/assets/business-model_by_ben-steenstra.svg"`

Effect:

- in ChatGPT-hostcontext kan dit pad stuklopen (gebroken image), waarna je naam/alt-achtig gedrag ziet i.p.v. correcte logo-render.

### 5.3 Stepper

Old 2.0:

- dynamische stepper-opbouw (`buildStepper`) met actieve step-title-uitlijning

Huidig:

- statische `11` `<i>` bars, beperkte statusdynamiek

Effect:

- visuele “oude” hiërarchie/oriëntatie wijkt af.

## 6) Waarom je eerst halfleeg/EN ziet en daarna NL

Dit komt uit de huidige startup-sequentie:

1. Runtime voert bij init direct `ingestSetGlobalsPayload()` uit.
2. Als op dat moment nog geen renderbare payload in `toolOutput/toolResponseMetadata` zit, dan:
   - logt hij missing payload
   - voert hij `ingest(buildFallbackPrestartResult(), "set_globals_fallback")` uit
3. Die fallback bevat alleen minimale locale strings (geen volledige prestart rich blocks).
4. Pas bij latere host-event(s) komt de echte `_meta.widget_result` binnen en wordt opnieuw gerenderd.

Dit verklaart exact:

- eerste scherm: leeg/minimaal/vaak EN
- tweede scherm: pas later gevuld (NL), maar al met afwijkende layout/flow t.o.v. old 2.0

## 7) Waarom prestart soms “arm” is ondanks bestaande vertaling

De fallback-prestart state bevat alleen minimale keys zoals:

- `btnStart`
- `startHint`
- `prestartWelcome` (single-line)

De rijke prestart-secties vereisen keys:

- `prestart.proven.title`
- `prestart.proven.body`
- `prestart.outcomes.*`
- `prestart.meta.how.*`
- `prestart.meta.time.*`

In de fallback-state ontbreken die, dus render wordt kort/minimaal.

Old 2.0 had juist een rijke hardcoded default prestart (`PRESTART_WELCOME_DEFAULT`) waardoor first paint niet “half” was.

## 8) Verschillen in contract- en actiongedrag die UI beïnvloeden

### 8.1 Deterministische action-filtering
`turn_contract.ts` filtert toegestane rollen op view-mode.

- `prestart`: alleen `start`
- `interactive`: altijd `text_submit`, en conditioneel `choice`/speciale rollen

### 8.2 State action contract seeding
`run_step_runtime_finalize.ts` zet:

- `ui_action_start` alleen voor `step_0 && started=false`
- `ui_action_text_submit` voor interactieve sessies

Daarmee is old direct-`btnOk`-semantiek niet meer het primaire pad.

### 8.3 Canonical widget mode
`run_step_canonical_widget_state.ts` zet:

- `step_0 + started=false` => `prestart`
- anders => `interactive` (ook als renderbare content nog dun is)

Gevolg:

- geen hard `blocked`, maar wel interactieve staten zonder old-2.0 knoplayout.

## 9) Step_0 specifiek: waarom “ready”-button niet old-stijl verschijnt

1. Old 2.0 gebruikte expliciet `btnOk` + label key `btnOk_step0_ready`.
2. Huidige runtime heeft geen `btnOk` element.
3. Huidige flow verwacht `ui.action_contract.actions` of parsed fallback choices in `#actions`.
4. Als contract/actionset voor die turn geen bruikbare non-text action oplevert, krijg je tekst + tekstinvoer i.p.v. old ready-knop.

Belangrijk extra bewijs:

- Runtime golden fixture `runtime/interactive.json` verwacht `has_ui_actions: false`.
- Dat is functioneel afwijkend van old 2.0-ervaring waarin die continue/readiness-actie zichtbaar kon zijn als knopflow.

## 10) i18n: wat goed is en wat niet

### 10.1 Wat goed staat

1. 11 talen bestaan in locale files (`de,en,es,fr,hi,id,it,ja,ko,nl,pt_br,zh_hans` met 11 niet-EN + EN basis).
2. EN default bestaat in `ui_strings_defaults.ts`.
3. Kern prestart keys zitten in defaults.

### 10.2 Wat fout gaat in first paint

Niet server-i18n, maar client startup fallback:

- client rendert vóór server-state met minimale locale table
- daardoor krijg je tijdelijke EN/minimale UI zelfs als server later NL full-ready terugstuurt

### 10.3 Field mapping (vertaaldocument -> zichtbare UI)

Kern step_0/prestart keys die de UI moet tonen:

- `sectionTitle.step_0`
- `prestart.headline`
- `prestart.proven.title`
- `prestart.proven.body`
- `prestart.outcomes.title`
- `prestart.outcomes.item1`
- `prestart.outcomes.item2`
- `prestart.outcomes.item3`
- `prestart.meta.how.label`
- `prestart.meta.how.value`
- `prestart.meta.time.label`
- `prestart.meta.time.value`
- `startHint`
- `btnStart`
- `uiSubtitle`
- `byText`

Status:

- deze keys bestaan server-side (defaults + locale merge)
- ze worden niet altijd op first paint gebruikt door de huidige client-fallbackstartup

## 11) Styling/HTML-afwijkingen t.o.v. old 2.0

### 11.1 Old 2.0 had template + rijke embedded styling

- `step-card.template.html` aanwezig
- inline image/data assets in runtime
- uitgebreide typografie/layoutregels voor card/header/stepper/input

### 11.2 Huidig

- geen `mcp-server/ui/step-card.template.html` in actieve runtime map
- enkel kleinere bundled runtime als SSOT
- assetstrategie deels extern i.p.v. volledig self-contained

### 11.3 Gevolg

- andere visuele compositie
- grotere kans op host-context styling/asset mismatch
- elementen zoals logo en bepaalde “oude” positionering vallen terug of verdwijnen

## 12) Tooling/ownership drift

1. `npm run build:ui` doet alleen TypeScript-check (`tsc --noEmit`), geen bundling-stap.
2. `ui/step-card.bundled.html` is feitelijke runtime-SSOT.
3. `ui/lib/*.ts` is veel groter/complexer dan de actieve bundled runtime.

Gevolg:

- je kunt in `ui/lib` wijzigingen doen die in ChatGPT niet exact terugkomen als bundled runtime niet 1-op-1 is bijgewerkt.

## 13) Alle nog aanwezige guard/restrictie-lagen (code-inventaris)

Deze bestaan nog in huidige codebase en beïnvloeden gedrag:

1. Startup fallback ingest bij missende globals payload (`set_globals_fallback`).
2. Deterministische role-filter op action_contract in `turn_contract.ts`.
3. Canonical view-contract normalisatie (prestart/interactive policy) in `turn_contract.ts` + `run_step_canonical_widget_state.ts`.
4. Server-side parity/contract checks en telemetry hooks (non-fatal maar gedragsturend).
5. Transport idempotency/liveness lagen (niet de oorzaak van jouw screenshot, wel aanwezig).

Wat niet meer actief-blockend is:

- stale transport drop/rebase staat nu effectief noop (`run_step_transport_stale.ts` retourneert defaults, geen early drop).

## 14) Conclusie per zichtbaar probleem uit jouw screenshots

### Probleem A
Eerst leeg/half EN scherm, daarna gevuld NL scherm.

Oorzaak:

- client first-paint fallback vóór echte payload (`set_globals_fallback`) + minimale fallback strings.

### Probleem B
Logo/branding niet zoals old (soms broken image, naam zichtbaar).

Oorzaak:

- asset-strategie is veranderd van inline (old) naar externe `/ui/assets/...` path (nu).

### Probleem C
Tweede scherm mist old knop-/layoutgedrag (“Ja ik ben er klaar voor” als knop).

Oorzaak:

- `btnOk` old flow is verwijderd
- huidige flow hangt aan action_contract/parsed choices
- interactieve step_0 actiepresentatie is contract-gedreven en wijkt af van old hardcoded buttonpad

### Probleem D
Opmaak voelt “niet old 2.0”.

Oorzaak:

- actieve runtime is een andere (kleinere) UI-architectuur
- template/embedded designpatronen uit old 2.0 zijn niet 1-op-1 overgenomen

## 15) Wat functioneel gelijkgetrokken moet worden voor echte old-2.0 parity
Dit is een uitlijn-checklist, geen code in dit rapport.

1. First paint mag nooit minimale fallback prestart tonen als rich locale-state verwacht wordt.
2. Runtime moet self-contained old 2.0 assetgedrag krijgen (logo/icons/background zonder host-path afhankelijkheid).
3. Old step_0 confirm/readiness knopsemantiek moet terug als expliciet zichtbaar controlpad.
4. Inhoudsprioriteit en rendering van prestart + step_0 moet exact old-volgorde gebruiken.
5. Actieve runtimebron moet eenduidig zijn (geen divergentie tussen `ui/lib` en gebundelde runtime).
6. Contract/view/action policies moeten old UX niet wegfilteren in interactieve step_0.
7. 11 talen + EN fallback moet op first paint direct correct zichtbaar zijn, niet pas na tweede render.

## 16) Samenvattend oordeel
Het probleem zit niet in “één losse vertaalkey”, maar in een combinatie van:

1. andere runtime-architectuur dan old 2.0,
2. startup fallback-first render,
3. gewijzigde assetstrategie,
4. gewijzigde action/button contractpresentatie.

Daarom krijg je precies het patroon dat je beschrijft: tijdelijk verkeerd scherm, daarna gedeeltelijk goed, maar niet old-2.0 strak/volledig.

## 17) Aanvullende bevindingen

Onderstaande punten ontbraken nog in dit rapport en zijn nu toegevoegd met hard bewijs.

### F-01 — `ui/assets` wordt niet meegeleverd in runtime-image
- Ernst: `blokkerend`
- Type: `functioneel verschil`
- Bewijs current:
  - Runtime verwijst naar extern logo-pad: `mcp-server/ui/step-card.bundled.html:661` (`/ui/assets/business-model_by_ben-steenstra.svg`).
  - Build kopieert alleen `step-card.bundled.html` naar `dist/ui`: `mcp-server/scripts/copy-ui-dist.mjs:9`, `:25`.
  - Docker runtime kopieert alleen `/app/dist` + `/app/assets` (presentation), niet `ui/assets`: `mcp-server/Dockerfile:41-48`.
  - Lokale dist bevat inderdaad geen assets-map: `mcp-server/dist/ui` bevat alleen `step-card.bundled.html`.
- Bewijs old 2.0:
  - Logo inline als data-URI, geen extern pad nodig: `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1175`.
- Effect:
  - Gebroken logo in productie/hostcontext is verklaard zonder speculatie.

### F-02 — Header-byline gedrag wijkt af (zichtbare “A business model by”)
- Ernst: `hoog`
- Type: `pure vormgeving`
- Bewijs current:
  - Byline tekst staat als zichtbare span in markup: `mcp-server/ui/step-card.bundled.html:657`.
  - Geen CSS-regel in current die `#byText` verbergt.
- Bewijs old 2.0:
  - Old CSS verbergt die tekst expliciet: `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:326-327`.
- Effect:
  - Bij kapot logo blijft in current losse byline-tekst zichtbaar; old had dit niet.

### F-03 — Externe fontafhankelijkheid in current, niet in old 2.0
- Ernst: `hoog`
- Type: `pure vormgeving`
- Bewijs current:
  - Laadt Google Fonts extern: `mcp-server/ui/step-card.bundled.html:6-10`.
  - Gebruikt `DM Sans`/`DM Serif Display`: `mcp-server/ui/step-card.bundled.html:42`, `:112`, `:239`, `:281`, `:370`.
- Bewijs old 2.0:
  - Geen externe fontlink; systeemfont tokens: `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:50`, `:180`.
- Effect:
  - Typografie wijkt af zodra externe fonts niet (tijdig) laden.

### F-04 — Eerste paint wordt synthetisch geforceerd via fallback payload
- Ernst: `hoog`
- Type: `functioneel verschil`
- Bewijs current:
  - Fallback builder: `mcp-server/ui/step-card.bundled.html:990-1020`.
  - Fallback inject op missende payload: `mcp-server/ui/step-card.bundled.html:1582-1585`.
  - Init roept direct ingest aan: `mcp-server/ui/step-card.bundled.html:1607`.
- Bewijs old 2.0:
  - Op `openai:set_globals` alleen `render()`, geen synthetische fallback ingest: `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2889-2892`.
- Effect:
  - “Leeg/half EN scherm” voor de echte serverpayload is verklaard.

### F-05 — Fallback payload bevat te weinig keys voor rijke prestart
- Ernst: `hoog`
- Type: `functioneel verschil`
- Bewijs current:
  - Fallback state bevat alleen `uiTitle/uiBylinePrefix/uiSubtitle/uiUseWidgetToContinue/btnStart`: `mcp-server/ui/step-card.bundled.html:997-1003`.
  - Rijke prestart vraagt extra keys (`prestart.proven.*`, `prestart.outcomes.*`, `prestart.meta.*`): `mcp-server/ui/step-card.bundled.html:1083-1092`, `:1112-1143`.
- Bewijs old 2.0:
  - Prestart default is direct volledig via `PRESTART_WELCOME_DEFAULT`: `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1278-1291`, gebruik op prestart: `:2281`.
- Effect:
  - First paint kan minimale prestart tonen ondanks beschikbare vertaling later.

### F-06 — `sectionTitle` fallback naar ruwe `step_0` in early state
- Ernst: `middel`
- Type: `functioneel verschil`
- Bewijs current:
  - Section title fallback: `sectionTitle.step_0 -> stepLabel.validation -> stepText`: `mcp-server/ui/step-card.bundled.html:1428-1430`.
  - Fallback payload bevat geen `sectionTitle.step_0`: `mcp-server/ui/step-card.bundled.html:997-1003`.
- Bewijs old 2.0:
  - Titel komt uit title-table/getSectionTitle: `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1379-1383`, `:2238`.
- Effect:
  - Tijdelijk zichtbaar technisch label `step_0` is verklaard.

### F-07 — `btnOk`-flow ontbreekt in current
- Ernst: `hoog`
- Type: `functioneel verschil`
- Bewijs current:
  - `btnOk` bestaat niet in current DOM (ID-diff: only-old `btnOk`).
  - Controlerij bevat geen `btnOk`-element: `mcp-server/ui/step-card.bundled.html:760-766`.
- Bewijs old 2.0:
  - `btnOk` aanwezig: `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1232`.
  - `btnOk_step0_ready` label key: `:1314`.
  - `btnOk` wordt conditioneel getoond in confirm mode: `:2266`, `:2642`.
  - `btnOk` dispatcht `ACTION_CONFIRM_CONTINUE`: `:2856-2862`.
- Effect:
  - “Ja, ik ben er klaar voor” buttonpariteit met old ontbreekt.

### F-08 — Legacy panel-controls staan wel in HTML, maar zijn in current niet actief
- Ernst: `hoog`
- Type: `functioneel verschil`
- Bewijs current:
  - Legacy panel + oude controls aanwezig in hidden container: `mcp-server/ui/step-card.bundled.html:702-767`.
  - Runtimecode gebruikt deze controls niet; rendering loopt via `#actions` + `#inputForm`: `mcp-server/ui/step-card.bundled.html:1348-1404`.
  - `rg` op current toont voor `btnGoToNextStep/btnStartDreamExercise/btnDreamConfirm/choiceWrap` alleen CSS/markup, geen event-wiring.
- Bewijs old 2.0:
  - Zelfde controls hebben actieve runtime-logica en event handlers: `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2625-2669`, `:2842-2887`.
- Effect:
  - Old zichtbare knoppenflow is niet alleen “gestyled anders”, maar functioneel ontkoppeld.

### F-09 — Current heeft label-based fallback dispatch (geen ActionCode)
- Ernst: `hoog`
- Type: `functioneel verschil`
- Bewijs current:
  - Parse fallback keuzes uit genummerde tekst: `mcp-server/ui/step-card.bundled.html:1191-1216`.
  - Dispatcht keuze-label als `user_message`: `mcp-server/ui/step-card.bundled.html:1381-1386`.
- Bewijs old 2.0:
  - Old buttonrender gebruikt `ui.action_codes` + `menu_id` en dispatcht ActionCode: `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2113-2120`, `:2136-2157`, `:2183-2201`.
  - Old contractdocument vereist ActionCodes, geen label fallback: `mcp-server/docs/compare/old_v2_2026-02-14/docs/ui-interface-contract.md:12-19`, `:34-45`.
- Effect:
  - Current wijkt af van old deterministische knoprouting.

### F-10 — Input-control en verzend-UX verschilt fundamenteel
- Ernst: `middel`
- Type: `pure vormgeving`
- Bewijs current:
  - Form-based input met `#inputForm`, `#inputText`, tekstbutton `#inputSend`: `mcp-server/ui/step-card.bundled.html:693-696`, update label: `:1402-1404`.
- Bewijs old 2.0:
  - Textarea + iconische send-button met data-URI icoon: `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1220-1224`.
- Effect:
  - Tweede scherm oogt anders ook als contenttekst correct is.

### F-11 — Stepper is statisch in current, dynamisch in old
- Ernst: `middel`
- Type: `pure vormgeving`
- Bewijs current:
  - Hardcoded 11 `<i>` bars in markup: `mcp-server/ui/step-card.bundled.html:669-670`.
- Bewijs old 2.0:
  - Dynamische opbouw met `buildStepper(activeIdx, stepTitle)`: `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2019`, gebruik: `:2237-2239`.
- Effect:
  - Stapnavigatie en visuele context wijken af.

### F-12 — Contractdocument en current runtime spreken elkaar tegen op fallback/i18n
- Ernst: `hoog`
- Type: `functioneel verschil`
- Bewijs current doc:
  - “No client-side language fallback selection”: `mcp-server/docs/ui-interface-contract.md:74-78`.
  - “Widget must not invent fallback narratives”: `mcp-server/docs/ui-interface-contract.md:66`.
- Bewijs current runtime:
  - Client fallback locale/strings actief: `mcp-server/ui/step-card.bundled.html:931-957`, `:976-988`.
  - Fallback narrative payload actief: `mcp-server/ui/step-card.bundled.html:990-1020`, `:1582-1585`.
- Effect:
  - Verwachte contractgedrag en feitelijke runtime divergeren.

## 18) Ontbrekende checks die nog niet in rapport stonden

1. Build/deploy artifact check voor UI-assets.
   - Controlepunt: runtime verwijst naar `/ui/assets/*` maar image bevat map niet.
   - Bewijs: `mcp-server/ui/step-card.bundled.html:661`, `mcp-server/scripts/copy-ui-dist.mjs:9`, `mcp-server/Dockerfile:41-48`.

2. ID-parity check (old vs current runtime DOM).
   - Controlepunt: old-only ID’s en current-only ID’s expliciet vergelijken.
   - Resultaat:
     - old-only: `btnOk`
     - current-only: `actions`, `inputForm`, `inputText`, `inputSend`, `meta`, `wordingChoice*` (meerdere).

3. Wiring-check op aanwezige controls.
   - Controlepunt: element bestaat in HTML, maar heeft runtime wiring?
   - Resultaat current:
     - `btnGoToNextStep`, `btnStartDreamExercise`, `btnDreamConfirm`, `choiceWrap`, `btnScoringContinue` bestaan in markup (`mcp-server/ui/step-card.bundled.html:739`, `:758`, `:762-765`), maar worden niet aangestuurd door actieve renderflow (`:1348-1404`).

4. Header asset afhankelijkheids-check.
   - Controlepunt: extern logo-pad versus self-contained.
   - Resultaat:
     - current extern pad (`:661`), old inline data-URI (`old:1175`).

5. Typography dependency-check.
   - Controlepunt: externe font providers nodig of niet.
   - Resultaat:
     - current: Google Fonts (`:6-10`), old: lokaal/system fonts (`old:50`, `old:180`).

6. Early render-key coverage check.
   - Controlepunt: bevat first-paint state alle prestart-rijkdom?
   - Resultaat:
     - current fallback state bevat minimale keys (`:997-1003`) en mist rich prestart keys (`:1083-1092` nodig).

7. Action dispatch contract-check.
   - Controlepunt: wordt ooit labeltekst gestuurd in plaats van ActionCode?
   - Resultaat:
     - current ja (`:1385`), old keuzepad gebruikt action_codes (`old:2183-2201`).

8. Documentatie-parity check.
   - Controlepunt: klopt runtimegedrag met actuele contractdocs.
   - Resultaat:
     - mismatch op fallback/i18n regels (`docs/ui-interface-contract.md:66`, `:74-78` vs runtime `:931-957`, `:990-1020`, `:1582-1585`).

9. Geverifieerd gelijk (toegevoegd zodat niets overgeslagen wordt).
   - Transport renderbron blijft `_meta.widget_result`-first kandidaatselectie in current: `mcp-server/ui/step-card.bundled.html:1248-1252`.
   - Stale transport-drop/rebase staat effectief uit (noop): `mcp-server/src/server/run_step_transport_stale.ts:27-34`.
   - 11 talen + EN fallback catalogusbestanden aanwezig: `mcp-server/src/i18n/ui_strings/locales/ui_strings_*.ts` + defaults in `mcp-server/src/i18n/ui_strings_defaults.ts:38-64`.

## 19) Definitieve parity-checklist

- [x] Old 2.0 compare-baseline is byte-identiek aan zip voor kernbestanden.
- [x] Alle zichtbare UI-hoofdelementen vergeleken (header/byline/logo/stepper/card/input/subtitle/footer).
- [x] Alle knoppenfamilies vergeleken (`btnStart`, `btnOk`, `btnGoToNextStep`, `btnStartDreamExercise`, `btnSwitchToSelfDream`, `btnDreamConfirm`, `btnScoringContinue`, choice buttons, text submit).
- [x] Action dispatch paden vergeleken (ActionCode vs labeltekst dispatch).
- [x] Prestart first-paint en overgang naar interactieve step_0 vergeleken.
- [x] Content-prioriteit vergeleken (`specialist.message/refined/question`, `result.text/prompt`, prestart rich content).
- [x] i18n files en fallback-inrichting gecontroleerd (11 talen + EN).
- [x] CSS/typografie dependencies vergeleken (extern fonts vs lokaal, asset-strategie).
- [x] HTML-structuur parity vergeleken (ID/class-diff, statuspositie, inputstructuur).
- [x] Build/deploy artifact parity gecontroleerd (dist/runtime image inhoud t.o.v. runtime verwijzingen).
- [x] Contractdocumenten vergeleken met feitelijke runtime-implementatie.
- [ ] Header-logo parity is functioneel opgelost in deploy artifact (nu nog blokkerend door asset packaging mismatch).
- [ ] Step_0 readiness-button parity (`btnOk_step0_ready`) is hersteld in actieve renderflow.
- [ ] First paint parity zonder synthetische minimale fallback is bereikt.
- [ ] Action dispatch parity zonder label-based fallback is bereikt.

## 20) Wat nog ontbreekt voor 100% old-2.0 interface parity

1. Deploy-artefacten moeten UI-assets bevatten zolang runtime `/ui/assets/*` refereert.
   - Zonder dit blijft logo/render-header afwijken, ongeacht i18n-correctheid.

2. Header/byline rendering moet old-2.0 equivalent zijn.
   - Inclusief dezelfde afhankelijkheidsstrategie (self-contained of identiek beschikbaar assetpad).

3. First paint moet direct uit echte serverpayload komen (niet via minimale synthetische prestart).
   - Anders blijft “leeg/half/ENG daarna NL” reproduceerbaar.

4. Step_0 confirm/readiness pad moet weer expliciet old-2.0 UI-gedrag opleveren.
   - Inclusief zichtbare confirm-knop semantiek in plaats van alleen body/prompt tekst.

5. Button-routing moet overal deterministisch ActionCode-gebaseerd blijven in de actieve flow.
   - Geen labeltekst-dispatch als tijdelijke route in interactieve modus.

6. Actieve renderflow en aanwezige controls moeten weer 1-op-1 overeenkomen.
   - Geen dode legacy controls in HTML die niet door runtime aangestuurd worden.

7. Documentatie en runtime moeten exact gelijklopen.
   - Nu staat in contractdoc dat client geen fallback/language-negotiation doet, maar runtime doet dat wel.
