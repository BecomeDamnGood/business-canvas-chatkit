// mcp-server/server.ts
import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { runCanvasStep } from "./agents.js";

const port = Number(process.env.PORT ?? 8787);
const host = "0.0.0.0";
const MCP_PATH = "/mcp";

const VERSION = "v12-agents";

// OpenAI Apps domain verification
const OPENAI_APPS_CHALLENGE_PATH = "/.well-known/openai-apps-challenge";
const OPENAI_APPS_CHALLENGE_TOKEN =
  process.env.OPENAI_APPS_CHALLENGE_TOKEN ?? "A467Dv1LPRa1lxtsLiwJsqHtyqKXDRCIVDnRA2xskw8";

// UI template settings
const UI_HTTP_PATH = "/ui/step-card";
const UI_RUN_STEP_PATH = "/ui/run-step";
const UI_MIME_TYPE = "text/html+skybridge";

// Optional UI auth token (recommended). If set, UI must send header x-ui-auth: <token>
const UI_AUTH_TOKEN = process.env.UI_AUTH_TOKEN ?? "";

// ---- Small helpers ----
function readJsonBody(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => (data += chunk.toString("utf8")));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function json(res: any, status: number, payload: any) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function stepCardHtml(): string {
  // This UI is "forced flow":
  // - user types inside widget
  // - widget POSTs to /ui/run-step (same server) to advance the state machine
  // - widget renders ONLY our desired UI (no extra ChatGPT text needed)
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Business Strategy Canvas Builder</title>
    <style>
      :root{
        --text:#0f172a;
        --muted:#64748b;
        --line:#e5e7eb;
        --bg:#ffffff;
        --card:#ffffff;
        --shadow:0 10px 30px rgba(15,23,42,0.06);
        --blue:#2f5bea;
        --blue2:#8ea6ff;
        --stepOff:#eef2f7;
      }
      *{ box-sizing:border-box; }
      body{
        margin:0;
        padding:0;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        color:var(--text);
        background:var(--bg);
      }
      .wrap{
        max-width: 1080px;
        margin: 0 auto;
        padding: 36px 20px 60px;
      }
      .title{
        text-align:center;
        font-size: 46px;
        letter-spacing: -0.02em;
        margin: 10px 0 6px;
        font-weight: 800;
      }
      .subtitle{
        text-align:center;
        font-size: 22px;
        color: var(--muted);
        margin: 0 0 26px;
        font-weight: 500;
      }

      .stepperRow{
        display:flex;
        align-items:center;
        justify-content:center;
        gap: 16px;
        margin: 18px 0 22px;
      }
      .stepper{
        display:flex;
        align-items:center;
        justify-content:center;
        gap: 0px;
      }
      .step{
        width: 56px;
        height: 56px;
        border-radius: 999px;
        display:flex;
        align-items:center;
        justify-content:center;
        font-weight: 700;
        font-size: 18px;
        background: var(--stepOff);
        color: #64748b;
        position: relative;
      }
      .step.active{
        background: var(--blue);
        color: white;
        box-shadow: 0 0 0 6px rgba(47,91,234,0.12);
      }
      .stepLine{
        width: 68px;
        height: 2px;
        background: var(--line);
      }

      .sectionTitle{
        text-align:center;
        font-size: 30px;
        font-weight: 800;
        margin: 8px 0 22px;
      }

      .card{
        max-width: 920px;
        margin: 0 auto;
        border-radius: 28px;
        border: 2px solid rgba(142,166,255,0.55);
        padding: 28px 28px 26px;
        background: var(--card);
        box-shadow: var(--shadow);
      }
      .cardInner{
        display:flex;
        align-items:flex-start;
        gap: 18px;
      }
      .badge{
        width: 64px;
        height: 64px;
        border-radius: 999px;
        background: var(--blue);
        color: white;
        display:flex;
        align-items:center;
        justify-content:center;
        font-weight: 800;
        font-size: 20px;
        flex: 0 0 auto;
      }
      .cardTitle{
        margin: 6px 0 6px;
        font-size: 34px;
        font-weight: 900;
        letter-spacing: -0.01em;
      }
      .cardDesc{
        margin: 0 0 18px;
        font-size: 22px;
        line-height: 1.45;
        color: var(--muted);
        max-width: 720px;
      }
      .prompt{
        font-size: 28px;
        font-weight: 800;
        margin: 12px 0 14px;
        letter-spacing: -0.01em;
      }

      .inputWrap{
        display:flex;
        align-items:flex-end;
        gap: 12px;
        margin-top: 8px;
      }
      textarea{
        width: 100%;
        min-height: 92px;
        resize: vertical;
        border-radius: 18px;
        border: 1px solid var(--line);
        padding: 18px 18px;
        font-size: 18px;
        outline: none;
        box-shadow: inset 0 1px 0 rgba(0,0,0,0.02);
      }
      textarea:focus{
        border-color: rgba(47,91,234,0.45);
        box-shadow: 0 0 0 4px rgba(47,91,234,0.10);
      }
      .send{
        width: 64px;
        height: 64px;
        border: none;
        border-radius: 18px;
        background: rgba(142,166,255,0.85);
        color: white;
        cursor: pointer;
        display:flex;
        align-items:center;
        justify-content:center;
        box-shadow: 0 10px 20px rgba(47,91,234,0.18);
      }
      .send:disabled{
        opacity: 0.5;
        cursor: not-allowed;
      }
      .send svg{ width: 26px; height: 26px; }

      .row{
        display:flex;
        gap: 10px;
        margin-top: 14px;
        flex-wrap: wrap;
      }
      .btn{
        border: 1px solid var(--line);
        background: #fff;
        border-radius: 999px;
        padding: 10px 14px;
        font-weight: 700;
        cursor: pointer;
      }
      .btn.primary{
        border-color: rgba(47,91,234,0.25);
        background: rgba(47,91,234,0.08);
      }

      .status{
        margin-top: 12px;
        color: var(--muted);
        font-size: 14px;
        white-space: pre-wrap;
      }

      .topRight{
        position: fixed;
        right: 14px;
        top: 10px;
        display:flex;
        gap: 10px;
        align-items:center;
        opacity: 0.9;
      }
      .langSelect{
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 6px 10px;
        background: #fff;
        font-weight: 600;
      }

      @media (max-width: 720px){
        .title{ font-size: 34px; }
        .subtitle{ font-size: 18px; }
        .cardTitle{ font-size: 26px; }
        .cardDesc{ font-size: 18px; }
        .prompt{ font-size: 22px; }
        .step{ width: 46px; height: 46px; }
        .stepLine{ width: 34px; }
        .badge{ width: 54px; height: 54px; }
        .send{ width: 56px; height: 56px; border-radius: 16px; }
      }
    </style>
  </head>
  <body>
    <div class="topRight">
      <select id="lang" class="langSelect" aria-label="Language">
        <option value="auto">Auto</option>
        <option value="en">EN</option>
        <option value="nl">NL</option>
        <option value="de">DE</option>
        <option value="fr">FR</option>
        <option value="es">ES</option>
        <option value="it">IT</option>
        <option value="pt">PT</option>
        <option value="tr">TR</option>
      </select>
    </div>

    <div class="wrap">
      <div class="title" id="uiTitle">Business Strategy Canvas Builder</div>
      <div class="subtitle" id="uiSubtitle">Build your strategic foundation step by step</div>

      <div class="stepperRow">
        <div class="stepper" id="stepper"></div>
      </div>

      <div class="sectionTitle" id="sectionTitle">Validation & Business Name</div>

      <div class="card">
        <div class="cardInner">
          <div class="badge" id="badge">1</div>
          <div style="flex:1">
            <div class="cardTitle" id="cardTitle">Validation & Business Name</div>
            <div class="cardDesc" id="cardDesc">
              Please share your company name and the kind of business it is to get started.
            </div>

            <div class="prompt" id="prompt">
              What is your business name or working title, and what problem does your business solve?
            </div>

            <div class="inputWrap">
              <textarea id="input" placeholder="Type here your answer..."></textarea>
              <button class="send" id="send" title="Send">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M3 11.5L21 3L12.5 21L11 13L3 11.5Z" fill="currentColor"/>
                </svg>
              </button>
            </div>

            <div class="row" id="quickBtns" style="display:none">
              <button class="btn primary" id="btnYes">Yes</button>
              <button class="btn" id="btnNo">No</button>
            </div>

            <div class="status" id="status"></div>
          </div>
        </div>
      </div>
    </div>

    <script>
      function pickData() {
        return (
          (globalThis.__SKYBRIDGE__ && globalThis.__SKYBRIDGE__.data) ||
          globalThis.skybridgeData ||
          globalThis.templateData ||
          {}
        );
      }

      const ORDER = ["step_0","dream","purpose","bigwhy","role","entity","strategy","rulesofthegame","presentation"];
      const TITLES = {
        step_0: { en: "Validation & Business Name", nl: "Validatie & Bedrijfsnaam" },
        dream: { en: "Dream", nl: "Droom" },
        purpose: { en: "Purpose", nl: "Purpose" },
        bigwhy: { en: "Big Why", nl: "Big Why" },
        role: { en: "Role", nl: "Rol" },
        entity: { en: "Entity", nl: "Entiteit" },
        strategy: { en: "Strategy", nl: "Strategie" },
        rulesofthegame: { en: "Rules of the game", nl: "Spelregels" },
        presentation: { en: "Presentation", nl: "Presentatie" },
      };

      // Multi-language strings (extend anytime). Fallbacks to English.
      const I18N = {
        uiTitle: {
          en: "Business Strategy Canvas Builder",
          nl: "Business Strategy Canvas Builder",
          de: "Business Strategy Canvas Builder",
          fr: "Business Strategy Canvas Builder",
          es: "Business Strategy Canvas Builder",
          it: "Business Strategy Canvas Builder",
          pt: "Business Strategy Canvas Builder",
          tr: "Business Strategy Canvas Builder",
        },
        uiSubtitle: {
          en: "Build your strategic foundation step by step",
          nl: "Bouw je strategische fundament stap voor stap",
          de: "Baue dein strategisches Fundament Schritt für Schritt",
          fr: "Construisez votre fondation stratégique étape par étape",
          es: "Construye tu base estratégica paso a paso",
          it: "Costruisci la tua base strategica passo dopo passo",
          pt: "Construa sua base estratégica passo a passo",
          tr: "Stratejik temelini adım adım oluştur",
        },
        // Step 1 description per your requirement
        step0Desc: {
          en: "Please share your company name and the kind of business it is to get started.",
          nl: "Deel je bedrijfsnaam en wat voor bedrijf het is om te beginnen.",
          de: "Teile deinen Firmennamen und die Art des Unternehmens, um zu starten.",
          fr: "Partagez le nom de votre entreprise et le type d’activité pour commencer.",
          es: "Comparte el nombre de tu empresa y el tipo de negocio para empezar.",
          it: "Condividi il nome della tua azienda e il tipo di attività per iniziare.",
          pt: "Compartilhe o nome da sua empresa e o tipo de negócio para começar.",
          tr: "Başlamak için şirket adını ve işletme türünü paylaş.",
        },
        inputPlaceholder: {
          en: "Type here your answer...",
          nl: "Typ hier je antwoord...",
          de: "Tippe hier deine Antwort...",
          fr: "Tapez votre réponse ici...",
          es: "Escribe tu respuesta aquí...",
          it: "Scrivi qui la tua risposta...",
          pt: "Digite sua resposta aqui...",
          tr: "Yanıtını buraya yaz...",
        },
        yes: { en: "Yes", nl: "Ja", de: "Ja", fr: "Oui", es: "Sí", it: "Sì", pt: "Sim", tr: "Evet" },
        no: { en: "No", nl: "Nee", de: "Nein", fr: "Non", es: "No", it: "No", pt: "Não", tr: "Hayır" },
      };

      function guessLocale() {
        const stored = localStorage.getItem("bsc_locale") || "auto";
        if (stored && stored !== "auto") return stored;

        const nav = (navigator.language || "en").toLowerCase();
        const short = nav.slice(0,2);
        return short || "en";
      }

      function t(key, locale) {
        const v = (I18N[key] || {});
        return v[locale] || v["en"] || "";
      }

      function safeLocale(locale) {
        const supported = ["en","nl","de","fr","es","it","pt","tr"];
        return supported.includes(locale) ? locale : "en";
      }

      function stepIndex(stepId) {
        const idx = ORDER.indexOf(stepId);
        return idx >= 0 ? idx : 0;
      }

      function stepTitle(stepId, locale) {
        const item = TITLES[stepId] || {};
        return item[locale] || item["en"] || "Step";
      }

      function buildStepper(activeIdx) {
        const el = document.getElementById("stepper");
        el.innerHTML = "";
        for (let i=0;i<9;i++){
          const s = document.createElement("div");
          s.className = "step" + (i===activeIdx ? " active" : "");
          s.textContent = String(i+1);
          el.appendChild(s);
          if (i<8){
            const line = document.createElement("div");
            line.className = "stepLine";
            el.appendChild(line);
          }
        }
      }

      function pickPromptFromSpecialist(specialist) {
        if (!specialist) return "";
        const c = String(specialist.confirmation_question || "").trim();
        const q = String(specialist.question || "").trim();
        return c || q || "";
      }

      function shouldShowYesNo(specialist) {
        // Show quick yes/no when there is a confirmation question, or when action is CONFIRM/ASK with confirm content
        if (!specialist) return false;
        const c = String(specialist.confirmation_question || "").trim();
        return !!c;
      }

      async function callRunStep(payload, uiAuthToken) {
        const headers = { "content-type": "application/json" };
        if (uiAuthToken) headers["x-ui-auth"] = uiAuthToken;
        const resp = await fetch("${UI_RUN_STEP_PATH}", {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          const msg = data && data.error ? data.error : ("HTTP " + resp.status);
          throw new Error(msg);
        }
        return data;
      }

      function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
      }

      function renderUI(modelResult, locale, uiAuthToken) {
        const state = modelResult?.state || {};
        const specialist = modelResult?.specialist || {};
        const current = state.current_step || "step_0";
        const idx = stepIndex(current);

        buildStepper(idx);

        const title = stepTitle(current, locale);
        setText("sectionTitle", title);
        setText("cardTitle", title);
        setText("badge", String(idx + 1));

        // Force your desired Step 1 description text (and allow future step descriptions later).
        const descEl = document.getElementById("cardDesc");
        if (descEl) {
          if (current === "step_0") descEl.textContent = t("step0Desc", locale);
          else descEl.textContent = ""; // you can later add descriptions per step
        }

        // Prompt from agent (strict flow)
        const prompt = pickPromptFromSpecialist(specialist) || modelResult?.text || "";
        setText("prompt", prompt || "");

        // yes/no buttons
        const showYN = shouldShowYesNo(specialist);
        const quick = document.getElementById("quickBtns");
        if (quick) quick.style.display = showYN ? "flex" : "none";
        setText("btnYes", t("yes", locale));
        setText("btnNo", t("no", locale));

        // status (optional debug)
        const status = document.getElementById("status");
        if (status) {
          const meta = [
            "step: " + (state.current_step || ""),
            "specialist: " + (modelResult.active_specialist || ""),
            "version: " + (modelResult.version || ""),
          ].join(" | ");
          status.textContent = meta;
        }

        // Save app state in window for continued steps
        window.__BSC__ = {
          step: current,
          state,
          locale,
          uiAuthToken,
        };
      }

      function loadInitial() {
        const data = pickData();

        // language: from state.language if present, else localStorage/browser.
        const initialState = data?.ui?.state || data?.state || {};
        const stateLang = (initialState && initialState.language) ? String(initialState.language) : "";
        const localeFromState = stateLang ? stateLang : guessLocale();
        let locale = safeLocale(localeFromState);

        const langSelect = document.getElementById("lang");
        if (langSelect) {
          const stored = localStorage.getItem("bsc_locale") || "auto";
          langSelect.value = stored;
          langSelect.addEventListener("change", () => {
            localStorage.setItem("bsc_locale", langSelect.value);
            const next = safeLocale(guessLocale());
            locale = next;
            setText("uiTitle", t("uiTitle", locale));
            setText("uiSubtitle", t("uiSubtitle", locale));
            const cur = window.__BSC__?.step || (initialState.current_step || "step_0");
            const fakeResult = window.__BSC__?.lastResult || data?.ui?.result || data?.result || data;
            if (fakeResult) renderUI(fakeResult, locale, window.__BSC__?.uiAuthToken || "");
          });
        }

        setText("uiTitle", t("uiTitle", locale));
        setText("uiSubtitle", t("uiSubtitle", locale));

        const uiAuthToken = data?.ui?.uiAuthToken || "";

        // If we were given a model result, render it. Otherwise render a default step_0 shell.
        const result = data?.ui?.result || data?.result || null;

        if (result) {
          renderUI(result, locale, uiAuthToken);
          window.__BSC__.lastResult = result;
        } else {
          // default
          renderUI(
            {
              text: "",
              specialist: {},
              state: { current_step: "step_0" },
              active_specialist: "",
              version: "",
            },
            locale,
            uiAuthToken
          );
        }

        const input = document.getElementById("input");
        if (input) input.placeholder = t("inputPlaceholder", locale);

        const send = document.getElementById("send");
        const btnYes = document.getElementById("btnYes");
        const btnNo = document.getElementById("btnNo");

        async function submitMessage(message) {
          const st = window.__BSC__?.state || {};
          const step = window.__BSC__?.step || "step_0";
          const token = window.__BSC__?.uiAuthToken || "";
          const payload = {
            current_step_id: step,
            user_message: message,
            state: st || {},
          };

          if (send) send.disabled = true;
          try {
            const data = await callRunStep(payload, token);
            const nextResult = data.result;
            const localeNow = safeLocale(guessLocale());
            setText("uiTitle", t("uiTitle", localeNow));
            setText("uiSubtitle", t("uiSubtitle", localeNow));

            renderUI(nextResult, localeNow, token);
            window.__BSC__.lastResult = nextResult;

            if (input) input.value = "";
          } catch (e) {
            const status = document.getElementById("status");
            if (status) status.textContent = "Error: " + (e && e.message ? e.message : String(e));
          } finally {
            if (send) send.disabled = false;
          }
        }

        if (send) {
          send.addEventListener("click", () => {
            const v = (input && input.value) ? input.value.trim() : "";
            if (!v) return;
            submitMessage(v);
          });
        }

        if (input) {
          input.addEventListener("keydown", (ev) => {
            // Enter to send, Shift+Enter newline
            if (ev.key === "Enter" && !ev.shiftKey) {
              ev.preventDefault();
              const v = input.value.trim();
              if (!v) return;
              submitMessage(v);
            }
          });
        }

        if (btnYes) btnYes.addEventListener("click", () => submitMessage(t("yes", safeLocale(guessLocale())).toLowerCase()));
        if (btnNo) btnNo.addEventListener("click", () => submitMessage(t("no", safeLocale(guessLocale())).toLowerCase()));
      }

      loadInitial();
    </script>
  </body>
</html>`;
}

function createAppServer() {
  const server = new McpServer({ name: "business-canvas-mcp", version: "0.1.0" });

  server.registerTool(
    "ping",
    {
      title: "Ping",
      description: "Health check. Returns pong plus an optional echo message.",
      inputSchema: { message: z.string().optional() },
    },
    async (args) => {
      const message = args?.message;
      return { content: [{ type: "text", text: message ? `pong: ${message}` : "pong" }] };
    }
  );

  server.registerTool(
    "run_step",
    {
      title: "Run Step",
      description:
        "Runs the Business Canvas agents flow (router + specialists + integrator). Returns UI template metadata.",
      inputSchema: {
        current_step_id: z.string(),
        user_message: z.string(),
        state: z.record(z.string(), z.any()).optional(),
      },
    },
    async (args) => {
      const result = await runCanvasStep({
        current_step_id: args.current_step_id,
        user_message: args.user_message,
        state: args.state ?? {},
      });

      // IMPORTANT: keep content minimal so ChatGPT is less likely to add extra text.
      // The UI is the primary surface.
      return {
        content: [{ type: "text", text: result.text || "Rendered in UI." }],
        structuredContent: {
          title: `Business Canvas (${VERSION})`,
          body: result.text,
          meta: `step: ${result.state.current_step} | specialist: ${result.active_specialist} | templateUrl: ${UI_HTTP_PATH}`,
          ui: {
            result,
            state: result.state,
            uiAuthToken: UI_AUTH_TOKEN ? "set" : "",
          },
        },
        _meta: {
          "openai/outputTemplateUrl": UI_HTTP_PATH,
        },
      };
    }
  );

  return server;
}

const httpServer = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end("Missing URL");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  // OpenAI Apps domain verification
  if (req.method === "GET" && url.pathname === OPENAI_APPS_CHALLENGE_PATH) {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(OPENAI_APPS_CHALLENGE_TOKEN);
    return;
  }

  // Health version
  if (req.method === "GET" && url.pathname === "/version") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(`VERSION=${VERSION}`);
    return;
  }

  // UI template
  if (req.method === "GET" && url.pathname === UI_HTTP_PATH) {
    res.writeHead(200, { "content-type": UI_MIME_TYPE });
    res.end(stepCardHtml());
    return;
  }

  // UI-run-step (forced flow)
  if (req.method === "POST" && url.pathname === UI_RUN_STEP_PATH) {
    try {
      if (UI_AUTH_TOKEN) {
        const header = String(req.headers["x-ui-auth"] ?? "");
        if (header !== UI_AUTH_TOKEN) {
          json(res, 401, { ok: false, error: "Unauthorized UI request" });
          return;
        }
      }

      const body = await readJsonBody(req);
      const current_step_id = String(body?.current_step_id ?? "step_0");
      const user_message = String(body?.user_message ?? "");
      const state = (body?.state && typeof body.state === "object") ? body.state : {};

      const result = await runCanvasStep({ current_step_id, user_message, state });
      json(res, 200, { ok: true, result });
    } catch (e: any) {
      json(res, 500, { ok: false, error: e?.message ? String(e.message) : "Internal error" });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/plain" }).end(`Business Canvas MCP server (${VERSION})`);
    return;
  }

  const MCP_METHODS = new Set(["POST", "GET", "DELETE", "OPTIONS"]);
  if (url.pathname === MCP_PATH && req.method && MCP_METHODS.has(req.method)) {
    const mcpServer = createAppServer();
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });

    res.on("close", () => {
      transport.close();
      mcpServer.close();
    });

    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) res.writeHead(500).end("Internal server error");
    }
    return;
  }

  res.writeHead(404).end("Not Found");
});

httpServer.listen(port, host, () => {
  console.log(\`Business Canvas MCP server listening on http://\${host}:\${port}\${MCP_PATH} (\${VERSION})\`);
});
