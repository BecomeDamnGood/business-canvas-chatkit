import type { ReportsPayload } from "./reports_analytics.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderReportsDashboardHtml(params: {
  payload: ReportsPayload;
  apiPath: string;
}): string {
  const payloadJson = JSON.stringify(params.payload)
    .replaceAll("<", "\\u003c")
    .replaceAll("</script>", "<\\/script>");
  const apiPath = escapeHtml(params.apiPath);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Business Canvas Reports</title>
    <style>
      :root {
        --bg: #f6f0e8;
        --panel: rgba(255, 252, 247, 0.92);
        --panel-border: rgba(92, 55, 24, 0.12);
        --text: #2f241c;
        --muted: #7f6958;
        --accent: #e67e3b;
        --accent-soft: rgba(230, 126, 59, 0.18);
        --line: rgba(47, 36, 28, 0.12);
        --shadow: 0 20px 50px rgba(79, 51, 31, 0.12);
        --radius: 22px;
        --radius-sm: 14px;
        --font-display: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
        --font-body: "Avenir Next", "Segoe UI", system-ui, sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        padding: 0;
        background:
          radial-gradient(circle at top right, rgba(230, 126, 59, 0.18), transparent 34%),
          linear-gradient(180deg, #fcf8f2 0%, #f4ede4 100%);
        color: var(--text);
        font-family: var(--font-body);
      }

      body {
        min-height: 100vh;
        padding: 28px;
      }

      .shell {
        max-width: 1280px;
        margin: 0 auto;
        display: grid;
        gap: 20px;
      }

      .hero,
      .panel {
        background: var(--panel);
        border: 1px solid var(--panel-border);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
        backdrop-filter: blur(14px);
      }

      .hero {
        padding: 26px 28px 24px;
        position: relative;
        overflow: hidden;
      }

      .hero::after {
        content: "";
        position: absolute;
        inset: auto -90px -90px auto;
        width: 220px;
        height: 220px;
        background: radial-gradient(circle, rgba(230, 126, 59, 0.18), transparent 68%);
        pointer-events: none;
      }

      .eyebrow {
        margin: 0 0 10px;
        color: var(--accent);
        letter-spacing: 0.18em;
        text-transform: uppercase;
        font-size: 12px;
        font-weight: 700;
      }

      h1 {
        margin: 0;
        font-family: var(--font-display);
        font-size: clamp(32px, 4vw, 52px);
        line-height: 0.95;
        max-width: 760px;
      }

      .subcopy {
        margin: 14px 0 0;
        max-width: 760px;
        color: var(--muted);
        font-size: 15px;
        line-height: 1.6;
      }

      .controls {
        display: flex;
        flex-wrap: wrap;
        gap: 14px;
        margin-top: 22px;
        align-items: end;
      }

      .field {
        display: grid;
        gap: 8px;
      }

      .field label {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .field input {
        min-width: 180px;
        border: 1px solid rgba(47, 36, 28, 0.16);
        border-radius: 999px;
        padding: 12px 16px;
        background: rgba(255, 255, 255, 0.95);
        color: var(--text);
        font: inherit;
      }

      .refresh {
        border: 0;
        border-radius: 999px;
        background: linear-gradient(135deg, #f28f4b, #db6d2d);
        color: #fff9f4;
        padding: 13px 22px;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
        transition: transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease;
        box-shadow: 0 14px 28px rgba(219, 109, 45, 0.28);
      }

      .refresh:hover {
        transform: translateY(-1px);
      }

      .refresh:disabled {
        opacity: 0.6;
        cursor: wait;
        transform: none;
      }

      .status {
        margin-top: 14px;
        min-height: 22px;
        color: var(--muted);
        font-size: 14px;
      }

      .metrics {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        gap: 16px;
      }

      .metric {
        padding: 20px;
      }

      .metric-label {
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-size: 11px;
        font-weight: 700;
      }

      .metric-value {
        margin-top: 10px;
        font-family: var(--font-display);
        font-size: clamp(30px, 3vw, 44px);
        line-height: 1;
      }

      .layout {
        display: grid;
        grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
        gap: 20px;
      }

      .stack {
        display: grid;
        gap: 20px;
      }

      .panel {
        padding: 20px;
      }

      .panel h2 {
        margin: 0 0 6px;
        font-family: var(--font-display);
        font-size: 28px;
      }

      .panel p {
        margin: 0 0 18px;
        color: var(--muted);
        line-height: 1.5;
      }

      .funnel-list,
      .daily-list {
        display: grid;
        gap: 10px;
      }

      .funnel-row,
      .daily-row {
        display: grid;
        grid-template-columns: minmax(110px, 1fr) 64px minmax(160px, 1.4fr);
        gap: 12px;
        align-items: center;
        padding: 12px 14px;
        border-radius: var(--radius-sm);
        background: rgba(255, 255, 255, 0.78);
        border: 1px solid rgba(47, 36, 28, 0.08);
      }

      .funnel-row strong,
      .daily-row strong {
        font-size: 14px;
      }

      .pill {
        justify-self: start;
        border-radius: 999px;
        background: rgba(47, 36, 28, 0.06);
        padding: 4px 10px;
        font-size: 12px;
        color: var(--muted);
      }

      .bar {
        position: relative;
        height: 12px;
        border-radius: 999px;
        overflow: hidden;
        background: rgba(47, 36, 28, 0.08);
      }

      .bar > span {
        position: absolute;
        inset: 0 auto 0 0;
        background: linear-gradient(90deg, rgba(230, 126, 59, 0.35), rgba(230, 126, 59, 0.95));
        border-radius: inherit;
      }

      .chart {
        border-radius: var(--radius-sm);
        background: linear-gradient(180deg, rgba(255,255,255,0.88), rgba(252,247,240,0.92));
        border: 1px solid rgba(47, 36, 28, 0.08);
        padding: 16px;
      }

      .chart svg {
        display: block;
        width: 100%;
        height: auto;
      }

      .legend {
        display: flex;
        flex-wrap: wrap;
        gap: 10px 14px;
        margin-top: 14px;
      }

      .legend-item {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        color: var(--muted);
      }

      .legend-swatch {
        width: 10px;
        height: 10px;
        border-radius: 999px;
      }

      .daily-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }

      .daily-table th,
      .daily-table td {
        text-align: left;
        padding: 10px 8px;
        border-bottom: 1px solid rgba(47, 36, 28, 0.08);
      }

      .daily-table th {
        color: var(--muted);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.11em;
      }

      .error {
        color: #a73319;
      }

      @media (max-width: 1040px) {
        body {
          padding: 18px;
        }

        .layout {
          grid-template-columns: 1fr;
        }

        .daily-row,
        .funnel-row {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <section class="hero">
        <p class="eyebrow">Business Canvas Builder</p>
        <h1>Live usage reports for the ChatGPT strategy app</h1>
        <p class="subcopy">
          Pick a date range, refresh the latest CloudWatch data, and inspect both the funnel totals
          and daily usage patterns in one place.
        </p>
        <div class="controls">
          <div class="field">
            <label for="fromDate">Date from</label>
            <input id="fromDate" type="date" />
          </div>
          <div class="field">
            <label for="toDate">Date to</label>
            <input id="toDate" type="date" />
          </div>
          <button id="refreshButton" class="refresh" type="button">Refresh data</button>
        </div>
        <div id="status" class="status"></div>
      </section>

      <section class="metrics" id="metrics"></section>

      <section class="layout">
        <div class="stack">
          <article class="panel">
            <h2>Sessions per day</h2>
            <p>Unique opened sessions for every day in the selected window.</p>
            <div class="chart">
              <div id="sessionsChart"></div>
            </div>
          </article>

          <article class="panel">
            <h2>Steps reached per day</h2>
            <p>Daily progression lines show how many unique sessions reached each step.</p>
            <div class="chart">
              <div id="stepsChart"></div>
            </div>
            <div id="stepsLegend" class="legend"></div>
          </article>

          <article class="panel">
            <h2>Daily detail</h2>
            <p>Compact daily table with opened sessions and the deepest step activity per day.</p>
            <div id="dailyTable"></div>
          </article>
        </div>

        <div class="stack">
          <article class="panel">
            <h2>Range funnel</h2>
            <p>Unique sessions over the selected range, from opening the app through presentation creation.</p>
            <div id="funnelList" class="funnel-list"></div>
          </article>
        </div>
      </section>
    </div>

    <script>
      const INITIAL_PAYLOAD = ${payloadJson};
      const REPORTS_API_PATH = "${apiPath}";
      const STEP_COLORS = {
        step_0: "#2f241c",
        dream: "#d86f2f",
        purpose: "#ce8d45",
        bigwhy: "#b55432",
        role: "#5f7a72",
        entity: "#4f8795",
        strategy: "#5874b8",
        targetgroup: "#7256a5",
        productsservices: "#a95a8c",
        rulesofthegame: "#7f6958",
        presentation: "#1c7d5d"
      };
      const STEP_LABELS = Object.fromEntries(INITIAL_PAYLOAD.summary.steps.map((step) => [step.id, step.label]));
      const metricsElement = document.getElementById("metrics");
      const funnelListElement = document.getElementById("funnelList");
      const sessionsChartElement = document.getElementById("sessionsChart");
      const stepsChartElement = document.getElementById("stepsChart");
      const stepsLegendElement = document.getElementById("stepsLegend");
      const dailyTableElement = document.getElementById("dailyTable");
      const fromInput = document.getElementById("fromDate");
      const toInput = document.getElementById("toDate");
      const refreshButton = document.getElementById("refreshButton");
      const statusElement = document.getElementById("status");

      let activePayload = INITIAL_PAYLOAD;
      let resizeObserver = null;

      function setStatus(message, isError = false) {
        statusElement.textContent = message || "";
        statusElement.classList.toggle("error", Boolean(isError));
      }

      function percent(value, total) {
        if (!total) return "0.0%";
        return ((value / total) * 100).toFixed(1) + "%";
      }

      function createMetric(label, value, helper) {
        const wrapper = document.createElement("article");
        wrapper.className = "metric hero";
        wrapper.innerHTML = \`
          <div class="metric-label">\${label}</div>
          <div class="metric-value">\${value}</div>
          <div class="subcopy">\${helper}</div>
        \`;
        return wrapper;
      }

      function renderMetrics(payload) {
        metricsElement.innerHTML = "";
        const opened = payload.summary.openedSessions;
        const presentation = payload.summary.presentationSessions;
        const lastStep = payload.summary.steps[payload.summary.steps.length - 1]?.sessions || 0;
        metricsElement.append(
          createMetric("Opened sessions", String(opened), "Unique sessions that started the app."),
          createMetric("Presentation sessions", String(presentation), percent(presentation, opened) + " of opened sessions generated a presentation."),
          createMetric("Step 11 reached", String(lastStep), percent(lastStep, opened) + " of opened sessions reached the presentation step.")
        );
      }

      function renderFunnel(payload) {
        const opened = payload.summary.openedSessions;
        const rows = [
          { label: "Opened", sessions: opened, id: "opened" },
          ...payload.summary.steps,
          { label: "Presentations", sessions: payload.summary.presentationSessions, id: "presentation_generated" }
        ];

        funnelListElement.innerHTML = "";
        rows.forEach((row) => {
          const rowElement = document.createElement("div");
          rowElement.className = "funnel-row";
          const width = opened ? Math.max((row.sessions / opened) * 100, row.sessions > 0 ? 2 : 0) : 0;
          rowElement.innerHTML = \`
            <strong>\${row.label}</strong>
            <span class="pill">\${row.sessions}</span>
            <div class="bar"><span style="width:\${width}%;"></span></div>
          \`;
          funnelListElement.appendChild(rowElement);
        });
      }

      function buildLineChart(series, options = {}) {
        const width = options.width || 900;
        const height = options.height || 320;
        const margin = { top: 20, right: 18, bottom: 44, left: 48 };
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;
        const labels = series[0]?.points.map((point) => point.label) || [];
        const values = series.flatMap((entry) => entry.points.map((point) => point.value));
        const maxValue = Math.max(...values, 1);
        const xStep = labels.length > 1 ? innerWidth / (labels.length - 1) : innerWidth;
        const yFor = (value) => margin.top + innerHeight - (value / maxValue) * innerHeight;
        const xFor = (index) => margin.left + xStep * index;
        const ticks = 4;
        const yTicks = Array.from({ length: ticks + 1 }, (_, index) => Math.round((maxValue / ticks) * index));

        const lineMarkup = series.map((entry) => {
          const points = entry.points.map((point, index) => \`\${xFor(index)},\${yFor(point.value)}\`).join(" ");
          const circles = entry.points.map((point, index) => \`
            <circle cx="\${xFor(index)}" cy="\${yFor(point.value)}" r="3.4" fill="\${entry.color}"></circle>
          \`).join("");
          return \`
            <polyline fill="none" stroke="\${entry.color}" stroke-width="\${entry.strokeWidth || 2.5}" stroke-linecap="round" stroke-linejoin="round" points="\${points}"></polyline>
            \${circles}
          \`;
        }).join("");

        const yGrid = yTicks.map((tick) => {
          const y = yFor(tick);
          return \`
            <line x1="\${margin.left}" y1="\${y}" x2="\${width - margin.right}" y2="\${y}" stroke="rgba(47,36,28,0.10)" stroke-dasharray="3 6"></line>
            <text x="\${margin.left - 10}" y="\${y + 4}" text-anchor="end" font-size="11" fill="#7f6958">\${tick}</text>
          \`;
        }).join("");

        const xLabels = labels.map((label, index) => \`
          <text x="\${xFor(index)}" y="\${height - 16}" text-anchor="middle" font-size="11" fill="#7f6958">\${label.slice(5)}</text>
        \`).join("");

        return \`
          <svg viewBox="0 0 \${width} \${height}" role="img" aria-label="Line chart">
            <rect x="0" y="0" width="\${width}" height="\${height}" rx="16" fill="transparent"></rect>
            \${yGrid}
            <line x1="\${margin.left}" y1="\${margin.top + innerHeight}" x2="\${width - margin.right}" y2="\${margin.top + innerHeight}" stroke="rgba(47,36,28,0.18)"></line>
            \${lineMarkup}
            \${xLabels}
          </svg>
        \`;
      }

      function renderSessionsChart(payload) {
        const points = payload.daily.map((row) => ({ label: row.date, value: row.openedSessions }));
        sessionsChartElement.innerHTML = buildLineChart([
          { color: "#e67e3b", points, strokeWidth: 3.2 }
        ], { height: 300 });
      }

      function renderStepsChart(payload) {
        const stepsToRender = payload.summary.steps;
        const series = stepsToRender.map((step) => ({
          color: STEP_COLORS[step.id] || "#7f6958",
          points: payload.daily.map((row) => ({
            label: row.date,
            value: row.steps[step.id] || 0
          })),
        }));
        stepsChartElement.innerHTML = buildLineChart(series, { height: 340 });
        stepsLegendElement.innerHTML = "";
        stepsToRender.forEach((step) => {
          const item = document.createElement("div");
          item.className = "legend-item";
          item.innerHTML = \`
            <span class="legend-swatch" style="background:\${STEP_COLORS[step.id] || "#7f6958"}"></span>
            <span>\${step.label}</span>
          \`;
          stepsLegendElement.appendChild(item);
        });
      }

      function renderDailyTable(payload) {
        const headers = ["Date", "Opened", "Top step count", "Presentation step"];
        const rows = payload.daily.map((row) => {
          const deepest = payload.summary.steps.reduce((best, step) => {
            const value = row.steps[step.id] || 0;
            return value > best.value ? { label: step.label, value } : best;
          }, { label: "-", value: 0 });
          return \`
            <tr>
              <td>\${row.date}</td>
              <td>\${row.openedSessions}</td>
              <td>\${deepest.label} (\${deepest.value})</td>
              <td>\${row.steps.presentation || 0}</td>
            </tr>
          \`;
        }).join("");
        dailyTableElement.innerHTML = \`
          <table class="daily-table">
            <thead>
              <tr>\${headers.map((header) => \`<th>\${header}</th>\`).join("")}</tr>
            </thead>
            <tbody>\${rows}</tbody>
          </table>
        \`;
      }

      function render(payload) {
        activePayload = payload;
        fromInput.value = payload.range.from;
        toInput.value = payload.range.to;
        renderMetrics(payload);
        renderFunnel(payload);
        renderSessionsChart(payload);
        renderStepsChart(payload);
        renderDailyTable(payload);
        setStatus(\`Showing \${payload.range.from} through \${payload.range.to} (\${payload.range.timezone}).\`);
        queueParentResize();
      }

      function queueParentResize() {
        requestAnimationFrame(() => {
          const height = Math.max(
            document.documentElement.scrollHeight,
            document.body.scrollHeight,
            1180
          );
          window.parent.postMessage(
            {
              type: "businessCanvasReports:height",
              height
            },
            "*"
          );
        });
      }

      async function refreshData() {
        refreshButton.disabled = true;
        setStatus("Refreshing the latest usage data...");
        try {
          const params = new URLSearchParams({
            from: fromInput.value,
            to: toInput.value,
            timezone: activePayload.range.timezone || "Europe/Amsterdam"
          });
          const response = await fetch(\`\${REPORTS_API_PATH}?\${params.toString()}\`, {
            headers: {
              Accept: "application/json"
            }
          });
          if (!response.ok) {
            throw new Error(\`Request failed with \${response.status}\`);
          }
          const payload = await response.json();
          render(payload);
        } catch (error) {
          console.error("Reports refresh failed", error);
          setStatus("Refreshing failed. Please try again.", true);
        } finally {
          refreshButton.disabled = false;
        }
      }

      refreshButton.addEventListener("click", () => {
        void refreshData();
      });

      if ("ResizeObserver" in window) {
        resizeObserver = new ResizeObserver(() => queueParentResize());
        resizeObserver.observe(document.body);
      }

      render(INITIAL_PAYLOAD);
    </script>
  </body>
</html>`;
}
