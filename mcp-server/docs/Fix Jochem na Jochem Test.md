# Fix Jochem na Jochem Test

## Fix 7 - Feedbackzin wordt foutief als stap-input behandeld (i.p.v. feedback/communicatie)

### Input (zoals gemeld)
In de wording-keuzekaart werd een userreactie zoals:
- `Dit raakt me nog niet echt.`

getoond als:
- `Dit is jouw input:`

Verwachting:
- Dit type zin moet als feedback op de suggestie worden gezien, niet als nieuwe inhoudelijke stap-input.

### Eerste analyse (grote lijnen, nog geen definitieve root-cause)

#### Hypothese A - Widget geeft vrije tekst zonder apart feedback-kanaal door als gewone `user_message`
- De UI verstuurt tekst als reguliere `user_message` en markeert dit niet als “feedback intent”.
- Daardoor komt feedback-taal in dezelfde verwerkingsstroom als inhoudelijke stapinput.

#### Hypothese B - `ACTION_TEXT_SUBMIT` normalisatie zet vrije tekst direct om naar turn-input
- In preflight wordt submitted tekst direct `userMessage`.
- Er is geen scheiding tussen “inhoudelijke bijdrage” en “reactie op voorgestelde formulering”.

#### Hypothese C - Classificatie `shouldTreatAsStepContributingInput` is te breed voor korte feedbackzinnen
- Heuristiek accepteert veel vrije tekst als “step-contributing” zolang het niet navigatie/offtopic is en lang genoeg.
- Een zin als “Dit raakt me nog niet echt.” valt hierdoor in de input-categorie.

#### Hypothese D - Reject-detectie is smal en patroon-gedreven
- Alleen expliciete reject-frases (zoals “dat is niet wat ik bedoel”) worden als afwijzing herkend.
- Semantische feedbackzinnen zonder die exacte patronen vallen terug naar default-pad.

### Bewijspunten in code (startpunten voor diep onderzoek)

- UI verstuurt vrije tekst als gewone request payload:
  - `mcp-server/ui/lib/ui_actions.ts`: 1685-1689 (`user_message`, `input_mode: "widget"`).

- `ACTION_TEXT_SUBMIT` zet submitted tekst direct als `userMessage`:
  - `mcp-server/src/handlers/run_step_preflight.ts`: 407-412.

- Heuristiek die tekst als stapinput classificeert:
  - `mcp-server/src/handlers/run_step_wording_heuristics.ts`: 176-189.

- Pending wording-flow met tekstintentie-interpretatie:
  - `mcp-server/src/handlers/run_step_runtime_action_routing.ts`: 559-567, 600-605.

- Explicit reject patterns (beperkte lijst):
  - `mcp-server/src/handlers/run_step_wording_heuristics.ts`: 203-220.
  - `mcp-server/src/handlers/run_step_runtime_action_routing.ts`: 243-260.

- UI-label dat dit vervolgens presenteert als “jouw input”:
  - `mcp-server/src/i18n/ui_strings/locales/ui_strings_nl.ts`: 297.
  - `mcp-server/ui/lib/ui_render.ts`: 490-506.

### Mogelijke structurele fixes (geen quick fixes)

1. Voeg een expliciete feedback-intentlaag toe vóór `shouldTreatAsStepContributingInput`
- Detecteer semantische feedback op suggestie (zonder exact reject-keyword).
- Routeer naar feedback-afhandeling i.p.v. nieuwe inhoudelijke stapinput.

2. Splits inputcontract voor widget
- Introduceer onderscheid tussen `content_input` en `feedback_input` in requestpad.
- Laat wording-choice state machine beide expliciet verwerken.

3. Verbreed reject/feedback-herkenning met NL/EN intentfamilies
- Niet alleen harde regex op “fout/bedoel”, maar ook kwaliteitsfeedback (“raakt niet”, “te algemeen”, “niet scherp genoeg”).

4. Voeg regressietests toe op pending wording + vrije feedbacktekst
- Cases voor impliciete reject, nuancefeedback, proceed-intent en echte inhoudelijke herformulering.

### Agent instructie (copy-paste, diep onderzoek, geen code wijzigen)
```text
Context
Er is een classificatieprobleem in wording-choice: feedbackzinnen worden als stapinput gezien.

Observed bug
- User geeft feedback op de voorgestelde formulering (bijv. "Dit raakt me nog niet echt.").
- Systeem toont dit als "Dit is jouw input" en behandelt het als inhoudelijke input.

Doel van deze opdracht
1) Bepaal definitieve root-cause in de intent-classificatieketen.
2) Ontwerp structurele scheiding tussen feedback en inhoudelijke input.
3) Definieer regressietestset.
4) Doe GEEN codewijzigingen in deze opdracht.

Harde regels
- Geen quick fixes.
- Geen enkelvoudige regex-patch als eindoplossing.
- Verplicht cross-step impactonderzoek: controleer of hetzelfde patroon ook in andere stappen voorkomt.
- Oplossing moet structureel zijn (shared policy/flow), niet step-specifieke pleister.
- Geen hardcoded UX-copy toevoegen in runtime/handler code; alle user-facing tekst via i18n keys/catalog.
- Zonder expliciet akkoord: geen implementatie.

Onderzoeksaanpak
1. Trace end-to-end van widget submit tot wording-choice render.
2. Leg vast waar feedback semantisch verloren gaat.
3. Definieer intent-taxonomie (feedback/reject/content/proceed).
4. Maak testmatrix per intentklasse.
5. Maak een cross-step inventory (minimaal: purpose, bigwhy, role, entity, strategy, targetgroup, productsservices, rulesofthegame) op hetzelfde faalpatroon.

Verplichte outputstructuur
A. Mensentaal probleemuitleg
B. Technisch bewijs (file/line)
C. Definitieve root-cause
D. Structureel fixplan
E. Beslisvoorstel

Stopconditie
- Stop na analyse + plan.
- Vraag expliciet akkoord voor implementatie.
```

### Oplossing / aanpassing (na akkoord)
Nog niet ingevuld. Wacht op expliciet akkoord voor implementatie.

## Fix 8 - Drievoudige entiteit-copy in confirm-view (context + suggestie + current-heading)

### Input (zoals gemeld)
Gewenste weergave:
- `Wat denk je van de formulering`
- `Een onafhankelijk informatieplatform voor complexe keuzes`

Huidige weergave bevat extra/dubbele contextregels:
- `Op basis van wat ik al weet over Mind stel ik de volgende entiteit voor`
- `Wat denk je van de formulering`
- `Je huidige entiteit voor Mind is`
- `Een onafhankelijk informatieplatform voor complexe keuzes`

### Eerste analyse (grote lijnen, nog geen definitieve root-cause)

#### Hypothese A - Entity-specialist-instructie forceert al een introductieregel in `message`
- Bij formulate-routes wordt de specialist gestuurd om expliciet een “Based on what I already know ...” zin te zetten.
- Dit levert al één contextlaag op vóór runtime-rendering.

#### Hypothese B - Runtime helper voegt nog een suggestielaag toe aan `message`
- `normalizeEntitySpecialistResult` bouwt `entity.suggestion.template` (`Wat denk je van de formulering`) + entity en append/rewrite dit in `message`.
- Daardoor ontstaat tweede contextlaag over hetzelfde voorstel.

#### Hypothese C - Turn renderer forceert daarna ook canonical current-context block
- Voor single-value confirm-steps wordt een canonical heading+value blok afgedwongen (`Je huidige entiteit voor ... is:` + waarde).
- Hierdoor ontstaat derde laag over exact dezelfde inhoud.

#### Hypothese D - Dedupe werkt niet over semantisch equivalente maar verschillend geformuleerde kopregels
- De dedupecheck kijkt vooral op exacte/vergelijkbare blokken, maar deze drie tekstlagen zijn semantisch gelijk met verschillende framing.
- Gevolg: alle drie blijven zichtbaar.

### Bewijspunten in code (startpunten voor diep onderzoek)

- Specialistcontract dat introductiezin verplicht:
  - `mcp-server/src/steps/entity.ts`: 228-231 en 248-252.

- Suggestietemplate in NL:
  - `mcp-server/src/i18n/ui_strings/locales/ui_strings_nl.ts`: 179 (`entity.suggestion.template`).

- Runtime append van suggestielaag in entity-helper:
  - `mcp-server/src/handlers/run_step_runtime_specialist_helpers.ts`: 141-153, 154-186.

- Current context template in NL:
  - `mcp-server/src/i18n/ui_strings/locales/ui_strings_nl.ts`: 149 (`offtopic.current.template`).

- Confirm-view canonical block afdwingen:
  - `mcp-server/src/core/turn_policy_renderer.ts`: 1425-1427, 1473-1477.
  - Contextheading en canonical blockbouw:
    - `mcp-server/src/core/turn_policy_renderer.ts`: 337-350, 352-382.

### Mogelijke structurele fixes (geen quick fixes)

1. Maak één SSOT voor entiteit-confirm copy-opbouw
- Kies precies één bron voor “context + voorstel” (specialist óf renderer, niet beide).
- Definieer duidelijke prioriteit in render-contract.

2. Beperk entity-helper tot normalisatie, niet compositie van extra narrative copy
- `normalizeEntitySpecialistResult` alleen canonical value zetten.
- Suggestieframing centraliseren in één renderlaag.

3. Voeg semantische dedupe op heading-families toe
- Herken “voorstel/introtekst/current-context” als dezelfde informatielaag.
- Houd in final display maximaal één kopregel + één canonical waarde.

4. Contracttest voor exact output-shape op entity confirm-state
- Assertie op maximaal twee tekstblokken: (a) gewenste vraagkop, (b) entiteitzin.
- Geen extra contextregels toegestaan in dit viewtype.

### Agent instructie (copy-paste, diep onderzoek, geen code wijzigen)
```text
Context
In Entiteit confirm-state verschijnt drievoudige/overlappende copy over dezelfde inhoud.

Observed bug
- Tegelijk zichtbaar: (1) specialist-introzin, (2) suggestie-template, (3) current-context heading.
- Verwachting: één compacte vraagkop + de entiteitzin.

Doel van deze opdracht
1) Vind definitieve root-cause over alle lagen die tekst toevoegen.
2) Definieer SSOT voor entiteit-confirm copy.
3) Schrijf regressiecriteria voor exact display-shape.
4) Doe GEEN codewijzigingen in deze opdracht.

Harde regels
- Geen quick fix via losse string-strip alleen.
- Geen duplicatie via meerdere lagen.
- Verplicht cross-step impactonderzoek: controleer alle single-value confirm stappen op hetzelfde duplicatiepatroon.
- Oplossing moet structureel zijn (één SSOT voor copy-compositie), niet alleen Entity apart patchen.
- Geen hardcoded UX-copy toevoegen in runtime/handler code; alle user-facing tekst via i18n keys/catalog.
- Zonder expliciet akkoord: geen implementatie.

Onderzoeksaanpak
1. Trace specialist output -> runtime helper -> turn renderer -> ui render.
2. Leg per laag vast welke regel wordt toegevoegd.
3. Definieer target UI-shape per contractstatus.
4. Maak testset voor entity confirm scenario's.
5. Verifieer hetzelfde compositiepad voor andere stappen en rapporteer gedeelde root-cause + generieke fixrichting.

Verplichte outputstructuur
A. Mensentaal probleemuitleg
B. Technisch bewijs (file/line)
C. Definitieve root-cause
D. Structureel fixplan
E. Beslisvoorstel

Stopconditie
- Stop na analyse + plan.
- Vraag expliciet akkoord voor implementatie.
```

### Oplossing / aanpassing (na akkoord)
Nog niet ingevuld. Wacht op expliciet akkoord voor implementatie.
