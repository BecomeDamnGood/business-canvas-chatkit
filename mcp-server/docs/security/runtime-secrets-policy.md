# Runtime Secrets Policy (Production)

## Scope
Dit beleid geldt voor `mcp-server` in productie-omgevingen.

## Verplichte regels
1. Secrets mogen niet uit lokale plaintext bestanden (`.env`) komen in productie.
2. `OPENAI_API_KEY` moet beschikbaar zijn via runtime secret injection.
3. De herkomst van secrets moet expliciet zijn via `BSC_RUNTIME_SECRET_SOURCE`.
4. Alleen goedgekeurde secret-bronnen zijn toegestaan:
- `aws_secrets_manager`
- `gcp_secret_manager`
- `azure_key_vault`
- `hashicorp_vault`
- `runtime_secret_injection`

## Enforced in code
- `src/server/server_config.ts`
  - `.env` loading alleen in local dev/test.
  - productie startup faalt zonder `OPENAI_API_KEY`.
  - productie startup faalt zonder geldige secret source.

## Required env in production
- `NODE_ENV=production`
- `OPENAI_API_KEY=<runtime injected secret>`
- `BSC_RUNTIME_SECRET_SOURCE=<approved source>`
- `OPENAI_APPS_CHALLENGE_TOKEN=<set when challenge endpoint is used>`

## Operational verification checklist
1. Deployment spec bevat secret reference, geen plaintext key.
2. App startup in productie slaagt alleen met geldige secret source.
3. `/.well-known/openai-apps-challenge` geeft alleen token terug als expliciet gezet.
