# Fix 1 - Products/Services wording-choice rendert retained context verkeerd en kapt gekozen/geracapte items stuk

## Probleem in mensentaal
- In de stap `Producten en Diensten` verschijnt bij een actieve wording-choice een retained-contextblok als rare doorlopende zin, terwijl die inhoud feitelijk uit meerdere bullets bestaat.
- De instructie `Kies de versie die het beste past bij het resterende verschil.` staat daardoor ook visueel op de verkeerde plek en voelt niet als onderdeel van de twee keuzevakken.
- Als de gebruiker daarna op `your suggestion` klikt, verlaat de flow direct de picker en komt terug in de normale step-weergave.
- Vervolgens worden gekozen of later gerecapte products/services-items kapot opgeknipt op komma's, waardoor bijvoorbeeld:
  - `Traditionele communicatiediensten (zoals DTP, posters, campagnes)`
  - eindigt als losse bullets:
    - `Traditionele communicatiediensten (zoals DTP`
    - `posters`
    - `campagnes)`

## Scopegrens
- Deze fix gaat over:
  - wording-choice rendering in `productsservices`
  - weergave van retained context en keuze-instructie
  - parsing van gekozen en gerecapte products/services-items
- Deze fix gaat niet over:
  - de Strategy overlap-fix
  - Dream Builder copy
  - algemene recap-logica van andere stappen tenzij nodig voor `productsservices`

## Concrete observaties uit de screenshots
### Screenshot 1
- `Dit is wat je volgens jouw input aanbiedt aan je klanten:` is inhoudelijk plausibel als heading.
- De retained-context verschijnt daarna als één lopend tekstblok:
  - `Deze punten blijven al in de definitieve lijst: · Strategisch bedrijfs- en communicatieadvies · ...`
- Dat is semantisch en visueel fout:
  - retained items zijn lijst-items
  - de keuze-instructie hoort duidelijk leesbaar onder de compare-cards te staan

### Screenshot 2
- Na klik op `your suggestion` verdwijnt de wording-choice direct.
- De UI springt terug naar de standaard step-vraag:
  - `Verfijn je producten en diensten voor Mindd of kies een optie.`
- Daarna blijkt bij recap dat items inhoudelijk zijn opgebroken op komma's.

## Codebewijs
### 1. De server bouwt retained context al als meerregelige bullettekst op
- In `mcp-server/src/handlers/run_step_wording.ts` bouwt `groupedListInstructionForState(...)` de instruction op als:
  - retained heading
  - `•`-regels per retained item
  - daarna pas de keuze-instructie
- Dat betekent: de brondata is al lijstvormig en niet bedoeld als één platte zin.

### 2. De widget rendert die instruction als één platte tekstnode
- In `mcp-server/ui/lib/ui_render.ts` wordt de wording-choice instruction gezet via:
  - `instructionEl.textContent = instruction`
- In `mcp-server/ui/step-card.bundled.html` heeft `.wordingChoiceInstruction` geen whitespace-regel zoals `pre-wrap` of `pre-line`.
- Gevolg:
  - newlines uit de instruction collapsen visueel
  - bulletregels komen plat achter elkaar te staan

### 3. De wording-choice heeft maar één gedeeld instructionblok
- In de wording-choice DOM bestaat één `#wordingChoiceInstruction`.
- Daardoor kan de keuzezin nu niet netjes als kaartspecifieke helper onder `your input / my suggestion` landen.
- De huidige layout is dus structureel niet goed genoeg voor de bedoelde presentatie.

### 4. Na klik op suggestion wordt de picker bewust afgesloten
- In `mcp-server/src/handlers/run_step_wording.ts` zet `applyWordingPickSelection(...)`:
  - `wording_choice_pending = "false"`
  - `wording_choice_selected = "suggestion"`
- Daarna wordt direct opnieuw de normale turn-render uitgevoerd.
- Daarom zie je na de klik niet nog een compare-scherm, maar meteen weer de standaard step-weergave.

### 5. Products/services-items worden onterecht op komma's gesplitst
- In `mcp-server/src/core/turn_policy_renderer.ts` splitst `productsServicesItemsFromRecap(...)` op:
  - `;`
  - newline
  - `,`
- In `mcp-server/src/handlers/run_step_runtime_state_helpers.ts` splitst `productsServicesItemsFromValue(...)` ook op:
  - `;`
  - newline
  - `,`
- Daardoor worden legitieme offerings met komma's intern behandeld als meerdere losse items.

## Definitieve invariant
- In `productsservices` moet retained context in wording-choice altijd als echte lijst renderen, niet als lopende tekst.
- De keuze-instructie moet leesbaar en duidelijk gepositioneerd zijn als instruction van de compare-state.
- Na het kiezen van `your suggestion` mag de picker sluiten, maar de gekozen products/services-waarde moet inhoudelijk intact blijven.
- Een enkel product/service-item met interne komma's mag nooit opgesplitst worden in meerdere bullets enkel vanwege die komma's.
- Recap, current-value headings, selection messages en confirm-state moeten voor `productsservices` dezelfde itemgrenzen respecteren.

## Enige juiste oplossing
1. Herstel de wording-choice instruction-render voor `productsservices`
- Render retained context niet als platte `textContent` zonder newline-preservatie.
- Zorg dat bulletregels visueel als bulletregels verschijnen.
- De keuze-instructie moet onder de compare-cards leesbaar blijven staan.

2. Maak de wording-choice layout semantisch expliciet
- Toon retained items als apart lijstblok.
- Houd `your input` en `my suggestion` beperkt tot de compare-vakken.
- Voorkom dat retained context en keuzezin samen één onleesbare lopende alinea vormen.

3. Laat suggestion-pick de picker nog steeds afsluiten, maar zonder inhoudsverlies
- Het sluiten van de picker na selectie mag blijven.
- Maar de geselecteerde `productsservices`-waarde moet daarna exact behouden blijven als gekozen lijst.

4. Verwijder komma-splitting als generieke list-boundary voor `productsservices`
- Gebruik voor `productsservices` alleen veilige itemgrenzen zoals:
  - expliciete bullets
  - echte newlines
  - eventueel expliciete `;`
- Splits niet blind op `,`, omdat komma's binnen één aanbod normaal en betekenisdragend zijn.

5. Trek diezelfde grens door in alle relevante lagen
- wording selection message
- current-value heading rendering
- recap parsing
- confirm/valid-output rendering

## Waarom dit de juiste oplossing is
- Dit volgt de echte products/services-semantiek:
  - één aanbod kan intern komma's bevatten zonder meerdere losse aanbiedingen te zijn.
- Dit verklaart en verhelpt beide zichtbare bugs:
  - screenshot 1: platte retained-context/instruction-render
  - screenshot 2 + recap: kapot gesplitste items na selection/recap
- Dit voorkomt dat de compare-flow technisch werkt maar productmatig verkeerde tekst en verkeerde itemgrenzen toont.

## Acceptatiecriteria
1. In een actieve `productsservices` wording-choice worden retained items als lijst getoond, niet als één lopende zin.
2. De keuze-instructie blijft leesbaar onder de compare-state en wordt niet visueel samengeperst met retained items.
3. Na klik op `your suggestion` sluit de picker, maar de gekozen waarde blijft inhoudelijk exact behouden.
4. Een item zoals:
   - `Traditionele communicatiediensten (zoals DTP, posters, campagnes)`
   blijft overal één item:
   - in selection message
   - in current-value weergave
   - in recap
   - in confirm-state
5. `productsservices` splitst niet meer blind op komma's bij recap/value parsing.
6. Regressietests bewijzen minimaal:
   - wording-choice instruction voor retained items rendert als meerregelige lijst
   - suggestion-pick voor `productsservices` commit geen kapotgesplitste lijst
   - recap van `productsservices` bewaart items met interne komma's als één bullet

## Harde regels
- Geen cosmetische fix alleen in CSS terwijl de parser nog komma's als itemgrens behandelt.
- Geen fix die de picker-instruction verstopt maar retained context semantisch onduidelijk laat.
- Geen generieke list-parserwijziging die andere stappen onbedoeld breekt zonder gerichte dekking.
- Als een `productsservices`-item interne komma's bevat, moet dat item intact blijven.
