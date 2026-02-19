# Text Structure Analysis Matrix

This matrix defines how `cardDesc` body content is rendered consistently per step, using one semantic rule set:

- ordered list for sequential steps/questions/instructions
- bullet list for enumerations/examples/features
- paragraph for regular narrative text
- heading-like line for explicit heading markers (for example `<strong>Heading</strong>` or `Heading:`)

## Source Inputs Used

- Live outputs:
  - `tests/live-audit-reports/live-full-audit-2026-02-17T18-38-04/report.md`
  - `tests/live-audit-reports/live-full-audit-2026-02-17T19-02-14/report.md`
- Existing regression fixtures (for steps not fully covered in live reports):
  - `mcp-server/src/ui_render.test.ts`
  - `mcp-server/src/handlers/run_step_finals.test.ts`

## Per-Step Matrix

| Step | Context | Example Source | Block Types | Render Decision |
| --- | --- | --- | --- | --- |
| `step_0` | intro | live report 18-38 lines 19-32 | heading + bullets + paragraphs | `heading_like_line`, `bullet_list`, `paragraph` |
| `step_0` | off-topic / ask state | live report 19-02 lines 24-26 | short narrative | `paragraph` |
| `dream` | intro/explain | live report 18-38 lines 46-49 | narrative paragraphs | `paragraph` |
| `dream` | refine prompt context in body | live report 19-02 lines 58-61 | heading + paragraph | `heading_like_line`, `paragraph` |
| `dream` | DreamBuilder context | existing fixtures (`DreamExplainer` scenarios) | statement list + follow-up question | `ordered_list` + `paragraph` |
| `purpose` | intro/explain | live report 18-38 lines 64-68 | heading + paragraph | `heading_like_line`, `paragraph` |
| `purpose` | ask-3-questions context | run_step finals fixtures | ordered questions + paragraph instruction | `ordered_list`, `paragraph` |
| `bigwhy` | intro/explain | live report 18-38 lines 87-90 | multi-paragraph narrative | `paragraph` |
| `bigwhy` | examples/questions | run_step finals fixtures | numbered question/examples | `ordered_list` + `paragraph` |
| `role` | intro/explain | live report 18-38 lines 112-115 | multi-paragraph narrative | `paragraph` |
| `role` | refine context | run_step finals fixtures | short heading + narrative | `heading_like_line`, `paragraph` |
| `entity` | refine context | live report 19-02 lines 132-134 | short narrative | `paragraph` |
| `entity` | examples/definition context | run_step finals fixtures | short list-like examples | `bullet_list` or `ordered_list` when explicitly numbered |
| `strategy` | intro/explain | run_step finals fixtures | narrative + optional list bullets | `paragraph` + `bullet_list` when list markers exist |
| `strategy` | wording-choice context | `ui_render.test.ts` wording list mode | list items stay in wording panel, not card body | `cardDesc` unchanged; wording panel controls list |
| `targetgroup` | intro/explain | run_step finals fixtures | narrative + optional examples | `paragraph` + `bullet_list` when list markers exist |
| `productsservices` | intro/explain | run_step finals fixtures | list-like offer points | `bullet_list` when bullet markers, else `paragraph` |
| `rulesofthegame` | intro/explain | run_step finals fixtures | rule enumeration | `ordered_list` when numbered, `bullet_list` for bullets |
| `presentation` | summary/brief | run_step finals fixtures | narrative summary | `paragraph` |

## Anti-Regression Rules

- Only `cardDesc` body is structurally transformed.
- `prompt` remains contract-driven and uses existing inline rendering.
- `ui.actions` / `ui.action_codes` are not transformed by text renderer.
- Wording-choice panel is excluded from list conversion.
- Body/prompt dedupe remains active to prevent duplicate lines.

