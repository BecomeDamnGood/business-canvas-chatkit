# MCP Server – Business Strategy Canvas

## Local development

**Start dev:** Use two terminals:

1. **Terminal 1:** `npm run build:ui -- --watch` – compile UI modules on change
2. **Terminal 2:** `npm run dev` – run the server

The UI (step-card) loads `/ui/lib/main.js`; the server serves all files under `/ui/*` from the filesystem.
