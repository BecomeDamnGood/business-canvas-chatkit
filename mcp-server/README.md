# MCP Server – Business Strategy Canvas

## Local development

**Start dev:** run `npm run dev`.

The UI (step-card) is served as a single bundled HTML file (`ui/step-card.bundled.html`) with inline JS and data-URI assets; the server serves files under `/ui/*` from the filesystem. The bundle is generated from `ui/lib/*.ts` via `scripts/build-ui.mjs` (TS-first, no JS runtime source of truth).
