



## Fix 5 - Spelregels gebruikt verkeerde meervoudstaal en heeft een onjuiste proceed/gating-flow

### Scopegrens
- Deze fix gaat over list-semantiek, pluralisatie en proceed/gating in `Spelregels`.
- Deze fix mag geen generieke bootstrap- of wording-choice-problemen verhullen met stap-specifieke renderworkarounds.
- Als proceed-intentie semantisch moet worden herkend, moet dat aansluiten op dezelfde meertalige intentlaag en niet op nieuwe taalwoordenlijsten.

### Standalone copy-paste randvoorwaarden
- Deze fix moet standalone uitvoerbaar zijn zonder aannames uit Fix 1, 2, 3 of 4.
- Gebruik deze fix niet om step-0 bootstrap, wording-choice of welkomstschermgedrag te repareren.
- Geen taalgebonden woordenlijsten of regexbundels toevoegen voor proceed-intentie als daar al een semantische intentlaag voor hoort te bestaan.
- Los pluralisatie op in de juiste render- of taalcontractlaag, en proceed/gating in de juiste state- of routinglaag.
- Als een implementatie meerdere fixes lijkt te raken, moet expliciet bewezen worden welk deel echt binnen `Spelregels` valt.

### Input (zoals gemeld)
- In `Spelregels` staat bij meerdere regels nu:
  - `Je huidige spelregels voor Bart is`
- Dat is niet correct Nederlands.
- Bij meer dan 1 regel had dit moeten zijn:
  - `Je huidige spelregels voor Bart zijn`
- Dit zit waarschijnlijk niet alleen in het Nederlands fout, maar potentieel ook in andere talen,
  omdat het eruitziet alsof er een generieke singular-template wordt gebruikt voor een meervoudige lijststap.
- Daarnaast verschijnt de confirm / ga-door-knop niet altijd als er al genoeg spelregels zijn.
- En als de user na 5 spelregels in de input zegt:
  - `ga door naar volgende stap`
  dan komt de user in een scherm terecht dat begint met:
  - `Op basis van je input stel ik de volgende spelregels voor`
  - gevolgd door:
    - `Hier zijn 5 duidelijke en concrete Spelregels voor Bart, gebaseerd op de context die we tot nu toe hebben opgebouwd`
    - daarna de lijst
    - en vervolgens:
      `Spelregels moeten beschrijven hoe wij intern samenwerken, niet externe beloftes of marktclaims. Kies wat het beste past: jouw input of mijn gebundelde suggestie.`
- Dat mag in deze vorm nooit gebeuren.
- Gewenste uitkomst:
  - als aan de voorwaarden is voldaan, moet de user direct kunnen doorgaan
  - of de user moet expliciet en duidelijk feedback krijgen wat er nog ontbreekt of wat er inhoudelijk mis is
  - maar niet in een onverwachte suggestie/picker-flow terechtkomen na `ga door naar volgende stap`.

### Verwachting
- `Spelregels` moet grammaticaal correct renderen bij enkelvoud en meervoud.
- Een lijst met meerdere spelregels mag niet onder een singular heading vallen.
- Als de user voldoende geldige spelregels heeft, hoort confirm/doorgaan beschikbaar te zijn.
- Als doorgaan nog niet kan, moet de user een duidelijke, semantische uitleg krijgen waarom niet.
- Een expliciet proceed-commando zoals `ga door naar volgende stap` mag niet landen in een generieke autosuggest/picker-flow die de user niet heeft gevraagd.

### Waargenomen gedrag
- De heading gebruikt nu `is` bij een meervoudige lijst van spelregels.
- De proceed/confirm-knop ontbreekt soms ondanks een zichtbare set spelregels.
- Als de user dan expliciet zegt `ga door naar volgende stap`, wordt dat niet afgehandeld als:
  - bevestigen en doorgaan
  - of heldere blokkade/uitleg
- In plaats daarvan komt de user in een scherm terecht waarin het systeem opnieuw een set spelregels voorstelt en wording-choice framing toont.
- Hoog-over wijst dit op twee verwante server-side problemen:
  - een generieke heading-template die geen rekening houdt met meervoud/list semantics
  - een proceed/gating-contract waarin `Spelregels` bij niet-confirmable status naar guidance/suggestion routing valt in plaats van naar een duidelijke validatie-uitkomst.

Gewenst structureel gedrag:
1. Meerdere spelregels moeten grammaticaal als meervoud worden gepresenteerd.
2. Die meervoudslogica moet expliciet correct zijn per taal of per taalcontract, niet toevallig goed in alleen Engels of Nederlands.
3. Als `Spelregels` confirmable is, moet confirm/doorgaan zichtbaar zijn.
4. Als `Spelregels` nog niet confirmable is, moet de user precies begrijpen waarom.
5. Een expliciet proceed-commando mag nooit ongevraagd eindigen in een nieuwe suggestie/picker-flow als de user eigenlijk wil afronden.
6. Eerdere fixes rond wording-choice, confirm-gating, state continuity en canonical rendering mogen niet ongedaan worden gemaakt.

### Eerste analyse (grote lijnen, nog geen definitieve root-cause)

#### Hypothese A - De huidige heading voor `Spelregels` gebruikt ten onrechte een generieke singular current-value template
- De heading lijkt opgebouwd te worden via één algemeen sjabloon in de trant van:
  - `Je huidige {stap} voor {bedrijf} is`
- Dat werkt voor enkelvoudige stappen,
  maar niet voor lijststappen zoals `Spelregels`.
- Daardoor krijg je bij 3 of 5 regels alsnog `is` in plaats van `zijn`.

#### Hypothese B - De pluraliteitslogica is wel opgelost voor andere lijststappen, maar niet voor `Spelregels`
- Voor `Products & Services` lijkt al expliciete single/plural heading-logica te bestaan.
- `Spelregels` lijkt daar niet op aangesloten.
- Daardoor is deze stap taalkundig achtergebleven op oudere generieke rendering.

#### Hypothese C - Confirm-gating voor `Spelregels` is strenger dan wat de user visueel als “genoeg” ervaart
- `Spelregels` kan zichtbaar 5 regels tonen,
  maar server-side nog steeds niet confirmable zijn.
- Bijvoorbeeld door:
  - pending wording-choice
  - externe/marktgerichte regels
  - of andere policy-checks
- Als dat gebeurt zonder duidelijke uitleg, voelt het voor de user alsof de knop onterecht ontbreekt.

#### Hypothese D - Proceed-tekst wordt bij onbeschikbare confirm-route generiek naar guidance gerouteerd
- In andere stappen bestaat al een patroon waarbij:
  - `ga door naar de volgende stap`
  - naar confirm gaat als confirm beschikbaar is
  - en anders naar een guidance-action
- In `Spelregels` kan dat ertoe leiden dat proceed niet als blokkade/uitleg wordt behandeld,
  maar naar een nieuwe suggestie- of repair-flow valt.
- Dan ontstaat precies het ongewenste scherm:
  - de user wil afronden
  - het systeem gaat opnieuw voorstellen en vergelijken.

### Bewijspunten in code

- De generieke current heading gebruikt nu één singular template:
  - in `mcp-server/src/handlers/run_step_runtime_state_helpers.ts`
  - `wordingSelectionMessage(...)` gebruikt voor niet-`productsservices`:
    - `offtopic.current.template`
- Die template is in het Nederlands expliciet singular:
  - in `mcp-server/src/i18n/ui_strings/locales/ui_strings_nl.ts`
  - `offtopic.current.template`: `Je huidige {0} voor {1} is`
- De bestaande test bewijst dat `Spelregels` daar nu ook onder valt:
  - in `mcp-server/src/handlers/run_step_runtime_state_helpers.test.ts`
  - de test verwacht expliciet:
    - `JE HUIDIGE SPELREGELS VOOR Mindd IS:`
- Voor `Products & Services` bestaat al aparte singular/plural heading-logica:
  - in `mcp-server/src/handlers/run_step_runtime_state_helpers.ts`
  - via `classifyProductsServicesItems(...)` en `productsServicesCurrentHeading(...)`
- Dat is sterk bewijs dat `Spelregels` nu nog niet op een vergelijkbaar pluraliteitscontract zit.

- `Spelregels` heeft daarnaast een expliciete runtime confirm-gate:
  - in `mcp-server/src/handlers/run_step_runtime_semantic_helpers.ts`
  - daar wordt voor `rulesofthegame` `evaluateRulesRuntimeGate(...)` aangeroepen
- Die gate vereist:
  - accepted output
  - geen pending wording choice
  - tussen 3 en 5 regels
  - geen externe regels
  bewijs:
  - in `mcp-server/src/steps/rulesofthegame_runtime_policy.ts`
  - `canConfirm` hangt af van:
    - `acceptedOutput`
    - `!wordingChoicePending`
    - `count >= 3 && count <= 5`
    - `!hasExternalRule`
- `hasExternalRule` markeert o.a. klant/market/pricing-achtige termen als extern:
  - in `mcp-server/src/steps/rulesofthegame_runtime_policy.ts`
  - via `EXTERNAL_FOCUS_PATTERN`
- De proceed-router heeft al een generiek fallbackpatroon:
  - in `mcp-server/src/handlers/run_step_runtime_action_routing.test.ts`
  - als confirm beschikbaar is, mapt `Ga door naar de volgende stap` naar confirm
  - als confirm niet beschikbaar is, mapt dezelfde tekst naar een guidance action
- Dat verklaart hoog-over waarom `ga door naar volgende stap` nu niet noodzakelijk tot doorgaan of een heldere blokkade leidt,
  maar in een alternatieve suggestie/guidance-flow kan eindigen.

### Onderzoeksrichting

Onderzoek dit eerst hoog over en bewijs daarna pas de exacte root-cause.

1. Trace de headingopbouw van `Spelregels`
- Onderzoek minimaal:
  - `mcp-server/src/handlers/run_step_runtime_state_helpers.ts`
  - relevante i18n-strings
  - tests voor current heading rendering
- Leg exact vast:
  - waarom `Spelregels` nu de singular template gebruikt
  - of andere lijststappen hetzelfde risico hebben
  - en hoe dit per taalcontract hoort te werken

2. Trace confirm-gating van `Spelregels`
- Onderzoek minimaal:
  - `mcp-server/src/handlers/run_step_runtime_semantic_helpers.ts`
  - `mcp-server/src/steps/rulesofthegame_runtime_policy.ts`
- Leg exact vast:
  - waarom de knop ontbreekt in het getoonde scenario
  - of dat komt door count, wording-choice pending, accepted evidence, of external-rule policy
  - en waarom dat voor de user nu niet duidelijk genoeg wordt gecommuniceerd

3. Trace proceed-intent voor `ga door naar volgende stap`
- Onderzoek minimaal:
  - `mcp-server/src/handlers/run_step_runtime_action_routing.ts`
  - bestaande routing tests
  - eventuele `rulesofthegame`-specifieke menus/actions
- Bewijs exact:
  - welke route `ga door naar volgende stap` nu neemt in dit scenario
  - waarom dat in suggestion/picker of guidance eindigt
  - en waarom dat productmatig fout is

4. Vergelijk met andere steps
- Controleer expliciet:
  - andere lijststappen met plural headings
  - andere confirm-gated steps met proceed-text fallback
- Bepaal expliciet of:
  - het headingprobleem lijst-step-generiek is
  - en/of het proceed/gating-probleem `Spelregels`-specifiek is

### Definitieve invariant

- Lijststappen mogen niet met een singular current heading worden gepresenteerd wanneer er meerdere items zichtbaar zijn.
- `Spelregels` moet grammaticaal correct en per taal semantisch juist renderen.
- Als `Spelregels` voldoet aan de server-side confirmvoorwaarden, moet doorgaan zichtbaar en bruikbaar zijn.
- Als `Spelregels` niet voldoet, moet de user expliciete feedback krijgen waarom niet.
- Een expliciet proceed-commando mag niet stilzwijgend ontaarden in een nieuwe suggestie- of picker-flow wanneer de user eigenlijk wil afronden.

### Wat expliciet niet mag gebeuren tijdens de fix

- Geen pure tekstpatch alleen voor Nederlands als de onderliggende singular/plural-semantiek generiek fout zit.
- Geen blinde force-show van de confirmknop zonder de bestaande runtime gate te respecteren.
- Geen oplossing die `ga door naar volgende stap` altijd direct laat navigeren, ook wanneer de inhoud server-side ongeldig is.
- Geen rollback van eerdere fixes rond confirm-gating, wording-choice, canonical rendering of state continuity.

### Voorkeursrichting

Voorkeursrichting:
- splits dit in twee gerichte maar samenhangende fixes:
  - correct list-aware heading contract voor `Spelregels` en vergelijkbare lijststappen
  - heldere proceed/gating-semantiek voor `Spelregels`
- Als confirm mogelijk is:
  - laat de user doorgaan
- Als confirm niet mogelijk is:
  - geef een expliciete blokkadereden of gerichte vervolgstap
  - maar stuur de user niet ongevraagd een suggestion/pickerflow in

Waarom dit de beste richting is:
- het lost zowel de zichtbare taalfout als de UX-breuk bij doorgaan op
- houdt de bestaande runtime gate intact waar nodig
- en maakt de server semantisch consistenter voor lijststappen

Alternatief 1:
- alleen `is` vervangen door `zijn` in Nederlands
- nadeel:
  - waarschijnlijk te smal
  - laat andere talen en de onderliggende list-semantiek ongemoeid

Alternatief 2:
- altijd de proceed-knop tonen zodra er 3-5 regels zichtbaar zijn
- nadeel:
  - omzeilt accepted/gating-contract
  - kan externe of pending regels onterecht laten bevestigen

### Agent instructie (copy-paste, diep onderzoek + implementatie)
```text
Context
Je implementeert een structurele fix voor `Spelregels`, waar nu twee gekoppelde problemen zichtbaar zijn:
1. een grammaticaal fout current-heading contract
2. een onjuiste proceed/gating-flow

Observed issues
- Bij meerdere spelregels staat er nu:
  `Je huidige spelregels voor Bart is`
  terwijl dat had moeten zijn:
  `Je huidige spelregels voor Bart zijn`
- Dit wijst waarschijnlijk op een generieke singular heading die onterecht wordt hergebruikt voor een meervoudige lijststap.
- Daarnaast ontbreekt de confirm/doorgaan-knop soms terwijl er al 5 zichtbare spelregels zijn.
- En als de user dan zegt:
  `ga door naar volgende stap`
  komt de user in een scherm terecht dat begint met:
  `Op basis van je input stel ik de volgende spelregels voor`
  gevolgd door een nieuwe lijst en wording-choice framing.
- Dat mag niet gebeuren.
- Als de regels geldig zijn moet de user kunnen doorgaan.
- Als ze nog niet geldig zijn moet de user expliciet horen wat er nog niet klopt.

Belangrijke randvoorwaarde
- Draai eerdere fixes NIET terug.
- Neem expliciet aan dat bestaande fixes voor:
  - confirm-gating
  - wording-choice rendering
  - canonical state continuity
  - `_meta.widget_result` authority
  behouden moeten blijven.
- Het enige probleem dat nu opgelost moet worden is:
  - `Spelregels` heeft onjuiste singular/plural heading-semantiek
  - en proceed/gating gedraagt zich semantisch verkeerd.

Doel van deze opdracht
1) Vind exact waarom `Spelregels` nu een singular current heading gebruikt.
2) Bepaal expliciet of dit alleen Nederlands raakt of generieker ook andere talen/lijststappen.
3) Vind exact waarom confirm/doorgaan ontbreekt in het getoonde scenario.
4) Vind exact waarom `ga door naar volgende stap` dan in een suggestion/picker/guidance-flow eindigt.
5) Zorg dat de user bij geldige inhoud kan doorgaan, en anders duidelijke feedback krijgt.
6) Behoud alle eerdere fixes.

Harde regels
- Geen NL-only cosmetische stringpatch als de semantiek generiek fout is.
- Geen blind forceren van confirm/doorgaan zonder runtime gate.
- Geen oplossing waarbij `ga door naar volgende stap` altijd navigeert ongeacht inhoudelijke geldigheid.
- Geen rollback van confirm/wording-choice/canonical fixes.

Onderzoeksaanpak vóór implementatie
1. Trace current heading rendering
- Onderzoek:
  - `mcp-server/src/handlers/run_step_runtime_state_helpers.ts`
  - de gebruikte i18n keys
  - tests voor `wordingSelectionMessage(...)`
- Bewijs exact:
  - waarom `Spelregels` nu onder `offtopic.current.template` valt
  - waarom dat singular is
  - welke stappen al wel expliciete plural logic hebben

2. Audit plural semantics per taal
- Controleer expliciet of de headingfix:
  - alleen voor Nederlands nodig is
  - of dat ook andere talen nu een singular-only template gebruiken voor lijststappen
- Lever expliciet bewijs en kies dan de juiste structurele oplossing

3. Trace confirm-gating in `Spelregels`
- Onderzoek:
  - `mcp-server/src/handlers/run_step_runtime_semantic_helpers.ts`
  - `mcp-server/src/steps/rulesofthegame_runtime_policy.ts`
- Bewijs exact:
  - of confirm ontbreekt door count
  - of door pending wording choice
  - of door external-rule policy
  - of door ontbrekend accepted evidence

4. Trace proceed text routing
- Onderzoek:
  - `mcp-server/src/handlers/run_step_runtime_action_routing.ts`
  - bestaande tests voor proceed text
  - `rulesofthegame` menu/actions
- Bewijs exact:
  - welke route `ga door naar volgende stap` nu neemt in dit scenario
  - waarom die route niet tot doorgaan of duidelijke validatiefeedback leidt
  - via welk pad de user in een suggestion/pickerflow belandt

5. Vergelijk met andere stappen
- Controleer expliciet:
  - andere list/bullet steps
  - andere confirm-gated steps met proceed text
- Bepaal of:
  - de headingfix generiek moet zijn voor list steps
  - de proceed/gatingfix specifiek is voor `Spelregels`
  - of beide deels generiek zijn

Definitieve invariants
- Een current heading voor een lijststap moet grammaticaal en semantisch passen bij het aantal items.
- `Spelregels` met meerdere zichtbare regels mag niet onder een singular heading renderen.
- Als `Spelregels` confirmable is, moet doorgaan beschikbaar zijn.
- Als `Spelregels` niet confirmable is, moet de user een duidelijke blokkadereden of gerichte feedback krijgen.
- Een expliciet proceed-commando mag niet ongevraagd eindigen in een suggestion/pickerflow wanneer de user wil afronden.

Implementatierichting
1. Introduceer list-aware current heading semantics voor `Spelregels` en andere relevante lijststappen waar nodig.
2. Houd die oplossing taalsensitief en contractmatig correct.
3. Normaliseer proceed/gating in `Spelregels`:
   - doorgaan als confirmable
   - anders expliciete validatiefeedback
   - geen onverwachte suggestion/pickerflow
4. Houd bestaande accepted-output en wording-choice contracts intact.

Verplichte tests
1. Heading regressie:
- met 3 of meer spelregels
- Verwacht:
  - correcte meervoudige heading in Nederlands
  - en expliciete onderbouwing/test of andere talen ook correct blijven

2. Confirm regressie:
- met 3-5 geldige interne spelregels
- Verwacht:
  - confirm/doorgaan beschikbaar

3. Invalid-but-visible regels:
- met zichtbare regels die nog niet confirmable zijn
- Verwacht:
  - geen confirm
  - wel expliciete feedback waarom niet

4. Proceed regressie:
- user zegt:
  `ga door naar volgende stap`
- in confirmable scenario:
  - direct door
- in non-confirmable scenario:
  - duidelijke blokkade/uitleg
  - expliciet niet een onverwachte suggestion/pickerflow

5. Non-regressie
- bestaande wording-choice paden
- accepted-output gating
- state continuity
- canonical rendering

Belangrijke reviewvragen tijdens implementatie
- Waarom gebruikt `Spelregels` nu een singular heading?
- Welke lijststappen hebben vergelijkbare risico’s?
- Waarom ontbreekt confirm in het gemelde scenario precies?
- Waarom wordt proceed nu naar guidance/suggestion gerouteerd?
- Hoe maak je die blokkade duidelijk zonder eerdere gatingfixes te breken?

Stopconditie
- Klaar pas als bewezen is dat:
  - `Spelregels` bij meerdere regels grammaticaal correct rendert,
  - confirm/doorgaan zichtbaar is wanneer de regels confirmable zijn,
  - de user duidelijke feedback krijgt wanneer ze niet confirmable zijn,
  - `ga door naar volgende stap` niet meer onterecht in een suggestion/pickerflow eindigt,
  - en eerdere fixes intact blijven.
```





## Fix 7 - UI schakelt tijdens een Engelstalige flow onterecht terug naar Nederlands

### Scopegrens
- Deze fix gaat over taalcontinuity en locale-authority in de widget- en serverketen.
- Deze fix gaat niet over de inhoudelijke kwaliteit van vertalingen, noch over step-semantiek zoals Dream, Big Why of wording-choice op zichzelf.
- Deze fix mag niet worden opgelost met hardcoded detectie op Engelse of Nederlandse voorbeeldteksten.

### Standalone copy-paste randvoorwaarden
- Deze fix moet standalone uitvoerbaar zijn zonder aannames uit Fix 1, 2, 3, 4, 5 of 6.
- Gebruik deze fix niet om bootstrap, wording-choice, proceed/gating of widget-liveness bugs te maskeren.
- Geen hardcoded woordenlijsten, regexen, string-matchregels of voorbeeldzin-detectie om “Engels” of “Nederlands” vast te stellen in vrije user- of specialisttekst.
- Geen fix die letterlijk afvangt dat strings als `Define your Big Why...` Engels zijn of dat zinnen als `Als mens zijn we...` Nederlands zijn.
- Geen UI-only quick fix die alleen de zichtbare taal forceert terwijl server-state en widget-state uiteen blijven lopen.
- De oplossing moet structureel zijn in locale-source-resolutie, i18n-state, ingest, continuity of render-authority.

### Input (zoals gemeld)
- De user werkt in een Engelstalige flow.
- Op enig moment schakelt de widget gedeeltelijk of volledig terug naar Nederlands.
- In het gemelde scherm zijn bijvoorbeeld:
  - heading / input / keuzeopties in het Engels
  - maar de bodytekst erboven ineens in het Nederlands
- Dat betekent semantisch:
  - de UI hanteert niet één consistente taalbron voor dezelfde turn/render
  - of een oude locale/context lekt terug in de zichtbare kaart

### Verwachting
- Als de user in een Engelstalige flow zit, moet de volledige kaart voor die turn consequent Engels blijven,
  tenzij er expliciet en aantoonbaar een taalwissel is gekozen of bevestigd.
- Voor één en dezelfde render mag de widget niet gemengd uit:
  - Engelse UI strings
  - en Nederlandstalige specialist/body content
  opbouwen, tenzij dat productmatig expliciet bedoeld is.
- Server en widget moeten dezelfde waarheid hanteren over:
  - actieve locale
  - locale source
  - translation readiness
  - en welke taal de actuele card-body moet gebruiken

### Waargenomen gedrag
- De kaart toont een taalbreuk binnen dezelfde stap:
  - body in het Nederlands
  - prompt/keuzes in het Engels
- Dat wijst hoog-over op een mismatch tussen:
  - `resolved_language`
  - `language_source`
  - `ui_strings_lang`
  - latest widget state
  - specialist message language
  - of een fallback/recovery pad dat een oude taal opnieuw inbrengt

Gewenst structureel gedrag:
1. Eén render gebruikt één consistente locale-authority.
2. Een expliciet Engelstalige sessie mag niet spontaan terugvallen naar Nederlands zonder bewezen taalwissel.
3. UI strings, prompt en specialist-body moeten voor dezelfde turn op dezelfde taalbeslissing rusten.
4. Resumed/recovered/lean payload paden moeten dezelfde taalcontinuity houden.
5. Eerdere fixes rond `_meta.widget_result`, bootstrap, continuity en widget action-lifecycle mogen niet worden teruggedraaid.

### Eerste analyse (grote lijnen, nog geen definitieve root-cause)

#### Hypothese A - UI strings en specialist-body gebruiken verschillende taalbronnen
- De knoppen/prompt kunnen uit `ui_strings_lang` of widget locale komen,
  terwijl de bodytekst uit de specialist-response of een oudere statewaarde komt.
- Dan krijg je precies een hybride kaart met Engels en Nederlands door elkaar.

#### Hypothese B - Een stale/latest payload in andere taal lekt de render in
- De widget kan een oude bodytekst of oudere state in het Nederlands behouden,
  terwijl nieuwe UI strings al in het Engels zijn.
- Dat zou een continuity/ingest probleem zijn, niet een vertaalkwaliteitsprobleem.

#### Hypothese C - Locale source resolver valt onterecht terug naar Nederlands
- De server kan voor sommige turns opnieuw `message_detect`, fallback-default of bootstrap-locale kiezen,
  terwijl de sessie al stabiel Engels had moeten blijven.
- Dan ontstaat een inconsistent mengpad tussen server-state en widget-state.

#### Hypothese D - Translation readiness/gating gebruikt een mixed fallbackpad
- Als bepaalde UI strings of content nog niet als volledig vertaald worden gezien,
  kan een fallbackpad oude Nederlandse tekst laten staan.
- Dan is de bug niet “verkeerde vertaling”, maar “verkeerde fallback-authority”.

### Bewijspunten in code

- I18n- en locale-state lopen via:
  - `mcp-server/src/handlers/run_step_i18n_runtime.ts`
  - `mcp-server/src/core/state.ts`
  - `mcp-server/ui/lib/ui_actions.ts`
  - `mcp-server/ui/lib/ui_render.ts`
- De widget leest locale en UI strings uit state,
  terwijl specialist/body content uit de gerenderde result payload komt.
- Er bestaan expliciete `ui_strings_status`, `ui_gate_status`, `ui_strings_lang`, `resolved_language` en `language_source` velden in de runtime/response keten.
- Hoog-over moet dus bewezen worden:
  - of de taal al server-side inconsistent wordt opgebouwd,
  - of de widget een mixed render maakt uit meerdere payloadbronnen,
  - en welk continuity/fallbackpad daar verantwoordelijk voor is.

### Onderzoeksrichting

Onderzoek dit eerst hoog over en bewijs daarna pas de exacte root-cause.

1. Trace de taalbeslissing end-to-end voor een falende render
- Onderzoek minimaal:
  - `mcp-server/src/handlers/run_step_i18n_runtime.ts`
  - `mcp-server/src/core/state.ts`
  - `mcp-server/ui/lib/ui_actions.ts`
  - `mcp-server/ui/lib/ui_render.ts`
- Leg exact vast:
  - welke locale server-side is resolved
  - welke locale in state staat
  - welke `ui_strings_lang` actief is
  - welke taal de specialist-body draagt
  - en waarom één kaart mixed uitvalt

2. Vergelijk een werkende en falende Engelstalige turn
- Bewijs expliciet:
  - `resolved_language`
  - `language_source`
  - `ui_strings_lang`
  - `ui_strings_status`
  - `ui_gate_status`
  - payload source
  - cached/latest widget payload
  - uiteindelijke render
- Het doel is exact te zien waar de taalcontinuity breekt.

3. Controleer fallback- en continuitypaden
- Onderzoek expliciet:
  - latest render retention
  - resumed/recovered payloads
  - stale payload fallback
  - locale-hint merge
  - bootstrap locale persistence
- Bewijs of een oudere Nederlandse payload/body opnieuw zichtbaar wordt in een verder Engelstalige sessie.

4. Vergelijk met andere stappen
- Neem minimaal mee:
  - `dream`
  - `purpose`
  - `bigwhy`
  - `role`
  - `entity`
  - `targetgroup`
- Bepaal expliciet of dit een Big Why-specifieke regressie is,
  of generiek voor de locale/renderketen.

5. Controleer live logging en transport-authority
- Gebruik server- en widgetsignalen om te bewijzen:
  - welke render source gekozen is
  - of `_meta.widget_result` en `structuredContent.result` dezelfde taalbeslissing dragen
  - of de client een oudere payload in andere taal blijft hergebruiken

### Definitieve invariant

- Eén turn/render mag niet tegelijkertijd verschillende taal-authorities mengen.
- Als een sessie in Engels actief is en geen expliciete taalwissel heeft, moet de volledige kaart in die turn Engels blijven.
- Locale continuity moet even streng zijn als state continuity:
  - serverbeslissing
  - widget ingest
  - latest render
  - en rerender
  moeten dezelfde taalwaarheid volgen.

### Wat expliciet niet mag gebeuren tijdens de fix

- Geen hardcoded detectie op Nederlandse of Engelse voorbeeldzinnen.
- Geen oplossing die alleen zichtbare labels forceert naar Engels terwijl de body nog uit een andere taalbron komt.
- Geen step-specifieke special case alleen voor `Big Why` zonder bewijs dat de breuk daar uniek zit.
- Geen rollback van i18n readiness, locale meta of `_meta.widget_result` authority.
- Geen quick fix die mixed-language renders verbergt zonder de onderliggende locale-authority mismatch op te lossen.

### Voorkeursrichting

Voorkeursrichting:
- bewijs eerst welke laag de taalcontinuity breekt,
- maak daarna één expliciete locale-authority voor de volledige render leidend,
- en zorg dat fallback/recovery geen oude tekst in een andere taal meer kan laten lekken.

Waarom dit de beste richting is:
- het voorkomt cosmetische taalfixes,
- het houdt de bestaande i18n- en widget-authority architectuur intact,
- en het lost ook andere mixed-language regressies op buiten het voorbeeldscherm.

Alternatief 1:
- de bodytekst client-side forceren naar de UI-locale
- nadeel:
  - maskeert server/client mismatch,
  - kan foutieve of half-vertaalde content verbergen

Alternatief 2:
- alle non-English locale-hints uitschakelen of altijd Engels forceren
- nadeel:
  - breekt echte meertalige flows,
  - te grof en productmatig onjuist

### Agent instructie (copy-paste, diep onderzoek + implementatie)
```text
Context
Je implementeert een structurele fix voor een regressie waarbij de widget in een Engelstalige flow ineens gedeeltelijk of volledig terugschakelt naar Nederlands.

Observed bug
- De user werkt in het Engels.
- In dezelfde kaart/render verschijnen daarna bijvoorbeeld:
  - bodytekst in het Nederlands
  - prompt/knoppen in het Engels
- Dat is semantisch onjuist:
  - één render gebruikt blijkbaar meerdere taalbronnen door elkaar.

Belangrijke randvoorwaarde
- Draai eerdere fixes NIET terug.
- Neem expliciet aan dat bestaande fixes voor:
  - `_meta.widget_result` authority
  - locale meta / i18n readiness
  - state continuity / latest render retention
  - widget action lifecycle
  behouden moeten blijven.
- Het enige probleem dat nu opgelost moet worden is:
  - mixed-language rendering / onverwachte terugval naar Nederlands in een Engelstalige flow.

Doel van deze opdracht
1) Vind exact waar de taalcontinuity breekt tussen server, state, widget ingest en render.
2) Bewijs waarom één render nu Engels en Nederlands mengt.
3) Zorg dat één render één consistente locale-authority gebruikt.
4) Behoud alle eerdere fixes.

Harde regels
- Geen hardcoded detectie op Engelse of Nederlandse voorbeeldzinnen.
- Geen string-matching op specifieke schermteksten of vertalingen.
- Geen Big Why-only special case zonder bewijs dat de root-cause daar uniek zit.
- Geen cosmetische UI-force-english fix.
- Geen rollback van i18n readiness, locale meta, continuity of widget authority.

Onderzoeksaanpak vóór implementatie
1. Trace locale end-to-end
- Onderzoek:
  - `mcp-server/src/handlers/run_step_i18n_runtime.ts`
  - `mcp-server/src/core/state.ts`
  - `mcp-server/ui/lib/ui_actions.ts`
  - `mcp-server/ui/lib/ui_render.ts`
- Bewijs exact:
  - welke locale is resolved
  - welke locale in state staat
  - welke `ui_strings_lang` actief is
  - welke taal de specialist-body heeft
  - en waar de mixed render ontstaat

2. Vergelijk werkende en falende Engelstalige turns
- Leg exact vast:
  - `resolved_language`
  - `language_source`
  - `ui_strings_lang`
  - `ui_strings_status`
  - `ui_gate_status`
  - payload source
  - latest cached widget payload
  - uiteindelijke render
- Bewijs waar de eerste divergentie in taalcontinuity zit.

3. Controleer ingest/fallback/continuity
- Onderzoek expliciet:
  - `_meta.widget_result`
  - `structuredContent.result`
  - latest render retention
  - stale payload fallback
  - resume/recovery paden
- Bewijs of oude Nederlandse content opnieuw zichtbaar wordt in een verder Engelstalige sessie.

4. Vergelijk met andere stappen
- Test minimaal:
  - `dream`
  - `purpose`
  - `bigwhy`
  - `role`
  - `entity`
  - `targetgroup`
- Bepaal expliciet of de fix generiek in de locale/renderketen moet zitten.

5. Controleer live logging
- Gebruik live logs en widget/transport markers om te bewijzen:
  - welke render source gekozen werd
  - of server en widget dezelfde taalbeslissing delen
  - of een oude payload in andere taal lekt

Definitieve invariants
- Eén render mag niet tegelijk meerdere taal-authorities mengen.
- Zonder expliciete taalwissel moet een Engelstalige sessie Engelstalig blijven renderen.
- UI strings, prompt en specialist-body moeten per turn op dezelfde locale-beslissing rusten.
- De fix moet structureel zijn in locale-authority en continuity, niet in hardcoded tekstafvang.

Implementatierichting
1. Vind de kleinste structurele mismatch in locale resolution -> state -> ingest -> render.
2. Maak één consistente locale-authority leidend voor de volledige render.
3. Zorg dat fallback/recovery geen oude content in andere taal meer kan laten lekken.
4. Houd bestaande i18n- en widget-authority fixes intact.

Verplichte tests
1. Engelstalige flow regressie:
- user werkt in Engels
- verwachte render blijft volledig Engels
- geen onverwachte Nederlandse bodytekst

2. Mixed-payload regressie:
- nieuwe UI strings + oudere payload in andere taal
- verwacht:
  - geen mixed-language render
  - expliciete en consistente render-authority

3. Resume/recovery regressie:
- Engelstalige sessie na resume/recovery
- verwacht:
  - taalcontinuity blijft Engels

4. Cross-step non-regressie:
- `dream`, `purpose`, `bigwhy`, `role`, `entity`, `targetgroup`
- geen mixed-language kaarten binnen één render

5. Bestaande non-regressies
- `_meta.widget_result` authority
- locale readiness/gating
- continuity/latest render retention
- widget action lifecycle

Belangrijke reviewvragen tijdens implementatie
- Welke locale is server-side resolved?
- Welke locale gebruikt de widget voor strings?
- Welke taal heeft de specialist-body echt?
- Wordt een oude payload in andere taal hergebruikt?
- Is dit Big Why-specifiek of generiek?
- Blijven eerdere fixes intact?

Stopconditie
- Klaar pas als bewezen is dat:
  - een Engelstalige flow niet meer spontaan terugvalt naar Nederlands,
  - één render geen mixed-language kaart meer toont,
  - resume/recovery dezelfde taalcontinuity houden,
  - de oplossing niet op hardcoded teksten leunt,
  - en eerdere fixes intact blijven.
```
