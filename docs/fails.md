# Fails Matrix

## Scope
Dit document beschrijft de **laatste 50 relevante pogingen** om de interactieve step-engine, widget-UI, wording flows, feedback, support flows en contracten te verbeteren.

Bron:
- `git log --grep='dream|purpose|bigwhy|role|entity|strategy|wording|feedback|support|choose|suggest|ui|contract|render' -i -n 50`

Doel:
- zichtbaar maken **waar** fixes werden gedaan
- vastleggen **waarom** regressies bleven terugkomen
- laten zien welke commits de kern raakten en welke vooral symptomen afdekten

## Hoofdconclusie
De terugkerende regressies komen niet uit 50 losse bugs. Ze komen uit steeds dezelfde kernfout:

- er leefden tegelijk **twee contractwerelden** in de runtime
- nieuw: `step_registry` / families / explicit capability contracts
- oud: string checks, wording heuristics, `wording_choice_pending` als catch-all, renderer-side step sets

Zolang beide werelden tegelijk actief bleven, kwamen bugs terug in:
- `choose one for me`
- `Your input / My suggestion`
- feedback op gekozen tekst
- `ik snap het niet`
- grouped compare
- step-specific confirm / refine states

## KPI-kader voor een kleine app
Een kleine app als deze hoort hierop beoordeeld te worden:

| KPI | Betekenis | Faalpatroon |
| --- | --- | --- |
| `1 truth per capability` | één bron voor capability-semantiek | registry + route + renderer + helper tegelijk |
| `No text-derived decisions` | first-class gedrag niet uit vrije tekst afleiden | parsing van `message` of widgetblob |
| `Family over step-if` | gedeeld gedrag via family, niet via losse step-lijsten | `strategy/productsservices/rulesofthegame` sets in renderer |
| `Special flows are explicit` | DreamExplainer, Presentation, step_0 echt apart | nep-family in registry of verborgen stringchecks |
| `No catch-all state` | compare/refine/support niet via één statepad | `wording_choice_pending` als transportlaag voor alles |
| `Small-app simplicity` | zo min mogelijk lagen | helper boven helper boven registry |

## Failure Taxonomy

| Code | Betekenis |
| --- | --- |
| `C1` | Parallelle contractwerelden |
| `C2` | Text-/message-derived kernbeslissing |
| `C3` | Renderer definieert zelf categories |
| `C4` | Special flow is niet echt afgescheiden |
| `C5` | Catch-all state met meerdere semantieken |
| `C6` | UI/state parity of startup-paint mismatch |
| `C7` | Presentatie-/i18n-/mediawijziging met nevenschade op flow |
| `C8` | Build/deploy/instrumentation ondersteunend, maar niet de kern |

## Matrix: Laatste 50 Pogingen

| # | Commit | Datum | Onderwerp | Primair gebied | Waarschijnlijk patroon | Oordeel |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `3ae6878` | 2026-03-14 | stabilize interactive step contracts | choose-for-me, support, renderer, refinement | `C1 C3 C5` | Raakt eindelijk de kern. Dit is de eerste commit in deze reeks die tegelijk de silent rerender, DreamExplainer-leugen, renderer step-sets en refinement-state split aanpakt. |
| 2 | `05dcc34` | 2026-03-14 | refactor: unify choose-for-me contracts | choose-for-me | `C1 C2` | Verplaatste choose-for-me naar registry, maar liet nog silent invalid-state gedrag bestaan. Kern half gedaan. |
| 3 | `2f8942b` | 2026-03-14 | refactor: separate stuck support contracts by specialist family | stuck-support | `C1 C4` | Goede richting, maar `dream_explainer` bleef als nep-family bestaan terwijl runtime nog stringchecks gebruikte. |
| 4 | `e6fc181` | 2026-03-14 | fix: generalize current-value feedback routing | refinement feedback | `C5` | Maakte het familiebreed, maar hield refinement nog in wording-choice state. Dat bleef botsen met compare/picker semantics. |
| 5 | `4e4cb51` | 2026-03-14 | fix: enforce explicit agent feedback contracts | compare feedback | `C1 C5` | Goede intentie, maar nog niet hard genoeg zolang renderer en wording-state meerdere semantieken bleven mengen. |
| 6 | `f1fe78e` | 2026-03-13 | fix: tighten wording choice interaction | wording choice | `C1 C5` | Symptomatische aanscherping. Loste gedrag op, maar niet de transportlaag van compare/refine door elkaar. |
| 7 | `001c678` | 2026-03-13 | fix: soften wording feedback UX | feedback toon | `C5 C7` | Tone fix. Niet fout, maar loste de kern niet op zolang semantische routes nog dubbel waren. |
| 8 | `f9ec4e5` | 2026-03-13 | fix: stabilize wording choice flows | wording choice | `C1 C5` | Stabilisatie zonder volledige contractscheiding. Klassieke “beter, maar niet af”-commit. |
| 9 | `beb25cf` | 2026-03-13 | fix: support presentation edits and widget regressions | presentation, widget | `C4 C7` | Noodzakelijke repair, maar risico op leakage omdat Presentation vaak in shared paths bleef meeliften. |
| 10 | `80edce5` | 2026-03-13 | refactor: unify suggestion flows and strategy examples | suggestions | `C1 C2 C3` | Richtte suggestion-flows op één lijn, maar de keuze bleef later nog te veel op runtime-heuristiek en renderer-categorieën leunen. |
| 11 | `d142d6b` | 2026-03-13 | refactor: unify suggestion flows across steps | suggestions | `C1 C2` | Groot gebaar in de goede richting, maar without hard state ownership bleef choose-for-me later alsnog fragiel. |
| 12 | `b2c2905` | 2026-03-11 | Add Russian locale and video support | i18n/media | `C7` | Niet de kern van deze regressies, maar vergrootte change surface in UI/runtime. |
| 13 | `03f7ff2` | 2026-03-11 | Fix productsservices picker and presentation recap rendering | grouped list, presentation | `C3 C4` | Goede bugfix, maar toont dat grouped/list en special-flow rendering nog niet schoon gescheiden waren. |
| 14 | `27a1e1d` | 2026-03-11 | Fix dream builder resume labels | dream builder UI | `C7` | UI-laag, weinig kernoplossing. |
| 15 | `82c55ae` | 2026-03-11 | Fix dream builder scoring submit handoff | dream builder flow | `C4 C6` | Special-flow handoff reparatie. Nog geen echte contractscheiding. |
| 16 | `ad619bb` | 2026-03-11 | Keep dream builder text input during scoring | UI interactivity | `C4 C6` | Productmatig logisch, maar vooral UI-flow herstel. |
| 17 | `89890c3` | 2026-03-11 | Finalize purpose intro gating and step flow updates | purpose intro flow | `C3 C6` | Intro- en gatinggedrag is vaak renderer/pipeline mixed geweest. Deze commit zit in die lijn. |
| 18 | `481a28f` | 2026-03-10 | Fix wording and rules step rendering | wording, rules | `C3 C5` | Renderer-side correctie. Duidelijk symptoom van teveel semantiek in de renderer. |
| 19 | `156cd00` | 2026-03-09 | Fix wording compare flow and route docs | compare flow | `C1 C5` | Compare-flow reparatie, maar nog zonder harde state-scheiding van refinement. |
| 20 | `c49f54f` | 2026-03-09 | Normalize list wording choice compare | grouped compare | `C3 C5` | Nodig voor grouped-list, maar deel van de latere compare/refine verstrengeling. |
| 21 | `191b80b` | 2026-03-09 | build: remove local deploy alias after push | build | `C8` | Niet inhoudelijk relevant voor de regressies. |
| 22 | `6b82370` | 2026-03-09 | build: verify UI artifacts and default deploy-next to amd64 | deploy/build | `C8` | Ondersteunend. Maakt deploy veiliger, verandert geen flowsemantiek. |
| 23 | `a9b3906` | 2026-03-09 | fix(i18n): enforce locale continuity for specialist content | locale continuity | `C7` | Waardevol, maar verhoogt wel de hoeveelheid state en gating rond UI-output. |
| 24 | `68b4d4d` | 2026-03-09 | fix(dream): allow confirm from hidden canonical pending state | dream confirm | `C5` | Klassieke workaround voor pending/canonical-sematiek. Signaal dat de statevorm te veel dingen tegelijk deed. |
| 25 | `33a9f67` | 2026-03-09 | fix(ui): fail closed on missing widget payload | widget payload | `C6` | Goede fail-closed fix. Past bij kleine-app discipline. |
| 26 | `d455481` | 2026-03-09 | Restore Dream provisional staging for canonical suggestions | dream staging | `C2 C5` | Herstelde staging, maar laat zien hoe suggestions, canonical value en refine-state door elkaar liepen. |
| 27 | `93199e8` | 2026-03-09 | Patch contract smoke for accepted output classifier | accepted-output classifier | `C8` | Test/smoke-ondersteuning; nuttig, maar niet de semantische root cause. |
| 28 | `7de430c` | 2026-03-09 | Fix wording choice stepworthiness semantics | wording choice intent | `C5` | Belangrijk voor compare eligibility, maar nog steeds binnen dezelfde overbelaste wording-choice machine. |
| 29 | `2f2fcb4` | 2026-03-09 | fix(ui): resolve widget actions from canonical contract | widget actions | `C1 C6` | Goede beweging richting contract-first UI, maar niet systeem-breed. |
| 30 | `b4cabf8` | 2026-03-08 | fix: reject malformed dream builder summaries | dream builder | `C4` | Goed special-flow herstel, maar niet generiek contractwerk. |
| 31 | `7a0a483` | 2026-03-08 | fix: retain canonical step continuity across widget turns | widget continuity | `C6` | Helpt statecontinuïteit, maar kwam voort uit fragiele lifecycle rond pending/provisional state. |
| 32 | `943c07f` | 2026-03-08 | Add localized intro videos to dream screens | media/UI | `C7` | Niet de kern; vergroot change surface. |
| 33 | `31251c9` | 2026-03-08 | Fix wording-choice picker contract collisions | wording picker | `C1 C5` | Direct signaal van parallelle contracten. |
| 34 | `58733da` | 2026-03-08 | Fix wording-choice canonical leakage | wording canonical leakage | `C5` | Symptoom van compare/refine/pending leakage. |
| 35 | `bfa1653` | 2026-03-08 | Fix single-value semantic card rendering | single-value renderer | `C3` | Renderer had te veel semantische verantwoordelijkheid. |
| 36 | `0d42a51` | 2026-03-08 | dream: enforce rule feedback and route formulation corrections | dream routing | `C2 C4` | Dream-special behavior correctie. Nog niet via één family-contract. |
| 37 | `ee90a92` | 2026-03-08 | Fix Step 0 bootstrap continuity across widget start | step_0 bootstrap | `C6` | Special flow herstel. |
| 38 | `1cfb611` | 2026-03-08 | Fix pending wording flow and canonical shape | pending wording | `C5` | Opnieuw pending/canonical semantics. Nog geen echte ontkoppeling. |
| 39 | `a92729e` | 2026-03-08 | fix(runtime): enforce dream builder single-source rendering and pending suggestion intent ssot | dream builder, pending intent | `C1 C4 C5` | Richting SSOT, maar alleen voor één cluster. De rest bleef mixed. |
| 40 | `c5dd1fe` | 2026-03-08 | fix(runtime): enforce canonical dream rendering and extend intro video language map | dream rendering | `C4 C7` | Mix van kern en media; daardoor groter risico dan nodig. |
| 41 | `6549b03` | 2026-03-08 | fix(runtime): unify canonical pending suggestion rendering and dream dedupe context | pending suggestion rendering | `C5` | Nog een pending-suggestion correctie. Laat zien hoe vaak dat statepad instabiel was. |
| 42 | `8708516` | 2026-03-08 | fix(ui): prefer canonical widget text source to prevent duplicate content | widget text source | `C1 C6` | Goede corrective move, maar niet compleet zolang routes/renderers nog eigen waarheden hielden. |
| 43 | `9c5d769` | 2026-03-08 | refactor: semantic pending suggestion routing across single-value steps | single-value routing | `C1 C5` | Belangrijke voorloper, maar later bleek dat wording-choice als catch-all bleef bestaan. |
| 44 | `3a693ef` | 2026-03-07 | fix dream-builder ssot dedupe and intent-driven runtime cleanup | dream-builder cleanup | `C4 C5` | Goede special-flow cleanup, maar niet voldoende voor main step engine. |
| 45 | `5e07827` | 2026-03-07 | security: keep structuredContent fallback renderable without rich payload | structured content fallback | `C8` | Niet direct oorzaak, maar bevestigt dat fallback-paden expliciet bleven bestaan. |
| 46 | `317a944` | 2026-03-06 | Fix deterministic ACTION_START flow and step0 startup rendering | startup determinism | `C6` | Goede fail-closed/stabiele startup fix. |
| 47 | `28de187` | 2026-03-06 | fix(ui): enforce canonical startup paint and fail-closed ACTION_START liveness | startup paint | `C6` | Zelfde cluster als #46; goede discipline, los van wording/suggestion kern. |
| 48 | `9c739d6` | 2026-03-06 | fix(dream-builder): enforce catalog-driven copy across locales | dream-builder i18n | `C7` | Niet de centrale contractbug, wel extra surface. |
| 49 | `0b86519` | 2026-03-06 | Fix wording-choice heading wrapper false positives | wording UI/rendering | `C3 C5` | Weer renderer/pending-semantiek overlap. |
| 50 | `f7f3337` | 2026-03-05 | feat: update run-step flow and expand UI i18n locales | broad runtime/UI change | `C1 C7` | Grote verbreding. Handig functioneel, maar ook het soort commit dat een kleine app makkelijk te veel bewegende delen geeft. |

## Hard Fails die uit deze 50 pogingen zichtbaar worden

### 1. `choose one for me` was te lang geen harde capability
Bewijs in de reeks:
- `d142d6b`
- `80edce5`
- `05dcc34`
- `3ae6878`

Patroon:
- eerst unify/refactor
- daarna alsnog silent no-op
- pas laat expliciete invalid-state

Les:
- een knopactie moet óf slagen óf zichtbaar falen
- nooit stil hetzelfde scherm teruggeven

### 2. `current-value refinement` en `wording choice` deelden te lang dezelfde state
Bewijs in de reeks:
- `1cfb611`
- `58733da`
- `7de430c`
- `e6fc181`
- `3ae6878`

Patroon:
- compare/picker en refine gebruikten te lang dezelfde pending-state
- dat veroorzaakte dubbele feedback, verkeerde framing en leakage

Les:
- refinement van gekozen tekst is een **ander** productgedrag dan `Your input / My suggestion`

### 3. Renderer bleef semantiek bezitten
Bewijs in de reeks:
- `bfa1653`
- `481a28f`
- `03f7ff2`
- `0b86519`
- `3ae6878`

Patroon:
- renderer had eigen step-lijsten en categorieën
- grouped-list gedrag en single-value gedrag werden deels daar “bedacht”

Les:
- renderer moet contracten lezen
- niet zelf stepfamilies definiëren

### 4. `DreamExplainer` zat half als special flow en half als gewone step in het systeem
Bewijs in de reeks:
- `82c55ae`
- `ad619bb`
- `27a1e1d`
- `2f8942b`
- `3ae6878`

Patroon:
- Dream-special logic leefde naast gewone step contracts
- registry en runtime vertelden niet altijd hetzelfde verhaal

Les:
- voor een kleine app is één expliciete uitzondering beter dan nep-generieke modellering

## Samenvatting per cluster

| Cluster | Reeks waar het terugkomt | Wat het zegt |
| --- | --- | --- |
| `choose-for-me` | `d142d6b` -> `80edce5` -> `05dcc34` -> `3ae6878` | capability had te lang geen harde owner |
| `wording/feedback/refinement` | `1cfb611` -> `58733da` -> `f9ec4e5` -> `e6fc181` -> `3ae6878` | wording-state deed te veel tegelijk |
| `grouped list / strategy / rules / products` | `c49f54f` -> `156cd00` -> `481a28f` -> `03f7ff2` -> `3ae6878` | grouped semantics zaten te veel in renderer/runtime samen |
| `stuck-support / DreamExplainer` | `2f8942b` -> `3ae6878` | scheiding was goed bedoeld maar eerst niet eerlijk genoeg gemodelleerd |
| `startup / widget parity` | `317a944` -> `28de187` -> `33a9f67` | fail-closed werkte hier beter dan slimme recovery |

## Wat deze matrix hard bewijst

1. De meeste regressies kwamen niet door “slechte copy”.
Ze kwamen door:
- gedeelde state met meerdere betekenissen
- dubbele contractbronnen
- renderer/route die registry-logica opnieuw definieerden

2. Veel commits waren inhoudelijk verdedigbaar, maar architectonisch niet af.
Dat zie je vooral aan commits met woorden als:
- `fix wording`
- `stabilize wording`
- `canonical leakage`
- `pending suggestion`
- `semantic card`
- `unify suggestion flows`

Die woorden keren terug omdat dezelfde kernlaag niet scherp genoeg was.

3. Voor een kleine app werken deze patronen slecht:
- extra helperlaag boven een registry
- routefallbacks op tekst
- catch-all pending state
- special flows half generiek modelleren

## Wat een reviewer nu specifiek moet controleren

- `choose-for-me` heeft geen silent rerender meer
- actieve runtime gebruikt geen oude choose-pick heuristiek meer
- `DreamExplainer` staat niet meer als nep-family in registry-types
- grouped-list categorieën komen uit registry-predicates
- current-value refinement gebruikt eigen state, niet `wording_choice_pending`
- compare flows vereisen expliciete agent feedback

## Verwachte vervolgvolgorde
Na deze analyse hoort het vervolg klein te blijven:

1. review op `choose-for-me`
2. review op `current-value refinement`
3. review op grouped compare residue
4. daarna pas verdere cleanup

Niet:
- weer tegelijk feedback, UI copy, i18n en routegedrag verbouwen

