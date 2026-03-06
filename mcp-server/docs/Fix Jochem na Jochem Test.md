# Fix Jochem na Jochem Test

## Fix 1 - Startup wait-shell + dubbele startklik op welkomstscherm

### Input (zoals gemeld)
Tijdens startup van de MCP app verschijnt eerst een loading-scherm (`Loading translation...`). Pas daarna verschijnt de normale app-content in de juiste taal.

Daarnaast is de startknop op het welkomstscherm pas effectief na een eerste klik; in de praktijk moet je vaak 2 keer klikken om naar het volgende scherm te gaan.

Gewenst interface-gedrag:
1. Geen zichtbare tussenschermen met halve/fallback content als eindgebruiker-flow.
2. Eerste zichtbare app-state is direct bruikbaar en in de juiste taal.
3. Startknop reageert deterministisch op de eerste klik (single-click progression).

### Eerste analyse (grote lijnen, nog geen definitieve root-cause)

#### Hypothese A - Client forceert een synthetische startup wait-state vóór canonical host payload
- De widget rendert actief een client-side wait-shell met `prestart.loading` zodra de eerste host payload nog niet beschikbaar is.
- Daardoor ziet de user eerst een fallback-scherm en pas daarna de echte state.
- Dit verklaart exact het waargenomen patroon “eerst loading, daarna gevuld”.

#### Hypothese B - Root wordt te vroeg zichtbaar gemaakt
- De root wordt vrijgegeven zodra `startupPayloadMissing` waar is, inclusief de synthetische wait-state.
- Daardoor wordt expliciet gekozen voor “iets tonen” in plaats van “wachten op canonical state en dan in één keer renderen”.

#### Hypothese C - Start-actie kan in ‘ack zonder zichtbare advance’-pad vallen
- In het startpad wordt `ACTION_START` als niet-gevorderd beschouwd als er geen direct ingest-bare widget-result payload is of view nog `prestart` blijft.
- Dan wordt een recovery-poll gepland i.p.v. directe zichtbare voortgang.
- UX-effect: eerste klik voelt als no-op; tweede klik lijkt nodig.

#### Hypothese D - Startup race tussen ingest-kanalen veroorzaakt prestart-cache-gevoel
- De code verwerkt meerdere ingest-signalen (`set_globals`, host notification, call response).
- Als eerste response shape niet canonical wordt herkend, kan prestart visueel blijven staan terwijl server-side start wel accepted is.

### Toets aan OpenAI-richtlijnen (hoog over)

Bronnen:
- https://developers.openai.com/apps-sdk/build/chatgpt
- https://developers.openai.com/apps-sdk/build/state-management
- https://developers.openai.com/apps-sdk/build/ux
- https://developers.openai.com/apps-sdk/build/ui-guidelines

Wat relevant lijkt:
1. Apps SDK-voorbeelden sturen op renderen vanuit host-state (`window.openai.toolOutput`) en updates via host-event (`openai:set_globals`).
2. UX-principes leggen nadruk op snelle/responsieve ervaring en heldere state-transities.
3. UI-richtlijnen leggen nadruk op duidelijke single-action interacties.

Inferred conclusie (expliciet als inferentie):
- Een geforceerde client-side startup wait-shell als eerste zichtbare app-state, gevolgd door latere re-render, past slecht bij het gewenste patroon van deterministische host-state render en snelle, eenduidige interactie.
- Een startknop die niet consistent op eerste klik doorzet is niet in lijn met “clear single-action progression”.

### Bewijspunten in code (startpunten voor diep onderzoek)

- `mcp-server/ui/step-card.bundled.html`
  - Startup synthetic wait-state:
    - `STARTUP_GRACE_MS_DEFAULT` + `buildStartupInitState` met `waiting_locale/pending`: regels 4705-4737.
    - `renderStartupWaitShell(...)`: regels 4760-4784.
    - trigger bij ontbrekende init payload: regel 5020.
  - Wait-shell rendering met `prestart.loading`:
    - `renderBootstrapWaitShell(...)`: regels 3784-3808.
  - Root reveal timing:
    - `startupPayloadMissing` + immediate `revealWidgetRoot()`: regels 4023-4025.
  - Startklik flow:
    - `btnStart` handler + `callRunStep(actionCode, { started: "true" })`: regels 4947-4960.
  - Start-ack zonder advance pad:
    - `startAdvanced = hasIngestedResult && (...)`: regel 3316.
    - failure-path + recovery poll scheduling: regels 3317-3332.
  - Recovery timing/debounce:
    - `CLICK_DEBOUNCE_MS = 250`: regels 2606-2608 en 3157-3158.
    - `scheduleStartAckRecoveryPoll(...)`: regels 2630-2667.

- `mcp-server/src/handlers/run_step_routes.ts`
  - `start_prestart` routing en prestart/start-trigger splitsing: regels 612-779.

- Historische regressie-evidence in repo (relevant voor dezelfde defectklasse)
  - `docs/mcp_widget_regressie_living_rapport.md`: 1212-1220, 1652-1653.
  - `docs/mcp_widget_stabilisatie_run_resultaat.md`: 49-51, 188-193.

### Mogelijke structurele fixes (geen quick fixes)

1. Maak canonical host payload hard de enige bron voor first visible paint
- Geen synthetische startup wait-state renderen als normale eerste app-state.
- Root pas revealen bij canonical payload (of expliciete fail-closed error-state).

2. Verwijder “prestart.loading” als standaard eerste gebruikersscherm
- Alleen tonen bij expliciete server view-mode recovery/wait, niet bij client init-miss.
- Doel: geen visuele dubbele overgang (loading -> prestart content).

3. Maak start-advance invariant strenger en deterministischer
- `ACTION_START` mag user-facing niet eindigen in stilstaande prestart zonder expliciete foutmelding.
- Als server `accepted + state_advanced` geeft, moet UI binnen begrensde tijd zichtbaar doorzetten naar interactieve state of expliciet falen.

4. Harmoniseer ingest-vormen tot één canonical parsepad
- `set_globals`, `tool-result` en `call response` moeten dezelfde canonical widget-result selectie afdwingen.
- Geen prestart-cache behoud bij vorm-mismatch zonder expliciete contract-error.

5. Verifieer met contracttests op UX-uitkomst
- Regressietests die exact afdwingen:
  - geen “loading translation -> pas daarna prestart” als standaard startup-flow,
  - startknop zet met één klik door naar interactieve step_0-state,
  - geen silent no-op bij start.

### Agent instructie (copy-paste, diep onderzoek, geen code wijzigen)
```text
Context
Je onderzoekt een startup/action regressie in de MCP-widget:
1) eerst zichtbaar loading/wait-scherm,
2) daarna pas gevuld welkomstscherm,
3) startknop voelt als dubbele klik nodig.

Observed bug
- User ziet eerst "Loading translation..." in de card.
- Daarna verschijnt pas de normale prestart-content in de juiste taal.
- Startknop gaat vaak pas bij tweede klik door naar het volgende scherm.

Doel van deze opdracht
1) Lever definitieve root-cause (geen symptoomfix).
2) Toets expliciet aan OpenAI Apps SDK-richtlijnen.
3) Lever structureel fixplan.
4) Doe GEEN codewijzigingen in deze opdracht.

Harde regels
- Quick fixes verboden.
- Geen extra retries/fallbacks als eindoplossing.
- Als je fallback-lagen vindt die UX-race maskeren: markeer als technische schuld.
- Zonder expliciet akkoord: geen implementatie.

Onderzoeksaanpak
1. Reproduceer deterministisch
- Leg startup-eventvolgorde vast:
  - initial ingest
  - set_globals
  - tool-result notification
  - first render
  - ACTION_START dispatch/ack/advance
- Leg per stap vast:
  - payload-shape bron
  - selected canonical render source
  - ui.view.mode
  - started/current_step
  - has_start_action
  - action liveness (ack/status/state_advanced/reason)

2. Maak causale keten
- Toon exact waarom loading-shell eerst zichtbaar wordt.
- Toon exact waarom startklik in no-progress pad valt.
- Toon of dit een ingest-shape probleem, ordering probleem, of beide is.

3. OpenAI-richtlijntoets
- Gebruik minimaal deze bronnen:
  - https://developers.openai.com/apps-sdk/build/chatgpt
  - https://developers.openai.com/apps-sdk/build/state-management
  - https://developers.openai.com/apps-sdk/build/ux
  - https://developers.openai.com/apps-sdk/build/ui-guidelines
- Maak expliciet onderscheid tussen:
  - direct bronfeit
  - inferentie voor deze codebase

4. Lever structureel oplossingsvoorstel (niet implementeren)
- 1 voorkeursrichting + max 2 alternatieven.
- Per richting:
  - architecturale impact,
  - welke invarianten hard worden,
  - risico/migratie,
  - teststrategie (unit/integratie/regressie).

Verplichte outputstructuur
A. Mensentaal probleemuitleg (kort)
B. Technisch bewijs (file/line + eventvolgorde)
C. Definitieve root-cause
D. Structureel fixplan
E. Beslisvoorstel (wat eerst, waarom)

Stopconditie
- Stop na analyse + plan.
- Vraag expliciet akkoord voor implementatie.
- Zonder akkoord: geen codewijzigingen.
```

### Oplossing / aanpassing (na akkoord)
Nog niet ingevuld. Wacht op expliciet akkoord voor implementatie.

## Fix 2 - Dream Builder: Engelse leak na switch-to-self + vraagzin niet catalog-gedreven in alle talen

### Input (zoals gemeld)
- In Dream Builder klikte de user op `Terugschakelen naar zelf het droom formuleren`.
- Daarna verscheen een scherm met Engelse tekst, terwijl de sessie volledig Nederlands was.
- Verwachting: deze teksten moeten uit de vertaaldocumenten/catalog komen en in alle talen beschikbaar zijn.

Extra copy-eis voor de Dream-vraag:
- De huidige zin in de flow is:
  - `Als je 5 tot 10 jaar vooruitkijkt, welke grote kans of dreiging zie je, en welke positieve verandering hoop je? Schrijf het als één duidelijke uitspraak.`
- Gewenst is een meervoud-/herformuleerde variant in alle talen.

### Eerste analyse (grote lijnen, nog geen definitieve root-cause)

#### Hypothese A - Hardcoded Engelse specialist-message in switch-to-self route
- In de route `dream_switch_to_self` staat een vaste Engelse boodschap in code.
- Daardoor lekt Engels direct in `specialist.message`, los van locale/ui_strings.

#### Hypothese B - Eerste Dream Builder-vraag is LLM-semantisch i.p.v. catalog-key
- De hoofdvraag voor de Dream-oefening wordt in specialist-instructies als betekenisregel opgegeven (in het Engels), met opdracht “localize in user language”.
- Dat maakt de uiteindelijke tekst afhankelijk van model-output i.p.v. vaste vertaalcatalog.
- Gevolg: wording drift (singular/plural), inconsistentie met gewenste copy, en geen gegarandeerde parity over alle talen.

#### Hypothese C - Bestaande i18n-keys zijn slechts deels aangesloten
- Keys zoals `dreamBuilder.question.base`, `dreamBuilder.question.more`, `dreamBuilder.switchSelf.headline` bestaan al in defaults/locales.
- Runtime gebruikt `question.more` in een specifiek vervolgpad, maar niet als harde bron voor de eerste Dream-vraag.
- `dreamBuilder.switchSelf.headline` lijkt gedefinieerd maar niet aangesloten op de switch-to-self message-render.

#### Hypothese D - “Localization helper” vervangt alleen termen, niet volledige zinnen
- `normalizeLocalizedConceptTerms` vervangt concepttermen (zoals stepnamen), maar vertaalt geen complete Engelse alinea’s.
- Daardoor blijft een hardcoded Engelse paragraaf intact in niet-EN sessies.

#### Hypothese E - Geen cross-locale contracttest op deze copy-paden
- Er lijkt geen regressietest die afdwingt dat dit specifieke switch-to-self scherm en Dream-vraag altijd uit de catalog komen voor alle ondersteunde locales.

### Bewijspunten in code (startpunten voor diep onderzoek)

- Hardcoded Engels na switch-to-self:
  - `mcp-server/src/handlers/run_step_routes.ts`
    - `dream_switch_to_self` route met vaste Engelse `specialist.message`: regels 532-536.

- Dream-vraag als semantische specialist-instructie (model-localization):
  - `mcp-server/src/steps/dream_explainer.ts`
    - Intro-vraag in Engels als meaning-contract: regel 347.
    - Vervolgvraag “meaning; do not hardcode translations”: regels 356-358.

- Bestaande i18n keys voor Dream-vragen:
  - `mcp-server/src/i18n/ui_strings_defaults.ts`
    - `dreamBuilder.question.base`: regels 75-76.
    - `dreamBuilder.question.more`: regels 77-78.
    - `dreamBuilder.switchSelf.headline`: regel 79.

- Gedeeltelijke runtime-aansluiting:
  - `mcp-server/src/handlers/run_step_runtime_specialist_helpers.ts`
    - gebruikt `dreamBuilder.question.more` voor prompt-stage `more`: regels 226-237.
  - `mcp-server/src/handlers/run_step_runtime_backbone.ts`
    - prompt-stage seed op `base`: regels 79-83.

- Lokalisatiehelper beperkt tot term-replacements:
  - `mcp-server/src/handlers/run_step_runtime_specialist_helpers.ts`: regels 35-111.

- Catalog-locale matrix (alle ondersteunde locales):
  - `mcp-server/src/i18n/ui_strings_catalog.ts`: regels 7-37.

### Mogelijke structurele fixes (geen quick fixes)

1. Verplaats switch-to-self body-copy naar i18n catalog en verwijder hardcoded Engels
- Introduceer expliciete keys voor deze bodytekst (bijv. `dreamBuilder.switchSelf.body.intro` + `dreamBuilder.switchSelf.body.helper`).
- Route `dream_switch_to_self` mag alleen catalog-keys gebruiken via `uiStringFromStateMap`.

2. Maak Dream-vraag SSOT via catalog-keys, niet via vrije model-localization
- Definieer canonieke keys voor:
  - eerste vraag (`dreamBuilder.question.base`),
  - vervolgvraag (`dreamBuilder.question.more`),
  - eventueel variant voor “write as one clear statement” vs “describe future view”.
- Dwing runtime-override af voor eerste Dream Builder vraag op basis van prompt-stage `base`, analoog aan bestaande `more`-override.

3. Voer copy-update door in alle ondersteunde locales
- Update de gewenste meervoud/herformuleerde zin in:
  - defaults EN,
  - alle locale bestanden: `de, en, es, fr, hi, hu, id, it, ja, ko, nl, pt_br, ru, zh_hans`.
- Houd keyset volledig gelijk per locale; geen ontbrekende keys toestaan.

4. Voeg i18n contracttests toe voor deze paden
- Test dat `dream_switch_to_self` in niet-EN locale nooit Engelse zinnen rendert.
- Test dat Dream-vraag in stage `base` en `more` uit catalog-key komt.
- Test key-parity over alle catalog-locales voor nieuwe Dream keys.

5. Maak copy-governance expliciet
- Leg vast welke Dream-vraag de canonieke NL bronzin is (vanwege ambigu geformuleerde input met dubbele zin).
- Vertaal van die canonieke bron naar alle talen; niet per taal vrij herschrijven in specialist.

### Agent instructie (copy-paste, diep onderzoek, geen code wijzigen)
```text
Context
Je onderzoekt een i18n-regressie in Dream Builder:
1) na switch-to-self verschijnt Engelse tekst in niet-EN sessie,
2) de centrale Dream-vraag moet copy-wise worden aangepast (meervoud/herformulering) en in alle talen consistent zijn.

Observed bug
- Klik op `ACTION_DREAM_SWITCH_TO_SELF` toont Engelse paragraaf terwijl sessie NL is.
- Dream-vraagtekst is niet de gewenste nieuwe formulering en lijkt niet strict catalog-gedreven over alle talen.

Doel van deze opdracht
1) Definieer definitieve root-cause met codebewijs.
2) Toon exact welke copypaden niet uit ui_strings catalog komen.
3) Lever structureel i18n-fixplan voor alle ondersteunde locales.
4) Doe GEEN codewijzigingen in deze opdracht.

Harde regels
- Quick fixes verboden.
- Geen runtime regex-hacks om Engels te maskeren.
- Geen model-only “localize better” als eindoplossing.
- Zonder expliciet akkoord: geen implementatie.

Onderzoeksaanpak
1. Herleid copy herkomst per zichtbaar tekstblok
- Voor switch-to-self scherm:
  - waar komt body-text vandaan?
  - waar komt vraag/prompt vandaan?
  - welke delen komen uit ui_strings keys en welke uit specialist literals?

2. Maak causale keten
- Toon exact waarom Engels zichtbaar kan worden in NL sessie.
- Toon waarom huidige Dream-vraag niet volledig via catalog wordt afgedwongen.

3. Bepaal catalog-gap
- Maak key-matrix voor relevante Dream copy:
  - switch-self body keys
  - base question key
  - more question key
- Controleer key-parity over alle locales.

4. Lever structureel oplossingsvoorstel (niet implementeren)
- Presenteer 1 voorkeursrichting + max 2 alternatieven.
- Per richting:
  - architecturale impact,
  - invarianten die hard worden,
  - risico/migratie,
  - teststrategie (unit/integratie/regressie).

Verplichte outputstructuur
A. Mensentaal probleemuitleg
B. Technisch bewijs (files/regels + copy-herkomst)
C. Definitieve root-cause
D. Structureel fixplan
E. Beslisvoorstel (incl. canonieke NL bronzin voor vertaling)

Stopconditie
- Stop na analyse + plan.
- Vraag expliciet akkoord voor implementatie.
- Zonder akkoord: geen codewijzigingen.
```

### Oplossing / aanpassing (na akkoord)
Nog niet ingevuld. Wacht op expliciet akkoord voor implementatie.

## Fix 3 - Stepper label wordt afgekapt; uitlijning labels niet conform (links, behalve presentatie rechts)

### Input (zoals gemeld)
In de bovenbalk (boven de oranje/grijze streepjes) wordt de actieve staptekst afgekapt als de naam langer is dan het segment.

Gewenst gedrag:
1. Alle stappen (behalve `presentatie`) links uitgelijnd.
2. De tekst moet doorlopen zodat de volledige stapnaam leesbaar is (geen afkapping met `...`).
3. De stap `presentatie` staat rechts uitgelijnd.

### Eerste analyse (grote lijnen, nog geen definitieve root-cause)

#### Hypothese A - Hardcoded tekstafkapping in stepper label functie
- De renderer kort staplabels expliciet in op 12 karakters en plakt `…`.
- Daardoor is afkapping geen CSS-bijeffect maar bewust gedrag in JS.

#### Hypothese B - CSS forceert extra ellipsis/overflow clipping
- Labelstijl gebruikt `white-space: nowrap`, `overflow: hidden`, `text-overflow: ellipsis`, `max-width:100%`.
- Zelfs zonder JS-truncation blijft clipping actief.

#### Hypothese C - Geen stap-specifieke uitlijningsregel voor `presentation`
- Stepper-items staan generiek op `align-items:flex-start`.
- Er is geen aparte logica/CSS voor laatste stap (`presentation`) om label rechts uit te lijnen.

#### Hypothese D - Layout-contract ontbreekt voor “volledige labelzichtbaarheid”
- De huidige stepper is gebouwd op segmentbreedtes; labelruimte is impliciet aan bar-segment gekoppeld.
- Zonder expliciete invariant op full-label readability blijft truncation logisch in huidige opzet.

### Bewijspunten in code (startpunten voor diep onderzoek)

- JS truncation:
  - `mcp-server/ui/lib/ui_render.ts`
    - `stepLabelShort(...)` kapt op 12 chars + `…`: regels 127-131.
    - actieve labeltext komt uit `stepLabelShort(...)`: regel 150.
  - `mcp-server/ui/step-card.bundled.html`
    - zelfde ingebundelde truncation: regels 3683-3687 en 3700.

- CSS clipping/ellipsis:
  - `mcp-server/ui/step-card.bundled.html`
    - `.step-item-label` met `nowrap + overflow:hidden + text-overflow:ellipsis`: regels 431-441.

- Uitlijning step-items:
  - `mcp-server/ui/step-card.bundled.html`
    - `.step-item { align-items: flex-start; }` voor alle stappen: regels 421-426.
    - geen speciale presentatie/right-align rule; alleen `:last-child { padding-right:0; }`: regel 429.

- Stapvolgorde/context presentatie als laatste stap:
  - `mcp-server/ui/lib/ui_constants.ts`
    - `ORDER` eindigt met `presentation`: regels 8-20.

### Mogelijke structurele fixes (geen quick fixes)

1. Verwijder truncation uit renderer als beleid
- Schrap `full.slice(0, 12) + "…"` in stepper-label pad.
- Label moet vanuit volledige localized title komen.

2. Maak stepper-label CSS full-readable
- Verwijder/override `overflow:hidden` en `text-overflow:ellipsis` voor actieve labelweergave.
- Definieer expliciet hoe label mag doorlopen (zonder bar-layout te breken), bv. overlay/absolute label-layer of adaptive label container.

3. Introduceer uitlijningsinvariant per stap
- Default: actieve label links uitgelijnd.
- Uitzondering: `presentation` label rechts uitgelijnd.
- Dwing dit via step-id/class contract, niet via fragiele `:last-child` heuristiek alleen.

4. Regressietests op visual contract
- Test dat actieve labeltekst exact volledige step-title bevat (geen ellipsis-char).
- Test dat `presentation`-label rechts staat en andere stappen links.
- Test op desktop + mobile breakpoints.

### Agent instructie (copy-paste, diep onderzoek, geen code wijzigen)
```text
Context
Je onderzoekt een UI-regressie in de stepper boven de kaart:
- actieve staptekst wordt afgekapt,
- uitlijning moet links zijn voor alle stappen behalve presentatie (rechts).

Observed bug
- Label toont afgekorte tekst met ellipsis.
- Gebruiker kan volledige stapnaam niet lezen.
- Presentatie-uitlijning wijkt af van gewenste contractregel.

Doel van deze opdracht
1) Lever definitieve root-cause (render + css + layout contract).
2) Toon exact welke code truncation en clipping veroorzaakt.
3) Lever structureel fixplan voor leesbaarheid + uitlijning.
4) Doe GEEN codewijzigingen in deze opdracht.

Harde regels
- Quick fixes verboden.
- Geen ad-hoc string-korting per taal.
- Geen eenmalige CSS hack zonder layout-invariant.
- Zonder expliciet akkoord: geen implementatie.

Onderzoeksaanpak
1. Reproduceer deterministisch
- Leg voor minstens 3 lange staplabels vast:
  - raw title key waarde,
  - gerenderde labeltext,
  - toegepaste css classes/states.

2. Maak causale keten
- Toon exact waar truncation in JS gebeurt.
- Toon exact waar CSS clipping gebeurt.
- Toon waarom presentatie niet apart rechts uitlijnt.

3. Definieer layout-invariant
- Schrijf harde regels voor:
  - full label readability,
  - default links uitgelijnd,
  - presentatie rechts uitgelijnd.

4. Lever structureel oplossingsvoorstel (niet implementeren)
- 1 voorkeursrichting + max 2 alternatieven.
- Per richting:
  - architecturale impact,
  - risico/migratie,
  - teststrategie (unit + UI regressie).

Verplichte outputstructuur
A. Mensentaal probleemuitleg
B. Technisch bewijs (files/regels)
C. Definitieve root-cause
D. Structureel fixplan
E. Beslisvoorstel (wat eerst, waarom)

Stopconditie
- Stop na analyse + plan.
- Vraag expliciet akkoord voor implementatie.
- Zonder akkoord: geen codewijzigingen.
```

### Oplossing / aanpassing (na akkoord)
Nog niet ingevuld. Wacht op expliciet akkoord voor implementatie.
## Fix 4 - Onnodige keuzekaart bij correcte input + dubbele betekenis in suggestie (bestaansreden)

### Input (zoals gemeld)
- User vroeg om 3 voorbeeld-bestaansredenen, kopieerde er 1 en gaf die als input.
- UI toont daarna een wording-choice scherm met:
  - `Dit is jouw input: ...`
  - `Dit zou mijn suggestie zijn: Je huidige bestaansreden voor Mindd is: ...`
- Gevoelde bug: de suggestie is inhoudelijk dezelfde zin met extra prefix, en er is onnodig een keuzepaneel.

Aanvullende functionele nuance (bevestigd):
- Als de input al correct is, dan mag er wél direct bevestiging staan zoals `Je huidige bestaansreden is: ...`,
- maar zonder keuze tussen twee varianten.

### Eerste analyse (grote lijnen, nog geen definitieve root-cause)

#### Hypothese A - Suggestie-tekst kan vervuild raken met een context-heading
- De wording-choice suggestie wordt opgebouwd uit meerdere kandidaten (field/refined/previous/message).
- Een kandidaat kan een al eerder opgebouwde contextregel bevatten zoals `Je huidige ... is:`.
- Daardoor vergelijkt de engine niet “zin vs zin”, maar “zin vs heading+zin”.

#### Hypothese B - Equivalentie-check werkt op ruwe tekst en mist heading-unwrapping
- De gelijkheidscheck (`areEquivalentWordingVariants`) canonicalize’t tekst, maar verwijdert geen `current heading` wrapper.
- Resultaat: semantisch gelijke inhoud wordt als verschillend gezien, waardoor onterecht wording-choice pending ontstaat.

#### Hypothese C - Zodra pending true is, forceert pipeline altijd keuze-UI
- Bij `wording_choice_pending=true` wordt `require_wording_pick` gezet en acties onderdrukt.
- UX-gevolg: user ziet altijd twee keuzevakken, ook als er eigenlijk niets te kiezen is.

#### Hypothese D - Dit patroon is niet beperkt tot bestaansreden
- Wording-choice eligibility geldt voor vrijwel alle stappen behalve `step_0` en `presentation`.
- Daarmee kan dezelfde duplicatie/prefix-mismatch ook in andere stappen voorkomen.

### Bewijspunten in code (startpunten voor diep onderzoek)

- Wording-choice scope is breed (bijna alle stappen):
  - `mcp-server/src/handlers/run_step_wording.ts`
    - `isWordingChoiceEligibleStep(...)` sluit alleen `step_0` en `presentation` uit: regels 148-153.

- Suggestie-kandidaatselectie die heading-vervuiling kan binnenhalen:
  - `mcp-server/src/handlers/run_step_wording_heuristics.ts`
    - `pickDualChoiceSuggestion(...)` candidate-volgorde incl. previous/message: regels 627-698.
    - `extractSuggestionFromMessage(...)` pakt laatste “bruikbare” zin/paragraaf zonder specifieke filter op `current ... is:` headings: regels 222-270.

- Heading-opbouw van “Je huidige ... is:”:
  - `mcp-server/src/handlers/run_step_runtime_state_helpers.ts`
    - `wordingSelectionMessage(...)` bouwt heading uit `offtopic.current.template` + current value: regels 538-571.

- Onterechte pending bij niet-equivalent:
  - `mcp-server/src/handlers/run_step_wording.ts`
    - equivalent-check en pending-opbouw (`wording_choice_pending=true`): regels 805-926.

- Pipeline forceert keuzepaneel bij pending:
  - `mcp-server/src/handlers/run_step_pipeline.ts`
    - pending choice override + `requireWordingPick=true`: regels 728-751.

### Check: kan dit ook bij andere stappen gebeuren?

Ja, potentieel wel.

Hoog risico (text-mode stappen):
1. `purpose`
2. `bigwhy`
3. `role`
4. `entity`
5. `targetgroup`
6. `dream` (in paden waar wording-choice text-mode actief is)

Ook mogelijk (list-mode, andere uiting):
1. `strategy`
2. `productsservices`
3. `rulesofthegame`
4. `dream` in builder/list-context

Waarom breed:
- Dezelfde wording-choice engine + pending-mechaniek wordt stap-overstijgend gebruikt.
- Een vervuilde suggestion-candidate of wrapper-mismatch kan dus op meerdere stappen dezelfde UX-fout triggeren.

### Mogelijke structurele fixes (geen quick fixes)

1. Voeg een canonical “unwrap current-heading” stap toe vóór equivalentie en vóór payload
- Strip gecontroleerd patronen als `offtopic.current.template`/step-current headings uit suggestion candidate.
- Vergelijk vervolgens inhoud-op-inhoud.

2. Voeg short-circuit toe: “inhoud al bevestigd” => geen wording-choice
- Als user-input canonical gelijk is aan huidige/nieuwe stapwaarde, ga direct naar bevestigingspad (`wordingSelectionMessage`) zonder keuzes.

3. Beperk message-based suggestion extraction tot valide refine-context
- Gebruik `extractSuggestionFromMessage` alleen als veld/refined kandidaten ontbreken of expliciet refine-intent aanwezig is.
- Voorkom dat narratieve contextregels als suggestie eindigen.

4. Cross-step regressietests op wording-choice false positives
- Testmatrix voor text- en list-stappen:
  - correcte input => géén keuzekaart,
  - wel bevestigingsregel `Je huidige ... is: ...`,
  - geen dubbeling van exact dezelfde inhoud met extra prefix.

5. Voeg anti-dup guard toe in pending-opbouw
- Als `suggestion_text` na canonical-unwrapping gelijk is aan `user_text`, zet `wording_choice_pending=false`.

### Agent instructie (copy-paste, diep onderzoek, geen code wijzigen)
```text
Context
Je onderzoekt een wording-choice regressie:
- bij correcte input toont de UI toch een keuzepaneel,
- de suggestie bevat dezelfde inhoud met extra prefix ("Je huidige ... is:"),
- dit lijkt nu zichtbaar bij bestaansreden, maar moet stap-overstijgend worden gecheckt.

Observed bug
- User plakt een correcte bestaansreden.
- In plaats van directe bevestiging verschijnt wording-choice met:
  - user input
  - suggestion = heading + vrijwel dezelfde zin
- Gewenst: directe bevestiging ("Je huidige bestaansreden is: ...") zonder keuzes.

Doel van deze opdracht
1) Lever definitieve root-cause van false-positive wording-choice.
2) Toon exact welk pad de heading/prefix in suggestion injecteert.
3) Onderzoek of dit bij andere stappen kan optreden (matrix).
4) Lever structureel fixplan.
5) Doe GEEN codewijzigingen in deze opdracht.

Harde regels
- Quick fixes verboden.
- Geen locale-specifieke string hacks.
- Geen suppressie van wording-choice zonder causale oplossing.
- Zonder expliciet akkoord: geen implementatie.

Onderzoeksaanpak
1. Reproduceer op purpose
- Scenario: voorbeeldzin plakken die al valide is.
- Log:
  - userRaw
  - suggestionRawCandidate
  - normalizedUser
  - equivalent=true/false
  - wording_choice_pending

2. Herleid candidate-keten
- Check candidate-prioriteit:
  - field value
  - refined_formulation
  - previous wording_choice_agent_current
  - extractSuggestionFromMessage(message)
- Markeer waar heading/prefix binnenkomt.

3. Cross-step impactanalyse
- Herhaal op minimaal:
  - bigwhy, role, entity, targetgroup (text-mode)
  - strategy, productsservices, rulesofthegame (list-mode)
- Rapporteer waar dezelfde false-positive wording-choice optreedt.

4. Structureel oplossingsvoorstel (niet implementeren)
- 1 voorkeursrichting + max 2 alternatieven.
- Per richting:
  - architecturale impact,
  - invarianten die hard worden,
  - risico/migratie,
  - teststrategie.

Verplichte outputstructuur
A. Mensentaal probleemuitleg
B. Technisch bewijs (file/line + candidate-keten)
C. Definitieve root-cause
D. Cross-step impactmatrix
E. Structureel fixplan
F. Beslisvoorstel (wat eerst, waarom)

Stopconditie
- Stop na analyse + plan.
- Vraag expliciet akkoord voor implementatie.
- Zonder akkoord: geen codewijzigingen.
```

### Oplossing / aanpassing (na akkoord)
Nog niet ingevuld. Wacht op expliciet akkoord voor implementatie.

## Fix 5 - Role “kies er een voor mij” kan introzin opslaan als finale rol

### Input (zoals gemeld)
- User koos in stap `Rol` eerst voor `geef 3 voorbeelden`.
- Daarna koos user `kies er een voor mij`.
- Daarna vroeg user een samenvatting/recap.
- Vervolgens ging user door naar de volgende stap.
- In de opgeslagen output staat bij `ROL`:
  - `Hier zijn drie korte voorbeelden van een Rol voor Mindd:.`
  - in plaats van de gekozen rolzin.

Gewenst:
1. Bij `kies er een voor mij` moet één echte role-optie worden opgeslagen.
2. Een intro/headline-zin van een voorbeeldenblok mag nooit als role-value worden gecommit.
3. Recap-vragen mogen dit niet overschrijven of “vervuilen”.

### Eerste analyse (grote lijnen, nog geen definitieve root-cause)

#### Hypothese A - Synthetic role-pick selecteert uit vrije tekst en kan de introregel pakken
- Route `synthetic_role_pick` kiest een suggestie via message-parsing (`pickRoleSuggestionFromPreviousState`).
- Als de vorige message een voorbeelden-intro bevat, kan die als kandidaat worden gezien.

#### Hypothese B - Filter voor “voorbeelden-intro” is vooral Engels en mist NL-varianten
- In `extractRoleSuggestionSentences` staan blokkades als `here are ... role examples`, maar geen NL patroon zoals `Hier zijn drie korte voorbeelden ...`.
- Daardoor blijft de Nederlandse introregel kandidaat.

#### Hypothese C - Ranking bevoordeelt regels met bedrijfsnaam
- Kandidaten met bedrijfsnaam krijgen extra score (+10).
- De introregel bevat vaak de bedrijfsnaam en kan daardoor boven echte voorbeeldzinnen eindigen.

#### Hypothese D - Eenmaal gestaged wordt foutieve waarde later hard gecommit
- Role-waarde wordt direct in `provisional_by_step.role` gestaged vanuit `role/refined_formulation`.
- Bij “doorgaan naar volgende stap” commit-pad kiest eerst `provisionalValue`.
- Daardoor wordt de foutieve introzin naar `role_final` geschreven, ook na een recap-turn.

### Bewijspunten in code (startpunten voor diep onderzoek)

- Synthetic role-pick flow:
  - `mcp-server/src/handlers/run_step_routes.ts`
    - `synthetic_role_pick` gebruikt `pickRoleSuggestionFromPreviousState(...)`: regels 231-242.
    - gekozen waarde wordt direct gezet in `refined_formulation` en `role`: regels 253-255.

- Parsing/ranking van role-kandidaat uit message:
  - `mcp-server/src/handlers/run_step_wording_heuristics.ts`
    - `extractRoleSuggestionSentences(...)`: regels 323-381.
    - blocked-list bevat vooral Engelse patronen: regels 332-339.
    - ranking geeft +10 bij bedrijfsnaam-match: regel 373.
  - Zelfde helper wordt gebruikt door picker:
    - `pickRoleSuggestionFromPreviousState(...)`: regels 599-623.

- Staging van role provisional:
  - `mcp-server/src/handlers/run_step_state_update.ts`
    - role staging via `stageFieldValue(... role, refined_formulation)`: regels 185-187.

- Commit naar final bij doorgaan:
  - `mcp-server/src/handlers/run_step_runtime_action_routing_policy.ts`
    - `resolveRequiredFinalValue(...)` pakt eerst `provisionalValue`: regels 77-82.
  - `mcp-server/src/handlers/run_step_runtime_action_routing.ts`
    - commit naar final-field bij transition: regels 386-390.

### Mogelijke structurele fixes (geen quick fixes)

1. Maak role choose-for-me data-gedreven i.p.v. message-parsing
- Laat de role-specialist bij “3 voorbeelden” expliciet een gestructureerde lijst returnen (bijv. `role_examples[]`).
- `synthetic_role_pick` kiest alleen uit die lijst, nooit uit vrijetekst `message`.

2. Voeg locale-onafhankelijke intro/cta-exclusie toe
- Blokkeer kandidaatregels die alleen “examples/voorbeelden” framing bevatten.
- Maak dit semantisch i.p.v. taal-hardcoded regex.

3. Voeg pre-commit validatie op role-shape toe
- Voordat `role`/`role_final` wordt gestaged/gecommit:
  - reject regels die voorbeelden-intro patronen matchen,
  - en gebruik laatste geldige role-candidate als fallback.

4. Bescherm commit-pad tegen recap-afgeleide ruis
- Als laatste specialist-turn recap/meta is, commit alleen als er valide staged role bestaat.
- Anders final ongewijzigd laten en user terugsturen naar role-keuze.

5. Regressietests op end-to-end sequence
- Test exact scenario:
  - 3 voorbeelden -> kies voor mij -> recap -> continue.
- Assert:
  - `role_final` bevat echte role-zin, nooit intro/headline.
- Herhaal voor minstens `nl` en `en`.

### Agent instructie (copy-paste, diep onderzoek, geen code wijzigen)
```text
Context
Je onderzoekt een regressie in Role:
- user kiest 3 voorbeelden,
- kiest daarna "kies er een voor mij",
- vraagt recap,
- gaat door naar volgende stap,
- en krijgt als opgeslagen Role een voorbeelden-introzin i.p.v. echte Role.

Observed bug
- Opgeslagen waarde wordt:
  "Hier zijn drie korte voorbeelden van een Rol voor <company>:."
- Verwacht: één echte gekozen Role-zin.

Doel van deze opdracht
1) Lever definitieve root-cause met causale keten.
2) Toon exact waar introzin als candidate kan worden gekozen.
3) Toon exact hoe deze waarde staged en later committed wordt.
4) Lever structureel fixplan.
5) Doe GEEN codewijzigingen in deze opdracht.

Harde regels
- Quick fixes verboden.
- Geen NL-specifieke patch als enige oplossing.
- Geen suppressie van commit zonder shape-validatie.
- Zonder expliciet akkoord: geen implementatie.

Onderzoeksaanpak
1. Reproduceer exact flowscenario
- role examples -> choose for me -> recap -> continue.
- Log per turn:
  - chosen candidate,
  - source (message/refined/field),
  - staged provisional role,
  - committed role_final.

2. Candidate-herkomst analyseren
- Verifieer parserfilter op intro/headline regels in meerdere talen.
- Verifieer ranking (bedrijfsnaam bias) die introregels kan prioriteren.

3. Commit-keten analyseren
- Bevestig hoe provisional wordt meegenomen in final commit.
- Bevestig gedrag wanneer laatste turn recap/meta is.

4. Structureel oplossingsvoorstel (niet implementeren)
- 1 voorkeursrichting + max 2 alternatieven.
- Per richting:
  - architecturale impact,
  - invarianten,
  - risico/migratie,
  - teststrategie.

Verplichte outputstructuur
A. Mensentaal probleemuitleg
B. Technisch bewijs (file/line + flow)
C. Definitieve root-cause
D. Structureel fixplan
E. Beslisvoorstel (wat eerst, waarom)

Stopconditie
- Stop na analyse + plan.
- Vraag expliciet akkoord voor implementatie.
- Zonder akkoord: geen codewijzigingen.
```

### Oplossing / aanpassing (na akkoord)
Nog niet ingevuld. Wacht op expliciet akkoord voor implementatie.


## Fix 6 - Lege "Validation" shell blijft bestaan door guard-lattice (niet alleen door code in 1 pad)

### Input (zoals gemeld)
- User ziet nog steeds een lege `Validation`-kaart (geen bruikbare tekst/actie), ondanks eerdere fixes op startup en ACTION_START.
- Verwachting: eerste zichtbare state moet direct bruikbaar zijn; nooit een lege interactieve shell.

### Hoog-over analyse
De regressie zit niet in 1 losse functie, maar in een combinatie van guards/blocks die elkaar niet afdwingen:
1. Startup fail-closed kijkt alleen naar “payload ontbreekt”, niet naar “payload is semantisch leeg”.
2. ACTION_START fail-closed kijkt alleen naar het klik/ack-pad, niet naar alle andere render-paden.
3. Canonical view-state laat `interactive` toe met `has_renderable_content=false`.
4. UI detecteert “interactive content absent”, maar blokkeert niet; hij rendert een lege kaart.

Gevolg: je kunt technisch “contract-correct” lijken, maar UX-matig alsnog in een lege shell landen.

### Pogingen die al gedaan zijn (en waarom dit niet afdoende was)

1. Commit `28de187` - `fix(ui): enforce canonical startup paint and fail-closed ACTION_START liveness`
- Wat is geprobeerd:
  - Startup wait-shell verwijderd; startup naar fail-closed timeout.
  - ACTION_START pad strenger gemaakt op ack/state_advanced.
- Waarom dit niet afdoende was:
  - Startup guard triggert alleen als init payload ontbreekt, niet als payload wel komt maar leeg/interactie-onbruikbaar is.
  - ACTION_START guard beschermt alleen het klikpad; niet elk ingest-/renderpad.
  - Canonical state-machine bleef `interactive` toestaan zonder renderbare content.

2. Commit `317a944` - `Fix deterministic ACTION_START flow and step0 startup rendering`
- Wat is geprobeerd:
  - Extra renderable-progress check voor `step_0:no_output:no_menu` na ACTION_START.
  - Seed/fallback voor step0-copy in `start_prestart` route.
- Waarom dit niet afdoende was:
  - Deze fix werkt alleen als `start_prestart` route echt geraakt wordt.
  - Als route wordt overgeslagen door state-gates (`started`/`intro_shown_session`), wordt het fallback-pad nooit gebruikt.
  - UI laat nog steeds lege interactive view door als warning-only pad.

### Technisch bewijs (guards/blocks die samen het probleem laten bestaan)

- `mcp-server/src/handlers/run_step_canonical_widget_state.ts:60-68`
  - Hard bewijs: canonical builder retourneert `mode: "interactive"` terwijl `has_renderable_content: false` en `invariant_ok: true`.
  - Dit legitimeert een lege interactive state.

- `mcp-server/ui/step-card.bundled.html:4265-4273`
  - Hard bewijs: bij ontbrekende interactieve content alleen `console.warn("ui_contract_interactive_content_absent")`.
  - Geen blokkade, geen recovery-state, geen fail-closed render.

- `mcp-server/ui/step-card.bundled.html:3290-3334`
  - Hard bewijs: strenge liveness-check zit uitsluitend in `ACTION_START` dispatch-afhandeling.
  - Dus buiten dat pad kan lege interactive content nog steeds doorlopen.

- `mcp-server/src/handlers/run_step_preflight.ts:254-255`
  - Hard bewijs: `rawState.started === true` wordt direct doorgezet.
  - Daardoor kunnen prestart-routes en start-gates worden overgeslagen als stale state binnenkomt.

- `mcp-server/src/handlers/run_step_routes.ts:650-653` en `679-682`
  - Hard bewijs: `start_prestart` is gebonden aan `intro_shown_session !== "true"`.
  - Bij stale `intro_shown_session` wordt het herstel-/seedpad niet geraakt.

### Definitieve root-cause
Root-cause is een guard-lattice mismatch:
- Entry-guards (startup timeout, ACTION_START liveness) zijn streng,
- maar de canonical view-invariant is te permissief (`interactive` zonder renderbare content),
- en de UI behandelt “geen interactieve content” als warning in plaats van contract-fout.

Daardoor blijft een lege `Validation`-shell mogelijk, ook na meerdere gerichte fixes.

### Structureel fixplan (voorkeur)

1. Maak server-canonical invariant hard
- `interactive` alleen toegestaan bij `has_renderable_content=true`.
- Als false: forceer `blocked` of `recovery` met expliciete reason_code.

2. Maak route-gates consistent met canonical invariant
- `start_prestart` mag niet alleen op `intro_shown_session` vertrouwen als die state-stale kan zijn.
- Voeg consistency check toe tussen `started`, `intro_shown_session`, `current_step`, en renderbaarheid.

3. Maak UI fail-closed op lege interactive payload
- `ui_contract_interactive_content_absent` mag geen warning-only blijven.
- Render expliciete blocked/recovery state i.p.v. lege kaart.

4. Contracttests op guard-combinaties
- Niet alleen ACTION_START unit tests, maar e2e met:
  - stale `started=true` input,
  - stale `intro_shown_session=true`,
  - payload met `interactive` + geen body/prompt/actions.
- Assert: nooit lege interactieve shell zichtbaar.

### Agent instructie (copy-paste, diep onderzoek, geen code wijzigen)
```text
Context
Je onderzoekt een regressie waarbij de widget soms een lege "Validation" interactive shell toont.
Deze regressie is eerder 2x "gefixt" maar blijft bestaan door guard-lattice gedrag.

Belangrijk
- Dit is geen losse bug in 1 functie.
- Zoek expliciet naar guards/blocks die elkaar tegenspreken.
- Zonder bewijs van guard-keten: geen implementatievoorstel.

Reeds geprobeerd (moet je meenemen in je analyse)
1) 28de187: startup fail-closed + ACTION_START liveness fail-closed.
2) 317a944: strengere ACTION_START renderable-progress check + step0 seed/fallback copy.

Waarom nog niet opgelost (hypothese die je moet bewijzen/ontkrachten)
- Canonical view staat interactive toe zonder renderbare content.
- UI behandelt interactive zonder content als warning-only.
- start_prestart herstelpad kan worden overgeslagen door stale state (`started`/`intro_shown_session`).

Onderzoeksopdracht
1. Reproduceer met eventketen
- Leg vast per turn:
  - inbound state.started
  - inbound intro_shown_session
  - gekozen route (start_prestart wel/niet)
  - canonical decision: ui_view_mode, has_renderable_content, reason_code
  - client log: ui_contract_interactive_content_absent

2. Bewijs guard-lattice causaal
- Toon exact pad waarin:
  - ACTION_START liveness niet triggert,
  - canonical interactive toch emitted wordt,
  - UI daardoor lege shell rendert.

3. Verplicht te inspecteren codepunten
- mcp-server/src/handlers/run_step_canonical_widget_state.ts (interactive zonder content)
- mcp-server/ui/step-card.bundled.html (warning-only bij interactive_content_absent)
- mcp-server/src/handlers/run_step_preflight.ts (raw started passthrough)
- mcp-server/src/handlers/run_step_routes.ts (start_prestart gating op intro_shown_session)

4. Verplicht bewijs uit logs/telemetry
- run_step_canonical_view_emitted
- ui_contract_interactive_content_absent
- ui_start_dispatch_not_advanced_fail_closed
- inclusief dezelfde request/session correlatie

Harde regels
- Geen quick fix in 1 pad.
- Geen extra retry-laag als eindoplossing.
- Eerst invariant-fout oplossen (server canonical + UI fail-closed gedrag).
- Zonder expliciet akkoord: geen codewijziging.

Verplichte outputstructuur
A. Korte mensentaal uitleg
B. Guard-matrix (welke guard, waar, wanneer actief)
C. Causale keten met request/session bewijs
D. Waarom 28de187 en 317a944 dit niet afvangen
E. Structureel fixvoorstel (1 voorkeur + max 2 alternatieven)
F. Beslisvoorstel met implementatievolgorde

Stopconditie
- Stop na analyse + plan.
- Vraag expliciet akkoord voor implementatie.
```

### Oplossing / aanpassing (na akkoord)
Nog niet ingevuld. Wacht op expliciet akkoord voor implementatie.
