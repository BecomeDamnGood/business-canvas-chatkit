# Compare Contract Freeze

This bug family is release-blocking.

## Single Owner

Active compare visibility is owned only by `ui.pending_interaction`.

- `ui.feedback_contract` is producer input only.
- `ui.wording_choice` is legacy compatibility input only.
- `ui.view.variant` is descriptive only.
- If compare is active and `ui.pending_interaction` is missing or malformed, the flow must fail closed with a contract error.

## Never Again Rules

- Do not add fallback rendering from compare sources to the generic semantic card.
- Do not add Dream-only compare visibility exceptions.
- Do not treat `ui.feedback_contract` or `ui.wording_choice` as alternate client-visible render owners.

## Required Proof

Changes in this bug family must keep these gates green:

- `npm run test:compare-proof`
- `node scripts/build-ui.mjs --check`
- `node scripts/verify-ui-runtime-artifacts.mjs`
- `node --loader ts-node/esm scripts/contract-smoke.mjs`

## Release Blocker

Any screenshot that shows a generic suggestion card while compare is pending is a blocker until the contract failure or compare surface is restored.
