# Fix Jochem na Jochem Test


## Fix 1 - Dream Builder dubbele content: 12-pogingen terugblik + structurele briefing

### Input (zoals gemeld)
Dit had niet mogen staan als losse paragraaf boven de bullets:
- `Over 5 tot 10 jaar zal werk steeds meer gericht zijn op het maken van een positieve impact ...`

Reden:
- Deze inhoud staat al in de Dream Builder bullets.
- De UI toont daardoor dezelfde semantische content dubbel (narrative paragraaf + statementslijst).

### Wat al gedaan is (12 pogingen) en waarom dat telkens niet afdoende was

1. `0318e72` - fallback/localisatie rond dream wording
- Focus: copy/fallback.
- Waarom onvoldoende: lost semantische dedupe tussen body en statements niet op.

2. `4bbec9c` - heading/list rendering fixes
- Focus: rendering-structuur en heading parsing.
- Waarom onvoldoende: targette vorm, niet de bron van dubbele Dream-inhoud.

3. `012ecfd` - intent-driven wording disambiguation
- Focus: intentrouting pending wording.
- Waarom onvoldoende: dual-vs-canonical routing verbeterd, maar geen harde body-vs-statements SSOT.

4. `256e298` - canonical single-value context invariants
- Focus: confirm-context invarianten.
- Waarom onvoldoende: invariant gold vooral op single-value confirm, niet op Dream Builder narrative+bullets.

5. `5db0483` - wording acceptance stabilisatie
- Focus: accept/reject wording-flow.
- Waarom onvoldoende: gedrag rond keuzeacceptatie, niet dedupe van Dream Builder contentkanalen.

6. `0b86519` - heading wrapper false positives
- Focus: heading-detectie.
- Waarom onvoldoende: cosmetische false positives, niet semantische duplicatie van statements.

7. `9c739d6` - catalog-driven Dream copy
- Focus: i18n/copybron.
- Waarom onvoldoende: correcte tekstbron voorkomt niet dat dezelfde inhoud 2x uit verschillende velden wordt getoond.

8. `956404f` - single-value confirm SSOT composition
- Focus: SSOT voor confirm-copy.
- Waarom onvoldoende: Dream Builder statements-flow valt deels buiten dit pad.

9. `3a693ef` - dream-builder dedupe + runtime cleanup
- Focus: dedupe in runtime teksthelper.
- Waarom onvoldoende: dedupe is context-gated; bij gate-mismatch blijft dubbele content mogelijk.

10. `9c5d769` - semantic pending suggestion routing
- Focus: pending suggestion intent-contract.
- Waarom onvoldoende: intentlaag verbeterd, maar display-compositie (body + statements panel) bleef multi-owner.

11. `8708516` - UI prefereert canonical text source
- Focus: één voorkeursbron voor card-body.
- Waarom onvoldoende: statements-panel blijft onafhankelijk renderen; zonder cross-channel dedupe blijft dubbeling.

12. `a92729e` - single-source rendering + intent SSOT
- Focus: verdere SSOT-scherping runtime/pipeline.
- Waarom onvoldoende: nog steeds geen harde contractregel die verbiedt dat body semantisch dezelfde inhoud heeft als `dream_builder_statements` wanneer die lijst zichtbaar is.

### Eerste analyse (grote lijnen, nog geen definitieve root-cause)

#### Hypothese A - Multi-owner contentcompositie (server body vs client statements panel)
- De card-body wordt opgebouwd uit `result.text/specialist.message`.
- De statementslijst wordt apart vanuit `specialist/statelijnen` gerenderd.
- Zonder harde, gedeelde invariant kunnen beide tegelijk dezelfde inhoud tonen.

#### Hypothese B - Dedupe in runtime is gated en daardoor niet altijd actief
- Dream Builder dedupe in runtime-finalize draait alleen bij specifieke contextvoorwaarden.
- Als `dreamBuilderRenderContext` niet exact waar is, blijft duplicate narrative staan.

#### Hypothese C - UI-fallback voor statements-panel is ruimer dan server-dedupe-context
- UI toont statements ook via fallback-conditie.
- Die conditie is niet 1-op-1 gekoppeld aan de server-side dedupe-activatie, waardoor mismatch ontstaat.

#### Hypothese D - Dedupe is vooral lexicaal, niet contractueel
- Dedupe vertrouwt op vergelijking van tekstlijnen/sentences.
- Bij kleine variaties, volgordeverschillen of contextregels kan semantische dubbeling toch blijven staan.

#### Hypothese E - Eerdere fixes zaten verspreid over lagen zonder expliciete “Dream Builder content ownership” contractregel
- We hebben veel verbeterd in losse lagen (renderer, wording, pipeline, UI), maar zonder één afdwingbare ownershipregel voor body-vs-statements.

### Bewijspunten in code (startpunten voor diep onderzoek)

- UI rendert body en statements los van elkaar:
  - `mcp-server/ui/lib/ui_render.ts`: 829-841 (body source), 888 (body render), 930-951 + 1196-1234 (statements panel).

- Statements-panel fallback is actief buiten expliciete view-variant:
  - `mcp-server/ui/lib/ui_render.ts`: 1197-1201 (`!hasExplicitViewVariant && isDreamExplainerMode`).

- Dream Builder dedupe bestaat, maar is context-gated:
  - `mcp-server/src/handlers/run_step_runtime_finalize.ts`: 300-307 (dreamBuilderRenderContext gate), 334-389 (message cleanup).

- Hulpfunctie voor dedupe tegen prompt bestaat, maar wordt niet gebruikt in de renderflow:
  - `mcp-server/ui/lib/ui_render.ts`: 168-181 (`dedupeBodyAgainstPrompt`), geen call-site.

### Mogelijke structurele fixes (geen quick fixes)

1. Definieer harde SSOT-eigenaarschap voor Dream Builder contentkanalen
- Wanneer statements-panel zichtbaar is, mag body geen semantische herhaling van statements bevatten.
- Dit als contractregel, niet als best-effort heuristiek.

2. Synchroniseer server- en UI-gates
- Dezelfde condition-set moet bepalen:
  - wanneer statements zichtbaar zijn,
  - wanneer dedupe verplicht is,
  - welke body toegestaan is (support/coach-zinnen alleen).

3. Introduceer expliciete `dream_builder_body_mode` in UI-contract
- Bijvoorbeeld: `support_only | full_narrative | none`.
- UI mag niet zelfstandig fallbacken naar dubbele content buiten dit contract.

4. Verplaats Dream Builder dedupe naar één canonical compositiefunctie
- Niet verspreid over runtime finalize + UI heuristieken.
- Eén punt dat beslist: welke tekstblokken verschijnen samen.

5. Breid regressietests uit met “no semantic duplicate across channels”
- Test: narrative paragraaf met 5 zinnen die overeenkomen met 5 statements -> body moet leeg/ingekort worden.
- Test met lichte parafrase en volgordevariatie.
- Test op gate-mismatch scenario (`no explicit view variant` + dreamExplainer fallback).

### Agent instructie (copy-paste, diep onderzoek, geen code wijzigen)
```text
Context
Dream Builder toont soms dubbele content: een narrative paragraaf die semantisch hetzelfde is als de statements-bullets.
Er zijn al circa 12 eerdere fixes gedaan in meerdere lagen, maar het probleem keert terug.

Observed bug
- Een volledige paragraaf met Dream-inhoud verschijnt bovenaan.
- Dezelfde inhoud verschijnt direct daaronder opnieuw als genummerde statements.
- Dit is ongewenste dubbele content.

Doel van deze opdracht
1) Maak een forensische terugblik op de eerdere fixes en waarom ze onvoldoende waren.
2) Bepaal definitieve root-cause van de huidige duplicate-channel regressie.
3) Ontwerp een structurele SSOT-oplossing voor Dream Builder content ownership.
4) Doe GEEN codewijzigingen in deze opdracht.

Harde regels
- Geen quick fix met extra string-strip als eindoplossing.
- Geen lokale patch in alleen UI of alleen server; oplossing moet cross-layer contractueel zijn.
- Geen hardcoded user-facing copy in runtime code; copy via i18n keys.
- Behoud bestaande contracten/invariants (`ui_contract_id`, rendered status, confirm visibility).
- Zonder expliciet akkoord: geen implementatie.

Onderzoeksaanpak
1. Reconstrueer de laatste 12 relevante pogingen (commit + intent + effect + gat).
2. Trace exact de huidige flow:
   - server text composition
   - dream builder statement source
   - ui body rendering
   - ui statements rendering
3. Bewijs de gate-mismatch (server dedupe gate vs ui panel gate).
4. Definieer SSOT-contract voor Dream Builder content ownership:
   - toegestaan blokkencombinaties
   - verboden combinatie (narrative duplicate + statements)
5. Lever regressietestmatrix met semantische duplicate-cases.

Verplichte outputstructuur
A. Terugblik 12 pogingen (wat gedaan, waarom onvoldoende)
B. Technisch bewijs huidige regressie (file/line)
C. Definitieve root-cause
D. Structureel fixplan (SSOT compositiecontract)
E. Testplan + risico-inschatting

Stopconditie
- Stop na analyse + plan.
- Vraag expliciet akkoord voor implementatie.
- Zonder akkoord: geen codewijzigingen.
```

### Oplossing / aanpassing (na akkoord)
Nog niet ingevuld. Wacht op expliciet akkoord voor implementatie.

## Fix 2 - Dream wording-flow: onderscheid input vs feedback + regressie in canonical heading-shape

### Input (zoals gemeld)
Geobserveerde regressies in Dream:

1. Bij een volledige userzin (inhoudelijke herformulering) verschijnt niet meer het dual-keuzevlak (`your input / my suggestion`), maar alleen nog één versie.
2. Bij feedback op een bestaande suggestie (bijv. `dit klinkt saai`) verschuift de output naar stap-/motivatiecopy i.p.v. inhoudelijke hersuggestie.
3. De interface-shape is onjuist: `Je huidige droom voor Mindd is:` moet als aparte headingregel (uppercase-stijl) boven de droom staan, niet inline in een lopende alinea.

Gewenst gedrag:
- Twee expliciete inputtypes blijven bestaan:
  - `content_input` (user levert eigen zin) -> dual-keuze moet beschikbaar blijven waar relevant.
  - `feedback_on_suggestion` (user corrigeert bestaande suggestie) -> nieuwe suggestie op basis van vorige suggestie, zonder verkeerde stap-meta-uitwijk.

### Eerste analyse (grote lijnen, nog geen definitieve root-cause)

#### Hypothese A - Over-canonicalisatie onderdrukt dual flow voor Dream
- De wording-opbouw forceert voor Dream standaard `canonical` presentatie.
- Daardoor wordt de picker/double-choice payload niet opgebouwd, ook niet wanneer inputtype inhoudelijk `content_input` is.

#### Hypothese B - Presentatiekeuze is step-gedreven i.p.v. intent-gedreven
- De beslislaag gebruikt vooral step-scope (`dream` => canonical) en onvoldoende het onderscheid tussen inhoudelijke herformulering versus feedback op pending suggestie.
- Gevolg: twee fundamenteel verschillende userintenties vallen visueel op hetzelfde pad.

#### Hypothese C - Feedbackturn mist harde inhoudsconstraint
- Bij `feedback_on_suggestion` kan specialist-copy uitwaaieren naar coaching/stapframing i.p.v. directe inhoudelijke hersuggestie.
- Hierdoor voelt het alsof feedback niet op de droominhoud wordt toegepast.

#### Hypothese D - Renderer accepteert inline heading+waarde als “goed genoeg”
- Canonical context-dedupe controleert aanwezigheid van heading/canonical tekst, maar normaliseert de vorm niet af naar aparte headingregel + waarde.
- Daardoor blijft een onjuiste inline variant (`Je huidige droom...: <zin>`) staan.

#### Hypothese E - UI toont geen dual panel zodra wording-choice payload ontbreekt
- In canonical pad komt vaak geen `wording_choice` UI payload mee.
- De client verbergt dan het keuzevlak volledig en laat alleen de standaard card zien.

### Bewijspunten in code (startpunten voor diep onderzoek)

- Canonical-voorkeur voor Dream in wording-opbouw:
  - `mcp-server/src/handlers/run_step_wording.ts`: 341-350, 926-928.

- Canonical pad retourneert geen picker payload:
  - `mcp-server/src/handlers/run_step_wording.ts`: 1082-1084.

- Pipeline zet picker alleen bij expliciete pending-choice payload:
  - `mcp-server/src/handlers/run_step_pipeline.ts`: 855-863.

- Pending-intent resolutie bestaat, maar presentatie blijft losgekoppeld van intent:
  - `mcp-server/src/handlers/run_step_runtime_action_routing.ts`: 562-577.
  - `mcp-server/src/handlers/run_step_wording_heuristics.ts`: 266-325.

- Canonical context-block afdwingen zonder shape-normalisatie:
  - `mcp-server/src/core/turn_policy_renderer.ts`: 382-412, 1524-1529.

- UI verbergt wording-keuzevlak als payload niet enabled is:
  - `mcp-server/ui/lib/ui_render.ts`: 482-487.

- Heading-rendering vraagt expliciete heading-structuur per regel:
  - `mcp-server/ui/lib/ui_text.ts`: 227-285.

### Mogelijke structurele fixes (geen quick fixes)

1. Maak presentatiekeuze intent-gedreven (SSOT), niet step-hardcoded
- Inputclassificatie als primaire driver:
  - `content_input` op pending suggestie -> dual picker (`your input / my suggestion`) waar contract dat toelaat.
  - `feedback_on_suggestion` / `reject_suggestion_explicit` -> canonical hersuggestieflow met suggestion-anchor.

2. Definieer een expliciet “pending suggestion turn contract”
- Vereiste velden per intent:
  - `intent`, `anchor`, `seed_source`, `presentation_mode`.
- Verplicht dat `feedback_on_suggestion` de vorige suggestie als basis gebruikt en niet terugvalt op generieke stapmeta-copy.

3. Voeg output-shape invariant toe voor single-value canonical blokken
- `heading` en `canonical value` moeten als aparte blokregels worden afgedwongen.
- Inline varianten (`heading: value` in één lopende alinea) normaliseren naar 2-regelige canonical structuur.

4. Houd dual-flow functioneel voor vrijwillige userzin
- Als user bewust een eigen zin aanlevert, moet de keuze om eigen formulering te behouden versus suggestie te kiezen intact blijven.
- Geen globale suppressie van dual panel voor alle Dream-gevallen.

5. Cross-step harmonisatie
- Pas dezelfde intent/presentation-regels toe op Purpose, BigWhy, Role, Entity, Targetgroup en andere single-value confirm-flows.
- Vermijd per-step uitzonderingslogica.

### Agent instructie (copy-paste, diep onderzoek, geen code wijzigen)
```text
Context
Na recente wijzigingen zijn twee verschillende typen userinput in Dream onvoldoende gescheiden:
1) inhoudelijke eigen zin (moet dual keuze kunnen tonen),
2) feedback op bestaande suggestie (moet nieuwe suggestie opleveren op basis van de vorige suggestie).
Daarnaast is canonical heading-shape regressief (inline i.p.v. headingregel + waarde).

Observed bugs
- Bij inhoudelijke userzin verdwijnt vaak de dual flow (your input / my suggestion).
- Bij feedback zoals "dit klinkt saai" verschuift output naar stap-/motivatiecopy i.p.v. inhoudelijke hersuggestie.
- "Je huidige droom voor Mindd is" verschijnt niet altijd als aparte headingregel boven de droomwaarde.

Doel van deze opdracht
1) Bepaal definitieve root-cause van presentatie-routing (canonical vs picker) en intentverwerking.
2) Ontwerp een structureel intent-contract voor pending suggestion afhandeling.
3) Definieer shape-invariants voor canonical heading/value rendering.
4) Doe GEEN codewijzigingen in deze opdracht.

Harde regels
- Geen keyword-hacks of locale-regex als primaire routering.
- Geen hardcoded user-facing runtime copy; alles via i18n keys.
- Pending wording-choice mag specialist/intent-pad niet blokkeren.
- Behoud bestaande contracten/invariants (`ui_contract_id`, rendered status, confirm visibility).
- Oplossing moet cross-step werken, niet Dream-only quick patch.
- Zonder expliciet akkoord: geen implementatie.

Onderzoeksaanpak
1. Trace end-to-end:
   - pending intent detectie
   - action routing
   - pipeline seeding
   - wording-choice opbouw
   - renderer output-shape
   - ui panel visibility
2. Maak intentmatrix met minimaal:
   - accept_suggestion_explicit
   - reject_suggestion_explicit
   - feedback_on_suggestion
   - content_input
   inclusief `anchor/source`.
3. Toets of presentatiekeuze (`picker` vs `canonical`) nu step-gedreven is en waar dit intent overschrijft.
4. Definieer structureel voorstel:
   - intent-gedreven presentatiekeuze
   - canonical shape-normalisatie (heading apart)
   - regressietests voor Dream + minimaal 2 andere single-value stappen.

Verplichte outputstructuur
A. Mensentaal probleemuitleg
B. Technisch bewijs (file/line)
C. Definitieve root-cause
D. Structureel fixplan (SSOT + intent-contract)
E. Testplan + risico-inschatting

Stopconditie
- Stop na analyse + plan.
- Vraag expliciet akkoord voor implementatie.
- Zonder akkoord: geen codewijzigingen.
```

### Oplossing / aanpassing (na akkoord)
Nog niet ingevuld. Wacht op expliciet akkoord voor implementatie.


## Fix 3 - Step 0 seed-extractie herkent bedrijfsnaam en type fout bij natuurlijke openingszin

### Input (zoals gemeld)
User-input:
- `help met mijn ondernemingsplan voor mijn reclamebureau Mindd`

Huidige output in validate/readiness:
- `Je hebt een ondernemingsplan voor mijn genaamd reclamebureau...`

Verwachting:
- Bedrijfstype: `reclamebureau`
- Bedrijfsnaam: `Mindd`
- Correcte readiness-zin op basis van die twee velden.

### Eerste analyse (grote lijnen, nog geen definitieve root-cause)

#### Hypothese A - Breed possessive patroon pakt verkeerde zinsdelen als venture/name
- De parser matcht vroeg op `mijn ...` en kapt op een onjuiste plek in de zin.
- Daardoor wordt een beschrijvend fragment als venture gezien en `reclamebureau` als naam.

#### Hypothese B - Prioriteit van extractiebronnen is semantisch onjuist
- Parser geeft voorrang aan regex-groepen uit het possessive patroon.
- Daardoor worden sterkere signalen (venture-hints zoals `reclamebureau`, en trailing merknaam `Mindd`) genegeerd.

#### Hypothese C - Validatie voorkomt foutieve tuple niet
- Naam-validatie accepteert `reclamebureau` als plausibele naam.
- Venture-validatie vereist vooral “niet leeg”, waardoor een fragment als `ondernemingsplan voor mijn` kan passeren.

#### Hypothese D - Foute seed wordt vroeg gecommitteerd en downstream klakkeloos gerenderd
- In start-prestart route wordt seed direct naar `step_0_final` geschreven.
- Readiness-render gebruikt die tuple direct in de catalog-template, dus fout wordt zichtbaar in UI.

### Bewijspunten in code (startpunten voor diep onderzoek)

- Te brede possessive match + prioriteit:
  - `mcp-server/src/handlers/run_step_step0.ts`: 177-186
  - `pronounVentureName` wordt geprioriteerd boven venture-hints en trailing naam.

- Venture/name selectie die verkeerde tuple produceert:
  - `mcp-server/src/handlers/run_step_step0.ts`: 183-187

- Naam-validatie die generieke venture-termen niet voldoende uitsluit:
  - `mcp-server/src/handlers/run_step_step0.ts`: 45-54

- Seed wordt hard in state gezet tijdens startup:
  - `mcp-server/src/handlers/run_step_routes.ts`: 730-743

- Readiness-zin rendert tuple 1-op-1 via i18n-template:
  - `mcp-server/src/handlers/run_step_runtime_text_ui_helpers.ts`: 79-117
  - `mcp-server/src/i18n/ui_strings/locales/ui_strings_nl.ts`: keys `step0.readiness.statement.*`

- Regressiespoor in historie:
  - Parser is in nieuwere vorm herschreven in commit `0d69c8f` (vervanging van stopwoord-gedreven extractie door bredere pattern-first extractie).

### Mogelijke structurele fixes (geen quick fixes)

1. Maak Step-0 seed-extractie semantisch en score-gedreven i.p.v. first-match regex-prioriteit
- Kandidaten voor `venture` en `name` apart verzamelen.
- Ranking toepassen met expliciete conflictregels (venture-woorden mogen geen naam winnen).

2. Hard onderscheid tussen `venture lexicon` en `brand/name lexicon`
- Venture-termset als negatieve filter voor naamkandidaten.
- Multi-token beschrijvende fragmenten blokkeren als venture-kandidaat wanneer ze functie-woorden bevatten (`voor`, `mijn`, `met`, etc.).

3. Introduceer tuple-consistentievalidatie vóór commit naar `step_0_final`
- Als `venture` en `name` semantisch botsen of lage confidence hebben: niet committen.
- Dan gecontroleerd fallback-pad (vraag om verduidelijking) i.p.v. foutieve tuple tonen.

4. Eén SSOT-parser voor alle Step-0 seeding-paden
- Zelfde parser gebruiken in prestart, bootstrap en latere correctieflows.
- Geen parallelle infer-logica per route.

5. Versterk regressietests op natuurlijke openingszinnen
- Cases met meerdere `mijn/my` segmenten.
- Cases met type + merknaam in vrije volgorde.
- Cases die foutieve “naam=venture” moeten blokkeren.

### Agent instructie (copy-paste, diep onderzoek, geen code wijzigen)
```text
Context
Step 0 (Validatie & Bedrijfsnaam) herkent bij natuurlijke openingszinnen soms de venture en bedrijfsnaam verkeerd.

Observed bug
Input: "help met mijn ondernemingsplan voor mijn reclamebureau Mindd"
Huidige interpretatie gaat fout: venture en naam worden omgewisseld of vervuild door zinsfragmenten.
De readiness-zin toont daardoor onzinnige output.

Doel van deze opdracht
1) Bepaal definitieve root-cause van de foutieve step-0 tuple-extractie.
2) Ontwerp een structurele, herbruikbare parse-strategie voor venture + bedrijfsnaam.
3) Definieer regressietests die dit blijvend voorkomen.
4) Doe GEEN codewijzigingen in deze opdracht.

Harde regels
- Geen keyword-hack of losse regex-fix als eindoplossing.
- Geen route-specifieke workaround; oplossing moet SSOT zijn.
- Geen hardcoded user-facing copy in runtime; copy blijft via i18n keys.
- Behoud bestaande contracten/invariants (`ui_contract_id`, rendered status, confirm visibility).
- Zonder expliciet akkoord: geen implementatie.

Onderzoeksaanpak
1. Trace end-to-end:
   - seed-detectie in step0 parser
   - route commit naar `step_0_final`
   - readiness-rendering
2. Maak causale keten met concreet bewijs (file/line).
3. Ontwerp parser-contract:
   - aparte kandidaatsets voor venture en name
   - confidence/ranking
   - conflict-resolutie
   - commit-guardrails
4. Toets op cross-flow impact:
   - startup/prestart
   - latere naamwijziging in step0
   - fallback naar clarify-flow
5. Definieer regressietestmatrix:
   - NL/EN openingszinnen
   - meerdere possessive segmenten
   - venture-term als ongeldige name
   - false-positive blokkades

Verplichte outputstructuur
A. Mensentaal probleemuitleg
B. Technisch bewijs (file/line)
C. Definitieve root-cause
D. Structureel fixplan (SSOT)
E. Testplan + risico-inschatting

Stopconditie
- Stop na analyse + plan.
- Vraag expliciet akkoord voor implementatie.
- Zonder akkoord: geen codewijzigingen.
```

### Oplossing / aanpassing (na akkoord)
Nog niet ingevuld. Wacht op expliciet akkoord voor implementatie.

