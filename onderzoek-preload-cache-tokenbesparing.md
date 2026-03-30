# Beknopte samenvatting

Er is in deze codebase maar één klikovergang met een aantoonbaar grote en veilige preload-winst: `Start` naar de eerste `step_0`-weergave, maar alleen wanneer er al prestart-invoer beschikbaar is of vooraf beschikbaar gemaakt kan worden. Op dat pad wacht de server nu nog synchroon op `Step0BootstrapExtractor` voordat de start-respons terugkomt. Dat hele modelrondje kan van het klikpad af als je een aparte prestart-warmup toevoegt en het bootstrapresultaat cachet op exact dezelfde invoer.

Voor tokenbesparing zijn drie maatregelen logisch, haalbaar en laag-risico:

- Sla in de dream-flow de `AcceptedOutputUserTurnClassifier` over zolang de specialist al een bruikbare kandidaat heeft teruggegeven. Dat scheelt per vermeden call minimaal 670 input tokens.
- Voeg dezelfde glossary-uitschakeling die nu al voor `__SHORTEN_BIGWHY__` bestaat ook toe aan interne repair-routes zoals dream-overlap/multi-rewrite/force-refine en strategy-consolidatie. Dat scheelt 479 input tokens per repair-call.
- Cache `Step0BootstrapExtractor` op `(FIRST_USER_MESSAGE, LANGUAGE)`. Die call is zuiver op exact die input en kost per vermeden herhaling minimaal 738 input tokens.

Wat ik expliciet niet aanbeveel als “grote snelle winst”:

- compare-pick knoppen: die worden al lokaal uit pending state opgelost, zonder nieuwe specialist-call;
- presentation-generate: die assets worden al op content-fingerprint gecachet;
- UI-taal/strings: dat loopt via een statische catalogus, niet via een vertaal-LLM.

## Werkwijze en bewijsbasis

- Codepad-analyse van UI -> `run_step` -> route/pipeline/specialist.
- Tokenmetingen lokaal met `tiktoken` 0.12.0 en `o200k_base`.
- Alleen maatregelen opgenomen die:
  - direct uit de huidige code volgen;
  - geen functionele versmalling vereisen;
  - ofwel bestaande gedragspatronen hergebruiken, ofwel memoization toepassen op zuivere input.

## 1. Welke klikovergang kan veel sneller met preload/cache

## 1.1 De enige duidelijke kandidaat: `Start` -> eerste `step_0` scherm

### Bewijs uit de code

- De `Start`-knop doet maar één ding: `callRunStep(actionCode, { started: "true" })`.
  - `mcp-server/ui/lib/main.ts:414-430`
- De client doet op zo’n klik precies één `run_step` request en wacht volledig op de response.
  - `mcp-server/ui/lib/ui_actions.ts:2473-2906`
- Op serverniveau wordt `ACTION_START` in `start_prestart` afgevangen.
  - `mcp-server/src/handlers/run_step_routes.ts:1001-1046`
- Als er nog geen `step0_bootstrap` of `step_0_final` is, roept dit pad tijdens de klik synchroon `Step0BootstrapExtractor` aan.
  - `mcp-server/src/handlers/run_step_routes.ts:1052-1088`
  - `mcp-server/src/handlers/run_step_routes.ts:1199-1200`
- Daarna volgt pas `ensureStartState(...)`.
  - `mcp-server/src/handlers/run_step_routes.ts:1203-1205`

### Waarom dit aantoonbaar preloadbaar is

- De prestart-route kan dezelfde bootstrap al vóór `ACTION_START` opbouwen en opslaan in state.
  - `mcp-server/src/handlers/run_step_routes.ts:1111-1157`
- De route accepteert op `ACTION_START` expliciet een al bestaand snapshot.
  - `allowStartActionWithSnapshot`
  - `mcp-server/src/handlers/run_step_routes.ts:1009-1015`
  - `mcp-server/src/handlers/run_step_routes.ts:1030-1044`
- Preflight buffert prestarttekst al expliciet zodat `ACTION_START` die later kan consumeren.
  - `mcp-server/src/handlers/run_step_preflight.ts:301-309`
  - `mcp-server/src/handlers/run_step_preflight.ts:405-424`
- De `Start`-klik zelf stuurt momenteel geen vrije tekst mee, alleen `{ started: "true" }`.
  - `mcp-server/ui/lib/main.ts:416-429`

### Waarom dit geen vertaal-LLM-preload hoeft te zijn

- `ensureUiStringsForState` gebruikt een statische stringcatalogus en geen modelcall.
  - `mcp-server/src/handlers/run_step_i18n_runtime.ts:264-335`
  - `mcp-server/src/handlers/run_step_i18n_runtime.ts:337-470`
- Dus de echte vermijdbare wachttijd op `Start` zit niet in vertaling, maar in `Step0BootstrapExtractor`.

### Hoe dit precies zou moeten

1. Voeg een aparte prestart-warmup toe, niet `ACTION_BOOTSTRAP_POLL`.
2. Trigger die warmup client-side debounce zodra:
   - `current_step === "step_0"`
   - `started !== "true"`
   - de input non-empty is
   - de genormaliseerde input-hash is gewijzigd
3. Laat die warmup server-side alleen dit doen:
   - `initial_user_message` vastleggen;
   - `maybeHydrateBootstrapFromStep0Specialist(false)` uitvoeren;
   - `ensureStartState(...)` uitvoeren;
   - dezelfde prestart-gate payload teruggeven als nu.
4. Laat `ACTION_START` daarna alleen nog de bestaande snapshot consumeren.

### Waarom `ACTION_BOOTSTRAP_POLL` hier niet genoeg is

- De bootstrap-poll-preprocess doet alleen locale/UI-strings-ready werk en zet daarna action/userMessage leeg.
  - `mcp-server/src/handlers/run_step_preflight.ts:336-373`
- Dat pad hydrateert `step0_bootstrap` dus niet.

### Netto-effect

- Op de klik zelf vervalt één volledige specialist-call als er al prestarttekst is voorgewarmd.
- Dat is structureel de grootste veilige winst, omdat het een volledige netwerk/model-roundtrip uit het klikpad haalt.

## 1.2 Wat juist geen grote preload/cache-kandidaat is

### Compare-pick knoppen

- De compare-pick knoppen sturen wel een `run_step`, maar server-side wordt de keuze uit bestaande pending state opgelost.
  - UI-clicks: `mcp-server/ui/lib/main.ts:380-412`
  - lokale routing: `mcp-server/src/handlers/run_step_runtime_action_routing.ts:1439-1464`
  - selectie wordt lokaal toegepast: `mcp-server/src/handlers/run_step_compare.ts:2541-2625`
- Er zit hier dus geen extra specialist-call die je “weg kunt preloaden”.

### Presentation-generate

- Presentation-assets zijn al inhoudsgecachet op `assetFingerprint`.
  - PPTX-hit: `mcp-server/src/handlers/run_step_presentation.ts:478-483`
  - PDF-hit: `mcp-server/src/handlers/run_step_presentation.ts:596-604`
  - PNG-hit: `mcp-server/src/handlers/run_step_presentation.ts:607-616`
- Dit pad is al correct gecachet; extra cacheadvies hier zou grotendeels dubbel werk zijn.

## 2. Waar we aanzienlijk op tokens kunnen besparen zonder functionele afbraak

## 2.1 Dream-flow: classifier pas aanroepen als hij echt nodig is

### Bewijs uit de code

- In de dream-flow wordt `classifyAcceptedOutputUserTurn(...)` nu altijd aangeroepen zodra `decision1.specialist_to_call === deps.dreamSpecialist`.
  - `mcp-server/src/handlers/run_step_pipeline.ts:1268-1284`
- Maar de uitkomst wordt alleen gebruikt voor de repair-branch die pas relevant is als:
  - niet off-topic;
  - geen meta fallback;
  - de specialist nog géén bruikbare dream-kandidaat heeft.
  - `mcp-server/src/handlers/run_step_pipeline.ts:1284-1307`
- `candidateMissing` wordt pas ná de classifier bepaald.
  - `mcp-server/src/handlers/run_step_pipeline.ts:1283-1285`

### Waarom dit veilig is

- Als `candidateMissing === false`, wordt de classifier-uitkomst verder niet gebruikt om gedrag te veranderen.
- De huidige specialist-output blijft dus exact hetzelfde als je de classifier in dat geval overslaat.

### Gemeten tokenimpact

- `AcceptedOutputUserTurnClassifier` instructies: 635 input tokens.
- Minimale planner-input voor die call: 35 input tokens.
- Minimale besparing per vermeden call: 670 input tokens, exclusief de echte user text.

### Hoe dit precies zou moeten

1. Bepaal eerst:
   - `isOfftopic`
   - `isMetaFallback`
   - `candidateMissing`
2. Roep `classifyAcceptedOutputUserTurn(...)` alleen nog aan als:
   - `!isOfftopic && !isMetaFallback && candidateMissing`
3. Laat `hasContributingInput` anders direct `false` zijn.

## 2.2 Glossary uitschakelen voor interne repair-routes

### Bewijs uit de code

- De globale glossary wordt centraal vóór specialist-instructies gezet.
  - `mcp-server/src/core/glossary.ts:16-57`
- Gemeten glossary-prefix: 479 input tokens.
- Voor `BigWhy` bestaat al een expliciete uitzondering: bij `__SHORTEN_BIGWHY__` wordt de glossary niet meegestuurd.
  - `mcp-server/src/handlers/specialist_dispatch.ts:542-566`
- Vergelijkbare interne repair-routes bestaan ook voor:
  - dream force refine: `mcp-server/src/handlers/run_step_pipeline.ts:1287-1289`, `1313-1316`
  - dream multi-rewrite/overlap/cluster repair: `mcp-server/src/handlers/run_step_pipeline.ts:1107`, `1157`, `1193`, `1245`, `1833`
  - strategy consolidate: `mcp-server/src/handlers/run_step_pipeline.ts:1330-1343`
- Maar `DreamExplainer` en `Strategy` sturen nu nog altijd `includeGlossary: true`.
  - `DreamExplainer`: `mcp-server/src/handlers/specialist_dispatch.ts:496-503`
  - `Strategy`: `mcp-server/src/handlers/specialist_dispatch.ts:634-641`

### Waarom dit veilig is

- Deze routes zijn geen open user-facing canvas-formuleringen maar interne repair/transformatie-opdrachten op al aangeleverde tekst.
- De codebase erkent dit principe al expliciet bij `__SHORTEN_BIGWHY__`.
- Door hetzelfde patroon alleen toe te passen op interne `__ROUTE__...`-prompts verander je geen user-facing contract, alleen de promptgrootte.

### Gemeten tokenimpact

- Besparing per repair-call: 479 input tokens.
- Dit geldt elke keer dat een repair-route afvuurt.

### Hoe dit precies zou moeten

1. Voeg in `specialist_dispatch.ts` één helper toe zoals:
   - `shouldIncludeGlossaryForInternalRoute(specialist, userMessage)`
2. Zet die op `false` voor:
   - `__SHORTEN_BIGWHY__`
   - `__ROUTE__DREAM_FORCE_REFINE__`
   - `__ROUTE__DREAM_EXPLAINER_MULTI_REWRITE_REPAIR__`
   - `__ROUTE__DREAM_EXPLAINER_OVERLAP_REPAIR__`
   - `__ROUTE__DREAM_EXPLAINER_CLUSTER_THEME_REPAIR__`
   - `__ROUTE__STRATEGY_CONSOLIDATE__`
3. Gebruik die helper als bron voor `includeGlossary`.

## 2.3 `Step0BootstrapExtractor` memoizen op exacte input

### Bewijs uit de code

- `Step0BootstrapExtractor` is zuiver op:
  - `FIRST_USER_MESSAGE`
  - optioneel `LANGUAGE`
  - `mcp-server/src/steps/step_0_bootstrap.ts:29-33`
- De instructies voor die call zijn groot.
  - `mcp-server/src/steps/step_0_bootstrap.ts:35-103`
- Gemeten instructiegrootte: 728 input tokens.
- Minimale planner-input: 10 input tokens.
- Minimale totale input per call: 738 tokens, exclusief de echte eerste user message.
- In `start_prestart` wordt alleen gekeken of `step0_bootstrap` al in state zit; er is geen inhouds-cache op exact dezelfde invoer.
  - `mcp-server/src/handlers/run_step_routes.ts:1052-1058`
  - `mcp-server/src/handlers/run_step_routes.ts:1073-1088`

### Waarom dit veilig is

- Memoization verandert de functie-uitkomst niet; hij hergebruikt alleen exact dezelfde uitkomst voor exact dezelfde genormaliseerde input.
- Omdat de inputset klein en expliciet is, is de cache-key exact definieerbaar:
  - `sha256(normalized_language + "\n" + normalized_first_user_message)`

### Hoe dit precies zou moeten

1. Normaliseer:
   - `FIRST_USER_MESSAGE.trim()`
   - `LANGUAGE.trim().toLowerCase()`
2. Bouw een cache-key op exact die twee velden.
3. Gebruik een kleine LRU/TTL-cache server-side.
4. Cache zowel:
   - `recognized: true`
   - als `recognized: false`
5. Lees de cache uit vóór `deps.callSpecialistStrictSafe(...)`.

### Gemeten tokenimpact

- Elke vermeden herhaling scheelt minimaal 738 input tokens plus de tokens van de echte user message.

## 3. Wat ik bewust niet adviseer

- Geen “algemene prompt-inkorting” zonder route-specifieke onderbouwing.
  - Dat is niet hard genoeg te bewijzen als risicoloos.
- Geen samenvoeging van meerdere classifiers in één nieuw promptcontract.
  - Dat is haalbaar, maar niet de laagste-risico-optie.
- Geen extra caching op presentation-assets.
  - Dat bestaat al.
- Geen preload-claims voor compare-picks.
  - Dat pad lost al lokaal uit pending state op.

## 4. Concrete prioriteit

1. `Start`-prewarm toevoegen voor prestarttekst.
   - Grootste veilige klik-winst.
2. Dream-classifier pas aanroepen als `candidateMissing === true`.
   - Grootste directe tokenwinst zonder contractwijziging.
3. Glossary uitschakelen voor interne repair-routes.
   - Kleine implementatie, duidelijke vaste tokenwinst per repair-call.
4. `Step0BootstrapExtractor` memoizen op exacte input.
   - Lage implementatierisico’s, nuttig voor retries/herhaalde sessiestarts.

## Meetnotities

- Tokenmetingen uitgevoerd met `tiktoken` 0.12.0, encoding `o200k_base`.
- Gemeten vaste promptdelen:
  - glossary-prefix: 479 tokens
  - `AcceptedOutputUserTurnClassifier` instructies: 635 tokens
  - `RunStepTurnSemanticsClassifier` instructies: 625 tokens
  - `Step0BootstrapExtractor` instructies: 728 tokens
