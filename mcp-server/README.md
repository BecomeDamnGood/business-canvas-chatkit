# MCP Server – Business Strategy Canvas

## Local development

**Start dev:** Use two terminals:

1. **Terminal 1:** `npm run build:ui -- --watch` – compile UI modules on change
2. **Terminal 2:** `npm run dev` – run the server

The UI (step-card) is served as a single bundled HTML file (`ui/step-card.bundled.html`) with inline JS and data-URI assets; the server serves files under `/ui/*` from the filesystem.
