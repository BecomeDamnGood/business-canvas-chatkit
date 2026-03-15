# Fails 2.0

## Fix 1

### Incident
Na deploy `v364` verscheen in live op het eerste scherm van `step_0` de fout:

`dreamExerciseButtonLabelKeyForState is not defined`

Gevolg:
- de widget liet een rauwe runtime-fout zien aan de gebruiker
- de rest van het scherm renderde nog deels
- de regressie zat in de **gebundelde live widget**, niet in de serverlogica

### Kernconclusie
Dit was geen “moeilijke edge case”.

Dit was een **bundle/source drift bug**:
- de source-runtime kende een helper
- de bundled runtime riep die helper aan
- maar de bundled runtime definieerde die helper niet

Dus:
- build groen
- tests groen
- smoke groen
- live toch stuk

Niet omdat live anders “denkt”, maar omdat wij een **onvolledige bundle** hebben gedeployed.

### Hard bewijs

#### 1. De gebundelde live widget roept de helper aan
In:
- [mcp-server/ui/step-card.bundled.html](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/step-card.bundled.html#L5490)

staat:

```js
btnStartDreamExerciseEl.textContent = t(lang, dreamExerciseButtonLabelKeyForState(state));
```

#### 2. De helper bestaat wel in de source-runtime
In:
- [mcp-server/ui/lib/ui_render.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/lib/ui_render.ts#L156)

staat de definitie van:

`dreamExerciseButtonLabelKeyForState(...)`

#### 3. De helper bestaat niet in de bundle
Repo-brede zoekactie op `step-card.bundled.html` laat alleen de aanroep zien en geen definitie.

Dus:
- source: **wel definitie**
- bundle: **wel gebruik**
- bundle: **geen definitie**

Dat is de directe oorzaak van de live-fout.

### Hoe deze bug ontstaat

#### Stap 1. We veranderden source-runtime gedrag
Tijdens de metadata-/contract-cleanup is de source-renderer Dream button label-logica gaan gebruiken via:
- [mcp-server/ui/lib/ui_render.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/lib/ui_render.ts#L1835)

#### Stap 2. De bundle is deels handmatig parallel gehouden
De gebundelde widget heeft nog zijn eigen inline runtime in:
- [mcp-server/ui/step-card.bundled.html](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/step-card.bundled.html)

Daar is de aanroep toegevoegd, maar de helperfunctie zelf niet meegekomen.

#### Stap 3. Daardoor ontstaat een pure runtime ReferenceError
Op het moment dat het scherm de Dream exercise button label wil zetten:
- probeert de browser `dreamExerciseButtonLabelKeyForState(...)` uit te voeren
- die naam bestaat niet in de bundled scope
- de widget toont de fout direct in live

### Waarom dit structureel bleef kunnen gebeuren
De huidige build zet nog steeds een **los HTML-runtime-artefact** naar dist:

- [mcp-server/package.json](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/package.json#L7)
- [mcp-server/scripts/copy-ui-dist.mjs](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/scripts/copy-ui-dist.mjs#L9)

Dat betekent in de praktijk:
- `ui/lib/*.ts` is één runtimewereld
- `ui/step-card.bundled.html` is een tweede runtimewereld
- de deploy gebruikt uiteindelijk die tweede wereld als live widget-artefact

Zolang dat model blijft bestaan, is “synchroon houden” geen oplossing maar alleen onderhoudsschuld.

De fout zat dus niet primair in een ontbrekende check.
De fout zat in het feit dat we **twee uitvoerbare widget-runtimes** accepteren.

### Concrete instructie: rigide root fix

#### Doel
Er mag nog maar **één** widget-runtime bestaan.

Niet:
- één source-runtime plus één handmatig bijgehouden bundle-runtime
- één logica in TypeScript en nog eens dezelfde logica inline in HTML
- één plek waar helpers worden gedefinieerd en een tweede plek waar ze opnieuw “meegekopieerd” moeten worden

Wel:
- één source-runtime
- één build-output die daar mechanisch uit voortkomt
- één live artefact dat geen eigen logica meer bevat buiten die gegenereerde output

#### Harde instructie
Los dit op door de runtime in [mcp-server/ui/step-card.bundled.html](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/step-card.bundled.html) **niet langer als tweede codebase te behandelen**.

Dat betekent concreet:

1. Verwijder de inline widget-runtime uit `step-card.bundled.html` als onderhoudsbron.
De HTML mag alleen nog:
- shell markup bevatten
- styling bevatten als dat nodig is
- een verwijzing bevatten naar één gegenereerd runtime-script

2. Verplaats alle widgetlogica naar gewone source-bestanden onder `ui/lib/`.
Dus ook:
- helperfuncties
- label-resolvers
- stepperlogica
- section-titlelogica
- action dispatch
- wording-choice weergave
- Dream Builder button label logica

3. Maak de build verantwoordelijk voor het genereren van het live runtime-artefact.
Niet handmatig:
- knippen/plakken
- parallel aanpassen
- “bundled html ook nog even bijwerken”

Maar mechanisch:
- source in
- gegenereerd artefact uit

4. Verbied handmatige parallelle runtime-logica in `step-card.bundled.html`.
Dat bestand mag na de refactor geen tweede definities meer bevatten van:
- UI helpers
- state readers
- action resolvers
- step metadata maps
- Dream-specifieke helpers

5. Laat `copy-ui-dist.mjs` alleen nog build-output kopiëren.
Niet langer:
- een handgeschreven runtime-html als waarheid verspreiden

#### Wat expliciet niet mag
Om te voorkomen dat dezelfde fout vermomd terugkomt, zijn deze oplossingen nadrukkelijk niet toegestaan:

- geen fallback die bij ontbrekende helper alsnog iets anders probeert
- geen runtime `if function exists`-escape
- geen duplicaat-definitie “voor de zekerheid”
- geen extra sync-script dat twee werelden naast elkaar probeert gelijk te trekken
- geen slimme detectie die source en bundle vergelijkt maar beide laat bestaan
- geen nieuwe parallelle helperlaag speciaal voor Dream of een ander scherm

Dat zijn allemaal symptoombestrijders.
De root fix is alleen geldig als de tweede runtimewereld verdwijnt.

### Gewenste eindtoestand
Na de fix moet dit waar zijn:

1. Elke live widgetfunctie heeft precies één definitie in source.
2. `step-card.bundled.html` bevat geen zelfstandige businesslogica meer die ook elders leeft.
3. Een helper kan niet meer wel in source bestaan maar niet in live bundle, omdat de bundle uit diezelfde source wordt opgebouwd.
4. Een wijziging in `ui/lib/ui_render.ts` of een ander sourcebestand kan alleen live gaan via dezelfde gegenereerde runtime.

### Waarom dit rigide moet
Deze bug is precies het soort bug dat ontstaat wanneer een team denkt:
- “we hoeven alleen beter op te letten”
- “we voegen nog een check toe”
- “we houden beide lagen gewoon synchroon”

Dat werkt hier niet.

De aanwezigheid van twee runtimes **is zelf de bugbron**.
Dus de oplossing moet ook op dat niveau hard zijn:

- niet slimmer
- niet flexibeler
- niet toleranter
- maar simpeler

### Praktische opdrachtformulering
Als uitvoeropdracht moet dit zo gelezen worden:

> Hef de dubbele widget-runtime op. Maak `ui/lib/*` de enige bron van runtimegedrag. Bouw daaruit één live artefact op. Reduceer `step-card.bundled.html` tot shell plus gegenereerde assets. Laat geen enkele handmatig onderhouden runtime-logica dubbel bestaan tussen source en bundle.

Dat is de enige solide oplossing voor deze klasse regressies.

### Verplicht agentprotocol voor deze fix
Deze fix mag alleen uitgevoerd worden als de agent eerst en daarna opnieuw in detail bewijs verzamelt.

Vooraf verplicht:
1. Lees relevante eerdere fouten in [docs/fails.md](/Users/MinddMacBen/business-canvas-chatkit/docs/fails.md) zodat dezelfde foutklasse niet opnieuw wordt ingevoerd.
2. Leg het exacte symptoom vast:
- scherm
- stap
- knop of input
- zichtbare fout
- verwacht gedrag
3. Leg het exacte runtime-pad vast:
- UI-callsite
- action code of render-call
- source-callsite
- bundle-callsite
- serverpad als dat meedoet
4. Leg de exacte breuk vast met hard bewijs:
- definitie ontbreekt
- dubbele owner
- bron en bundle verschillen
- error-handler maakt het user-facing
5. Leg de fix-scope vast:
- welke bestanden wel
- welke bestanden expliciet niet

Achteraf verplicht:
1. Bewijs dat de oorspronkelijke breuk weg is op exact hetzelfde pad.
2. Bewijs dat de foutklasse niet meer terug kan komen door dezelfde oorzaak.
3. Bewijs dat de user-facing UX buiten scope niet veranderd is.
4. Vergelijk de functionaliteit achteraf expliciet met de **laatste versie op GitHub**.
Niet qua code, maar qua **wat de gebruiker ervaart**:
- zichtbare content
- knoppen
- labels
- flow
- feedback
- wording-choice
- recap/presentation-uitkomst
5. Die vergelijking moet op feiten rusten:
- concrete schermen
- concrete user-paden
- concrete zichtbare verschillen of gelijkheden
Niet op:
- aannames
- “zal wel hetzelfde zijn”
- alleen tests
6. Als de GitHub-versie en de bedoelde ervaring niet volledig samenvallen, of als er twijfel of discrepantie is, moet de agent **stoppen en de gebruiker een vraag stellen** in plaats van te gokken.
4. Voeg in [docs/fails.md](/Users/MinddMacBen/business-canvas-chatkit/docs/fails.md) kort toe:
- bug
- root cause
- fix
- bewijs vooraf
- bewijs achteraf

Verboden binnen dit protocol:
- geen aannames
- geen “tests zijn groen dus klaar”
- geen deploy zonder bewijs van het echte live pad
- geen scope-uitbreiding zonder nieuw bewijs
- geen nieuwe structuren
- geen nieuwe flows
- geen fallbacks
- geen extra lagen
- geen nieuwe “slimme” tussenoplossingen
- geen shit verzinnen buiten het bestaande contract/owner-model
- eenvoud afdwingen: `1 contract`, `1 owner`, en verder vereenvoudigen

## Fix 2

### Incident
In live verdween op het Dream-introscherm de inhoudelijke uitleg en bleef alleen de foutregel plus een half opgebouwd scherm over.

Zichtbaar gevolg:
- de uitleg boven de prompt viel weg
- de foutregel `dreamExerciseButtonLabelKeyForState is not defined` kwam in de kaart zelf terecht
- de rest van het scherm bleef deels staan, waardoor het leek alsof content “verdwenen” was

### Kernconclusie
Dit was niet alleen “een knoplabel dat stuk is”.

De render **crasht halverwege** en daarom blijft de UI in een half geüpdatete toestand hangen:
- een deel van het scherm is al leeggemaakt of opnieuw opgebouwd
- daarna gooit de bundle een `ReferenceError`
- de dev-error handler schrijft die fout weer zichtbaar in de interface

Dus de gebruiker ziet niet een nette foutpagina, maar een half scherm met verdwenen inhoud.

### Hard bewijs

#### 1. De bundle rendert eerst gewoon delen van de UI
In:
- [mcp-server/ui/step-card.bundled.html](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/step-card.bundled.html#L4878)

begint `render(...)` normaal met:
- state lezen
- stepper bouwen
- section title zetten
- prompt/body/choice-layout opbouwen

#### 2. De crash gebeurt pas later in dezelfde render
In:
- [mcp-server/ui/step-card.bundled.html](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/step-card.bundled.html#L5490)

wordt alsnog dit uitgevoerd:

```js
btnStartDreamExerciseEl.textContent = t(lang, dreamExerciseButtonLabelKeyForState(state));
```

Omdat die functie in de bundle niet bestaat, stopt de render daar met een `ReferenceError`.

#### 3. De fout wordt daarna expres zichtbaar in de UI geschreven
In:
- [mcp-server/ui/step-card.bundled.html](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/step-card.bundled.html#L5668)

hangt de bundle een globale `window.addEventListener("error", ...)` handler op.

Die handler doet:
- `console.error(...)`
- en daarna `reportDevError(...)`

Die `reportDevError(...)` schrijft de fouttekst naar:
- `status`
- of `uiSubtitle`

Dus de foutregel die de gebruiker ziet is geen losse browserconsole-melding, maar een **bewust in de kaart teruggeschreven runtime-fout**.

### Hoe deze bug ontstaat

#### Stap 1. De render voert destructieve UI-updates uit vóór alle dependencies bewezen zijn
De renderfunctie zet eerst al delen van de interface:
- stepper
- badge
- section title
- prompt
- choice-layout

Dat gebeurt vóór de Dream button label-call.

#### Stap 2. Daarna raakt de render een ontbrekende helper
Pas later wordt `dreamExerciseButtonLabelKeyForState(...)` aangeroepen.

Dus:
- de render is al halverwege
- de DOM is al deels aangepast
- daarna klapt hij eruit

#### Stap 3. De error handler zet de crash als zichtbare tekst terug in de kaart
Daardoor ziet de gebruiker:
- verdwenen normale content
- plus de rauwe foutmelding in het scherm

Dat is precies waarom dit voelt als “alle content is verdwenen”.

### Echte oplossing
De oplossing is niet:
- extra `try/catch` om de kapotte helper heen
- een fallback label
- een guard als “als de functie bestaat”

De oplossing is:
- de dubbele runtime opheffen
- en daarmee voorkomen dat de bundle ooit nog een helper aanroept die daar niet bestaat

Zolang source en bundle twee uitvoerbare runtimewerelden blijven, kan dit patroon altijd terugkomen:
- halve render
- runtime crash
- rauwe fout zichtbaar in de UI

### Praktische opdrachtformulering
Lees deze bug daarom als uitbreiding van Fix 1:

> Niet alleen de ontbrekende helper moet verdwijnen als foutklasse, maar ook het hele patroon waarbij de live bundle halverwege een render kan crashen door bron/bundle drift. De enige solide oplossing blijft: één runtime-owner in source en een mechanisch gegenereerde live bundle zonder parallel onderhouden renderlogica.

### Verplicht agentprotocol voor deze fix
Deze fix mag alleen uitgevoerd worden als de agent eerst en daarna opnieuw in detail bewijs verzamelt.

Vooraf verplicht:
1. Lees relevante eerdere fouten in [docs/fails.md](/Users/MinddMacBen/business-canvas-chatkit/docs/fails.md), in het bijzonder eerdere half-render, double-owner en bundle/source regressies.
2. Leg het exacte zichtbare symptoom vast:
- welke content ontbreekt
- welke foutregel zichtbaar wordt
- welk scherm half blijft staan
3. Leg het exacte renderpad vast:
- begin van render
- DOM-updates vóór de crash
- crash-callsite
- globale error-handler die de fouttekst terugschrijft
4. Leg het exacte verschil vast tussen werkende baseline en kapotte toestand.
5. Leg de fix-scope vast:
- alleen de echte oorzaak
- geen bredere UX-herbouw

Achteraf verplicht:
1. Bewijs dat de render niet meer halverwege crasht op dit pad.
2. Bewijs dat de fouttekst niet meer user-facing in de kaart verschijnt.
3. Bewijs dat de oorspronkelijke content weer zichtbaar is.
4. Vergelijk de functionaliteit achteraf expliciet met de **laatste versie op GitHub**.
Niet qua code, maar qua **wat de gebruiker ziet en doet** op dit scherm:
- inhoud
- volgorde
- knoppen
- labels
- zichtbare foutmeldingen
- interactiepad
5. Die vergelijking moet op feiten rusten:
- concrete schermen
- concrete user-paden
- concrete zichtbare verschillen of gelijkheden
Niet op aannames of alleen tests.
6. Als de GitHub-versie en de bedoelde ervaring niet volledig samenvallen, of als er twijfel of discrepantie is, moet de agent **stoppen en de gebruiker een vraag stellen** in plaats van te gokken.
4. Voeg in [docs/fails.md](/Users/MinddMacBen/business-canvas-chatkit/docs/fails.md) kort toe:
- bug
- root cause
- fix
- bewijs vooraf
- bewijs achteraf

Verboden binnen dit protocol:
- geen guard als eindoplossing
- geen fallback label
- geen try/catch die de echte oorzaak maskeert
- geen aanname dat source en bundle wel gelijk zullen zijn
- geen nieuwe structuren
- geen nieuwe flows
- geen fallbacks
- geen extra lagen
- geen nieuwe “slimme” tussenoplossingen
- geen shit verzinnen buiten het bestaande contract/owner-model
- eenvoud afdwingen: `1 contract`, `1 owner`, en verder vereenvoudigen

## Fix 3

### Doel
Herstel de **gebruikerservaring van alle 11 stappen** naar de laatste werkende baseline, terwijl alleen de pure metadata-centralisatie mag blijven bestaan.

De waarheid voor gedrag is:
- de toestand **vóór** commit `dd14792`

De waarheid voor wat wel mag blijven is alleen:
- centrale step metadata voor `order`, `titles`, `stepper labels` en `section titles`

Alles wat in die brede wijziging daarnaast per ongeluk user-facing gedrag heeft veranderd, moet eruit.

### Waarom Fix 3 nodig is
De fout was niet alleen dat één helper ontbrak.

De grotere fout was dat een wijziging met als doel:
- step metadata centraliseren

tegelijk óók dingen heeft geraakt die daar niet bij hoorden:
- UI-contract gedrag
- wording gedrag
- button gedrag
- rendergedrag
- bundle-runtime gedrag
- feedback-semantiek

Hard bewijs:
- commit `dd14792` heet `Centralize step metadata and contract UI`
- maar raakt **34 files**
- met **1450 insertions** en **492 deletions**
- en raakt niet alleen metadata-bestanden, maar ook:
  - [mcp-server/src/handlers/turn_contract.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/turn_contract.ts)
  - [mcp-server/src/handlers/run_step_wording.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/run_step_wording.ts)
  - [mcp-server/src/core/turn_policy_renderer.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/core/turn_policy_renderer.ts)
  - [mcp-server/ui/lib/ui_render.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/lib/ui_render.ts)
  - [mcp-server/ui/step-card.bundled.html](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/step-card.bundled.html)

Dus:
- de wijziging was aantoonbaar te breed
- en daardoor is het niet geloofwaardig om te doen alsof alleen metadata veranderd is

### Harde instructie
Gebruik `dd14792^` als **UX-baseline** en herstel over alle stappen exact dat gedrag terug.

Niet:
- “waarschijnlijk was dit bedoeld”
- “dit is schoner”
- “dit is logischer”
- “dit kunnen we meteen verbeteren”

Wel:
- wat de gebruiker zag en kon doen vóór `dd14792`, is de waarheid

### Scope van wat mag blijven
Alleen deze metadata-centralisatie mag overblijven:
- `orderIndex`
- `titleKey`
- `stepperLabelKey`
- `sectionTitleKey`
- `sectionTitleWithBusinessKey`
- `sectionTitleWithoutBusinessKey`

Dus alleen:
- volgorde
- stepper label
- section title
- generieke staptitel

### Scope van wat expliciet terug moet naar baseline
Als een wijziging uit `dd14792` user-facing gedrag buiten metadata heeft beïnvloed, moet die terug.

Dat geldt voor:
- wording gedrag
- feedback gedrag
- button gedrag
- contract filtering
- action selection
- Dream-flow
- choice rendering
- raw error rendering
- bundle/source gedragsverschillen

### Verdachte bestanden die terug naar baseline moeten behalve metadata-hunks
Deze bestanden mogen alleen metadata-gerelateerde wijzigingen houden. Alle andere user-facing semantiek moet terug naar `dd14792^`.

- [mcp-server/src/handlers/turn_contract.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/turn_contract.ts)
- [mcp-server/src/handlers/run_step_wording.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/run_step_wording.ts)
- [mcp-server/src/core/turn_policy_renderer.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/core/turn_policy_renderer.ts)
- [mcp-server/ui/lib/ui_render.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/lib/ui_render.ts)
- [mcp-server/ui/step-card.bundled.html](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/step-card.bundled.html)
- [mcp-server/ui/lib/ui_actions.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/lib/ui_actions.ts)
- [mcp-server/src/handlers/run_step_runtime_finalize.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/run_step_runtime_finalize.ts)
- [mcp-server/src/core/actioncode_registry.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/core/actioncode_registry.ts)

### Bestanden die wél in scope zijn voor de metadata-migratie
Deze bestanden zijn de juiste plek voor de echte wijziging:

- [mcp-server/src/steps/step_registry.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/steps/step_registry.ts)
- [mcp-server/ui/lib/ui_constants.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/lib/ui_constants.ts)
- `title.*` regels in de i18n-locales
- server-side heading helpers die alleen titles en section titles afleiden

### Verplichte vergelijking over alle 11 stappen
Per stap moet de user-ervaring worden vergeleken met `dd14792^` op:
- intro-scherm
- eerste interactieve scherm
- wording-choice scherm
- feedback scherm
- knoppen
- bullets en body
- stepper label
- badge gedrag
- section title
- recap heading
- presentation heading

De stappen zijn:
- `step_0`
- `dream`
- `purpose`
- `bigwhy`
- `role`
- `entity`
- `strategy`
- `targetgroup`
- `productsservices`
- `rulesofthegame`
- `presentation`

### Definition of done
Fix 3 is pas klaar als dit tegelijk waar is:

1. Alle 11 stappen gedragen zich voor de gebruiker weer zoals in `dd14792^`.
2. Alleen metadata-owner centralisatie is overgebleven.
3. Geen wording-, feedback-, button- of contractsemantiek is “stiekem mee verbeterd”.
4. Geen raw runtime error verschijnt in de kaart.
5. Source en bundle vertonen voor deze schermen geen afwijkend gedrag meer.

### Verboden
- geen nieuwe architectuur
- geen nieuwe slimme helperlaag
- geen extra fallbackgedrag
- geen verbreding naar wording, actions, contracts of Dream-flow
- geen “we verbeteren dit meteen even mee”

### Praktische opdrachtformulering
Lees Fix 3 als:

> Gebruik `dd14792^` als baseline voor de volledige gebruikerservaring van alle 11 stappen. Behoud alleen de metadata-centralisatie. Draai alle overige user-facing gedragswijzigingen uit `dd14792` terug naar baseline. Voeg niets nieuws toe.

### Verplicht agentprotocol voor deze fix
Deze fix mag alleen uitgevoerd worden als de agent eerst en daarna opnieuw in detail bewijs verzamelt.

Vooraf verplicht:
1. Lees relevante eerdere fouten in [docs/fails.md](/Users/MinddMacBen/business-canvas-chatkit/docs/fails.md), vooral alle regressies waarin één fix andere schermen of stappen kapot maakte.
2. Leg `dd14792^` vast als UX-baseline en `dd14792` als first-bad brede commit.
3. Maak per stap een vergelijking voor:
- intro
- eerste interactie
- wording-choice
- feedback
- knoppen
- bullets/body
- stepper
- badge
- section title
- recap/presentation heading
4. Leg per afwijking vast:
- in welk bestand de afwijking is ingevoerd
- of die afwijking metadata is of niet
- of die dus mag blijven of terug moet
5. Leg de fix-scope vast:
- alleen metadata-centralisatie mag blijven
- alle overige user-facing gedragswijzigingen moeten terug

Achteraf verplicht:
1. Bewijs per stap dat de UX weer gelijk is aan `dd14792^`.
2. Bewijs dat alleen metadata-centralisatie is overgebleven.
3. Bewijs dat geen wording-, feedback-, button- of contractsemantiek ongemerkt is mee veranderd.
4. Vergelijk de functionaliteit achteraf expliciet met de **laatste versie op GitHub**.
Niet qua code, maar qua **wat de gebruiker ervaart**:
- schermopbouw
- labels
- knoppen
- feedback
- wording-choice
- recap/presentation
- flow door de stappen
5. Die vergelijking moet op feiten rusten:
- concrete schermen
- concrete user-paden
- concrete zichtbare verschillen of gelijkheden
Niet op aannames of alleen tests.
6. Als de GitHub-versie en de bedoelde ervaring niet volledig samenvallen, of als er twijfel of discrepantie is, moet de agent **stoppen en de gebruiker een vraag stellen** in plaats van te gokken.
4. Voeg in [docs/fails.md](/Users/MinddMacBen/business-canvas-chatkit/docs/fails.md) kort toe:
- bug
- root cause
- fix
- bewijs vooraf
- bewijs achteraf

Verboden binnen dit protocol:
- geen aannames over “bedoeld gedrag”
- geen fix op basis van alleen tests
- geen verbreding naar wording, actions, contracts of Dream-flow
- geen “we verbeteren dit meteen even mee”
- geen nieuwe structuren
- geen nieuwe flows
- geen fallbacks
- geen extra lagen
- geen nieuwe “slimme” tussenoplossingen
- geen shit verzinnen buiten het bestaande contract/owner-model
- eenvoud afdwingen: `1 contract`, `1 owner`, en verder vereenvoudigen
