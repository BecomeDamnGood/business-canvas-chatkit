# Text Presentation Contract

This contract separates display text from routing/action semantics.

## Canonical Fields

- `message`: primary specialist narrative and coaching text.
- `refined_formulation`: highlighted candidate wording when provided.
- `questionText`: display-only numbered options line(s), generated from `actions[]`.
- `actions[]`: canonical interactive choices for button rendering.

## Hard Separation Rule

- Generic chooser instructions (`choose/pick/select 1/2/...`) are forbidden in `message`.
- These instructions are allowed only in `question` / `questionText`.
- If confirm options are filtered out and action count changes, message text must still remain free of chooser lines.

## Rendering Locations

- Main body:
- `message`
- Refinement panel:
- `refined_formulation` when non-empty
- Prompt area:
- `questionText` (display only)
- Button area:
- `actions[]` (source of truth for click behavior)

## Structural Rendering Policy

- `cardDesc` body uses semantic structure rendering (paragraph / ordered list / bullet list / heading-like line).
- The analysis baseline per step is maintained in:
- `docs/contracts/text-structure-analysis-matrix.md`
- `prompt` and `actions[]` are not reformatted by the body renderer.

## Recap Rendering

- Recap is derived from canonical finals snapshot.
- Recap must not invent placeholder values for missing finals.

## Wording Choice Rendering

- When wording choice is pending, render wording panel and suppress regular action buttons.

## Legacy Compatibility

- If `actions[]` is absent, UI may temporarily fallback to legacy numbered choice parsing.
- Contract target state is `actions[]`-first rendering with no parser dependency.
