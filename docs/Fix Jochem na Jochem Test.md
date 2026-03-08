# Fix Jochem na Jochem Test

## Fix 1 - Single-value heading/body shape is heuristisch en verliest uppercase-semantiek

### Input (zoals gemeld)
- In single-value confirm/refine screens verschijnt een regel zoals:
  - `Wat denk je van de formulering`
- Verwachting:
  - deze regel moet als aparte heading/kicker renderen,
  - dus in uppercase-stijl,
  - en niet samenvallen met de canonieke waarde eronder.
- Waargenomen gedrag:
  - de UI toont bijvoorbeeld:
    - `Wat denk je van de formulering Een strategisch reclamebureau voor complexe keuzes`
  - waardoor de heading geen heading meer is maar gewone bodytekst.

Gewenst structureel gedrag:
1. Heading-semantiek voor single-value steps komt uit het contract, niet uit tekst-parsing.
2. De renderer weet expliciet wat `heading`, `canonical value` en `support text` is.
3. Uppercase-styling hangt alleen af van semantische rol, niet van toevallige interpunctie zoals `:`.
4. Het systeem blijft werken voor `Entity`, `Purpose`, `Big Why`, `Role`, `Dream` en vergelijkbare single-value schermen.

### Eerste analyse (grote lijnen, nog geen definitieve root-cause)

#### Hypothese A - Heading-semantiek gaat verloren tussen turn-policy en widget-render
- De backend kan voor single-value steps wel degelijk een heading + canonical value afleiden.
- Maar die shape wordt onderweg terug omgezet naar vrije tekstblokken.
- Daardoor moet de frontend later opnieuw raden wat een heading is.

#### Hypothese B - Frontend heading-detectie is puur heuristisch
- De widget behandelt alleen regels die eindigen op `:` of als standalone `<strong>...</strong>` binnenkomen als heading.
- Een semantisch geldige heading zonder `:` wordt daardoor gewone paragraaftekst.

#### Hypothese C - Niet-heading regels worden daarna samengevoegd tot één paragraaf
- Zodra de eerste regel niet als heading wordt gezien, worden heading + canonical value in één paragraph-block gezet.
- Dan is het visueel onmogelijk om nog uppercase-kicker styling toe te passen.

#### Hypothese D - `questionText`, `message`, canonical text en body lopen door elkaar
- De renderketen heeft meerdere velden voor prompt/body/canonical/picker-context.
- Daardoor is niet hard gegarandeerd welk veld de single-value heading bevat en welk veld de canonieke tekst bevat.

#### Hypothese E - De huidige tests normaliseren het foutieve gedrag al deels
- Er bestaan tests die expliciet accepteren dat zulke regels als gewone tekst boven de canonical value verschijnen.
- Daardoor blijft de verkeerde shape regressievrij bestaan.

### Bewijspunten in code (startpunten voor diep onderzoek)

- Backend kent al een single-value heading voor `Entity`:
  - `mcp-server/src/core/turn_policy_renderer.ts`
    - `singleValueConfirmHeading(...)`: regels 352-372.
    - leest `entity.suggestion.template`, pakt de eerste regel en maakt daar een heading van.
  - `mcp-server/src/core/turn_policy_renderer.ts`
    - `singleValueConfirmCanonicalMessage(...)`: regels 374-380.
    - bouwt expliciet `heading + canonical value`.

- De turn-policy gebruikt die heading/canonical-shape ook actief:
  - `mcp-server/src/core/turn_policy_renderer.ts`
    - canonical/context enforcement rond confirm visibility: regels 1555-1573.
  - Gevolg:
    - server-side bestaat de semantiek al gedeeltelijk,
    - maar niet als hard UI-contract.

- De finalize-laag vlakt dit daarna weer af naar tekstblokken:
  - `mcp-server/src/handlers/run_step_runtime_finalize.ts`
    - selectie van `selectionCurrentParts.heading/body`: regels 565-595.
    - voegt heading en body samen terug in `msg` als multiline string.
  - Dit is nog steeds tekst-shape, geen expliciet structured payload.

- UI payload kent wel `questionText`, maar geen aparte `heading/body/canonical`-structuur:
  - `mcp-server/src/handlers/run_step_ui_payload.ts`
    - `rawQuestionText` -> `questionText`: regels 381-382.
    - `questionTextPayload`: regels 439-442.
  - Gevolg:
    - structured single-value heading heeft geen dedicated veld.

- De widget kiest daarna vrij tussen prompt/body-bronnen:
  - `mcp-server/ui/lib/ui_render.ts`
    - `uiQuestionText`, `promptRaw`, `bodyRaw`, `promptSource`, `body`: regels 886-912.
    - `renderStructuredText(cardDescEl, body || "")`: regel 934.
  - Gevolg:
    - de visuele hoofdcard vertrouwt op body-tekstshape.

- De frontend heading-detectie is puur heuristisch:
  - `mcp-server/ui/lib/ui_text.ts`
    - `isHeadingLikeLine(...)`: regels 146-150.
    - alleen `:` of standalone `<strong>...</strong>`.
  - `mcp-server/ui/lib/ui_text.ts`
    - `appendHeading(...)`: regels 193-204.
    - alleen dan krijgt de regel class `cardSubheading`.

- Zodra een regel niet als heading wordt herkend, wordt hij gewone paragraph-body:
  - `mcp-server/ui/lib/ui_text.ts`
    - paragraph grouping: regels 183-190 en 287-299.
  - Gevolg:
    - `Wat denk je van de formulering` + canonical value kunnen in één block eindigen.

- Uppercase-styling hangt alleen aan die heading class:
  - `mcp-server/ui/step-card.bundled.html`
    - body paragraph styling: regels 762-769.
    - heading styling `.cardDesc .cardSubheading`: regels 878-885.
  - Dus:
    - geen `cardSubheading` => geen uppercase.

- Er is al regressie-evidence dat foutieve vrije-tekstshape geaccepteerd wordt:
  - `mcp-server/src/handlers/run_step_runtime_finalize.test.ts`
    - regels 679-694 testen een variant waarin een regel zoals `Wat denk je van deze formulering` als gewone outputtekst bestaat.

### Definitieve root-cause (hoog over)

Dit defect ontstaat door een contractgat, niet door CSS.

1. De backend kent voor single-value states impliciet al wel heading/canonical-semantiek.
2. Die semantiek wordt niet als hard UI-contract doorgegeven.
3. In plaats daarvan wordt de inhoud teruggeflattened naar multiline tekst.
4. De frontend probeert vervolgens heuristisch te raden wat een heading is.
5. Zodra interpunctie of layout net afwijkt, degradeert de heading naar gewone bodytekst.
6. Dan verdwijnt ook automatisch de uppercase-styling, omdat die alleen aan de heading-class hangt.

Kort:
- de fout zit in “semantic structure encoded as text”,
- niet in de uppercase-CSS zelf.

### Mogelijke structurele fixes (geen quick fixes)

1. Introduceer een expliciete single-value content-shape in het UI-contract
- Bijvoorbeeld een payload-structuur zoals:
  - `ui.content.heading`
  - `ui.content.canonical_text`
  - `ui.content.support_text`
  - eventueel `ui.content.feedback_reason_text`
- De frontend rendert dan heading/body elk in een eigen semantisch blok.

2. Laat de frontend niet langer headings raden uit punctuation
- `isHeadingLikeLine` mag hooguit fallback zijn voor legacy content.
- Niet meer de primaire manier waarop single-value confirm/refine screens worden opgebouwd.

3. Gebruik één SSOT voor single-value confirm/refine rendering
- Niet tegelijk:
  - `message`
  - `refined_formulation`
  - `questionText`
  - `wordingSelectionMessage(...)`
  - body heuristics
- Maar één canonical render-shape waar confirm/refine UI altijd op draait.

4. Maak migration/backward compatibility expliciet
- Oude payloads zonder nieuwe structurele velden mogen nog renderen.
- Maar single-value screens die uit nieuwe turn-policy komen moeten altijd de nieuwe structured path gebruiken.

5. Verplaats regressietests van “string shape” naar “semantic shape”
- Tests moeten niet meer bewijzen dat het systeem een losse headingzin ergens in tekst kan vinden.
- Tests moeten bewijzen dat heading/body/canonical apart blijven tot in de widget-render.

### Voorkeursrichting

Voorkeursrichting:
- voeg een expliciete structured content contractlaag toe voor single-value steps,
- gebruik die eerst voor `Entity`, `Purpose`, `Big Why`, `Role`, `Dream`,
- en laat de huidige heading-heuristiek alleen als legacy fallback bestaan.

Waarom dit de beste richting is:
- lost de huidige bug echt op in plaats van hem te maskeren,
- voorkomt nieuwe varianten van hetzelfde probleem,
- maakt styling, i18n en wording semantisch stabieler,
- en verkleint de afhankelijkheid van toeval in `message`-tekst.

Alternatief 1:
- heading-detectie verbreden in de frontend
- bijvoorbeeld ook regels als `Wat denk je van ...` als heading markeren
- nadeel:
  - taalafhankelijk,
  - fragiel,
  - blijft tekst-parsing in plaats van contract.

Alternatief 2:
- afdwingen dat backend altijd `:` of `<strong>` injecteert
- nadeel:
  - nog steeds tekst-hacks,
  - semantiek blijft impliciet,
  - render blijft afhankelijk van formatting-conventies.

### Agent instructie (copy-paste, diep onderzoek + implementatie)
```text
Context
Je implementeert een structurele fix voor single-value confirm/refine schermen in de MCP-widget.

Observed bug
- Regels zoals "Wat denk je van de formulering" moeten als aparte uppercase heading renderen.
- In de praktijk komen ze soms als gewone bodytekst binnen.
- Dan worden heading en canonical value samengevoegd tot één paragraaf.

Doel van deze opdracht
1) Elimineer heading-detectie-op-basis-van-tekst als primaire renderstrategie voor single-value steps.
2) Introduceer een expliciete structured content-shape voor single-value confirm/refine rendering.
3) Zorg dat uppercase/kicker-styling volgt uit semantische rol, niet uit punctuation.
4) Behoud backward compatibility voor oude payloads waar redelijk nodig.

Harde regels
- Geen quick fix die alleen een `:` toevoegt.
- Geen regex/keyword-oplossing als hoofdoplossing.
- Geen frontend-only patch zolang de backend nog vrije tekst als hoofdcontract gebruikt.
- Geen breuk van wording-choice, Dream Builder of list-steps.
- i18n blijft via bestaande keys/contracten; geen nieuwe hardcoded user-facing copy in logic.

Onderzoeksaanpak vóór implementatie
1. Trace de huidige single-value keten end-to-end
- `turn_policy_renderer`
- `run_step_runtime_finalize`
- `run_step_ui_payload`
- `ui_render`
- `ui_text`
- Leg per laag vast:
  - waar heading-semantiek aanwezig is,
  - waar die wordt afgevlakt,
  - waar de widget nog moet gokken.

2. Bepaal scope van stappen
- Minimaal:
  - `entity`
  - `purpose`
  - `bigwhy`
  - `role`
  - `dream` waar relevant voor single-value canonical confirmation
- Controleer ook of `targetgroup` in dezelfde single-value confirm visibility flow valt.

3. Ontwerp nieuw contract
- Voeg een structured UI-content vorm toe, bijvoorbeeld:
  - `ui.content.heading`
  - `ui.content.canonical_text`
  - `ui.content.support_text`
  - `ui.content.feedback_reason_text`
- Kies namen die passen bij bestaande UI-contract conventies.
- Maak duidelijk welk veld SSOT is voor single-value rendering.

4. Definieer renderinvariant
- Voor single-value confirm/refine states geldt:
  - heading is apart veld,
  - canonical value is apart veld,
  - support/feedback is apart veld,
  - frontend voegt deze niet samen tot één paragraph blob.
- Frontend heading rendering mag niet afhangen van:
  - `:`
  - `<strong>`
  - lege regels
  - locale-specifieke zinsvorm.

Implementatierichting
1. Backend: contractvorming
- Pas `turn_policy_renderer` aan zodat single-value states een structured content payload meesturen.
- Gebruik bestaande single-value kennis (`singleValueConfirmHeading`, canonical accepted value, feedback reason) als bron.
- Zorg dat de nieuwe shape actief gevuld wordt in confirm/refine contexts waar nu canonical visibility enforced wordt.

2. Runtime/finalize: niet meer flattenen als primaire weg
- Verminder of verwijder voor deze structured single-value contexts het terugschrijven naar vrije `msg`-tekst als hoofdbron.
- `buildTextForWidget` mag voor legacy/telemetry/fallback nog tekst genereren, maar niet langer de primaire source zijn voor deze schermen.
- Controleer expliciet interactie met wording-choice pending en canonical presentation.

3. UI payload
- Breid `ui` payload schema en builders uit zodat de structured contentvelden veilig worden doorgegeven.
- Houd bestaande velden backward compatible.
- Documenteer welk veld de widget eerst moet gebruiken.

4. Frontend render
- In `ui_render`:
  - detecteer de nieuwe structured single-value content shape,
  - render heading, canonical text en support text als aparte blocks,
  - gebruik voor heading een dedicated semantische/class path die altijd uppercase-styling krijgt.
- Gebruik `renderStructuredText` alleen nog voor vrije body/support content, niet om de heading-rol zelf te bepalen.

5. Frontend fallback
- Laat `isHeadingLikeLine` bestaan voor legacy vrije tekst.
- Gebruik die alleen als fallback wanneer structured content ontbreekt.
- Structured content heeft altijd voorrang.

Verplichte tests
1. Renderer/turn-policy tests
- Single-value entity confirm state levert expliciete structured heading + canonical text.
- Zelfde voor minstens één andere single-value step (`purpose` of `bigwhy`).

2. Runtime/finalize tests
- Structured single-value payload wordt niet terug afgevlakt tot één multiline blob.
- Geen regressie in wording-choice of canonical pending flows.

3. UI payload tests
- Nieuwe structured content shape komt door in `ui`.
- Oude payloads zonder die shape blijven renderbaar.

4. Frontend render tests
- Heading rendert in aparte node/class met uppercase-styling pad.
- Heading zonder `:` blijft heading.
- Heading en canonical value worden niet samengevoegd tot één paragraph.

5. Regressietests
- Case:
  - heading = `Wat denk je van de formulering`
  - canonical = `Een strategisch reclamebureau voor complexe keuzes`
  - verwacht:
    - heading apart,
    - canonical apart,
    - geen inline samenvoeging.
- Voeg ook een Engels equivalent toe.

Belangrijke reviewvragen tijdens implementatie
- Is er nog ergens één pad waar single-value heading alleen als vrije tekst bestaat?
- Is `questionText` nog onterecht bron voor single-value heading in confirm/refine states?
- Kan de widget structured content overschrijven met prompt/body fallback?
- Is Dream Builder uitgesloten van deze renderingregel waar nodig?

Stopconditie
- Klaar pas als single-value confirm/refine heading-semantiek contractueel is gemaakt,
- de widget niet meer hoeft te raden,
- en regressietests expliciet bewijzen dat uppercase/kicker rendering niet meer afhangt van punctuation.
```

### Oplossing / aanpassing (na akkoord)
Nog niet ingevuld. Wacht op expliciet akkoord voor implementatie.
