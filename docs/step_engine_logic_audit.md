# Step Engine Logic Audit

## Doel
Deze audit legt de bestaande owner-logica vast per capability, zodat dispatch, menu-overgang, state-write en render niet meer op meerdere plekken tegelijk beslissen.

Leidende regel:
- `action_routing` mag alleen route-/menu-mechanica doen
- `special_route` mag alleen speciale validatie/state-write doen
- `state_action` blijft beperkt tot systeemacties
- renderer/UI lezen contracten en state, maar beslissen geen capability-semantiek

## Conflicten die zijn gevonden

| Conflict | Bestaand pad | Probleem | Correctie |
| --- | --- | --- | --- |
| Dubbele menu-owner | `choose-for-me` | action-routing zette al `nextMenuId`, waarna special route nog valideerde tegen het bronmenu | `choose-for-me` is nu `special_route`-owned en pre-transitiont niet meer |
| Dubbele menu-owner | `dream start exercise` | action-routing en special route stuurden allebei Dream-menu/fase | `dream *_START_EXERCISE` is nu `special_route`-owned |
| Dubbele menu-owner | `dream switch to self` | matrix en special route stuurden allebei terug naar intro | `ACTION_DREAM_SWITCH_TO_SELF` is nu `special_route`-owned |
| Dubbele menu-owner | `presentation make` | matrix zette al `no_buttons`, terwijl special route de generatieflow bezit | `ACTION_PRESENTATION_MAKE` is nu `special_route`-owned |
| Pending-state leakage | Dream Builder input | builder-input kon nog als `feedback_on_current_value` worden behandeld zodra er al een gewone Dream-waarde bestond | current-value feedback wordt in Dream Builder modes niet meer geactiveerd |
| No-op foutbeeld | `invalid_state` | contractfout gaf lege `text` en lege `specialist`, waardoor een klik als “er gebeurt niets” kon voelen | `invalid_state` rendert nu de fouttekst zichtbaar |

## Owner-matrix per capability

### Step 0

| Menu / capability | Action codes | Owner | State-write | Render |
| --- | --- | --- | --- | --- |
| Prestart/start | `ACTION_START`, `ACTION_STEP0_READY_START`, `ACTION_STEP0_META_RETURN` | `state_action` voor `ACTION_START`, anders `action_routing` | bootstrap/runtime | contract renderer |

### Dream

| Menu / capability | Action codes | Owner | State-write | Render |
| --- | --- | --- | --- | --- |
| Intro / why | `ACTION_DREAM_INTRO_EXPLAIN_MORE`, `ACTION_DREAM_WHY_GIVE_SUGGESTIONS` | `action_routing` | runtime/pipeline | contract renderer |
| Suggesties -> kies er een | `ACTION_DREAM_SUGGESTIONS_PICK_ONE` | `special_route` | route | contract renderer |
| Start exercise | `ACTION_DREAM_INTRO_START_EXERCISE`, `ACTION_DREAM_WHY_START_EXERCISE`, `ACTION_DREAM_SUGGESTIONS_START_EXERCISE`, `ACTION_DREAM_REFINE_START_EXERCISE` | `special_route` | route | contract renderer |
| Dream refine confirm | `ACTION_DREAM_REFINE_CONFIRM` | `action_routing` | runtime confirm path | contract renderer |
| Dream Builder refine | `ACTION_DREAM_EXPLAINER_REFINE_CONFIRM`, `ACTION_DREAM_EXPLAINER_REFINE_ADJUST` | confirm via `action_routing`, adjust via `action_routing` | pipeline / route follow-up | contract renderer |
| Dream Builder score submit | `ACTION_DREAM_EXPLAINER_SUBMIT_SCORES` | `special_route` | route | contract renderer |
| Switch to self | `ACTION_DREAM_SWITCH_TO_SELF` | `special_route` | route | contract renderer |

Dream-specifieke logica:
- `__dream_runtime_mode` is flow-context, geen compare-owner
- Dream Builder input mag niet via current-value feedback het wording-choice pad overslaan

### Purpose / Big Why / Role / Entity

| Step | Choose-for-me action | Owner | State-write | Render |
| --- | --- | --- | --- | --- |
| Purpose | `ACTION_PURPOSE_EXAMPLES_CHOOSE_FOR_ME` | `special_route` | route | contract renderer |
| Big Why | `ACTION_BIGWHY_SUGGESTIONS_CHOOSE_FOR_ME` | `special_route` | route | contract renderer |
| Role | `ACTION_ROLE_EXAMPLES_CHOOSE_FOR_ME` | `special_route` | route | contract renderer |
| Entity | `ACTION_ENTITY_SUGGESTIONS_CHOOSE_FOR_ME` | `special_route` | route | contract renderer |

Voor de overige intro/explain/refine/confirm-acties blijft `action_routing` de owner.

### Strategy / grouped list

| Menu / capability | Action codes | Owner | State-write | Render |
| --- | --- | --- | --- | --- |
| Vraag / examples / consolidate | normale menu-actions | `action_routing` | pipeline | contract renderer |
| Choose-for-me | `ACTION_STRATEGY_EXAMPLES_CHOOSE_FOR_ME` | `special_route` | route | contract renderer |
| Confirm / continue | `ACTION_STRATEGY_CONFIRM_SATISFIED`, `ACTION_STRATEGY_FINAL_CONTINUE` | `action_routing` | runtime confirm path | contract renderer |

### Targetgroup / ProductsServices / RulesOfTheGame

| Step | Capability | Owner | State-write | Render |
| --- | --- | --- | --- | --- |
| Targetgroup | intro/ask/refine/confirm | `action_routing` | pipeline / runtime confirm path | contract renderer |
| ProductsServices | grouped compare + confirm | `action_routing` | pipeline / runtime confirm path | contract renderer |
| RulesOfTheGame | grouped compare + confirm | `action_routing` | pipeline / runtime confirm path | contract renderer |

### Presentation

| Menu / capability | Action codes | Owner | State-write | Render |
| --- | --- | --- | --- | --- |
| Generate / remake | `ACTION_PRESENTATION_MAKE` | `special_route` | route | contract renderer |
| Change / continue | overige presentatie-acties | `action_routing` | runtime / route | contract renderer |

## Expliciete vergeet-checklist
- geen `special_route` action mag vooraf door action-routing naar een nieuw menu worden gezet
- geen Dream Builder input mag door current-value feedback worden gekaapt
- `invalid_state` moet zichtbaar renderen
- `choose-for-me` valideert altijd tegen bronmenu + snapshot en zet pas daarna doelmenu
- renderer gebruikt contract/view-state, niet eigen capability-semantiek
