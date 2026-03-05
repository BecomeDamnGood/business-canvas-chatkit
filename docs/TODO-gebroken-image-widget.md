# TODO - Ben-foto moet zichtbaar zijn (zonder safety-blokkades)

Datum: 2026-03-04
Status: aangepast volgens verzoek

## Wat er fout ging
De Ben-profielflow werd eerder omgebouwd naar text-only. Daardoor verdween de image-injectie uit de runtime en bleef alleen tekst over.

## Wat nu hard is aangepast
1. Ben-profieltekst is weer tekst-only (geen markdown image-regel in message):
   - Bestand: `mcp-server/src/handlers/run_step_policy_meta.ts`

2. Ben-foto wordt direct en expliciet in de Ben-profielview gerenderd (niet via text/markdown-pipeline):
   - `img.cardDesc-image` met bron `assets/ben-steenstra.webp` op widget-origin
   - Bestand: `mcp-server/ui/lib/ui_render.ts`
   - Bestand: `mcp-server/ui/step-card.bundled.html`

3. Ben-profiel typografie staat weer aan:
   - `is-ben-profile` class wordt weer gezet bij `meta_topic = BEN_PROFILE`
   - Bestand: `mcp-server/ui/lib/ui_render.ts`
   - Bestand: `mcp-server/ui/step-card.bundled.html`

4. Markdown-image URL blokkade verwijderd:
   - geen schema-whitelist/URL-whitelist meer in `extractMarkdownImage(...)`
   - Bestand: `mcp-server/ui/lib/ui_text.ts`
   - Bestand: `mcp-server/ui/step-card.bundled.html`

5. CSP image beperking opengezet:
   - `img-src` staat nu open (`*`, `data:`, `blob:`, `https:`, `http:`)
   - Bestand: `mcp-server/src/middleware/security.ts`

6. Widget-CSP staat nu weer conform OpenAI Apps SDK:
   - `openai/widgetCSP` met `resource_domains` + `connect_domains` op widget-origin
   - Bestand: `mcp-server/src/server/mcp_registration.ts`

7. `/ui` static serving guards verwijderd:
   - path-prefix check (`resolved.startsWith(uiDir)`) verwijderd
   - `stat.isFile()` check verwijderd
   - Bestand: `mcp-server/src/server/http_routes.ts`

8. UI fallback/guard verwijderd:
   - geen `graceful_fallback` meer die body/prompt overschrijft
   - bundled guard die blokkeerde op "interactive content missing" is ook verwijderd
   - Bestand: `mcp-server/ui/lib/ui_render.ts`
   - Bestand: `mcp-server/ui/step-card.bundled.html`

## Link naar de foto
- Relatief in de app: `/ui/assets/ben-steenstra.webp`
- Volledig met jouw huidige App Runner domein: `https://xp8hpu4mmw.us-east-1.awsapprunner.com/ui/assets/ben-steenstra.webp`

## OpenAI-documentatie (referentie)
- https://developers.openai.com/apps-sdk/build/chatgpt-ui
- https://developers.openai.com/apps-sdk/guides/security-privacy
- https://developers.openai.com/apps-sdk/deploy/troubleshooting
