# ActionCode PR Summary

Context: Summary of ActionCode migration PR commits and diffs.

| PR | Commit | Files changed | Insertions/Deletions | Files list |
| --- | --- | --- | --- | --- |
| pr10 | `be3dd25` pr10: add ActionCode contract checks to CI | 3 | +147 / -80 | .github/workflows/ci.yml<br>docs/actioncode-diff.json<br>mcp-server/scripts/actioncode-diff.mjs |
| pr9 | `3815b1a` pr9: strict ActionCode handling and UI flags | 2 | +65 / -25 | mcp-server/src/handlers/run_step.ts<br>mcp-server/ui/step-card.template.html |
| pr8 | `d57ad00` pr8: enforce menu contract and gate legacy routing | 2 | +15 / -8 | mcp-server/src/handlers/run_step.ts<br>mcp-server/ui/step-card.template.html |
| pr7 | `0484a63` pr7: use registry action codes with fallback | 1 | +23 / -4 | mcp-server/ui/step-card.template.html |
| pr6 | `1dce26e` pr6: add shadow-compare telemetry | 2 | +70 / -1 | mcp-server/src/handlers/run_step.ts<br>mcp-server/ui/step-card.template.html |
| pr5 | `936c0b0` pr5: include registry_version and ui action codes | 1 | +47 / -24 | mcp-server/src/handlers/run_step.ts |
| pr4 | `8b48746` pr4: add ActionCode registry and use it | 2 | +304 / -109 | mcp-server/src/core/actioncode_registry.ts<br>mcp-server/src/handlers/run_step.ts |
| pr3 | `fa8dd3b` pr3: add input_mode to run_step | 2 | +6 / -0 | mcp-server/src/handlers/run_step.ts<br>mcp-server/ui/step-card.template.html |
| pr2 | `28c5892` pr2: add ActionCode diff report | 2 | +596 / -0 | docs/actioncode-diff.json<br>mcp-server/scripts/actioncode-diff.mjs |

_Generated at 2026-02-11 07:55:45 UTC_.
