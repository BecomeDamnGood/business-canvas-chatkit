# Backup: version v89

**Version:** v89  
**Backup note date:** 2025-02-02

## Status for this version

This is version **v89** where everything works **almost correctly**:

- **Up through categorization inside the Dream Builder** – the flow and categorization in the Dream Builder work as intended.
- **Up through the transition to Purpose** – the transition to the Purpose step works correctly.

Use this backup as a reference or rollback point if later changes break behavior in this range.

## Technical reference

- **VERSION** in `server.ts`: fallback `"v89"` (or via `process.env.VERSION`).
- **Local testing:** `LOCAL_DEV=1 npm run dev` → http://localhost:8787/test
- **Production:** MCP endpoint `/mcp`, tool `run_step`; behavior unchanged vs earlier releases.
