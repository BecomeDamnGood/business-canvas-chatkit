# MCP Server – Business Strategy Canvas

## Local development

**Start dev:** run `npm run dev`.

The UI source of truth lives in `ui/step-card.template.html` plus `ui/lib/*.ts`. `npm run build:ui` generates the served runtime artifact `ui/step-card.bundled.html`, and the server serves that bundled file under `/ui/*`. Runtime rendering is contract-first and fail-closed: the widget only consumes server-emitted `_meta.widget_result` + `ui.action_contract`.

## Deploy build notes

On Apple Silicon, a local Docker build will default to `arm64` unless you override it.

- Local validation: `docker build --build-arg APP_VERSION=v999-test -t business-canvas-mcp:v999-test .`
- Production image for App Runner: `./deploy-next.sh v326 linux/amd64`
- Preflight runtime UI asset contract: `npm run verify:ui-runtime-artifacts`
