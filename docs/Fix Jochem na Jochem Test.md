# Fix Jochem na Jochem Test

## Fix 1 - Confirm-gating is semantisch inconsistent na refinement van bestaande output, zichtbaar in dream en mogelijk ook in andere stappen

### Input (zoals gemeld)
- Alles rond bedrijfscontext/state-continuity lijkt nu goed te werken.
- Het actuele probleem zit nu elders:
  - als de user feedback geeft op een bestaande droom, bijvoorbeeld:
    - `ik vind dit nog saai`
    - `dit is te vlak`
    - `maak dit inspirerender`
  - dan verschijnt wel een nieuwe/refined droomtekst,
  - maar de knop om door te gaan / te bevestigen ontbreekt.
- Daarnaast gaat recap ook fout:
  - als de user vraagt wat er besproken is,
  - dan verschijnt de droom soms 2 keer:
    - eerst als recap-item `DROOM`
    - en daarna nog eens als `JE HUIDIGE DROOM ...`
- Belangrijk:
  - de eerdere fixes voor state continuity, wording-choice exclusivity, canonical leakage, semantic cards en intro-video rendering mogen niet ongedaan worden gemaakt.
  - het enige actuele probleem dat nu onderzocht en opgelost moet worden is:
    - confirm-gating na refinement van bestaande output is semantisch inconsistent,
    - en recap van de droom rendert soms dubbel.

### Verwachting
- Als de user feedback geeft op bestaande output van een stap, moet de widget een semantisch bevestigbare refined versie kunnen tonen wanneer dat volgens het bestaande productgedrag hoort.
- Dit is in `dream` nu zichtbaar, maar de fix moet expliciet meenemen dat vergelijkbare confirm-gating ook bij andere accepted-output stappen kan spelen.
- Als er zichtbare, inhoudelijk geldige refined output is voor dezelfde stap, moet de gebruiker kunnen bevestigen en doorgaan wanneer dat volgens het bestaande productgedrag hoort.
- Een refine-turn op bestaande output mag niet eindigen in:
  - zichtbare nieuwe step-output
  - maar géén confirm/doorgaan-knop
- Als de user om een recap vraagt, mag de droom niet dubbel worden gerenderd:
  - niet eerst in recap-vorm
  - en daarna nog eens als current-value block
- Resume/recovery/lean payload paden mogen hier geen semantisch andere UI van maken.

### Waargenomen gedrag
- In `dream` verschijnt na refine-feedback soms netjes een herschreven droom.
- Tegelijk ontbreekt de button om door te gaan.
- Dit treedt aantoonbaar op wanneer de user de bestaande droom bekritiseert in wording-termen zoals:
  - `saai`
  - `vlak`
  - `maak dit krachtiger`
  - `herschrijf dit`
- In recap-turns wordt dezelfde droom soms dubbel getoond.
- Op basis van de huidige policy-architectuur is het plausibel dat hetzelfde confirm-gating patroon ook andere accepted-output stappen kan raken, zelfs als dat nog niet visueel gemeld is.

Gewenst structureel gedrag:
1. Feedback op bestaande step-output moet leiden tot een UI-state waarin refine-output en confirm-eligibility semantisch op elkaar aansluiten.
2. Deze invariant moet expliciet gecontroleerd worden voor alle stappen die afhankelijk zijn van accepted output / canonical bevestiging, niet alleen `dream`.
3. Een recap-turn mag nooit zowel de known-facts recap als een extra current-value append renderen voor exact dezelfde inhoud.
4. De server moet voor refine, confirm gating en recap rendering één consistente waarheid hanteren.
5. De fix mag eerdere continuity- of renderingfixes niet terugdraaien.

### Eerste analyse (grote lijnen, nog geen definitieve root-cause)

#### Hypothese A - Refinement van bestaande output wordt ten onrechte als niet-bijdragende output behandeld
- De pipeline detecteert wording-feedback op bestaande output.
- In `dream` is dit al aantoonbaar.
- Maar als hetzelfde accepted-output patroon ook in andere stappen gebruikt wordt, kan daar dezelfde mismatch bestaan.
- Als de confirm-gate alleen accepted output toestaat, kan zichtbare refined tekst bestaan zonder confirm-button.

#### Hypothese B - Current-value refine gebruikt andere acceptatieregels dan de specialist-instructie suggereert
- De specialist krijgt instructie om de huidige accepted wording te herschrijven.
- Maar de opslag/gating lijkt die herschreven tekst niet altijd als accepted refinement te behandelen.
- Daardoor ontstaat een semantische mismatch:
  - prompt-contract zegt: herschrijf bestaande accepted wording
  - UI-policy zegt: dit is nog niet bevestigbaar

#### Hypothese C - Recap-rendering en refined append draaien tegelijk
- De recap-policy kan een volledige known-facts recap bouwen.
- Daarna kan een tweede renderlaag alsnog `refined_formulation` of current value appenden.
- Als recap geen suppress-signaal zet, verschijnt dezelfde droom 2 keer.

#### Hypothese D - Het probleem zit primair server-side, niet client-side
- De continuity-fix heeft statebehoud al hersteld.
- De resterende symptomen passen beter bij:
  - intent-classificatie
  - provisional source semantiek
  - confirm gating
  - text finalization / dedupe
- Niet bij verloren lokale state alleen.

### Bewijspunten in code

- Feedback op de huidige droom wordt expliciet als `feedback_on_current_value` herkend:
  - `mcp-server/src/handlers/run_step_wording_heuristics.ts`
    - `resolveCurrentValueFeedbackIntent(...)`: regels rond 238-268
  - Voorbeelden zoals `saai`, `vlak`, `maak dit ...`, `dit is ...` vallen expliciet in dit pad.

- De pipeline zet zo'n dream-turn ook daadwerkelijk om naar `feedback_on_current_value`:
  - `mcp-server/src/handlers/run_step_pipeline.ts`
    - `shouldTreatTurnAsDreamCurrentValueFeedback(...)`: regels rond 154-173
    - intent override naar `feedback_on_current_value`: regels rond 505-517

- Diezelfde intent wordt daarna als niet-bijdragend behandeld en krijgt bron `system_generated`:
  - `mcp-server/src/handlers/run_step_pipeline.ts`
    - `isNonContributingWordingIntent(...)`: regels rond 78-85
    - `resolveProvisionalSourceForTurn(...)`: regels rond 97-104
    - toepassing op state mutation: regels rond 829-839
  - Gevolg:
    - de refined droom kan zichtbaar zijn,
    - maar semantisch niet als accepted provisional tellen.

- De confirm-gate accepteert alleen finals of provisional values met accepted source:
  - `mcp-server/src/core/turn_policy_renderer.ts`
    - accepted provisional-bronnen: regels rond 92-120
    - dream builder refine gating: regels rond 983-1018
    - confirm-acties worden weggefilterd als `confirmEligible=false`: regels rond 1281-1287
  - Gevolg:
    - zichtbare dream-output zonder accepted evidence leidt exact tot ontbrekende button.

- Dit accepted-output patroon is niet uniek voor `dream`, maar wordt ook gebruikt voor andere stappen:
  - `mcp-server/src/core/turn_policy_renderer.ts`
    - accepted-driven valid steps zoals `purpose`, `bigwhy`, `role`, `entity`, `targetgroup`, `presentation`: regels rond 1104-1122
  - Gevolg:
    - als dezelfde semantische mismatch ook buiten `dream` voorkomt, kunnen daar vergelijkbare confirm-problemen ontstaan.

- De specialist-contracttekst suggereert juist dat current-value feedback de huidige accepted wording moet herschrijven:
  - `mcp-server/src/handlers/run_step_runtime_state_helpers.ts`
    - `If intent is feedback_on_current_value with anchor current_value, rewrite the current accepted wording itself.`: regels rond 665-676
  - Gevolg:
    - er zit waarschijnlijk een semantische mismatch tussen specialist-contract en gating/acceptatie.

- Recap gebruikt known-facts rendering, maar recap krijgt geen expliciete suppressie tegen extra refined append:
  - `mcp-server/src/core/turn_policy_renderer.ts`
    - recap vervangt answerText via `buildKnownFactsRecap(state)`: regels rond 1415-1421
    - daarna wordt toch een message samengesteld die nog los staat van later finalize-append gedrag: regels rond 1423-1489
    - `__suppress_refined_append` wordt alleen conditioneel gezet voor single-value confirm SSOT: regels rond 1703-1711
  - `mcp-server/src/handlers/run_step_policy_meta.ts`
    - `metaTopic === "RECAP"` wordt vroeg teruggegeven zonder extra suppressie: regels rond 622-623
    - andere meta-paden zoals `BEN_PROFILE` zetten suppressie wél expliciet: regels rond 633-644
  - `mcp-server/src/handlers/run_step_runtime_finalize.ts`
    - refined append wordt alleen onderdrukt als `__suppress_refined_append` of specifieke uitzonderingen actief zijn: regels rond 313-316
    - refined/current-value append kan alsnog gebeuren: regels rond 649-705
  - Gevolg:
    - recap en current dream append kunnen naast elkaar verschijnen.

### Definitieve root-cause (hoog over)

Dit lijken twee nauw verwante server-side semantische defects te zijn, waarvan één waarschijnlijk generieker is dan alleen `dream`.

1. Refinement van bestaande accepted/current output wordt minstens in `dream` wel als rewrite-feedback herkend,
   maar vervolgens als niet-bijdragend / `system_generated` opgeslagen.
2. De confirm-gate vertrouwt alleen finals of accepted provisional evidence.
3. Daardoor kan de UI nieuwe step-output tonen terwijl de confirm/doorgaan-button toch verdwijnt.
4. In `dream` is daarnaast nog een extra recap/render-bug aanwezig.
5. Daardoor kan dezelfde droom eerst in `known facts recap` verschijnen en daarna nog eens via `refined_formulation` / current-value append.

Kort:
- het knopprobleem is waarschijnlijk een generiek acceptatie/gating-defect met `dream` als eerste zichtbare case,
- het dubbele droomprobleem is waarschijnlijk een dream-specifiek recap/finalize dedupe-defect,
- en beide zitten server-side in semantiek/rendercontract, niet primair in client continuity.

### Wat expliciet niet mag gebeuren tijdens de fix

- Draai eerdere continuity-fixes niet terug.
- Los dit niet op met een cosmetische frontend-only workaround.
- Maskeer het niet door de knop altijd blind te tonen.
- Verberg de dubbele droom niet alleen via CSS of presentation hacks.
- Verander `_meta.widget_result` of widget-state continuity niet opnieuw als afleidingsmanoeuvre.
- Behandel dit niet als puur prompt- of wordingprobleem; het zit waarschijnlijk in acceptatie- en rendersemantiek.

Expliciete randvoorwaarde:
- Neem als uitgangspunt dat de huidige state continuity-fix correct is en behouden moet blijven.
- Het enige probleem dat nu opgelost moet worden is:
  - confirm-gating na refinement van bestaande output is inconsistent,
  - en dream recap rendert soms dubbel.

### Mogelijke structurele fixes

1. Maak `feedback_on_current_value` semantisch bevestigbaar waar dat productmatig hoort
- Onderzoek of deze intent nog steeds `system_generated` mag blijven.
- Start met `dream`, maar audit expliciet ook andere accepted-output stappen.
- Als de specialist-contracttekst zegt dat de huidige accepted wording herschreven wordt, dan moet confirm-gating daarop aansluiten.
- Voorkom de mismatch:
  - zichtbare refined step-output
  - maar geen accepted evidence

2. Scheid recap-rendering expliciet van refined/current-value append
- Als een turn `wants_recap=true` / `RECAP_REQUEST` is, moet recap de autoritatieve body zijn.
- Dan mag een latere finalize-pass dezelfde droom niet nog eens toevoegen.
- Voeg een semantische suppress-regel toe, geen cosmetische dedupe-hack.

3. Verifieer of current-value refine dezelfde canonical waarheid gebruikt in alle paden
- Check:
  - current value feedback
  - wording picker accept/reject
  - action-route refine
  - explicit confirm
- Zorg dat deze paden niet elk een andere accepted-status hanteren voor dezelfde zichtbare step-output.

4. Audit andere confirm-gated stappen
- Controleer expliciet minstens:
  - `purpose`
  - `bigwhy`
  - `role`
  - `entity`
  - `targetgroup`
  - `presentation`
- Bepaal of het refine/accepted/gating defect daar ook kan optreden.
- Als het generiek is, fix het generiek.
- Als het alleen `dream` raakt, lever expliciet bewijs waarom.

5. Maak regressietests voor beide defecten
- Test expliciet:
  - refine-feedback op bestaande droom met woorden als `saai`, `vlak`, `maak dit...`
  - minstens één niet-dream single-value accepted-output step met vergelijkbare refine-flow
  - recap van droom zonder dubbele render
  - resumed/recovered turn met dezelfde semantiek

### Voorkeursrichting

Voorkeursrichting:
- onderzoek eerst de server-side semantische keten:
  - heuristiek
  - provisional source
  - accepted output gate
  - step-specific menu filtering
  - recap suppress/finalize append
- en fix daarna de kleinste structurele mismatch die:
  - het generieke confirm-probleem oplost waar nodig,
  - en de dream-specifieke recap-dubbeling oplost.

Waarom dit de beste richting is:
- verklaart waarom de continuity-fix niets aan deze bug veranderde,
- pakt de echte mismatch tussen zichtbare output en confirmability aan,
- voorkomt dat de fix te smal op `dream` wordt terwijl andere stappen dezelfde breuk kunnen hebben,
- en voorkomt dat recap/rendering later opnieuw dubbel gaat lopen.

Alternatief 1:
- confirm-button altijd tonen zodra er zichtbare step-tekst is
- nadeel:
  - omzeilt de accepted-output contractlaag
  - grote regressiekans in andere steps

Alternatief 2:
- recap alleen tekstueel “opschonen” in finalize
- nadeel:
  - kan symptoom 2 maskeren,
  - maar laat symptoom 1 intact

Alternatief 3:
- heuristiek voor `feedback_on_current_value` uitzetten
- nadeel:
  - kan wording-choice/refinegedrag beschadigen,
  - en lost het onderliggende semantische contract niet netjes op

### Agent instructie (copy-paste, diep onderzoek + implementatie)
```text
Context
Je implementeert een structurele fix voor een server-side semantische mismatch in de MCP-widget rond confirm-gating na refinement van bestaande output.

Observed bugs
- Als de user feedback geeft op een bestaande droomformulering, zoals:
  - "ik vind dit saai"
  - "dit is te vlak"
  - "maak dit inspirerender"
  verschijnt vaak wel een refined droom,
  maar ontbreekt de confirm/doorgaan-button.
- Als de user vraagt om een recap van wat besproken is, wordt de droom soms dubbel getoond:
  - één keer als recap-item
  - en nog eens als current-dream/refined block.
- Het is waarschijnlijk dat het confirm-gating probleem niet uniek is voor `dream`, maar ook andere accepted-output stappen kan raken.
- `dream` is de eerste zichtbare case; recap-dubbeling lijkt vooralsnog wel dream-specifiek.

Belangrijke randvoorwaarde
- Draai eerdere fixes NIET terug.
- Neem expliciet aan dat de bestaande fixes voor:
  - state continuity / business context retention
  - wording-choice exclusivity
  - canonical leakage
  - single-value semantic cards
  - intro-video rendering
  behouden moeten blijven.
- Het enige probleem dat nu opgelost moet worden is:
  - confirm-gating na refinement van bestaande output is inconsistent,
  - en dream recap rendert soms dubbel.

Doel van deze opdracht
1) Vind exact waarom refined bestaande output zichtbaar kan zijn zonder confirm/doorgaan-button.
2) Bepaal expliciet of dezelfde confirm-gating breuk ook kan optreden in andere accepted-output stappen.
3) Zorg dat refine-output en confirm-eligibility weer semantisch op elkaar aansluiten, eerst in `dream` en generiek waar nodig.
4) Zorg dat recap van de droom niet dubbel rendert.
5) Behoud alle eerdere fixes.

Harde regels
- Geen rollback van recente fixes als hoofdoplossing.
- Geen frontend-only cosmetische fix.
- Geen oplossing die de knop blind forceert zonder accepted-output contract.
- Geen pure prompt-workaround.
- Geen wijziging die state continuity opnieuw verzwakt of `_meta.widget_result` minder autoritatief maakt.
- Geen fix die alleen `dream`-tekst maskeert maar de onderliggende semantische mismatch laat bestaan.

Onderzoeksaanpak vóór implementatie
1. Trace current-dream feedback intent
- Onderzoek:
  - `run_step_wording_heuristics`
  - `run_step_pipeline`
- Bewijs exact:
  - welke userformuleringen in `feedback_on_current_value` vallen
  - hoe die intent in de pipeline wordt gezet
  - welke provisional source daaruit volgt

2. Trace accepted-output gating voor dream
- Onderzoek:
  - `turn_policy_renderer`
  - `run_step_state_update`
  - eventuele helpers voor accepted output / provisional source
- Leg exact vast:
  - wanneer dream in `builder_refine` confirmable is
  - waarom zichtbare refined output nu soms niet confirmable is
  - of `dream_final` ontbreekt, overschaduwd wordt, of semantisch niet meetelt

3. Audit andere accepted-output stappen
- Onderzoek:
  - `turn_policy_renderer`
  - step finals in `state`
  - relevante refine / wording / action-route paden
- Controleer expliciet minimaal:
  - `purpose`
  - `bigwhy`
  - `role`
  - `entity`
  - `targetgroup`
  - `presentation`
- Bewijs:
  - of current-value refinement daar dezelfde accepted/gating mismatch kan veroorzaken
  - of `dream` echt een uitzondering is

4. Vergelijk specialist-contract met runtime-semantiek
- Onderzoek:
  - `run_step_runtime_state_helpers`
  - dream/dream-explainer contracts
- Bewijs of er een mismatch is tussen:
  - "rewrite the current accepted wording itself"
  - en de uiteindelijke accepted/gating-logica

5. Trace recap-rendering end-to-end
- Onderzoek:
  - `turn_policy_renderer`
  - `run_step_policy_meta`
  - `run_step_runtime_finalize`
- Leg exact vast:
  - wanneer `buildKnownFactsRecap(state)` gebruikt wordt
  - of recap-turns `__suppress_refined_append` of equivalent krijgen
  - via welk pad de droom daarna nog eens wordt ge-append

6. Vergelijk fresh, resumed en recovered paden
- Start met een sessie waarin al een geldige droom bestaat.
- Doorloop:
  - directe refine-feedback op huidige droom
  - directe refine-feedback op minstens één andere accepted-output step
  - wording-pick pad
  - action-route refine pad
  - recap-vraag
  - resumed/recovered render
- Bewijs of het probleem overal hetzelfde root-cause pad heeft of meerdere varianten kent.

Definitieve invariants
- Als de server refined output toont als voortzetting van bestaande accepted step-output binnen dezelfde stapcontext, dan moeten refine-output en confirmability semantisch consistent zijn.
- Een `feedback_on_current_value`-pad mag geen zichtbare refined step-output opleveren die tegelijk als niet-bevestigbaar wordt behandeld, tenzij er een expliciete productregel bestaat en zichtbaar gedrag daarop is afgestemd.
- Een recap-turn mag voor dezelfde droominhoud niet zowel de known-facts recap als een extra current/refined append renderen.
- Een recap-turn moet één autoritatieve body hebben.

Implementatierichting
1. Harmoniseer current-value feedback met accepted-output contract
- Onderzoek of `feedback_on_current_value`:
  - een andere provisional source moet krijgen,
  - of anderszins accepted evidence moet opleveren,
  - of dat confirm-gating voor dit type refine-pad moet worden genormaliseerd.
- Start met `dream`, maar maak de oplossing generiek als dezelfde semantische breuk elders ook bestaat.
- Kies de kleinste structurele wijziging die overeenkomt met het bedoelde productgedrag.

2. Harden confirm gating voor refine op bestaande output
- Zorg dat `dream` in `builder_refine` niet langer kan eindigen in:
  - zichtbare refined canonical output
  - zonder confirm-button
  als die output semantisch een voortzetting van current accepted wording is.
- Pas dit ook toe op andere stappen als het onderzoek aantoont dat dezelfde accepted-output mismatch daar bestaat.

3. Maak recap exclusief
- Als `wants_recap=true` / `RECAP_REQUEST`, zorg dat recap de autoritatieve renderbody is.
- Voorkom dat `refined_formulation`, current value of gelijkwaardige dream-content daarna nogmaals wordt appended.
- Doe dit via semantische suppressie of één centrale renderregel, niet via broze string-hacks alleen.

4. Behoud bestaande gedragspaden
- Verifieer expliciet dat niet stukgaan:
  - wording-choice picker exclusivity
  - accepted single-value confirm rendering
  - dream-builder statements flow
  - intro-video rendering
  - state continuity / business context retention

Verplichte tests
1. Dream refine confirm regressietests
- Start met een bestaande geldige droom.
- Laat een userbericht binnenkomen zoals:
  - "ik vind dit saai"
  - "dit is te vlak"
  - "maak dit inspirerender"
- Verwacht:
  - refined dream zichtbaar
  - confirm/doorgaan beschikbaar wanneer de output semantisch de nieuwe current dream vormt
  - geen regressie in accepted-output invariants

2. Cross-step confirm-gating regressietests
- Kies minstens één niet-dream accepted-output step, bijvoorbeeld:
  - `purpose`
  - `role`
  - `entity`
- Simuleer refinement op bestaande output.
- Verwacht:
  - ofwel dezelfde correcte confirmability als productmatig bedoeld,
  - of expliciet bewijs dat de stap bewust anders hoort te werken.

3. Provisional source / gating tests
- Bewijs expliciet dat het chosen refine-pad:
  - niet meer onterecht tussen zichtbaar output en accepted gating valt
  - of expliciet correct genormaliseerd wordt voor confirmability

4. Recap regressietests
- Met een bekende droom:
  - vraag om recap / wat besproken is
- Verwacht:
  - droom slechts één keer zichtbaar
  - geen extra current-dream append na known-facts recap

5. Resume / recovery regressietests
- Laat dezelfde refine- en recap-situaties lopen via resumed/recovered renderpaden.
- Verwacht semantisch identiek gedrag aan een verse render.

6. Non-regression tests
- Verifieer dat bestaande tests rond:
  - dream builder statements dedupe
  - single-value confirm SSOT
  - wording heuristics
  - state continuity
  intact blijven of bewust geüpdatet worden met correcte motivatie.

Belangrijke reviewvragen tijdens implementatie
- Waarom wordt `feedback_on_current_value` nu als niet-bijdragend behandeld?
- Is dat voor dream nog steeds inhoudelijk correct?
- Is dat voor andere accepted-output stappen ook nog steeds inhoudelijk correct?
- Welke accepted-evidence definitie hoort productmatig te gelden na het herschrijven van bestaande accepted output?
- Geldt die definitie generiek voor vergelijkbare stappen?
- Waarom krijgt recap nu geen suppressie tegen refined append?
- Bestaat er nog een tweede pad naast `feedback_on_current_value` dat dezelfde knop-bug kan veroorzaken?
- Blijven eerdere fixes onaangetast?

Stopconditie
- Klaar pas als bewezen is dat:
  - refine-feedback op bestaande output niet meer leidt tot zichtbare refined output zonder confirm/doorgaan-button waar confirm productmatig hoort,
  - expliciet is onderzocht en afgedekt of dit ook andere accepted-output stappen raakt,
  - recap van de droom niet meer dubbel rendert,
  - eerdere fixes intact blijven,
  - en er expliciete regressietests zijn voor refine, recap en resumed/recovered paden.
```
