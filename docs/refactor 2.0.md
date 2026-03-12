# Refactor 2.0

## Doel

Dit document beschrijft een concrete refactorrichting voor de `business-canvas-chatkit` codebase, zonder directe implementatie. Het doel is om het toevoegen, wijzigen en onderhouden van stappen zoals `purpose`, `strategy`, `rulesofthegame` en een mogelijke toekomstige stap zoals `attitude` veel goedkoper, veiliger en voorspelbaarder te maken.

De kern van het probleem vandaag:

- stapkennis leeft op veel verschillende plekken tegelijk
- de live runtime is modulair, maar nog niet echt stap-gedreven vanuit een enkele bron
- sommige regels zijn generiek, andere zijn impliciet hardcoded per stap
- presentatie-export, wording-choice, meta-routing en i18n hangen allemaal aan vaste stapsets
- de source-frontend en de gebundelde frontend moeten synchroon blijven

Refactor 2.0 stelt voor om dit te vervangen door een echte **step registry architecture** met declaratieve stap-capabilities en een duidelijk onderscheid tussen:

- stapdefinitie
- specialist-uitvoering
- state/final-mutatie
- UI-rendering
- export/recap
- vertaling

Dit voorstel is bewust pragmatisch: het wil de huidige architectuur niet in één keer vervangen, maar een migratiepad bieden dat compatibel blijft met de bestaande runtime.

---

## Huidige problemen

### 1. Stapdefinitie is verspreid

Vandaag moet een stap op meerdere plaatsen worden toegevoegd of bijgewerkt:

- canonieke stapset: [state.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/core/state.ts)
- final field map: [state.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/core/state.ts)
- UI-volgorde: [ui_constants.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/lib/ui_constants.ts)
- specialist dispatch: [specialist_dispatch.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/specialist_dispatch.ts)
- state update wiring: [run_step_state_update_defaults.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/run_step_state_update_defaults.ts)
- wording heuristics field mapping: [run_step_wording_heuristics_defaults.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/run_step_wording_heuristics_defaults.ts)
- meta-step labels en motivatie: [run_step_policy_meta.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/run_step_policy_meta.ts)
- recap/presentation secties: [run_step_presentation_recap.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/run_step_presentation_recap.ts)
- UI stepper/rendering: [ui_render.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/lib/ui_render.ts)
- gebundelde frontend: [step-card.bundled.html](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/step-card.bundled.html)

Gevolg:

- hoge foutkans bij uitbreidingen
- regressies ontstaan makkelijk door één vergeten plek
- developers moeten de architectuur in hun hoofd reconstrueren

### 2. Niet alle stapregels zijn declaratief

Vandaag zijn meerdere runtime-keuzes hardcoded met stapnamen:

- bullet-consistency geldt alleen voor `strategy`, `productsservices`, `rulesofthegame`
- bepaalde wording-choice paden zijn stap-specifiek
- meta/offtopic labels zijn stap-specifiek
- recap/export hanteert een vaste staplijst

Gevolg:

- een nieuwe stap kan inhoudelijk lijken op een bestaande stap, maar krijgt niet automatisch hetzelfde gedrag
- stapgedrag is moeilijk af te leiden uit één bron

### 3. Vertalingen bevatten hardcoded stapnummers

Locale-bestanden bevatten strings zoals:

- `Step 7: Strategy`
- `Stap 10: Spelregels`
- `Étape 11 : Présentation`

Gevolg:

- een nieuwe stap in het midden betekent een vertaalmigratie in alle talen
- ook ongewijzigde stappen moeten aangepast worden
- vertalingen zijn structureel gekoppeld aan flowvolgorde

### 4. Source UI en bundled UI kunnen uit sync raken

De widget wordt live geladen uit:

- [run_step_transport.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/server/run_step_transport.ts)
- [step-card.bundled.html](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/step-card.bundled.html)

Maar de logica wordt ook onderhouden in:

- [ui_render.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/lib/ui_render.ts)
- [ui_constants.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/lib/ui_constants.ts)

Gevolg:

- developers moeten dubbel nadenken
- source-wijziging is niet automatisch live-wijziging

### 5. Oude en nieuwe flowarchitectuur bestaan naast elkaar

Er is nog een oudere flow in:

- [agents.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/agents.ts)

Terwijl de live app draait via:

- [run_step.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/run_step.ts)
- [run_step_runtime.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/run_step_runtime.ts)

Gevolg:

- analyse is duurder
- refactors zijn risicovoller
- nieuwe developers kunnen makkelijk in het verkeerde pad investeren

---

## Gewenste eindtoestand

### Kernprincipe

Elke stap wordt één keer beschreven in een centrale registry. Alle andere systemen lezen hun gedrag daaruit af.

### Gewenste architectuurlagen

#### 1. Step Registry

Een centrale bron per stap met onder meer:

- `stepId`
- `orderIndex`
- `titleKey`
- `sectionTitleKey`
- `finalField`
- `provisionalField`
- `specialistId`
- `schemaName`
- `schemaKind`
- `stepKind`
- `listSemantics`
- `supportsWordingChoice`
- `supportsMetaRedirect`
- `includeInPresentation`
- `includeInProgressStepper`
- `hasIntroVideo`
- `uiPresentationMode`
- `previousStepId`
- `nextStepId`

#### 2. Specialist Layer

Een laag die op basis van registry-config weet:

- welke specialist aangeroepen wordt
- welke input builder gebruikt wordt
- welk schema gevalideerd wordt
- welke runtime normalizers van toepassing zijn

#### 3. State Layer

Een laag die uit de registry haalt:

- welk provisional veld bij de stap hoort
- welk final veld bij de stap hoort
- of de stap lijstsemantiek heeft
- of er canonicalization nodig is

#### 4. UI Layer

Een laag die uit de registry haalt:

- welke stappen in de stepper komen
- wat hun label/key is
- of een stap een single-value kaart is of een lijststap
- of een stap een preview/export-paneel heeft

#### 5. Export/Recap Layer

Een laag die presentatie en recap opbouwt uit registry-config in plaats van een vaste lijst.

#### 6. Translation Layer

Een laag waarin stapnamen en sectietitels vertaald worden, maar niet de volgordenummers.

---

## Concreet ontwerp

## A. Nieuwe centrale step registry

### Voorstel

Introduceer een nieuw domeinbestand, bijvoorbeeld:

- `mcp-server/src/steps/step_registry.ts`

Met daarin per stap één registry-record.

### Minimale registry-shape

Elke stap zou minimaal dit moeten beschrijven:

```text
stepId
order
active
titleKey
sectionTitleOfKey
sectionTitleOfFutureKey
finalField
specialistId
schemaId
stepKind
listSemantics
wordingChoiceMode
includeInPresentation
includeInStepper
offtopicLabelKey
motivationMissingPiece
```

### Belangrijke velden

#### `stepKind`

Mogelijke waarden:

- `bootstrap`
- `single_value`
- `list_value`
- `presentation`
- `special_flow`

Hiermee kan de runtime generiek beslissen:

- hoe te renderen
- welke wording-choice regels passend zijn
- of list consistency checks nodig zijn

#### `listSemantics`

Mogelijke waarden:

- `none`
- `unordered`
- `ordered`
- `grouped_compare`

Dit vervangt hardcoded stapsets zoals:

- `strategy`
- `productsservices`
- `rulesofthegame`

in runtime-finalize en UI.

#### `includeInPresentation`

Boolean of struct met:

- `true` als de stap in recap/PPT thuishoort
- eventueel extra presentatieconfig zoals:
  - `labelKey`
  - `forceList`

Hiermee kan [run_step_presentation_recap.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/run_step_presentation_recap.ts) dynamisch worden opgebouwd.

#### `offtopicLabelKey` en `motivationMissingPiece`

Deze verplaatsen stap-specifieke meta/motivatiekennis uit:

- [run_step_policy_meta.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/run_step_policy_meta.ts)

naar de registry.

### Verwachte winst

- stap toevoegen op één centrale plek
- veel minder risico op vergeten wiring
- duidelijker diff bij stapwijzigingen

---

## B. Specialist binding uit de registry halen

### Huidige situatie

[specialist_dispatch.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/specialist_dispatch.ts) bevat grote expliciete if-ketens per specialist.

Dat is verdedigbaar voor echt unieke flows, maar te duur voor standaard stappen.

### Voorstel

Splits specialist-logica in twee categorieën:

#### 1. Custom steps

Blijven expliciet:

- `step_0`
- `dream`
- eventueel andere sterk afwijkende flows

#### 2. Registry-driven specialist steps

Voor reguliere stappen:

- `purpose`
- `bigwhy`
- `role`
- `entity`
- `strategy`
- `targetgroup`
- `productsservices`
- `rulesofthegame`
- toekomstige `attitude`

Gebruik een centrale dispatcher die uit de registry leest:

- specialist name
- instruction module
- input builder
- json schema
- zod schema
- normalization profile

### Belangrijk

De specialist modules per stap mogen blijven bestaan.
Wat moet verdwijnen, is de noodzaak om op tien plekken handmatig te onthouden dat een stap bestaat.

### Verwachte winst

- minder copy-paste
- kleinere kans op vergeten dispatch-wire
- betere testbaarheid per stap

---

## C. State update declaratief maken

### Huidige situatie

[run_step_state_update_defaults.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/run_step_state_update_defaults.ts) injecteert step ids expliciet in state update helpers.

Daarnaast bestaan step/final mappings in [state.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/core/state.ts).

### Voorstel

Laat state update helpers werken op registry-data:

- `finalFieldForStep(stepId)`
- `isListStep(stepId)`
- `canonicalizationMode(stepId)`
- `provisionalStorageMode(stepId)`

### Voorbeeld van logica die dan verdwijnt

- hardcoded parameters zoals `productsservicesStepId`, `rulesofthegameStepId`, `presentationStepId`
- handmatige mapping tussen `current_step` en state-velden

### Verwachte winst

- één source of truth voor finals
- minder drift tussen step ids en state fields

---

## D. Wording-choice logica generaliseren

### Huidige situatie

De wording-choice laag heeft step-specifieke mapping en speciale behandeling:

- [run_step_wording_heuristics_defaults.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/run_step_wording_heuristics_defaults.ts)
- [run_step_runtime_finalize.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/run_step_runtime_finalize.ts)

### Voorstel

Maak wording-choice afhankelijk van registry-capabilities:

- `supportsWordingChoice`
- `wordingChoiceMode`
- `targetField`
- `comparisonMode`
- `canonicalPresentationMode`

### Doel

Een nieuwe lijststap zoals `attitude` moet door config hetzelfde gedrag kunnen krijgen als `rulesofthegame`, zonder handmatige extra heuristiekblokken.

### Verwachte winst

- minder stap-specifieke branching
- nieuwe lijststappen goedkoper
- beter voorspelbare UX

---

## E. Bullet/list-consistency centraliseren

### Huidige situatie

De runtime behandelt nu alleen bepaalde stappen expliciet als bullet consistency steps:

- [run_step_runtime_finalize.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/run_step_runtime_finalize.ts#L453)

### Voorstel

Verplaats dit naar registry-level:

- `listSemantics: unordered`
- `canonicalListNormalization: bullet_preserving`
- `compareMode: list_delta` of vergelijkbaar

### Waarom dit belangrijk is

Een stap zoals `attitude` die inhoudelijk een lijststap is, moet exact dezelfde regels krijgen als `rulesofthegame`.

Zonder dit blijft iedere nieuwe lijststap een verzameling losse uitzonderingen.

### Verwachte winst

- consistente list UX
- minder regressies bij list-achtige stappen

---

## F. Presentation recap dynamisch maken

### Huidige situatie

[run_step_presentation_recap.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/run_step_presentation_recap.ts) bevat een vaste `PRESENTATION_RECAP_SECTION_SPECS`.

### Probleem

Nieuwe stappen verschijnen niet automatisch in de recap of export.

### Voorstel

Laat recap-secties genereren uit de registry:

- filter `includeInPresentation === true`
- respecteer `presentationLabelKey`
- respecteer `forceList`

### Uitzonderingen

`step_0` en mogelijk `presentation` zelf kunnen aparte logica houden.

### Verwachte winst

- presentatie-export wordt stapconfig-gedreven
- geen dubbele onderhoudslijst meer

---

## G. UI-stepper en UI-titels uit dezelfde registry halen

### Huidige situatie

De UI gebruikt een vaste `ORDER` in:

- [ui_constants.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/lib/ui_constants.ts)

### Voorstel

Genereer de UI-stepper vanuit dezelfde centrale registry.

### Belangrijk

Er mogen niet langer twee onafhankelijke staporden bestaan:

- backend canonical order
- frontend UI order

### Verwachte winst

- minder kans op backend/UI drift
- nieuwe stap verschijnt automatisch op de juiste plek

---

## H. Vertaalstrategie zonder hardcoded stapnummers

### Huidige situatie

Locale-bestanden bevatten hardcoded nummers per stap.

Voorbeelden:

- [ui_strings_defaults.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/i18n/ui_strings_defaults.ts)
- [ui_strings_nl.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/i18n/ui_strings/locales/ui_strings_nl.ts)
- [ui_strings_de.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/i18n/ui_strings/locales/ui_strings_de.ts)

### Voorstel

Splits:

- `title.step_name_only`
- runtime-computed step number

Of:

- `titleTemplate = "Step {n}: {title}"`
- `titleName.strategy = "Strategy"`

### Voorkeursrichting

Per taal:

- één translateerbaar step title template
- per stap alleen de stapnaam

### Verwachte winst

- een nieuwe stap vereist geen hernummering in alle locale files
- vertaalwerk wordt kleiner en veiliger

---

## I. Source UI en bundled UI ontkoppelen of bundling expliciet maken

### Huidige situatie

De live widget gebruikt:

- [step-card.bundled.html](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/step-card.bundled.html)

Maar de bronlogica leeft ook in:

- [ui_render.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/lib/ui_render.ts)
- [ui_constants.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/lib/ui_constants.ts)

### Voorstel

Kies één van deze richtingen:

#### Optie 1. Strikte bundling pipeline

- source files zijn leidend
- bundle is alleen build output
- handmatige edits aan bundle zijn verboden

#### Optie 2. Runtime leest compacte JSON config

- UI-step registry en labels worden server-side ingevoed
- bundle bevat minder hardcoded step-kennis

### Minimumdoel

Maak expliciet in tooling en docs:

- welke file de waarheid is
- wanneer de bundle opnieuw gegenereerd moet worden

### Verwachte winst

- minder synchronisatiebugs
- duidelijker ontwikkelpad

---

## J. Oude en nieuwe architectuur scheiden

### Huidige situatie

Er bestaat nog een oudere flow in [agents.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/agents.ts), terwijl live verkeer door `run_step_runtime` gaat.

### Voorstel

Maak expliciet onderscheid:

- `legacy/` of `experimental/` voor oude flow
- `runtime/` voor live flow

Of:

- verwijder `agents.ts` zodra alle nuttige delen zijn gemigreerd

### Waarom dit belangrijk is

Zolang twee paden blijven bestaan:

- blijft analyse duur
- blijft onduidelijk waar nieuwe features thuishoren
- blijft het risico bestaan dat fixes op het verkeerde pad landen

### Verwachte winst

- kleinere mentale belasting
- minder architecturale verwarring

---

## K. Dream expliciet modelleren als sub-state-machine

### Waarom dit expliciet nodig is

`dream` is in de live runtime geen gewone stap met alleen een specialist en een final field.

De code toont meerdere aparte runtime-modi en UI-varianten:

- `self`
- `builder_collect`
- `builder_scoring`
- `builder_refine`
- `dream_explainer`

Bewijs in de code:

- [specialist_dispatch.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/specialist_dispatch.ts)
- [ui_render.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/lib/ui_render.ts)

Concreet gedrag dat vandaag bestaat:

- dream builder statements verzamelen
- dream scoring clusters en scores tonen
- dream top clusters berekenen
- gebruiker laten kiezen tussen richtingen
- refine-flow op basis van scoring-resultaten
- afwijkende CTA's en actiepaden

### Gevolg voor Refactor 2.0

Het is niet voldoende om `dream` alleen als `special_flow` te markeren.
Er is een extra abstraction laag nodig:

- `stepId = dream`
- `substate` of `runtimeMode`
- mode-specifieke actions
- mode-specifieke contracten
- mode-specifieke UI rendering

### Voorstel

Voeg naast de step registry een aparte `subflow registry` of `runtime profile` toe voor complexe stappen.

Voor `dream` moet die minimaal modelleren:

- ondersteunde runtime-modi
- toegestane transitions
- action codes / route tokens per mode
- mode-specifieke state keys
- mode-specifieke render-behavior

### Waarom dit belangrijk is

Zonder deze extra laag blijft `dream` een impliciete uitzonderingsmachine naast de registry-architectuur.

---

## L. Action-contracts en route tokens als expliciete architectuurlaag

### Waarom dit expliciet nodig is

De live app-flow hangt niet alleen aan `stepId`, `specialistId` en `finalField`.
Er bestaat ook een afzonderlijke contractlaag met:

- action codes
- contract ids
- contract versions
- route tokens
- payload modes
- action roles

Bewijs in de code:

- [run_step_ports.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/run_step_ports.ts)
- [button-contract.md](/Users/MinddMacBen/business-canvas-chatkit/docs/button-contract.md)
- [ui_render.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/lib/ui_render.ts)

Voorbeelden:

- `ACTION_START`
- `ACTION_TEXT_SUBMIT`
- `ACTION_DREAM_EXPLAINER_SUBMIT_SCORES`
- `dreamPickOneRouteToken`
- `presentationMakeRouteToken`

### Gevolg voor Refactor 2.0

Een pure step registry is niet genoeg.
Er moet ook een expliciete `interaction contract registry` of vergelijkbare laag komen.

### Voorstel

Modelleer naast step metadata ook interaction metadata:

- `contractId`
- `contractVersion`
- `supportedActionRoles`
- `supportedActionCodes`
- `routeTokens`
- `payloadModeByAction`

### Minimumdoel

De volgende kennis mag niet langer verspreid in losse constants of UI helpers leven:

- welke actions bij welke stap of subflow horen
- welke action roles de UI verwacht
- welke route tokens speciale runtime-overgangen activeren

---

## M. Runtime integrity: idempotency, stale payloads, liveness en locale continuity

### Waarom dit expliciet nodig is

De live runtime is niet alleen een step machine.
Er zit ook een integriteitslaag omheen die race conditions, dubbele submits, stale payloads en locale-drift moet afvangen.

Bewijs in de code:

- [run_step_transport.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/server/run_step_transport.ts)
- [locale_continuity.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/locale_continuity.ts)
- [ui_render.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/lib/ui_render.ts)

Concreet zichtbaar in de runtime:

- idempotency preflight
- stale payload drop/rebase
- action liveness contract
- `ack_status`
- `action_code_echo`
- `client_action_id_echo`
- locale hint authority en continuity

### Gevolg voor Refactor 2.0

Ook als de step registry goed is ontworpen, kan een refactor regressies veroorzaken in:

- dubbele acties
- race conditions
- replay-afhandeling
- locale continuity
- UI notices op basis van liveness

### Voorstel

Neem runtime integrity expliciet op als non-negotiable architectuurlaag, los van stapdefinitie:

- `transport integrity`
- `ordering and liveness`
- `locale continuity`

### Minimumdoel

Elke refactorfase moet aantoonbaar behouden:

- idempotency gedrag
- stale payload gedrag
- ack/liveness contract
- locale authority continuity

---

## N. Presentation als recap én asset pipeline

### Waarom dit expliciet nodig is

`presentation` is niet alleen een stap die in de recap verschijnt.
De live app genereert ook presentatie-assets en toont daar specifieke preview/download UI voor.

Bewijs in de code:

- [run_step_runtime_execute.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/src/handlers/run_step_runtime_execute.ts)
- [ui_render.ts](/Users/MinddMacBen/business-canvas-chatkit/mcp-server/ui/lib/ui_render.ts)

Concreet zichtbaar:

- `generatePresentationAssets`
- `presentation_assets`
- `png_url`
- `pdf_url`
- `presentationPreview`
- `presentationThumb`
- `presentationDownload`

### Gevolg voor Refactor 2.0

Een registry-gedreven recap lost niet automatisch de presentatiepipeline op.
Daarom moet `presentation` als twee aan elkaar gekoppelde concerns worden behandeld:

1. recap/inhoudelijke secties
2. assetgeneratie en distributie

### Voorstel

Breid de architectuur uit met expliciete `presentation pipeline` metadata:

- of de stap assets genereert
- welk assettype verwacht wordt
- welke preview/render-mode de UI gebruikt
- welke downloadtargets de UI nodig heeft

### Minimumdoel

Refactors aan recaplogica mogen niet ongemerkt de assetflow breken.
Refactors aan assetflow mogen niet impliciet recapsecties muteren.

---

## Concreet migratieplan

## Fase 0 — Inventaris en freeze

Doel:

- één keer scherp vastleggen welke files stapkennis bevatten
- nieuwe stappen tijdelijk niet toevoegen tijdens de refactor

Werk:

- ownership-map actualiseren
- registry-doelen per huidige stap uitschrijven
- bundlingproces expliciet documenteren
- subflow-kandidaten expliciet markeren:
  - `dream`
  - `presentation`
- interaction-contract afhankelijkheden inventariseren
- runtime integrity invariants vastleggen

Resultaat:

- stabiele basis om te migreren

## Fase 1 — Step registry introduceren zonder runtimegedrag te veranderen

Doel:

- nieuwe centrale registry toevoegen
- bestaande runtime nog niet ombouwen

Werk:

- `step_registry.ts` toevoegen
- huidige stappen één-op-één modelleren
- tests maken die controleren dat alle canonical steps registry-records hebben
- nog geen transport-, liveness- of localegedrag wijzigen

Acceptatie:

- registry bevat alle huidige stappen
- nog geen behavior change

## Fase 2 — Read-only consumers op registry laten leunen

Doel:

- niet-kritische lezers eerst migreren

Werk:

- UI stepper order uit registry
- `titlesForLang` en sectie-selectie uit registry
- presentatie recap secties uit registry
- geen wijzigingen aan interaction contracts of runtime integrity

Acceptatie:

- geen functionele regressie
- minder hardcoded staplijsten

## Fase 3 — State/final mapping uit registry

Doel:

- `STEP_FINAL_FIELD_BY_STEP_ID` en step-field logic koppelen aan registry

Werk:

- `finalFieldForStep`
- `isListStep`
- `presentationSectionSpec`

Acceptatie:

- state updates en recap lezen dezelfde stepmetadata
- runtime integrity gedrag is ongewijzigd

## Fase 4 — Specialist dispatch en specialist schema binding uit registry

Doel:

- standaard stappen dispatchen via configuratie

Werk:

- generic specialist dispatcher
- custom handlers alleen voor afwijkende stappen
- stapmodule blijft eigenaar van instructies en schema’s
- `dream` blijft buiten deze generieke migratie zolang de sub-state-machine nog niet expliciet gemodelleerd is
- action-contracts en route tokens blijven compatibel

Acceptatie:

- nieuwe standaard stap kan worden toegevoegd zonder dispatch-copy-paste

## Fase 5 — Wording-choice en bullet consistency declaratief maken

Doel:

- lijststappen als capability modelleren

Werk:

- wording-choice target fields uit registry
- bullet-consistency lijst vervangen door capability check
- compare-mode per step configureerbaar maken

Acceptatie:

- `attitude`-achtige lijststap kan als configgedreven stap bestaan
- bestaande wording-choice contracten en action roles blijven intact

## Fase 6 — Vertalingen moderniseren

Doel:

- stapnummering uit locale strings halen

Werk:

- title templates
- losse stapnaamkeys
- locale migratie

Acceptatie:

- stap toevoegen vereist geen wereldwijde hernummering

## Fase 7 — Legacy afbouwen

Doel:

- oude flow expliciet deactiveren of verwijderen

Werk:

- `agents.ts` archiveren of verwijderen
- docs en tests daarop aanpassen

Acceptatie:

- één duidelijk live pad

## Fase 8 — Dream subflow expliciteren

Doel:

- `dream` van impliciete uitzonderingsmachine naar expliciet gemodelleerde subflow brengen

Werk:

- dream runtime-modi modelleren
- mode transitions expliciet maken
- mode-specifieke actions en state keys vastleggen
- UI rendering per mode minder impliciet maken

Acceptatie:

- `dream`-gedrag is niet langer afhankelijk van verspreide ad-hoc checks

## Fase 9 — Interaction contracts expliciet modelleren

Doel:

- action contracts en route tokens onder formele configuratie brengen

Werk:

- action roles en action codes per stap/subflow modelleren
- route tokens centraliseren
- UI en runtime beide op dezelfde interaction metadata laten leunen

Acceptatie:

- nieuwe interactieve stap vereist geen losse contractkennis in meerdere files

## Fase 10 — Runtime integrity expliciet beschermen

Doel:

- refactorbestendige garanties op transportintegriteit

Werk:

- invariants voor idempotency, stale payloads, liveness en locale continuity formaliseren
- parity tests toevoegen
- documenteren welke lagen niet stilzwijgend mogen veranderen tijdens step-refactors

Acceptatie:

- step-refactors kunnen niet ongemerkt transport- of locale-regressies veroorzaken

---

## Risico’s van de refactor zelf

### 1. Verborgen step-specifieke uitzonderingen

Niet alle stapgedrag is vandaag zichtbaar in één file.
Bij migratie bestaat risico dat een kleine stap-specifieke nuance verloren gaat.

Mitigatie:

- golden tests per stap
- contracttests op specialist output
- behavior snapshots voor wording-choice en presentation recap
- expliciete subflowtests voor `dream`

### 2. UI-bundle drift

Als source migreert maar bundle niet, krijg je schijnbaar willekeurig gedrag.

Mitigatie:

- bundling expliciet in CI of predeploy
- source-only bewerken als policy

### 3. i18n-regressies

Een stapregistry lost nummering niet automatisch op zolang de translation strategy nog oud is.

Mitigatie:

- i18n pas aanpassen na registry-stabilisatie
- tijdelijke compatibility-laag voor oude keys

### 4. Te grote refactor ineens

Als registry, dispatch, state en i18n in één PR worden omgegooid, wordt review en diagnose te moeilijk.

Mitigatie:

- fasering per laag
- elke fase afzonderlijk deploybaar

### 5. Interactielaag raakt los van steplaag

Als step registry en action-contracts los van elkaar evolueren, ontstaan regressies in knoppen, submits en route tokens.

Mitigatie:

- action/contract parity tests
- één expliciete interaction metadata-laag

### 6. Runtime integrity regressies

Een step-gerichte refactor kan per ongeluk idempotency-, stale- of localegedrag wijzigen zonder dat de step-tests falen.

Mitigatie:

- integriteitstests apart behouden
- transport invariants als release-blocker behandelen

---

## Teststrategie

## 1. Registry-completeness tests

Tests die afdwingen:

- elke canonical step heeft een registry-record
- elke registry-step heeft:
  - title key
  - final field
  - specialist binding
  - presentation config indien nodig
  - interaction metadata indien van toepassing

## 2. Step-order parity tests

Tests die afdwingen:

- backend volgorde
- UI volgorde
- export volgorde

komen uit dezelfde registry-bron.

## 3. List-step behavior tests

Voor `strategy`, `productsservices`, `rulesofthegame` en toekomstige `attitude`:

- bullet normalization
- wording-choice gedrag
- canonical list persistence

## 4. Presentation recap parity tests

Voor elke stap die `includeInPresentation === true` heeft:

- recap bevat de sectie
- juiste labelkey wordt gebruikt
- list vs inline presentatie klopt

## 5. Dream subflow tests

Voor `dream`:

- runtime mode transitions
- builder collect/scoring/refine gedrag
- direction-picking gedrag
- score-submit contractgedrag

## 6. Interaction-contract parity tests

Tests die afdwingen:

- elke interactieve stap heeft geldige action roles
- UI action mapping en runtime routing lezen compatibele contractdata
- route tokens blijven synchroon tussen UI en runtime

## 7. Runtime integrity tests

Tests voor:

- idempotency replay
- stale payload drop/rebase
- action liveness ack-status
- locale continuity tussen turns

## 8. Locale title tests

Tests die voorkomen dat oude hardcoded nummering terugkomt.

---

## Concrete impact op een toekomstige stap `attitude`

Met de gewenste eindarchitectuur zou het toevoegen van `attitude` ongeveer dit moeten zijn:

1. specialistmodule toevoegen
2. registry-record toevoegen
3. vertaling voor stapnaam toevoegen
4. tests laten draaien

Niet meer:

- handmatig step order op meerdere plaatsen aanpassen
- meerdere default-maps updaten
- bullet-consistency hardcoded uitbreiden
- presentatie-recap apart onthouden
- wording heuristics apart onthouden

Dat is precies het succescriterium van Refactor 2.0.

---

## Aanbevolen volgorde van uitvoering

### Aanbevolen volgorde

1. step registry introduceren
2. UI/read-only consumers op registry
3. presentation recap op registry
4. state/final routing op registry
5. specialist dispatch op registry
6. wording/bullet behavior declaratief maken
7. i18n nummering moderniseren
8. legacy opschonen

### Niet aanbevolen

- eerst i18n oplossen
- eerst oude flow verwijderen
- eerst alle specialist dispatch generiek maken zonder registry

Dat maakt het risico groter en de architectuur minder navolgbaar.

---

## Definition of done voor Refactor 2.0

Refactor 2.0 is pas echt geslaagd als:

- een nieuwe standaardstap op één centrale plek kan worden geregistreerd
- UI-stepper, state-final, specialist dispatch en presentation recap daar automatisch uit afleiden
- lijststappen via capability-config gelijk gedrag krijgen
- stapnummers niet meer hardcoded in alle vertalingen leven
- er nog maar één echte live runtime-architectuur overblijft

---

## Slotadvies

De hoogste ROI zit niet in “meer generieke helpers”, maar in:

- één echte step registry
- declaratieve step capabilities
- het verwijderen van structurele kennisduplicatie

Zonder die drie blijft elke nieuwe stap duurder dan nodig, ook als individuele bestanden netter worden.

Met die drie wordt de codebase niet alleen schoner, maar vooral:

- goedkoper om uit te breiden
- veiliger om te deployen
- makkelijker om over te dragen
