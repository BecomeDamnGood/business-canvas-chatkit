# Cross-Step Dependencies

This file maps canonical producers and consumers for persistent finals.

## Producer -> Consumer Chain

- `step_0_final` (producer: `step_0`)
- consumers: `dream`, `dream_explainer`, `purpose`, `bigwhy`, `role`, `entity`, `strategy`, `targetgroup`, `productsservices`, `rulesofthegame`, `presentation`

- `business_name` (producer: `step_0`)
- consumers: all steps for personalization and labels

- `dream_final` (producer: `dream` / `dream_explainer`)
- consumers: `purpose`, `bigwhy`, `role`, `entity`, `strategy`, `targetgroup`, `productsservices`, `rulesofthegame`, `presentation`

- `purpose_final` (producer: `purpose`)
- consumers: `bigwhy`, `role`, `entity`, `strategy`, `targetgroup`, `productsservices`, `rulesofthegame`, `presentation`

- `bigwhy_final` (producer: `bigwhy`)
- consumers: `role`, `entity`, `strategy`, `targetgroup`, `productsservices`, `rulesofthegame`, `presentation`

- `role_final` (producer: `role`)
- consumers: `entity`, `strategy`, `targetgroup`, `productsservices`, `rulesofthegame`, `presentation`

- `entity_final` (producer: `entity`)
- consumers: `strategy`, `targetgroup`, `productsservices`, `rulesofthegame`, `presentation`

- `strategy_final` (producer: `strategy`)
- consumers: `targetgroup`, `productsservices`, `rulesofthegame`, `presentation`

- `targetgroup_final` (producer: `targetgroup`)
- consumers: `productsservices`, `rulesofthegame`, `presentation`

- `productsservices_final` (producer: `productsservices`)
- consumers: `rulesofthegame`, `presentation`

- `rulesofthegame_final` (producer: `rulesofthegame`)
- consumers: `presentation`

- `presentation_brief_final` (producer: `presentation`)
- consumers: terminal output only

## Ownership Rule

- No step may overwrite another step's final.
- Confirm flows write only the final of the active step.
- Exception: `dream_explainer` may write `dream_final` (shared ownership with `dream`).

