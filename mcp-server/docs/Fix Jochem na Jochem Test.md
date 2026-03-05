# Fix Jochem na Jochem Test

## Fix 1 - Entiteit: headline/menu mismatch en refine-knop zonder zichtbare formulering

### Input (zoals gemeld)
In de stap `entiteit` bleef de user doorvragen. Daarna verscheen een scherm waarbij de agent in communicatiemodus had moeten blijven. Er stond een knop `Verfijn de formulering voor mij alsjeblieft`, terwijl er geen formulering zichtbaar was.

Gewenst interface-gedrag:
1. Feedback op vraag/statement van user.
2. De standaardzin over wat de huidige `<stepname>` voor `<companyname/my future company>` is.
3. De opgeslagen statement.
4. Headline moet `Verfijn je entiteit ...` zijn in plaats van `Definieer ...` als er al output bekend is.

### Eerste analyse (grote lijnen, nog geen definitieve root-cause)

#### Hypothese A - Status en menu raken ontkoppeld
- `headline` wordt bepaald op basis van `status` (`no_output` => `define`, anders `refine`).
- `menu` kan tegelijk uit de bewaarde `phase` komen i.p.v. uit dezelfde `status`.
- Daardoor kan combinatie ontstaan: headline `Definieer ...` + knop uit `ENTITY_MENU_EXAMPLE` (`Verfijn ...`).
- Technische aanwijzingen:
  - `contractHeadlineForState` kiest `define/refine` puur op `status`.
  - `resolveMenuContract` gebruikt bij `no_output`/`incomplete_output` nog steeds `phaseMenu` als die geldig is.

#### Hypothese B - Tijdelijk opgeslagen step-output kan gewist worden tijdens interactiestate reset
- Er is een pad dat `clearStepInteractiveState` aanroept.
- Die reset wist ook `provisional_by_step[stepId]`.
- Als de entiteit nog niet definitief gecommit was, kan bekende output verdwijnen, waardoor `status` terugvalt naar `no_output`.
- Technische aanwijzingen:
  - `clearStepInteractiveState` roept direct `clearProvisionalValue` aan.
  - Dit pad kan getriggerd worden bij pending wording-choice + nieuwe tekstinput.

#### Hypothese C - Recap/contextblok wordt niet afgedwongen in dit statuspad
- Bij off-topic/communicatie-flow wordt recap-context alleen toegevoegd als status niet `no_output` is.
- Als status onterecht op `no_output` staat, ontbreekt de verwachte blokstructuur met huidige opgeslagen statement.

#### Hypothese D - Contract-invariant ontbreekt
- Er lijkt geen harde invariant te bestaan die verbiedt:
  - `status=no_output` gecombineerd met `ENTITY_MENU_EXAMPLE`, of
  - tonen van `ACTION_ENTITY_EXAMPLE_REFINE` zonder zichtbare/canonieke formulering.
- Gevolg: inconsistente UI kan legitiem door de huidige codepaden glippen.

### Bewijspunten in code (startpunten voor diep onderzoek)
- `mcp-server/src/core/turn_policy_renderer.ts`
  - `contractHeadlineForState` (status => define/refine): rond regels 247-270.
  - `computeStatus` accepted/provisional/visible output: rond regels 615-763.
  - `resolveMenuContract` phase-menu prioriteit buiten `valid_output`: rond regels 937-959.
  - off-topic recap alleen bij `effectiveStatus !== no_output`: rond regels 1075-1080.
- `mcp-server/src/core/ui_contract_matrix.ts`
  - Entity default menu per status: regels 574-578.
- `mcp-server/src/i18n/ui_strings/locales/ui_strings_nl.ts`
  - Label `ACTION_ENTITY_EXAMPLE_REFINE`: regel 75.
- `mcp-server/src/handlers/run_step_runtime_state_helpers.ts`
  - `clearStepInteractiveState` wist provisional value: regels 322-325.
- `mcp-server/src/handlers/run_step_runtime_action_routing.ts`
  - `clearStepInteractiveState` pad bij text-intent + pending wording: regels 530-537.
- `mcp-server/src/handlers/run_step_turn_response_engine.ts`
  - Gerenderde contractfase wordt elke turn teruggeschreven naar `__ui_phase_by_step`: regels 123-126.

### Mogelijke structurele fixes (geen quick fixes)

1. Maak een eenduidige UI-state machine per step
- Één canonieke afleiding voor `headline`, `menu`, `buttons`, `recap-block` vanuit dezelfde step-output-status.
- `phase` mag alleen subflow-positie zijn binnen een geldige status, nooit een bron die status tegenspreekt.

2. Splits content-state en interaction-state hard
- `clearStepInteractiveState` mag géén step-output wissen.
- Alleen tijdelijke interactievelden resetten (`wording_choice_*`, tijdelijke keuzecontext), niet `provisional_by_step` met inhoudelijke step-output.

3. Status-naar-menu contract hard afdwingen
- Voor `entity`:
  - `no_output` => alleen intro/formulate menu’s.
  - `incomplete/valid` met bestaande entiteit => refine/example menu’s.
- Geen refine-acties renderen zonder zichtbare/canonieke formulering.

4. Canonieke recap-weergave verplicht maken
- Als er bekende entiteit is (final of geaccepteerde provisional), dan altijd de 3-blok structuur tonen:
  1) feedback,
  2) standaard contextzin,
  3) opgeslagen statement.
- Dit moet een invariant zijn, geen best-effort.

5. Contract-tests toevoegen op inconsistenties
- Regressietests voor exact dit scenario:
  - user blijft doorvragen,
  - eerdere entiteit bestaat,
  - UI mag nooit `Definieer ...` combineren met `ENTITY_MENU_EXAMPLE` refine-knop zonder formulering.

### Aanvulling op Fix 1 - Zelfde defectklasse zichtbaar in `doelgroep`
- Nieuwe observatie: in `doelgroep` verschijnt een `ga door`-actie (`ACTION_TARGETGROUP_POSTREFINE_CONFIRM`) terwijl er geen zichtbare opgeslagen doelgroep-statement in beeld staat.
- Dit valt onder dezelfde root-causeklasse als Fix 1 (status/menu/render-ontkoppeling + contextblok niet hard afgedwongen), alleen in een andere stap.
- Daarom geen aparte `Fix 3` nodig op dit moment; dit issue wordt toegevoegd aan de scope en acceptatiecriteria van `Fix 1`.
- Kanttekening: als de structurele fix van Fix 1 correct stap-onafhankelijk wordt geïmplementeerd, hoort dit probleem automatisch mee opgelost te zijn.

#### Extra bewijspunten voor deze variant
- `mcp-server/src/core/ui_contract_matrix.ts`
  - `targetgroup` default menu’s: `no_output -> TARGETGROUP_MENU_INTRO`, `valid_output -> TARGETGROUP_MENU_POSTREFINE`.
- `mcp-server/src/core/turn_policy_renderer.ts`
  - `targetgroup` zit in `acceptedDrivenValidSteps`; bij accepted evidence gaat status naar `valid_output`.
  - headline wordt nog steeds afgeleid van status (`define/refine`) los van menu-phase.
- `mcp-server/src/handlers/run_step_runtime_semantic_helpers.ts`
  - contract-invarianten blokkeren confirm vooral op evidence/menu-niveau, maar niet op eis dat de canonical statement zichtbaar in de UI-body moet staan.

#### Extra acceptatiecriteria onder Fix 1
1. In alle single-value stappen (`entity`, `targetgroup`, `purpose`, `bigwhy`, `role`) geldt:
   - als een confirm/continue button zichtbaar is, moet in dezelfde turn ook de canonical opgeslagen step-output zichtbaar zijn in de body.
2. Geen confirm/continue zonder zichtbare statement.
3. Regressietestmatrix uitbreiden met minimaal `entity` + `targetgroup` voor dit patroon.

---

### Agent instructie (copy-paste, diep onderzoek, geen code wijzigen)
```text
Context
Je onderzoekt een UI-contract regressie in stap `entity` van de Business Strategy Canvas Builder.

Observed bug
- User bleef doorvragen in entity-step.
- UI toonde headline "Definieer je entiteit ..." terwijl er al eerder output bekend was.
- UI toonde knop "Verfijn de formulering voor mij alsjeblieft" terwijl er geen formulering zichtbaar was.

Doel van deze opdracht
1) Achterhaal de echte root cause (niet symptoombestrijding).
2) Lever technisch bewijs met concrete state-transities en codepaden.
3) Stel alleen structurele oplossingen voor.
4) Doe GEEN codewijzigingen in deze opdracht.

Harde regels
- Quick fixes zijn verboden.
- Geen fallbacks/omwegen/extra guards als structurele oplossing.
- Als je bestaande guards/fallbacks vindt die dit maskeren, markeer ze als technische schuld met voorstel tot verwijdering na root-cause fix.
- Zonder expliciet akkoord van opdrachtgever mag er geen code worden aangepast.

Onderzoeksaanpak
1. Reproduceer deterministisch
- Reproduceer de flow met exacte inputvolgorde (entity output aanwezig, daarna doorvragen).
- Leg per turn vast:
  - `current_step`
  - `last_specialist_result` (action, message, question, refined_formulation, entity, is_offtopic)
  - `provisional_by_step.entity`
  - `provisional_source_by_step.entity`
  - `entity_final`
  - `__ui_phase_by_step.entity`
  - gerenderd `status`, `contract_id`, `menuId`, `uiActionCodes`, `headline/question`

2. Maak een causale keten
- Toon exact waar status wordt bepaald.
- Toon exact waar menu/phase wordt bepaald.
- Toon exact waar/wanneer opgeslagen output eventueel wordt gewist.
- Toon exact waarom refine-button zichtbaar werd zonder zichtbare formulering.

3. Valideer tegen functionele verwachting
- Verwacht gedrag bij bestaande entity-output:
  - feedback + standaard contextzin + opgeslagen statement
  - headline "Verfijn je entiteit ..." (niet "Definieer ...")

4. Lever structureel oplossingsvoorstel (nog niet implementeren)
- Presenteer 1 voorkeursrichting + max 2 alternatieven.
- Voor elke richting:
  - architecturale impact,
  - welke invarianten hierdoor hard worden,
  - risico’s/migratie,
  - teststrategie (unit + integratie + regressie).

Verplichte outputstructuur
A. Mensentaal uitleg van het probleem (kort en helder)
B. Technisch bewijs (bestands- en regelnummers, state snapshots)
C. Definitieve root-cause formulering
D. Structureel fixplan (zonder codewijziging)
E. Beslisvoorstel aan opdrachtgever (wat eerst, waarom)

Stopconditie
- Stop na analyse + plan.
- Vraag expliciet akkoord voor implementatie.
- Zonder akkoord: geen codewijzigingen.
```

### Oplossing / aanpassing (na akkoord)
Nog niet ingevuld. Wacht op expliciet akkoord voor implementatie.

## Fix 2 - Wording-choice acceptatie, verlies van focuspunten en ongewenste Engelstalige/dubbele strategieblokken

### Input (zoals gemeld)
- In wording-choice stond bij `my suggestion` een versie met 3 statements.
- User klikte geen keuzebutton, maar vroeg in tekst om het korter/bondiger te maken.
- Volgens regel moet dit (zonder expliciete afwijzing) gelden als acceptatie van `my suggestion`.
- Volgend scherm toonde ineens nog maar 2 statements.
- Daarnaast werd dubbele tekst getoond en een Engelse regel (`SO FAR WE HAVE ...`) die nooit zichtbaar had mogen zijn.
- Dit moet stap-onafhankelijk kloppen (zelfde principe in elke stap).

### Eerste analyse (grote lijnen, nog geen definitieve root-cause)

#### Hypothese A - Pending wording-choice wordt te vroeg vrijgegeven bij vrije tekst
- Tijdens een pending wording-choice turn wordt vrije step-contributing tekst gezien als signaal om pending state los te laten.
- Daardoor verdwijnt de keuze-context en wordt usertekst als nieuwe inhoud naar specialist gestuurd, i.p.v. default acceptatie van `my suggestion`.
- Gevolg: de eerder voorgestelde 3 statements zijn niet langer leidend; specialist kan met 2 statements terugkomen.
- Technische aanwijzingen:
  - `run_step_runtime_action_routing.ts` reset pending state via `clearStepInteractiveState` bij text-intent.
  - Deze reset is vóór de wording-pick selectie.

#### Hypothese B - Reset van interactieve state wist ook inhoudelijke stap-progressie
- `clearStepInteractiveState` reset niet alleen wording-choice velden, maar wist ook `provisional_by_step[stepId]`.
- Hierdoor kan eerder geaccepteerde tussentijdse output verloren gaan.
- Gevolg: canonical basis voor de volgende turn wordt zwakker/kleiner, wat statementverlies versterkt.

#### Hypothese C - Engels is deels contractueel afgedwongen in specialist-instructies
- Strategie-instructies bevatten harde vaste zinnen in het Engels (o.a. `So far we have these [X] strategic focus points`).
- Ondanks "localized"-intentie is dit in praktijk lekgevoelig en kan in output blijven staan.
- Runtime corrigeert alleen enkele bekende Engelse claims, niet deze volledige familie.

#### Hypothese D - Dubbele strategieblokken door dubbele ownership
- Specialistmessage bevat al een lijst/samenvatting van focuspunten.
- Renderer voegt daarna nog een canonical `strategyContextBlock` toe.
- Dedupe-detectie faalt als headings/taal/structuur verschillen, waardoor inhoud dubbel verschijnt.
- Gevolg: scherm toont lijst in message én nogmaals als "huidige strategie" blok.

### Bewijspunten in code (startpunten voor diep onderzoek)
- `mcp-server/src/handlers/run_step_runtime_action_routing.ts`
  - pending release op text-intent: regels 530-537.
  - pending panel branch die dan wordt overgeslagen: regels 553-557.
- `mcp-server/src/handlers/run_step_runtime_state_helpers.ts`
  - `clearStepInteractiveState` wist `provisional` via `clearProvisionalValue`: regels 322-325.
- `mcp-server/src/steps/strategy.ts`
  - vaste frase `So far we have these [X] strategic focus points`: regel 420.
  - herhaalde harde outputpatronen met dezelfde frase: regels 485, 510, 525, 537, 556.
- `mcp-server/src/core/turn_policy_renderer.ts`
  - strategy-context wordt extra toegevoegd onder message: regels 1068-1098.
- `mcp-server/src/core/turn_policy/strategy_helpers.ts`
  - opbouw van canonical strategy context block (summary + huidige strategie + bullets).
- `mcp-server/src/handlers/run_step_wording.ts`
  - beperkte Engelse claim-filter (`you've provided...`) maar niet algemene `So far...` familie (rond `stripUnsupportedReformulationClaims`).

### Mogelijke structurele fixes (geen quick fixes)

1. Maak een expliciete pending-choice intent state machine (stap-onafhankelijk)
- Nieuwe intents tijdens pending-choice:
  - `ACCEPT_SUGGESTION_DEFAULT` (default bij geen expliciete afwijzing),
  - `REJECT_SUGGESTION_EXPLICIT`,
  - `MODIFY_SUGGESTION`,
  - `NEW_STEP_CONTENT`.
- Vrije tekst zonder expliciete afwijzing mag pending niet resetten; base = suggestion.
- Alleen bij expliciete afwijzing/"helemaal fout/ik bedoel iets anders" mag suggestion verlaten worden.

2. Scheid interactie-reset van content-state definitief
- `clearStepInteractiveState` mag alleen interactieve velden resetten.
- Content (`provisional_by_step`) moet via aparte, expliciete content-transitie verlopen.
- Zo voorkom je statementverlies door UI-flow-reset.

3. Maak runtime owner van alle summary/recap microcopy
- Specialist levert alleen gestructureerde data (`statements`, `reason`, `question intent`), geen vaste samenvattingszinnen.
- Runtime rendert altijd gelokaliseerde summaryregels via i18n keys.
- Verwijder harde Engelse stringvereisten uit specialist-instructies.

4. Single-owner render-contract voor lijstblokken
- Ofwel specialistmessage toont focuslijst, ofwel renderer `strategyContextBlock` toont die, maar nooit beide.
- Contract-invariant: één canonical lijstweergave per turn.
- Voeg list-set dedupe op canonical item keys toe vóór renderen.

5. Uniforme spelling-normalisatie vóór commit (alle stappen)
- Eén centrale normalizer/spelling-correctielaag vóór persist/render.
- Niet verspreid per stap/pad, zodat gedrag consistent blijft bij free text, wording-pick en action routes.

---

### Agent instructie (copy-paste, diep onderzoek, geen code wijzigen)
```text
Context
Je onderzoekt een regressie in wording-choice en strategy rendering.

Observed bug
- In wording-choice had "my suggestion" 3 statements.
- User klikte geen keuzebutton en vroeg in tekst om korter/bondiger.
- Volgende scherm toonde 2 statements i.p.v. 3.
- Er verscheen dubbele inhoud en een Engelse regel ("SO FAR WE HAVE...").

Business rule (hard)
- Als user geen button kiest en niet expliciet aangeeft dat de suggestie fout is of iets totaal anders bedoeld wordt, dan geldt dat als acceptatie van "my suggestion".
- Dit gedrag moet in elke stap consistent zijn.

Doel van deze opdracht
1) Bepaal de echte root cause inclusief state-transities.
2) Lever technisch bewijs voor statementverlies + dubbele render + language leak.
3) Stel alleen structurele oplossingen voor.
4) GEEN codewijzigingen in deze opdracht.

Harde regels
- Geen quick fixes.
- Geen fallbacks/extra guards als eindoplossing.
- Als bestaande guards/fallbacks de root cause maskeren: markeer als technische schuld.
- Zonder expliciet akkoord: geen implementatie.

Onderzoeksaanpak
1. Reproduceer deterministisch
- Gebruik exact deze flow:
  a) wording-choice met user-versie + suggestion-versie
  b) geen button click
  c) user stuurt vrije tekst "korter/bondiger" (zonder expliciete afwijzing)
- Leg per turn vast:
  - `current_step`
  - `last_specialist_result` (incl. `wording_choice_*` velden)
  - `provisional_by_step[strategy]` + bron
  - `strategy_final`
  - `statements`
  - `ui_contract_id`, `menu`, `status`
  - uiteindelijke widget tekst

2. Causale keten bouwen
- Toon exact waar pending wording-choice wordt vrijgegeven of behouden.
- Toon exact waar content-state eventueel wordt gewist tijdens interactieve reset.
- Toon exact waar 3 -> 2 statements ontstaat.
- Toon exact waar Engelse regel in output kan ontstaan.
- Toon exact waarom lijst dubbel in UI komt.

3. Contract-invarianten toetsen
- Invariant 1: pending wording-choice zonder expliciete reject => suggestion blijft basis.
- Invariant 2: interactieve reset wist nooit inhoudelijke step-output.
- Invariant 3: geen mixed language in user-facing tekst.
- Invariant 4: per turn exact één canonical lijstweergave.

4. Structureel fixvoorstel (niet implementeren)
- Presenteer 1 voorkeursontwerp + max 2 alternatieven.
- Voor elk ontwerp:
  - architectuurimpact,
  - welke invarianten hard afgedwongen worden,
  - migratierisico,
  - testplan (unit/integratie/regressie).

Verplichte outputstructuur
A. Mensentaal uitleg
B. Technisch bewijs met files/regels + state snapshots
C. Definitieve root-cause
D. Structureel fixplan
E. Beslisvoorstel + expliciete akkoordvraag voor implementatie

Stopconditie
- Stop na analyse + plan.
- Vraag akkoord.
- Zonder akkoord: geen codewijzigingen.
```

### Oplossing / aanpassing (na akkoord)
Nog niet ingevuld. Wacht op expliciet akkoord voor implementatie.

## Fix 3 - Rules of the Game: onjuiste confirm-gating, geen >5 consolidatieflow, en onvoldoende interne-gerichtheid

### Input (zoals gemeld)
- `Rules of the Game` moet minimaal 3 regels hebben voordat `ga door` zichtbaar mag worden.
- Bij meer dan 5 regels moet (zoals bij strategie) feedback komen dat te veel regels niet wenselijk is (geen wetboek).
- Bij >5 moet een `your input / my suggestion`-keuze verschijnen waarin regels in `my suggestion` worden samengevoegd, met uitleg waarom.
- Belangrijk inhoudelijk: regels zijn intern gericht (hoe je werkt/samenwerkt). Voorbeeld zoals `Gratis is gratis voor iedereen` had een `my suggestion` naar interne regel moeten triggeren.

### Eerste analyse (grote lijnen, nog geen definitieve root-cause)

#### Hypothese A - Confirm verschijnt te vroeg door statuslogica in renderer
- In `computeStatus` voor `rulesofthegame` geldt nu:
  - `valid_output` zodra `acceptedOutput` waar is en er een `acceptedValue` is, óf bij `statementCount >= 3`.
- Daardoor kan `valid_output` (en dus confirm-menu) verschijnen met minder dan 3 regels, zolang er maar geaccepteerde output aanwezig is.
- Dit botst direct met de businessregel “minimaal 3 voordat ga door mag”.

#### Hypothese B - Max-limiet en UX-contract lopen niet met gewenste gedrag
- Post-processing hanteert nu een hard maximum van 6, niet 5.
- Overschrijding wordt vooral technisch afgekapt/gesaneerd, maar niet contractueel als expliciete user-flow behandeld (met your input/my suggestion).
- Er is geen rules-specifieke equivalent van strategie-achtige overflow-feedback + consolidatiekeuze.

#### Hypothese C - Consolidatie bestaat technisch, maar niet als expliciete beslis-UI
- Er bestaat wel merge/truncate logica in backend (`postProcessRulesOfTheGame`), inclusief feedbacktekst.
- Deze pipeline wordt niet hard afgedwongen als interactieve keuze-flow (`wording choice`) wanneer gebruiker boven de grens uitkomt.
- Daardoor mist transparantie en controle op samengevoegde regels.

#### Hypothese D - Interne-gerichtheid is niet hard gevalideerd
- Instructies spreken veel over gedrag/principes, maar niet hard genoeg als validator “altijd intern werk-/samenwerkingsafspraken”.
- Runtime/code heeft geen deterministische check die externe/perk/markt-georiënteerde regels naar `REFINE + my suggestion` dwingt.
- Gevolg: regels zoals `Gratis is gratis voor iedereen` kunnen doorstromen zonder interne herformulering.

### Bewijspunten in code (startpunten voor diep onderzoek)
- `mcp-server/src/core/turn_policy_renderer.ts`
  - `rulesofthegame` statusbepaling: `acceptedOutput && (acceptedValue || statementCount >= 3)` (regels 710-717).
- `mcp-server/src/core/ui_contract_matrix.ts`
  - `rulesofthegame.valid_output -> RULES_MENU_CONFIRM` (regels 594-597).
- `mcp-server/src/handlers/run_step_runtime_semantic_helpers.ts`
  - confirm-invariants checken vooral “accepted evidence” en menu-consistentie, niet “minimaal 3 zichtbare regels” (regels 159-165, 191-205, 218-225).
- `mcp-server/src/handlers/run_step_state_update.ts`
  - rules-state wordt direct genormaliseerd/gecomprimeerd met `postProcessRulesOfTheGame(..., 6)` (regels 240-249).
- `mcp-server/src/steps/rulesofthegame.ts`
  - post-process limiet op 6 (regels 830-835), truncatie naar eerste `max` (regels 820-827),
  - feedbacktekst over merges/limiet bestaat maar is Engels en niet gekoppeld aan een verplichte keuze-flow (regels 893-923).

### Mogelijke structurele fixes (geen quick fixes)

1. Maak harde count-gating contractueel in runtime (niet alleen specialist-instructie)
- `rulesofthegame` mag alleen `valid_output` zijn bij canoniek aantal regels binnen afgesproken bandbreedte.
- `ga door`-actie alleen renderen als deze invariant waar is.

2. Breng limietbeleid op 5 en maak overflow expliciet interactief
- Uniforme grens: maximaal 5 (in instructie + state-update + renderer + tests).
- Bij >5: verplicht `your input / my suggestion`-flow met samengevoegde set en korte rationale (“geen wetboek”).

3. Maak consolidatie een first-class UI-contract
- Niet stil trunceren; altijd expliciet tonen wat is samengevoegd en waarom.
- User kiest of accepteert default volgens wording-choice policy (zie Fix 2).

4. Voeg interne-gerichtheid als harde semantische invariant toe
- Regel moet intern gedrags-/samenwerkingsprincipe beschrijven.
- Externe/propositie/perk-regels triggeren `REFINE` met interne herformulering (`my suggestion`) en bewijszin waarom.

5. Harmoniseer instructie en code
- Specialist-instructies en runtime-validators moeten exact dezelfde definitie hanteren.
- Verwijder mismatch tussen “3-5” in tekst en “tot 6” in code.

---

### Agent instructie (copy-paste, diep onderzoek, geen code wijzigen)
```text
Context
Je onderzoekt regressiegedrag in stap `rulesofthegame`.

Observed bug
- Confirm/ga-door verschijnt terwijl er minder dan 3 regels zichtbaar/canoniek zijn.
- Bij >5 regels ontbreekt een expliciete consolidatieflow (your input / my suggestion + rationale).
- Externe formuleringen (bijv. "Gratis is gratis voor iedereen") worden niet consequent intern herformuleerd.

Businessregels (hard)
1) Minimaal 3 regels voordat ga-door zichtbaar mag zijn.
2) Meer dan 5 regels is niet wenselijk (geen wetboek): toon feedback + consolidatievoorstel.
3) Bij >5: toon your input / my suggestion, met samengevoegde my suggestion en uitleg.
4) Rules of the Game zijn intern gericht: hoe we werken/samenwerken.

Doel van deze opdracht
1) Bewijs exact waarom confirm te vroeg verschijnt.
2) Bewijs waarom >5 geen expliciete consolidatiekeuze triggert.
3) Bewijs waarom externe regels niet hard naar interne regels worden gerefined.
4) Lever structureel fixplan zonder codewijziging.

Harde regels
- Geen quick fixes.
- Geen extra guards/fallbacks als eindoplossing.
- Zonder expliciet akkoord: geen implementatie.

Onderzoeksaanpak
1. Reproduceer deterministisch
- Scenario A: 2 regels en toch confirm zichtbaar.
- Scenario B: 6+ regels zonder your input/my suggestion consolidatiekeuze.
- Scenario C: externe regel (zoals "Gratis is gratis voor iedereen") zonder interne my suggestion.
- Leg per turn vast:
  - `current_step`
  - `last_specialist_result` (incl. `statements`, `refined_formulation`, `rulesofthegame`)
  - `provisional_by_step.rulesofthegame`
  - `rulesofthegame_final`
  - gerenderde `status`, `contract_id`, `menu`, `uiActionCodes`
  - uiteindelijke widgettekst

2. Causale keten
- Toon statusafleiding naar `valid_output`.
- Toon menu-afleiding naar confirm.
- Toon waar rules worden gemerged/truncated en of/waar dit aan user wordt uitgelegd.
- Toon waar internal-vs-external validatie ontbreekt of te zwak is.

3. Invarianten evalueren
- Invariant 1: confirm alleen bij >=3 regels.
- Invariant 2: >5 verplicht expliciete consolidatieflow met rationale.
- Invariant 3: regels zijn intern gericht, anders REFINE naar interne formulering.

4. Structureel fixvoorstel (niet implementeren)
- Presenteer 1 voorkeursrichting + max 2 alternatieven.
- Voor elk:
  - architectuurimpact,
  - migratie/risico,
  - testplan (unit + integratie + regressie),
  - relatie met Fix 2 (hergebruik pending-choice architectuur waar nuttig).

Verplichte outputstructuur
A. Mensentaal uitleg
B. Technisch bewijs (file/regel + state snapshots)
C. Definitieve root-cause
D. Structureel fixplan
E. Beslisvoorstel + expliciete akkoordvraag

Stopconditie
- Stop na analyse + plan.
- Zonder akkoord geen codewijziging.
```

### Oplossing / aanpassing (na akkoord)
Nog niet ingevuld. Wacht op expliciet akkoord voor implementatie.

## Fix 4 - Presentatie: bullets/volledigheid, afbeelding-meta, onterechte wording-choice en HTML-lek

### Input (zoals gemeld)
- In `presentatie` worden `strategie` en `spelregels` niet als bullets getoond.
- `producten en diensten` toont in dit geval 2 items terwijl eerder 4-5 items bekend waren.
- Vraag over afbeeldingen/logo's in presentatie moet uit vast toegestane antwoord komen:
  - "Helaas is het nu nog niet mogelijk om afbeeldingen of logo's te verwerken in de presentatie. We werken er hard aan om dit in de toekomst mogelijk te maken."
  - plus vertaling naar alle ondersteunde talen.
- Dit leidde onterecht tot `your input / my suggestion`.
  - Dit mag alleen bij expliciete wijzigingsintentie en dan met inhoudelijke feedback als input niet past bij stapcontract.
- In screenshot 2 kwam HTML/code (`<strong>...`) zichtbaar in de suggestion-card. Dit mag nooit user-facing zichtbaar zijn.

### Eerste analyse (grote lijnen, nog geen definitieve root-cause)

#### Hypothese A - Presentation recap is model-gestuurd met markup i.p.v. runtime-canoniek rendermodel
- `presentation`-instructies verplichten nu `<strong>`-tags in specialist-output voor recap.
- Daardoor wordt structurele opmaak afhankelijk van model-output i.p.v. server-side canonical render.
- Als die markup downstream in wording-choice terechtkomt, wordt raw HTML zichtbaar als tekst.
- Technische aanwijzingen:
  - `steps/presentation.ts` schrijft `<strong>...</strong>` expliciet voor in INTRO/ASK/REFINE recap-output.

#### Hypothese B - Wording-choice scope is te breed en sluit `presentation` niet uit
- Wording-choice eligibility sluit nu alleen `step_0` uit.
- Hierdoor kan vrije tekst in presentatie-step onterecht in pending choice (`your input / my suggestion`) landen.
- Bij presentatie kan dat enorme recap-teksten met HTML als suggestion tonen.
- Technische aanwijzingen:
  - `isWordingChoiceEligibleStep` in `run_step_wording.ts` retourneert `true` voor alle stappen behalve step 0.
  - `fieldForStep` mapt `presentation` naar `presentation_brief`; suggestion kan daardoor volledige recap-body worden.

#### Hypothese C - Geen dedicated meta-topic + i18n key voor "afbeeldingen/logo niet ondersteund"
- Centrale meta-router kent geen `meta_topic` voor presentatie-media-capability.
- Daardoor wordt vraag over afbeeldingen niet deterministisch afgehandeld via vaste tekst per taal.
- Gevolg: model kan antwoord naar gewone stapflow of wording-choice duwen.
- Technische aanwijzingen:
  - `META_TOPIC_CONTRACT_INSTRUCTION` en `META_TOPIC_ROUTE_REGISTRY` bevatten geen presentatie-image topic/key.
  - In `ui_strings_defaults.ts` en locale files ontbreekt key voor dit vaste antwoord.

#### Hypothese D - Bullet/extractie voor presentatie-assets is fragiel bij run-on/gelabelde tekst
- `presentationLines()` splitst primair op newline; bij samengelijmde tekst op één regel blijft dat één line-item.
- `sanitizeLinesForSection()` breekt op eerste gedetecteerde andere section-label; daardoor kan sectie-inhoud vroegtijdig afkappen.
- Dit kan verklaren waarom in output niet alle bekende items terugkomen.
- Technische aanwijzingen:
  - `run_step_presentation.ts` gebruikt newline-first parsing en section label break-logic.

#### Hypothese E - Invariant "geen markup/code zichtbaar in user UI" ontbreekt als harde contractcheck
- Semantische invarianten valideren menu/actions/evidence, maar niet dat wording-choice velden geen raw tags tonen.
- Hierdoor kan `<strong>` of andere markup ongefilterd in cards terechtkomen.
- Technische aanwijzingen:
  - `run_step_runtime_semantic_helpers.ts` bevat geen check op HTML/markup in `wording_choice_*` payload of card-velden.

### Bewijspunten in code (startpunten voor diep onderzoek)
- `mcp-server/src/steps/presentation.ts`
  - Recap-format eist HTML `<strong>` labels in meerdere flowblokken (o.a. regels 155-166, 192-203, 225-237).
- `mcp-server/src/handlers/run_step_wording.ts`
  - `isWordingChoiceEligibleStep`: alleen `step0` uitgesloten (regels 137-139).
  - pending flow bouwt `suggestion_text` direct uit suggestionRaw zonder presentation-specifieke sanitatie (o.a. regels 745-747, 891-907).
- `mcp-server/src/handlers/run_step_wording_heuristics_defaults.ts`
  - `fieldForStep("presentation") -> "presentation_brief"` (regels 48-60).
- `mcp-server/src/handlers/run_step_wording_heuristics.ts`
  - `pickDualChoiceSuggestion` neemt `field`/`refined_formulation` direct als candidate (regels 621-635).
- `mcp-server/src/handlers/run_step_policy_meta.ts`
  - toegestane `meta_topic` lijst bevat geen presentatie-media capability topic (regels 67-82).
  - registry heeft geen route key voor presentatie-afbeeldingen (regels 133-176).
- `mcp-server/src/i18n/ui_strings_defaults.ts`
  - wel diverse `meta.topic.*` keys, maar geen key voor "images/logos not supported in presentation" (regels 197-210).
- `mcp-server/src/handlers/run_step_presentation.ts`
  - `presentationLines` newline-first parser (regels 36-45).
  - `sanitizeLinesForSection` stopt bij andere section label (regels 66-79).
  - sectiestrategie/producten/spelregels worden hierdoor uit finals geëxtraheerd (regels 322-366).
- `mcp-server/src/handlers/run_step_runtime_semantic_helpers.ts`
  - geen hard verbod op raw HTML/markup in wording-choice user-facing velden (regels 159-226 focussen op action/menu invarianten).

### Mogelijke structurele fixes (geen quick fixes)

1. Maak presentatie-recap runtime-canoniek en markup-vrij
- Specialist levert alleen gestructureerde data/intent; runtime bouwt de recap weergave vanuit finals.
- Geen HTML-tags in specialist-outputcontract voor user-visible tekst.
- Presentatieweergave en PPT-export gebruiken dezelfde canonical list-source.

2. Beperk wording-choice scope contractueel
- `presentation` uitsluiten van wording-choice, of alleen toelaten in strikt gedefinieerde refine-subflow met korte tekst (geen volledige recap).
- Geen `your input / my suggestion` tenzij expliciete wijzigingsintentie hard is gedetecteerd.
- Bij niet-wijzigingsvraag (zoals capability vraag) direct meta-router antwoord, geen wording-choice.

3. Voeg dedicated meta-topic toe voor presentatie-media capability
- Nieuw topic, bijvoorbeeld `PRESENTATION_MEDIA_NOT_SUPPORTED`.
- Centrale router geeft vaste tekst via i18n key, in alle ondersteunde talen.
- Volledig deterministic: geen specialistvrije formulering voor dit onderwerp.

4. Versterk canonical list reconstructie voor presentatie
- Section-aware parser die ook run-on tekst en gemengde bullets/nummering robust splitst.
- Nooit silent truncation door eerste vreemde label; parse complete bron en map items per section.
- Cross-check aantal items tegen canonical state (strategie/rules/products) vóór render/export.

5. Voeg harde UI-safety invariant toe: geen raw markup/code in cards
- Voor wording-choice en recap-cards: sanitize/escape op contractniveau.
- Valideer dat user-facing velden geen `<tag>` patronen bevatten.
- Fail-fast als invariant breekt (telemetry + blokkeren renderpad) i.p.v. stil tonen.

6. Eenduidige spelling-normalisatie vóór intent-routing
- User input altijd via centrale spelling/normalisatie laag vóór intentclassificatie en wording-choice branching.
- Zo voorkom je dat lichte taalvarianten onterecht als wijzigingsintentie eindigen.

---

### Agent instructie (copy-paste, diep onderzoek, geen code wijzigen)
```text
Context
Je onderzoekt regressies in stap `presentation` met impact op recap-weergave, wording-choice, meta-antwoorden en UI-safety.

Observed bugs
1) In presentatie-recap worden `strategie` en `spelregels` niet als bullets getoond.
2) `producten en diensten` toont minder items dan eerder bekend (bijv. 2 i.p.v. 4-5).
3) Vraag over afbeeldingen/logo's in presentatie gaf niet het vaste capability-antwoord, maar leidde tot een onterechte your input/my suggestion-flow.
4) In suggestion-card werd raw HTML/code zichtbaar (`<strong>...`). Dit mag nooit.

Businessregels (hard)
- Your input / my suggestion mag alleen bij expliciete wijzigingsintentie.
- Capability-vraag "kan ik afbeeldingen/logo toevoegen" moet deterministisch via vaste tekst worden beantwoord.
- Vaste tekst (lokaliseren in alle ondersteunde talen):
  "Helaas is het nu nog niet mogelijk om afbeeldingen of logo's te verwerken in de presentatie. We werken er hard aan om dit in de toekomst mogelijk te maken."
- User-facing UI mag nooit raw HTML/code tonen.
- Zonder expliciet akkoord: geen codewijzigingen.

Doel van deze opdracht
1) Achterhaal de echte root cause(s) met causale keten.
2) Lever technisch bewijs met state snapshots en codepaden.
3) Stel alleen structurele oplossingen voor.
4) Doe GEEN implementatie in deze opdracht.

Harde regels
- Quick fixes verboden.
- Geen fallbacks/omwegen/extra guards als eindoplossing.
- Als bestaande guards/fallbacks root cause maskeren: markeer als technische schuld.

Onderzoeksaanpak
1. Reproduceer deterministisch
- Scenario A: presentatie-recap met bekende 4-5 products/services en meerdere strategy/rules bullets.
- Scenario B: user vraagt "kan ik afbeeldingen/logo toevoegen?"
- Scenario C: vrije uservraag in presentatie zonder expliciete wijzigingsintentie.
- Leg per turn vast:
  - `current_step`
  - `last_specialist_result` (action, message, refined_formulation, presentation_brief, wording_choice_*)
  - `provisional_by_step.presentation`
  - `presentation_brief_final`
  - finals van `strategy`, `productsservices`, `rulesofthegame`
  - `ui_contract_id`, `menuId`, `status`, `uiActionCodes`
  - gerenderde widgettekst + wording-choice payload

2. Bouw causale keten
- Toon waarom wording-choice in presentatie kon activeren.
- Toon waarom HTML-tagcontent in suggestion-user-facing terechtkwam.
- Toon waarom bullets/items verloren of samengeplakt raakten.
- Toon waarom capability-vraag niet via meta-topic vaste tekst werd gerouteerd.

3. Toets invarianten
- Invariant 1: capability-vraag -> vaste meta-antwoordtekst (gelokaliseerd), geen wording-choice.
- Invariant 2: geen raw markup/code in user-facing UI.
- Invariant 3: presentatie-recap reflecteert alle canonical items per sectie zonder silent truncation.
- Invariant 4: wording-choice alleen bij expliciete wijzigingsintentie.

4. Lever structureel fixvoorstel (niet implementeren)
- Presenteer 1 voorkeursrichting + max 2 alternatieven.
- Voor elk:
  - architectuurimpact,
  - welke invarianten hard worden,
  - migratie/risico,
  - teststrategie (unit + integratie + regressie + meertalige assertions).

Verplichte outputstructuur
A. Mensentaal uitleg
B. Technisch bewijs (files/regels + snapshots)
C. Definitieve root-cause formulering
D. Structureel fixplan (zonder code)
E. Beslisvoorstel + expliciete akkoordvraag

Stopconditie
- Stop na analyse + plan.
- Vraag expliciet akkoord.
- Zonder akkoord: geen codewijzigingen.
```

### Oplossing / aanpassing (na akkoord)
Nog niet ingevuld. Wacht op expliciet akkoord voor implementatie.
