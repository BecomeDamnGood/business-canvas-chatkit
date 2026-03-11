import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { renderInlineText, renderSingleValueCardContent, renderStructuredText } from "../ui/lib/ui_text.ts";
import { extractChoicesFromPrompt } from "../ui/lib/ui_choices.ts";
import { canonicalizeWidgetPayload } from "../ui/lib/locale_bootstrap_runtime.ts";
import {
  callRunStep,
  handleToolResultAndMaybeScheduleBootstrapRetry,
  initActionsConfig,
  toolData,
  widgetState,
} from "../ui/lib/ui_actions.ts";
import { readDreamBuilderViewContract, renderChoiceButtons, resolveWidgetBodyText } from "../ui/lib/ui_render.ts";
import { setIsLoading } from "../ui/lib/ui_state.ts";
import {
  dropIncompatibleLastSpecialistResult,
  stampResponseContentLocale,
} from "./handlers/locale_continuity.ts";
import { buildTransientFallbackSpecialist } from "./handlers/specialist_dispatch_fallbacks.ts";

test("renderInlineText builds STRONG nodes safely", { concurrency: false }, () => {
  const originalDocument = (globalThis as unknown as { document: unknown }).document;
  const fakeDocument = {
    createDocumentFragment() {
      return {
        nodeType: 11,
        childNodes: [] as unknown[],
        appendChild(node: unknown) {
          this.childNodes.push(node);
          return node;
        },
      };
    },
    createTextNode(text: string) {
      return { nodeType: 3, textContent: String(text) };
    },
    createElement(tag: string) {
      return {
        nodeType: 1,
        tagName: String(tag).toUpperCase(),
        textContent: "",
        childNodes: [] as unknown[],
        appendChild(node: unknown) {
          this.childNodes.push(node);
          return node;
        },
      };
    },
  };
  (globalThis as unknown as { document: unknown }).document = fakeDocument;

  const container = {
    childNodes: [] as unknown[],
    get firstChild() {
      return this.childNodes.length ? this.childNodes[0] : null;
    },
    removeChild() {
      this.childNodes.shift();
    },
    appendChild(node: unknown) {
      this.childNodes.push(node);
      return node;
    },
  };

  renderInlineText(container as unknown as Element, "<strong>Hi</strong> there");
  const fragment = container.childNodes[0] as { childNodes: { tagName: string; textContent: string }[] };
  assert.ok(fragment);
  assert.equal(fragment.childNodes.length, 2);
  assert.equal(fragment.childNodes[0].tagName, "STRONG");
  assert.equal(fragment.childNodes[0].textContent, "Hi");
  assert.equal(fragment.childNodes[1].textContent, " there");

  (globalThis as unknown as { document: unknown }).document = originalDocument;
});

test("renderInlineText auto-links plain URLs", { concurrency: false }, () => {
  const originalDocument = (globalThis as unknown as { document: unknown }).document;
  const fakeDocument = {
    createDocumentFragment() {
      return {
        nodeType: 11,
        childNodes: [] as unknown[],
        appendChild(node: unknown) {
          this.childNodes.push(node);
          return node;
        },
      };
    },
    createTextNode(text: string) {
      return { nodeType: 3, textContent: String(text) };
    },
    createElement(tag: string) {
      return {
        nodeType: 1,
        tagName: String(tag).toUpperCase(),
        textContent: "",
        className: "",
        href: "",
        target: "",
        rel: "",
        childNodes: [] as unknown[],
        appendChild(node: unknown) {
          this.childNodes.push(node);
          return node;
        },
      };
    },
  };
  (globalThis as unknown as { document: unknown }).document = fakeDocument;
  try {
    const container = {
      childNodes: [] as unknown[],
      get firstChild() {
        return this.childNodes.length ? this.childNodes[0] : null;
      },
      removeChild() {
        this.childNodes.shift();
      },
      appendChild(node: unknown) {
        this.childNodes.push(node);
        return node;
      },
    };

    renderInlineText(
      container as unknown as Element,
      "For more information visit https://www.bensteenstra.com."
    );

    const visit = (node: any): any[] => {
      if (!node || typeof node !== "object") return [];
      const own = node.tagName === "A" ? [node] : [];
      const children = Array.isArray(node.childNodes) ? node.childNodes.flatMap((child: any) => visit(child)) : [];
      return own.concat(children);
    };
    const links = (container.childNodes as any[]).flatMap((node) => visit(node));
    assert.equal(links.length, 1);
    assert.equal(links[0].href, "https://www.bensteenstra.com");
    assert.equal(links[0].target, "_blank");
    assert.equal(links[0].rel, "noopener noreferrer");
    assert.equal(links[0].className, "inlineLink");
  } finally {
    (globalThis as unknown as { document: unknown }).document = originalDocument;
  }
});

test("extractChoicesFromPrompt stays inert while structured ui.actions still render buttons", { concurrency: false }, () => {
  const originalDocument = (globalThis as unknown as { document: unknown }).document;
  const wrap: {
    childNodes: unknown[];
    style: { display: string };
    appendChild: (node: unknown) => unknown;
  } = {
    childNodes: [] as unknown[],
    style: { display: "" },
    appendChild(node: unknown) {
      this.childNodes.push(node);
      return node;
    },
  };
  Object.defineProperty(wrap, "innerHTML", {
    get() {
      return "";
    },
    set() {
      wrap.childNodes = [];
    },
  });

  const fakeDocument = {
    getElementById(id: string) {
      if (id === "choiceWrap") return wrap;
      return null;
    },
    createElement(tag: string) {
      return {
        nodeType: 1,
        tagName: String(tag).toUpperCase(),
        className: "",
        type: "",
        textContent: "",
        disabled: false,
        style: {} as Record<string, string>,
        childNodes: [] as unknown[],
        appendChild(node: unknown) {
          this.childNodes.push(node);
          return node;
        },
        addEventListener() {},
      };
    },
    createTextNode(text: string) {
      return { nodeType: 3, textContent: String(text) };
    },
    createDocumentFragment() {
      return {
        nodeType: 11,
        childNodes: [] as unknown[],
        appendChild(node: unknown) {
          this.childNodes.push(node);
          return node;
        },
      };
    },
  };

  (globalThis as unknown as { document: unknown }).document = fakeDocument;
  setIsLoading(false);

  const prompt = "Choose one:\n1) <strong>Alpha</strong>\n2) Beta";
  const { promptShown, choices } = extractChoicesFromPrompt(prompt);
  assert.equal(promptShown, prompt);
  assert.equal(choices.length, 0);

  renderChoiceButtons(choices, {
    specialist: { menu_id: "TEST_MENU" },
    state: { current_step: "step_0" },
    ui: {
      action_codes: ["ACTION_ONE", "ACTION_TWO"],
      expected_choice_count: 2,
      action_contract: {
        actions: [
          { id: "a1", label: "Alpha", action_code: "ACTION_ONE", role: "choice" },
          { id: "a2", label: "Beta", action_code: "ACTION_TWO", role: "choice" },
        ],
      },
      actions: [
        { id: "a1", label: "Alpha", action_code: "ACTION_ONE", intent: { type: "ROUTE", route: "__ROUTE__ONE__" } },
        { id: "a2", label: "Beta", action_code: "ACTION_TWO", intent: { type: "ROUTE", route: "__ROUTE__TWO__" } },
      ],
    },
    registry_version: "test",
  });

  const buttons = wrap.childNodes.filter(
    (node: unknown) => node && (node as { tagName?: string }).tagName === "BUTTON"
  );
  assert.equal(buttons.length, 2);

  (globalThis as unknown as { document: unknown }).document = originalDocument;
});

test("resolveWidgetBodyText keeps empty canonical dream-builder body authoritative", () => {
  const body = resolveWidgetBodyText({
    currentStep: "dream",
    resultText: "",
    specialist: {
      message: "Over 5 tot 10 jaar zal werk steeds meer gericht zijn op positieve impact.",
    },
    promptBody: "",
    dreamBuilderViewContract: readDreamBuilderViewContract({
      variant: "dream_builder_collect",
      dream_builder_body_mode: "none",
      dream_builder_statements_visible: true,
    }),
  });

  assert.equal(body, "");
});

test("renderStructuredText groups paragraphs, ordered lists, and bullets", { concurrency: false }, () => {
  const originalDocument = (globalThis as unknown as { document: unknown }).document;
  const fakeDocument = {
    createDocumentFragment() {
      return {
        nodeType: 11,
        childNodes: [] as unknown[],
        appendChild(node: unknown) {
          this.childNodes.push(node);
          return node;
        },
      };
    },
    createTextNode(text: string) {
      return { nodeType: 3, textContent: String(text) };
    },
    createElement(tag: string) {
      return {
        nodeType: 1,
        tagName: String(tag).toUpperCase(),
        className: "",
        textContent: "",
        childNodes: [] as unknown[],
        get firstChild() {
          return this.childNodes.length ? this.childNodes[0] : null;
        },
        removeChild() {
          this.childNodes.shift();
        },
        appendChild(node: unknown) {
          this.childNodes.push(node);
          return node;
        },
      };
    },
  };
  (globalThis as unknown as { document: unknown }).document = fakeDocument;

  const container = {
    innerHTML: "",
    childNodes: [] as unknown[],
    appendChild(node: unknown) {
      this.childNodes.push(node);
      return node;
    },
  };

  renderStructuredText(
    container as unknown as Element,
    [
      "<strong>The Proven Standard</strong>",
      "A globally implemented strategy canvas used by teams worldwide.",
      "",
      "1. First ordered item",
      "2. Second ordered item",
      "",
      "- First bullet",
      "- Second bullet",
    ].join("\n")
  );

  assert.equal(container.childNodes.length, 4);
  assert.equal((container.childNodes[0] as { tagName: string }).tagName, "P");
  assert.equal((container.childNodes[1] as { tagName: string }).tagName, "P");
  assert.equal((container.childNodes[2] as { tagName: string }).tagName, "UL");
  assert.equal((container.childNodes[3] as { tagName: string }).tagName, "UL");
  const firstParagraphFragment = (container.childNodes[0] as { childNodes: unknown[] }).childNodes[0] as {
    childNodes: { tagName?: string; textContent: string }[];
  };
  assert.equal(
    String(firstParagraphFragment.childNodes[0]?.textContent || "").includes("The Proven Standard"),
    true
  );

  (globalThis as unknown as { document: unknown }).document = originalDocument;
});

test("renderStructuredText renders markdown image lines as card images", { concurrency: false }, () => {
  const originalDocument = (globalThis as unknown as { document: unknown }).document;
  const fakeDocument = {
    createDocumentFragment() {
      return {
        nodeType: 11,
        childNodes: [] as unknown[],
        appendChild(node: unknown) {
          this.childNodes.push(node);
          return node;
        },
      };
    },
    createTextNode(text: string) {
      return { nodeType: 3, textContent: String(text) };
    },
    createElement(tag: string) {
      return {
        nodeType: 1,
        tagName: String(tag).toUpperCase(),
        className: "",
        textContent: "",
        src: "",
        alt: "",
        href: "",
        target: "",
        rel: "",
        childNodes: [] as unknown[],
        get firstChild() {
          return this.childNodes.length ? this.childNodes[0] : null;
        },
        removeChild() {
          this.childNodes.shift();
        },
        appendChild(node: unknown) {
          this.childNodes.push(node);
          return node;
        },
      };
    },
  };
  (globalThis as unknown as { document: unknown }).document = fakeDocument;
  try {
    const container = {
      innerHTML: "",
      childNodes: [] as unknown[],
      appendChild(node: unknown) {
        this.childNodes.push(node);
        return node;
      },
    };

    renderStructuredText(
      container as unknown as Element,
      [
        "![Ben Steenstra](assets/ben-steenstra.webp)",
        "",
        "For more information visit https://www.bensteenstra.com",
      ].join("\n")
    );

    assert.equal((container.childNodes[0] as any).tagName, "IMG");
    assert.equal((container.childNodes[0] as any).className, "cardDesc-image");
    assert.equal((container.childNodes[0] as any).src, "assets/ben-steenstra.webp");
    assert.equal((container.childNodes[0] as any).alt, "Ben Steenstra");
    assert.equal((container.childNodes[1] as any).tagName, "P");
  } finally {
    (globalThis as unknown as { document: unknown }).document = originalDocument;
  }
});

test("renderSingleValueCardContent keeps semantic heading and canonical value separate without punctuation", { concurrency: false }, () => {
  const originalDocument = (globalThis as unknown as { document: unknown }).document;
  const fakeDocument = {
    createDocumentFragment() {
      return {
        nodeType: 11,
        childNodes: [] as unknown[],
        appendChild(node: unknown) {
          this.childNodes.push(node);
          return node;
        },
      };
    },
    createTextNode(text: string) {
      return { nodeType: 3, textContent: String(text) };
    },
    createElement(tag: string) {
      return {
        nodeType: 1,
        tagName: String(tag).toUpperCase(),
        className: "",
        textContent: "",
        childNodes: [] as unknown[],
        get firstChild() {
          return this.childNodes.length ? this.childNodes[0] : null;
        },
        removeChild() {
          this.childNodes.shift();
        },
        appendChild(node: unknown) {
          this.childNodes.push(node);
          return node;
        },
      };
    },
  };
  (globalThis as unknown as { document: unknown }).document = fakeDocument;
  try {
    const scenarios = [
      {
        heading: "Wat denk je van de formulering",
        canonicalText: "Een strategisch reclamebureau voor complexe keuzes",
      },
      {
        heading: "What do you think of the wording",
        canonicalText: "A strategic advertising agency for complex decisions",
      },
    ];

    for (const scenario of scenarios) {
      const container = {
        innerHTML: "",
        childNodes: [] as unknown[],
        appendChild(node: unknown) {
          this.childNodes.push(node);
          return node;
        },
      };

      const rendered = renderSingleValueCardContent(container as unknown as Element, scenario);

      assert.equal(rendered, true);
      assert.equal(container.childNodes.length, 2);
      assert.equal((container.childNodes[0] as any).tagName, "P");
      assert.equal((container.childNodes[0] as any).className, "cardSubheading");
      assert.equal((container.childNodes[1] as any).tagName, "P");
      assert.equal((container.childNodes[1] as any).className, "cardCanonicalValue");
      const headingFragment = (container.childNodes[0] as { childNodes: unknown[] }).childNodes[0] as {
        childNodes: { textContent: string }[];
      };
      const canonicalFragment = (container.childNodes[1] as { childNodes: unknown[] }).childNodes[0] as {
        childNodes: { textContent: string }[];
      };
      assert.equal(String(headingFragment.childNodes[0]?.textContent || ""), scenario.heading);
      assert.equal(String(canonicalFragment.childNodes[0]?.textContent || ""), scenario.canonicalText);
    }
  } finally {
    (globalThis as unknown as { document: unknown }).document = originalDocument;
  }
});

test("bundled runtime renders rich body into cardDesc via formatter and keeps unsafe targets out of innerHTML", () => {
  const source = fs.readFileSync(new URL("../ui/step-card.bundled.html", import.meta.url), "utf8");
  assert.match(source, /function escapeHtml\(/);
  assert.match(source, /function renderInlineText\(/);
  assert.match(source, /function renderSingleValueCardContent\(/);
  assert.match(source, /function renderStructuredText\(/);
  assert.match(source, /renderSingleValueCardContent\(cardDescEl,\s*singleValueContent\)/);
  assert.match(source, /renderStructuredText\(cardDescEl,\s*body \|\| ""\);/);
  assert.match(source, /renderInlineText\(promptEl,\s*promptText \|\| ""\);/);
  assert.match(source, /choiceWrap\.innerHTML = "";/);
  assert.doesNotMatch(source, /(?:ui\.prompt|promptEl)\.innerHTML\s*=/);
  assert.doesNotMatch(source, /(?:ui\.error|errorEl)\.innerHTML\s*=/);
});

test("bundled runtime startup and ACTION_START flow stay on the simple happy-path", () => {
  const source = fs.readFileSync(new URL("../ui/step-card.bundled.html", import.meta.url), "utf8");

  // Startup: no fail-closed blocked fallback, ingest once and continue.
  assert.doesNotMatch(source, /function renderStartupWaitShell\(/);
  assert.match(source, /function scheduleStartupFailClosed\(/);
  assert.doesNotMatch(source, /scheduleStartupFailClosed\("startup_no_initial_payload"\)/);
  assert.match(source, /tryInitialIngestFromHost\("set_globals"\);/);
  assert.doesNotMatch(source, /startup_fail_closed_no_canonical_payload/);

  // Routing defaults to interactive when no explicit server mode is present.
  assert.match(source, /const normalizedViewMode = hasExplicitServerRouting \? viewMode : "interactive";/);

  // ACTION_START: no strict liveness fail-closed path.
  assert.doesNotMatch(source, /scheduleStartAckRecoveryPoll\(/);
  assert.doesNotMatch(source, /result\?\.ack_status \|\| responseState\.ack_status \|\| responseLiveness\.ack_status/);
  assert.doesNotMatch(source, /result\?\.state_advanced \?\? responseState\.state_advanced \?\? responseLiveness\.state_advanced/);
  assert.doesNotMatch(source, /\[ui_start_dispatch_not_advanced_fail_closed\]/);
  assert.doesNotMatch(source, /\[ui_contract_interactive_content_absent\]/);
});

test("canonical widget payload only accepts _meta.widget_result authority", () => {
  const canonical = canonicalizeWidgetPayload({
    _meta: {
      widget_result: {
        current_step_id: "step_0",
        state: { current_step: "step_0" },
      },
    },
    structuredContent: {
      result: {
        current_step_id: "dream",
        state: { current_step: "dream" },
      },
    },
    result: {
      current_step_id: "purpose",
      state: { current_step: "purpose" },
    },
  });
  assert.equal(canonical.source, "meta.widget_result");
  assert.equal(String((canonical.result.state as Record<string, unknown>).current_step || ""), "step_0");

  const droppedStructuredOnly = canonicalizeWidgetPayload({
    structuredContent: {
      result: {
        current_step_id: "dream",
        state: { current_step: "dream" },
      },
    },
  });
  assert.equal(droppedStructuredOnly.source, "none");
  assert.deepEqual(droppedStructuredOnly.result, {});
});

test("locale continuity drops locale-mismatched last specialist render state across current-value steps", () => {
  const steps = ["dream", "purpose", "bigwhy", "role", "entity", "targetgroup"];
  for (const stepId of steps) {
    const next = dropIncompatibleLastSpecialistResult({
      current_step: stepId,
      language: "en",
      locale: "en",
      ui_strings_lang: "en",
      ui_strings_requested_lang: "en",
      last_specialist_result: {
        action: "ASK",
        message: "Nederlandse specialistbody die niet meer mag lekken.",
        question: "Vraag in het Nederlands.",
        __content_language: "nl",
        __content_locale: "nl",
      },
    });
    assert.deepEqual(
      (next.last_specialist_result || {}) as Record<string, unknown>,
      {},
      `expected stale specialist content to clear for step ${stepId}`
    );
  }
});

test("transient fallback does not reuse stale specialist body after locale authority switches to English", () => {
  const fallback = buildTransientFallbackSpecialist(
    {
      current_step: "bigwhy",
      language: "en",
      locale: "en",
      ui_strings_lang: "en",
      ui_strings_requested_lang: "en",
      last_specialist_result: {
        action: "ASK",
        message: "Als mens zijn we...",
        question: "Waarom is dit belangrijk?",
        __content_language: "nl",
        __content_locale: "nl",
      },
    } as any,
    {
      step0CardDescForState: () => "",
      step0QuestionForState: () => "",
      pickPrompt: (specialist) => String(specialist?.question || ""),
      renderFreeTextTurnPolicy: () => ({
        specialist: {
          action: "ASK",
          message: "Define your Big Why in one clear sentence.",
          question: "What should stay at the core of your motivation?",
          refined_formulation: "",
        },
      }),
    }
  );

  assert.equal(String(fallback.message || ""), "Define your Big Why in one clear sentence.");
  assert.equal(String(fallback.question || ""), "What should stay at the core of your motivation?");
});

test("response finalization stamps a single locale authority onto response content and persisted specialist state", () => {
  const stamped = stampResponseContentLocale({
    current_step_id: "purpose",
    specialist: {
      action: "ASK",
      message: "What do you exist to change?",
    },
    state: {
      current_step: "purpose",
      language: "en",
      locale: "en",
      ui_strings_lang: "en",
      ui_strings_requested_lang: "en",
      last_specialist_result: {
        action: "ASK",
        message: "What do you exist to change?",
      },
    },
  });

  assert.equal(String(stamped.content_language || ""), "en");
  assert.equal(String(stamped.content_locale || ""), "en");
  assert.equal(String(((stamped.specialist || {}) as Record<string, unknown>).__content_language || ""), "en");
  assert.equal(
    String(
      ((((stamped.state || {}) as Record<string, unknown>).last_specialist_result || {}) as Record<string, unknown>)
        .__content_language || ""
    ),
    "en"
  );
});

test("widget continuity retains known business context when a later same-session payload is leaner", { concurrency: false }, () => {
  const originalOpenAi = (globalThis as unknown as { openai?: unknown }).openai;
  const originalLatest = (globalThis as Record<string, unknown>).__BSC_LATEST__;
  const originalLastToolOutput = (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__;
  try {
    const host = {
      widgetState: {} as Record<string, unknown>,
      setWidgetState(next: Record<string, unknown>) {
        this.widgetState = next;
      },
    };
    (globalThis as unknown as { openai?: unknown }).openai = host;
    initActionsConfig({
      render: () => {},
      t: () => "",
    });

    handleToolResultAndMaybeScheduleBootstrapRetry({
      _meta: {
        widget_result: {
          current_step_id: "step_0",
          state: {
            current_step: "step_0",
            business_name: "Mindd",
            step_0_final: "Venture: reclamebureau | Name: Mindd | Status: existing",
            step0_bootstrap: {
              venture: "reclamebureau",
              name: "Mindd",
              status: "existing",
              source: "initial_user_message",
            },
            bootstrap_session_id: "sess-1",
            bootstrap_epoch: 1,
            response_seq: 1,
            host_widget_session_id: "host-1",
          },
        },
      },
    });

    handleToolResultAndMaybeScheduleBootstrapRetry({
      _meta: {
        widget_result: {
          current_step_id: "dream",
          state: {
            current_step: "dream",
            bootstrap_session_id: "sess-1",
            bootstrap_epoch: 1,
            response_seq: 2,
            host_widget_session_id: "host-1",
          },
        },
      },
    });

    const persisted = widgetState();
    assert.equal(String(persisted.business_name || ""), "Mindd");
    assert.equal(
      String(persisted.step_0_final || ""),
      "Venture: reclamebureau | Name: Mindd | Status: existing"
    );
    assert.deepEqual(persisted.step0_bootstrap, {
      venture: "reclamebureau",
      name: "Mindd",
      status: "existing",
      source: "initial_user_message",
    });
  } finally {
    if (originalOpenAi === undefined) delete (globalThis as unknown as { openai?: unknown }).openai;
    else (globalThis as unknown as { openai?: unknown }).openai = originalOpenAi;
    if (originalLatest === undefined) delete (globalThis as Record<string, unknown>).__BSC_LATEST__;
    else (globalThis as Record<string, unknown>).__BSC_LATEST__ = originalLatest;
    if (originalLastToolOutput === undefined) delete (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__;
    else (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__ = originalLastToolOutput;
  }
});

test("callRunStep keeps step-0 continuity in outbound state when latest render lost it", { concurrency: false }, async () => {
  const originalOpenAi = (globalThis as unknown as { openai?: unknown }).openai;
  const originalDocument = (globalThis as unknown as { document?: unknown }).document;
  const originalLatest = (globalThis as Record<string, unknown>).__BSC_LATEST__;
  const originalLastToolOutput = (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__;
  const originalWindow = (globalThis as unknown as { window?: unknown }).window;
  setIsLoading(false);
  try {
    let capturedPayload: Record<string, unknown> | null = null;
    const host = {
      widgetState: {
        started: "true",
        current_step: "dream",
        business_name: "Mindd",
        step_0_final: "Venture: reclamebureau | Name: Mindd | Status: existing",
        step0_bootstrap: {
          venture: "reclamebureau",
          name: "Mindd",
          status: "existing",
          source: "initial_user_message",
        },
        bootstrap_session_id: "sess-1",
        bootstrap_epoch: 1,
        response_seq: 2,
        host_widget_session_id: "host-1",
      } as Record<string, unknown>,
      setWidgetState(next: Record<string, unknown>) {
        this.widgetState = next;
      },
      async callTool(_name: string, args: unknown) {
        capturedPayload = args as Record<string, unknown>;
        return {
          _meta: {
            widget_result: {
              current_step_id: "dream",
              state: {
                current_step: "dream",
                bootstrap_session_id: "sess-1",
                bootstrap_epoch: 1,
                response_seq: 3,
                host_widget_session_id: "host-1",
              },
            },
          },
        };
      },
    };
    (globalThis as unknown as { openai?: unknown }).openai = host;
    (globalThis as unknown as { document?: unknown }).document = {
      getElementById() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    };
    (globalThis as unknown as { window?: unknown }).window = undefined;
    (globalThis as Record<string, unknown>).__BSC_LATEST__ = {
      state: {
        current_step: "dream",
        bootstrap_session_id: "sess-1",
        bootstrap_epoch: 1,
        response_seq: 2,
        host_widget_session_id: "host-1",
      },
      lang: "nl",
    };
    initActionsConfig({
      render: () => {},
      t: () => "",
    });

    await callRunStep("ACTION_DREAM_INTRO_EXPLAIN_MORE");

    assert.ok(capturedPayload);
    const outboundState = (capturedPayload?.state || {}) as Record<string, unknown>;
    assert.equal(String(outboundState.business_name || ""), "Mindd");
    assert.equal(
      String(outboundState.step_0_final || ""),
      "Venture: reclamebureau | Name: Mindd | Status: existing"
    );
    assert.deepEqual(outboundState.step0_bootstrap, {
      venture: "reclamebureau",
      name: "Mindd",
      status: "existing",
      source: "initial_user_message",
    });
  } finally {
    setIsLoading(false);
    if (originalOpenAi === undefined) delete (globalThis as unknown as { openai?: unknown }).openai;
    else (globalThis as unknown as { openai?: unknown }).openai = originalOpenAi;
    if (originalDocument === undefined) delete (globalThis as unknown as { document?: unknown }).document;
    else (globalThis as unknown as { document?: unknown }).document = originalDocument;
    if (originalWindow === undefined) delete (globalThis as unknown as { window?: unknown }).window;
    else (globalThis as unknown as { window?: unknown }).window = originalWindow;
    if (originalLatest === undefined) delete (globalThis as Record<string, unknown>).__BSC_LATEST__;
    else (globalThis as Record<string, unknown>).__BSC_LATEST__ = originalLatest;
    if (originalLastToolOutput === undefined) delete (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__;
    else (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__ = originalLastToolOutput;
  }
});

test("widget continuity retains accepted canonical step state when a later same-session payload is leaner", { concurrency: false }, () => {
  const originalOpenAi = (globalThis as unknown as { openai?: unknown }).openai;
  const originalLatest = (globalThis as Record<string, unknown>).__BSC_LATEST__;
  const originalLastToolOutput = (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__;
  try {
    const host = {
      widgetState: {} as Record<string, unknown>,
      setWidgetState(next: Record<string, unknown>) {
        this.widgetState = next;
      },
    };
    (globalThis as unknown as { openai?: unknown }).openai = host;
    initActionsConfig({
      render: () => {},
      t: () => "",
    });

    handleToolResultAndMaybeScheduleBootstrapRetry({
      _meta: {
        widget_result: {
          current_step_id: "dream",
          state: {
            current_step: "dream",
            dream_final: "Mindd droomt van een wereld waarin mensen met vertrouwen keuzes maken.",
            purpose_final: "Mindd bestaat om complexe keuzes begrijpelijk te maken.",
            presentation_brief_final: "Mindd helpt mensen met heldere keuzes en eerlijke informatie.",
            provisional_by_step: {
              dream: "Mindd droomt van een wereld waarin mensen met vertrouwen keuzes maken.",
            },
            provisional_source_by_step: {
              dream: "wording_pick",
            },
            bootstrap_session_id: "sess-1",
            bootstrap_epoch: 1,
            response_seq: 4,
            host_widget_session_id: "host-1",
          },
        },
      },
    });

    handleToolResultAndMaybeScheduleBootstrapRetry({
      _meta: {
        widget_result: {
          current_step_id: "purpose",
          state: {
            current_step: "purpose",
            bootstrap_session_id: "sess-1",
            bootstrap_epoch: 1,
            response_seq: 5,
            host_widget_session_id: "host-1",
          },
        },
      },
    });

    const persisted = widgetState();
    assert.equal(
      String(persisted.dream_final || ""),
      "Mindd droomt van een wereld waarin mensen met vertrouwen keuzes maken."
    );
    assert.equal(
      String(persisted.purpose_final || ""),
      "Mindd bestaat om complexe keuzes begrijpelijk te maken."
    );
    assert.equal(
      String(persisted.presentation_brief_final || ""),
      "Mindd helpt mensen met heldere keuzes en eerlijke informatie."
    );
    assert.deepEqual((persisted.provisional_by_step || {}) as Record<string, unknown>, {
      dream: "Mindd droomt van een wereld waarin mensen met vertrouwen keuzes maken.",
    });
    assert.deepEqual((persisted.provisional_source_by_step || {}) as Record<string, unknown>, {
      dream: "wording_pick",
    });
  } finally {
    if (originalOpenAi === undefined) delete (globalThis as unknown as { openai?: unknown }).openai;
    else (globalThis as unknown as { openai?: unknown }).openai = originalOpenAi;
    if (originalLatest === undefined) delete (globalThis as Record<string, unknown>).__BSC_LATEST__;
    else (globalThis as Record<string, unknown>).__BSC_LATEST__ = originalLatest;
    if (originalLastToolOutput === undefined) delete (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__;
    else (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__ = originalLastToolOutput;
  }
});

test("widget continuity respects explicit canonical clears in the same session", { concurrency: false }, () => {
  const originalOpenAi = (globalThis as unknown as { openai?: unknown }).openai;
  const originalLatest = (globalThis as Record<string, unknown>).__BSC_LATEST__;
  const originalLastToolOutput = (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__;
  try {
    const host = {
      widgetState: {} as Record<string, unknown>,
      setWidgetState(next: Record<string, unknown>) {
        this.widgetState = next;
      },
    };
    (globalThis as unknown as { openai?: unknown }).openai = host;
    initActionsConfig({
      render: () => {},
      t: () => "",
    });

    handleToolResultAndMaybeScheduleBootstrapRetry({
      _meta: {
        widget_result: {
          current_step_id: "dream",
          state: {
            current_step: "dream",
            dream_final: "Mindd droomt van een wereld waarin mensen met vertrouwen keuzes maken.",
            provisional_by_step: {
              dream: "Mindd droomt van een wereld waarin mensen met vertrouwen keuzes maken.",
            },
            provisional_source_by_step: {
              dream: "wording_pick",
            },
            bootstrap_session_id: "sess-1",
            bootstrap_epoch: 1,
            response_seq: 4,
            host_widget_session_id: "host-1",
          },
        },
      },
    });

    handleToolResultAndMaybeScheduleBootstrapRetry({
      _meta: {
        widget_result: {
          current_step_id: "dream",
          state: {
            current_step: "dream",
            dream_final: "",
            provisional_by_step: {
              dream: "",
            },
            provisional_source_by_step: {
              dream: "",
            },
            bootstrap_session_id: "sess-1",
            bootstrap_epoch: 1,
            response_seq: 5,
            host_widget_session_id: "host-1",
          },
        },
      },
    });

    const persisted = widgetState();
    assert.equal(String(persisted.dream_final || ""), "");
    assert.deepEqual((persisted.provisional_by_step || {}) as Record<string, unknown>, {});
    assert.deepEqual((persisted.provisional_source_by_step || {}) as Record<string, unknown>, {});
  } finally {
    if (originalOpenAi === undefined) delete (globalThis as unknown as { openai?: unknown }).openai;
    else (globalThis as unknown as { openai?: unknown }).openai = originalOpenAi;
    if (originalLatest === undefined) delete (globalThis as Record<string, unknown>).__BSC_LATEST__;
    else (globalThis as Record<string, unknown>).__BSC_LATEST__ = originalLatest;
    if (originalLastToolOutput === undefined) delete (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__;
    else (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__ = originalLastToolOutput;
  }
});

test("incoming stale dream scoring payloads do not overwrite a newer refine render", { concurrency: false }, () => {
  const originalOpenAi = (globalThis as unknown as { openai?: unknown }).openai;
  const originalLatest = (globalThis as Record<string, unknown>).__BSC_LATEST__;
  const originalLastToolOutput = (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__;
  try {
    const host = {
      widgetState: {} as Record<string, unknown>,
      setWidgetState(next: Record<string, unknown>) {
        this.widgetState = next;
      },
    };
    (globalThis as unknown as { openai?: unknown }).openai = host;
    initActionsConfig({
      render: () => {},
      t: () => "",
    });

    handleToolResultAndMaybeScheduleBootstrapRetry({
      _meta: {
        widget_result: {
          current_step_id: "dream",
          state: {
            current_step: "dream",
            __dream_runtime_mode: "builder_refine",
            dream_awaiting_direction: "false",
            dream_scores: [[9, 8], [7, 7]],
            dream_top_clusters: [{ theme: "Vertrouwen", average: 8.5 }],
            bootstrap_session_id: "sess-1",
            bootstrap_epoch: 1,
            response_seq: 6,
            host_widget_session_id: "host-1",
          },
          ui: {
            view: {
              mode: "interactive",
              variant: "dream_builder_refine",
            },
          },
          specialist: {
            message: "Mindd droomt van een wereld waarin vertrouwen richting geeft.",
          },
        },
      },
    });

    handleToolResultAndMaybeScheduleBootstrapRetry({
      _meta: {
        widget_result: {
          current_step_id: "dream",
          state: {
            current_step: "dream",
            __dream_runtime_mode: "builder_scoring",
            bootstrap_session_id: "sess-1",
            bootstrap_epoch: 1,
            response_seq: 5,
            host_widget_session_id: "host-1",
          },
          ui: {
            view: {
              mode: "interactive",
              variant: "dream_builder_scoring",
            },
          },
          specialist: {
            scoring_phase: "true",
            statements: Array.from({ length: 20 }, (_, index) => `Statement ${index + 1}`),
            clusters: [
              {
                theme: "Vertrouwen",
                statement_indices: [0, 1],
              },
            ],
          },
        },
      },
    });

    const persistedPayload = toolData();
    const persistedResult = (((persistedPayload as Record<string, unknown>)._meta || {}) as Record<string, unknown>)
      .widget_result as Record<string, unknown>;
    const persistedUi = (persistedResult.ui || {}) as Record<string, unknown>;
    const persistedView = (persistedUi.view || {}) as Record<string, unknown>;
    const persistedState = (persistedResult.state || {}) as Record<string, unknown>;

    assert.equal(String(persistedView.variant || ""), "dream_builder_refine");
    assert.equal(String(persistedState.__dream_runtime_mode || ""), "builder_refine");
    assert.equal(String(widgetState().response_seq || ""), "6");
  } finally {
    if (originalOpenAi === undefined) delete (globalThis as unknown as { openai?: unknown }).openai;
    else (globalThis as unknown as { openai?: unknown }).openai = originalOpenAi;
    if (originalLatest === undefined) delete (globalThis as Record<string, unknown>).__BSC_LATEST__;
    else (globalThis as Record<string, unknown>).__BSC_LATEST__ = originalLatest;
    if (originalLastToolOutput === undefined) delete (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__;
    else (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__ = originalLastToolOutput;
  }
});

test("callRunStep keeps accepted canonical step continuity in outbound state when latest render lost it", { concurrency: false }, async () => {
  const originalOpenAi = (globalThis as unknown as { openai?: unknown }).openai;
  const originalDocument = (globalThis as unknown as { document?: unknown }).document;
  const originalLatest = (globalThis as Record<string, unknown>).__BSC_LATEST__;
  const originalLastToolOutput = (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__;
  const originalWindow = (globalThis as unknown as { window?: unknown }).window;
  setIsLoading(false);
  try {
    let capturedPayload: Record<string, unknown> | null = null;
    const host = {
      widgetState: {
        started: "true",
        current_step: "dream",
        dream_final: "Mindd droomt van een wereld waarin mensen met vertrouwen keuzes maken.",
        purpose_final: "Mindd bestaat om complexe keuzes begrijpelijk te maken.",
        provisional_by_step: {
          dream: "Mindd droomt van een wereld waarin mensen met vertrouwen keuzes maken.",
        },
        provisional_source_by_step: {
          dream: "wording_pick",
        },
        bootstrap_session_id: "sess-1",
        bootstrap_epoch: 1,
        response_seq: 5,
        host_widget_session_id: "host-1",
      } as Record<string, unknown>,
      setWidgetState(next: Record<string, unknown>) {
        this.widgetState = next;
      },
      async callTool(_name: string, args: unknown) {
        capturedPayload = args as Record<string, unknown>;
        return {
          _meta: {
            widget_result: {
              current_step_id: "dream",
              state: {
                current_step: "dream",
                bootstrap_session_id: "sess-1",
                bootstrap_epoch: 1,
                response_seq: 6,
                host_widget_session_id: "host-1",
              },
            },
          },
        };
      },
    };
    (globalThis as unknown as { openai?: unknown }).openai = host;
    (globalThis as unknown as { document?: unknown }).document = {
      getElementById() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    };
    (globalThis as unknown as { window?: unknown }).window = undefined;
    (globalThis as Record<string, unknown>).__BSC_LATEST__ = {
      state: {
        current_step: "dream",
        bootstrap_session_id: "sess-1",
        bootstrap_epoch: 1,
        response_seq: 5,
        host_widget_session_id: "host-1",
      },
      lang: "nl",
    };
    initActionsConfig({
      render: () => {},
      t: () => "",
    });

    await callRunStep("ACTION_DREAM_EXPLAINER_REFINE_ADJUST");

    assert.ok(capturedPayload);
    const outboundState = (capturedPayload?.state || {}) as Record<string, unknown>;
    assert.equal(
      String(outboundState.dream_final || ""),
      "Mindd droomt van een wereld waarin mensen met vertrouwen keuzes maken."
    );
    assert.equal(
      String(outboundState.purpose_final || ""),
      "Mindd bestaat om complexe keuzes begrijpelijk te maken."
    );
    assert.deepEqual((outboundState.provisional_by_step || {}) as Record<string, unknown>, {
      dream: "Mindd droomt van een wereld waarin mensen met vertrouwen keuzes maken.",
    });
    assert.deepEqual((outboundState.provisional_source_by_step || {}) as Record<string, unknown>, {
      dream: "wording_pick",
    });
  } finally {
    setIsLoading(false);
    if (originalOpenAi === undefined) delete (globalThis as unknown as { openai?: unknown }).openai;
    else (globalThis as unknown as { openai?: unknown }).openai = originalOpenAi;
    if (originalDocument === undefined) delete (globalThis as unknown as { document?: unknown }).document;
    else (globalThis as unknown as { document?: unknown }).document = originalDocument;
    if (originalWindow === undefined) delete (globalThis as unknown as { window?: unknown }).window;
    else (globalThis as unknown as { window?: unknown }).window = originalWindow;
    if (originalLatest === undefined) delete (globalThis as Record<string, unknown>).__BSC_LATEST__;
    else (globalThis as Record<string, unknown>).__BSC_LATEST__ = originalLatest;
    if (originalLastToolOutput === undefined) delete (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__;
    else (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__ = originalLastToolOutput;
  }
});

test("dream confirm advances to purpose when the server returns an accepted canonical widget payload", { concurrency: false }, async () => {
  const originalOpenAi = (globalThis as unknown as { openai?: unknown }).openai;
  const originalDocument = (globalThis as unknown as { document?: unknown }).document;
  const originalLatest = (globalThis as Record<string, unknown>).__BSC_LATEST__;
  const originalLastToolOutput = (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__;
  const originalWindow = (globalThis as unknown as { window?: unknown }).window;
  setIsLoading(false);
  try {
    const renderedPayloads: unknown[] = [];
    const host = {
      widgetState: {
        started: "true",
        current_step: "dream",
        bootstrap_session_id: "sess-1",
        bootstrap_epoch: 1,
        response_seq: 2,
        host_widget_session_id: "host-1",
      } as Record<string, unknown>,
      setWidgetState(next: Record<string, unknown>) {
        this.widgetState = next;
      },
      async callTool(_name: string, args: unknown) {
        const payload = args as Record<string, unknown>;
        assert.equal(String(payload.user_message || ""), "ACTION_DREAM_EXPLAINER_REFINE_CONFIRM");
        return {
          _meta: {
            widget_result: {
              current_step_id: "purpose",
              ok: true,
              ack_status: "accepted",
              state_advanced: true,
              state: {
                current_step: "purpose",
                ack_status: "accepted",
                state_advanced: true,
                bootstrap_session_id: "sess-1",
                bootstrap_epoch: 1,
                response_seq: 3,
                host_widget_session_id: "host-1",
                ui_action_liveness: {
                  ack_status: "accepted",
                  state_advanced: true,
                  action_code_echo: "ACTION_DREAM_EXPLAINER_REFINE_CONFIRM",
                },
              },
              ui: {
                view: { mode: "interactive" },
                content: { heading: "Purpose" },
              },
            },
          },
        };
      },
    };
    (globalThis as unknown as { openai?: unknown }).openai = host;
    (globalThis as unknown as { document?: unknown }).document = {
      getElementById() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    };
    (globalThis as unknown as { window?: unknown }).window = undefined;
    (globalThis as Record<string, unknown>).__BSC_LATEST__ = {
      state: {
        current_step: "dream",
        bootstrap_session_id: "sess-1",
        bootstrap_epoch: 1,
        response_seq: 2,
        host_widget_session_id: "host-1",
      },
      lang: "nl",
    };
    initActionsConfig({
      render: (raw) => {
        renderedPayloads.push(raw);
      },
      t: () => "",
    });

    await callRunStep("ACTION_DREAM_EXPLAINER_REFINE_CONFIRM");

    assert.equal(renderedPayloads.length, 1);
    const rendered = canonicalizeWidgetPayload(renderedPayloads[0]).result;
    assert.equal(String(rendered.current_step_id || ""), "purpose");
    assert.equal(String((rendered.state as Record<string, unknown>).current_step || ""), "purpose");
    assert.equal(String(host.widgetState.ui_action_liveness_ack_status || ""), "accepted");
    assert.equal(String(host.widgetState.ui_action_liveness_state_advanced || ""), "true");
  } finally {
    setIsLoading(false);
    if (originalOpenAi === undefined) delete (globalThis as unknown as { openai?: unknown }).openai;
    else (globalThis as unknown as { openai?: unknown }).openai = originalOpenAi;
    if (originalDocument === undefined) delete (globalThis as unknown as { document?: unknown }).document;
    else (globalThis as unknown as { document?: unknown }).document = originalDocument;
    if (originalWindow === undefined) delete (globalThis as unknown as { window?: unknown }).window;
    else (globalThis as unknown as { window?: unknown }).window = originalWindow;
    if (originalLatest === undefined) delete (globalThis as Record<string, unknown>).__BSC_LATEST__;
    else (globalThis as Record<string, unknown>).__BSC_LATEST__ = originalLatest;
    if (originalLastToolOutput === undefined) delete (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__;
    else (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__ = originalLastToolOutput;
  }
});

test("callRunStep fail-closes active dispatches that return no canonical widget payload instead of reusing the stale card", { concurrency: false }, async () => {
  const originalOpenAi = (globalThis as unknown as { openai?: unknown }).openai;
  const originalDocument = (globalThis as unknown as { document?: unknown }).document;
  const originalLatest = (globalThis as Record<string, unknown>).__BSC_LATEST__;
  const originalLastToolOutput = (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__;
  const originalWindow = (globalThis as unknown as { window?: unknown }).window;
  setIsLoading(false);
  try {
    const renderedPayloads: unknown[] = [];
    const staleDreamEnvelope = {
      _meta: {
        widget_result: {
          current_step_id: "dream",
          ok: true,
          state: {
            current_step: "dream",
            bootstrap_session_id: "sess-1",
            bootstrap_epoch: 1,
            response_seq: 2,
            host_widget_session_id: "host-1",
          },
          ui: {
            view: { mode: "interactive" },
            content: { heading: "Dream" },
          },
        },
      },
    };
    const host = {
      widgetState: {
        started: "true",
        current_step: "dream",
        bootstrap_session_id: "sess-1",
        bootstrap_epoch: 1,
        response_seq: 2,
        host_widget_session_id: "host-1",
      } as Record<string, unknown>,
      setWidgetState(next: Record<string, unknown>) {
        this.widgetState = next;
      },
      async callTool() {
        return {
          structuredContent: {
            result: {
              current_step_id: "purpose",
              ack_status: "accepted",
              state_advanced: true,
              action_code_echo: "ACTION_DREAM_EXPLAINER_REFINE_CONFIRM",
              state: {
                current_step: "purpose",
                ack_status: "accepted",
                state_advanced: true,
                bootstrap_session_id: "sess-1",
                bootstrap_epoch: 1,
                response_seq: 3,
                host_widget_session_id: "host-1",
                ui_action_liveness: {
                  ack_status: "accepted",
                  state_advanced: true,
                  action_code_echo: "ACTION_DREAM_EXPLAINER_REFINE_CONFIRM",
                },
              },
            },
          },
        };
      },
    };
    (globalThis as unknown as { openai?: unknown }).openai = host;
    (globalThis as unknown as { document?: unknown }).document = {
      getElementById() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    };
    (globalThis as unknown as { window?: unknown }).window = undefined;
    (globalThis as Record<string, unknown>).__BSC_LATEST__ = {
      state: {
        current_step: "dream",
        bootstrap_session_id: "sess-1",
        bootstrap_epoch: 1,
        response_seq: 2,
        host_widget_session_id: "host-1",
      },
      lang: "nl",
    };
    (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__ = staleDreamEnvelope;
    initActionsConfig({
      render: (raw) => {
        renderedPayloads.push(raw);
      },
      t: () => "",
    });

    await callRunStep("ACTION_DREAM_EXPLAINER_REFINE_CONFIRM");

    assert.equal(renderedPayloads.length, 1);
    const rendered = canonicalizeWidgetPayload(renderedPayloads[0]).result;
    const renderedState = (rendered.state || {}) as Record<string, unknown>;
    assert.equal(String(rendered.current_step_id || ""), "purpose");
    assert.equal(String(renderedState.current_step || ""), "purpose");
    assert.equal(String((rendered.error as Record<string, unknown>).type || ""), "contract_violation");
    assert.equal(String((rendered.error as Record<string, unknown>).reason || ""), "incoming_missing_widget_result");
    assert.equal(String(renderedState.ui_gate_reason || ""), "contract_violation");
    assert.equal(String(host.widgetState.ui_action_liveness_ack_status || ""), "accepted");
    assert.equal(String(host.widgetState.ui_action_liveness_state_advanced || ""), "true");

    const cachedAfter = canonicalizeWidgetPayload(
      (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__
    ).result;
    assert.equal(String(cachedAfter.current_step_id || ""), "purpose");
    assert.equal(String(((cachedAfter.state || {}) as Record<string, unknown>).ui_gate_reason || ""), "contract_violation");
  } finally {
    setIsLoading(false);
    if (originalOpenAi === undefined) delete (globalThis as unknown as { openai?: unknown }).openai;
    else (globalThis as unknown as { openai?: unknown }).openai = originalOpenAi;
    if (originalDocument === undefined) delete (globalThis as unknown as { document?: unknown }).document;
    else (globalThis as unknown as { document?: unknown }).document = originalDocument;
    if (originalWindow === undefined) delete (globalThis as unknown as { window?: unknown }).window;
    else (globalThis as unknown as { window?: unknown }).window = originalWindow;
    if (originalLatest === undefined) delete (globalThis as Record<string, unknown>).__BSC_LATEST__;
    else (globalThis as Record<string, unknown>).__BSC_LATEST__ = originalLatest;
    if (originalLastToolOutput === undefined) delete (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__;
    else (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__ = originalLastToolOutput;
  }
});

test("accepted confirm actions across current-value steps render the next step", { concurrency: false }, async () => {
  const originalOpenAi = (globalThis as unknown as { openai?: unknown }).openai;
  const originalDocument = (globalThis as unknown as { document?: unknown }).document;
  const originalLatest = (globalThis as Record<string, unknown>).__BSC_LATEST__;
  const originalLastToolOutput = (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__;
  const originalWindow = (globalThis as unknown as { window?: unknown }).window;
  setIsLoading(false);
  try {
    const scenarios = [
      { action: "ACTION_DREAM_EXPLAINER_REFINE_CONFIRM", current: "dream", next: "purpose" },
      { action: "ACTION_PURPOSE_REFINE_CONFIRM", current: "purpose", next: "bigwhy" },
      { action: "ACTION_BIGWHY_REFINE_CONFIRM", current: "bigwhy", next: "role" },
      { action: "ACTION_ROLE_REFINE_CONFIRM", current: "role", next: "entity" },
      { action: "ACTION_ENTITY_EXAMPLE_CONFIRM", current: "entity", next: "strategy" },
      { action: "ACTION_TARGETGROUP_POSTREFINE_CONFIRM", current: "targetgroup", next: "productsservices" },
    ] as const;

    const renderedSteps: string[] = [];
    const host = {
      widgetState: {} as Record<string, unknown>,
      setWidgetState(next: Record<string, unknown>) {
        this.widgetState = next;
      },
      async callTool(_name: string, args: unknown) {
        const payload = args as Record<string, unknown>;
        const state = (payload.state || {}) as Record<string, unknown>;
        const current = String(state.current_step || "");
        const scenario = scenarios.find((entry) => entry.action === String(payload.user_message || ""));
        assert.ok(scenario);
        assert.equal(current, scenario.current);
        return {
          _meta: {
            widget_result: {
              current_step_id: scenario.next,
              ok: true,
              ack_status: "accepted",
              state_advanced: true,
              state: {
                current_step: scenario.next,
                ack_status: "accepted",
                state_advanced: true,
                bootstrap_session_id: "sess-x",
                bootstrap_epoch: 1,
                response_seq: Number(state.response_seq || 1) + 1,
                host_widget_session_id: "host-x",
                ui_action_liveness: {
                  ack_status: "accepted",
                  state_advanced: true,
                  action_code_echo: scenario.action,
                },
              },
              ui: {
                view: { mode: "interactive" },
                content: { heading: scenario.next },
              },
            },
          },
        };
      },
    };
    (globalThis as unknown as { openai?: unknown }).openai = host;
    (globalThis as unknown as { document?: unknown }).document = {
      getElementById() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    };
    (globalThis as unknown as { window?: unknown }).window = undefined;

    for (const [index, scenario] of scenarios.entries()) {
      initActionsConfig({
        render: (raw) => {
          const rendered = canonicalizeWidgetPayload(raw).result;
          renderedSteps.push(String((rendered.state as Record<string, unknown>).current_step || rendered.current_step_id || ""));
        },
        t: () => "",
      });
      host.widgetState = {
        started: "true",
        current_step: scenario.current,
        bootstrap_session_id: "sess-x",
        bootstrap_epoch: 1,
        response_seq: index + 1,
        host_widget_session_id: "host-x",
      };
      (globalThis as Record<string, unknown>).__BSC_LATEST__ = {
        state: {
          current_step: scenario.current,
          bootstrap_session_id: "sess-x",
          bootstrap_epoch: 1,
          response_seq: index + 1,
          host_widget_session_id: "host-x",
        },
        lang: "nl",
      };
      (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__ = {
        _meta: {
          widget_result: {
            current_step_id: scenario.current,
            state: {
              current_step: scenario.current,
              bootstrap_session_id: "sess-x",
              bootstrap_epoch: 1,
              response_seq: index + 1,
              host_widget_session_id: "host-x",
            },
          },
        },
      };
      await callRunStep(scenario.action);
    }

    assert.deepEqual(renderedSteps, scenarios.map((scenario) => scenario.next));
  } finally {
    setIsLoading(false);
    if (originalOpenAi === undefined) delete (globalThis as unknown as { openai?: unknown }).openai;
    else (globalThis as unknown as { openai?: unknown }).openai = originalOpenAi;
    if (originalDocument === undefined) delete (globalThis as unknown as { document?: unknown }).document;
    else (globalThis as unknown as { document?: unknown }).document = originalDocument;
    if (originalWindow === undefined) delete (globalThis as unknown as { window?: unknown }).window;
    else (globalThis as unknown as { window?: unknown }).window = originalWindow;
    if (originalLatest === undefined) delete (globalThis as Record<string, unknown>).__BSC_LATEST__;
    else (globalThis as Record<string, unknown>).__BSC_LATEST__ = originalLatest;
    if (originalLastToolOutput === undefined) delete (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__;
    else (globalThis as Record<string, unknown>).__BSC_LAST_TOOL_OUTPUT__ = originalLastToolOutput;
  }
});

test("bundled runtime does not retain legacy render-source fallbacks", () => {
  const source = fs.readFileSync(new URL("../ui/step-card.bundled.html", import.meta.url), "utf8");
  assert.match(source, /source:\s*"meta\.widget_result"/);
  assert.doesNotMatch(source, /source:\s*"structuredContent\.result"/);
  assert.doesNotMatch(source, /source:\s*"result"/);
});

test("bundled runtime fail-closes missing canonical widget payloads", () => {
  const source = fs.readFileSync(new URL("../ui/step-card.bundled.html", import.meta.url), "utf8");
  assert.match(source, /incoming_missing_widget_result/);
  assert.match(source, /Canonical widget payload is missing in tool response\./);
  assert.match(source, /widget_result:/);
});

test("bundled runtime retains canonical step continuity for latest render cache", () => {
  const source = fs.readFileSync(new URL("../ui/step-card.bundled.html", import.meta.url), "utf8");
  assert.match(source, /function retainCanonicalStepContinuity\(preferred, \.\.\.fallbacks\)/);
  assert.doesNotMatch(source, /__BSC_LATEST__\s*=\s*\{\s*state,\s*lang\s*\}/);
});

test("bundled prestart intro movie uses language-mapped SSOT links", () => {
  const source = fs.readFileSync(new URL("../ui/step-card.bundled.html", import.meta.url), "utf8");
  assert.match(source, /const PRESTART_INTRO_VIDEO_BY_LANG = \{/);
  assert.match(source, /en:\s*"https:\/\/youtu\.be\/JjlY4iGWSi8"/);
  assert.match(source, /nl:\s*"https:\/\/youtu\.be\/FD3BZit8evg"/);
  assert.match(source, /de:\s*"https:\/\/youtu\.be\/dMnAR-eVedo"/);
  assert.match(source, /es:\s*"https:\/\/youtu\.be\/hEfq_ciotPk"/);
  assert.match(source, /fr:\s*"https:\/\/youtu\.be\/WalQNHy1DRo"/);
  assert.match(source, /it:\s*"https:\/\/youtu\.be\/XUMJ44mXQ6Y"/);
  assert.match(source, /ja:\s*"https:\/\/youtu\.be\/o1di1BkDdKA"/);
});

test("bundled prestart intro movie hides iframe when no language-specific link exists", () => {
  const source = fs.readFileSync(new URL("../ui/step-card.bundled.html", import.meta.url), "utf8");
  assert.match(source, /function prestartIntroVideoUrlForLang\(lang\)/);
  assert.match(source, /const introVideoUrl = prestartIntroVideoUrlForLang\(lang\);/);
  assert.match(source, /if \(introVideoUrl\) \{/);
  assert.doesNotMatch(source, /PRESTART_SHOW_VIDEO\s*=\s*true/);
});

test("bundled ben profile movie uses language-mapped SSOT links and hides when unavailable", () => {
  const source = fs.readFileSync(new URL("../ui/step-card.bundled.html", import.meta.url), "utf8");
  assert.match(source, /const BEN_PROFILE_VIDEO_BY_LANG = \{/);
  assert.match(source, /en:\s*"https:\/\/youtu\.be\/kV4oF2mUZXI"/);
  assert.match(source, /nl:\s*"https:\/\/youtu\.be\/5TLxnL2OkQo"/);
  assert.match(source, /it:\s*"https:\/\/youtu\.be\/S7_GwDJZIAs"/);
  assert.match(source, /de:\s*"https:\/\/youtu\.be\/T18fvylOojg"/);
  assert.match(source, /es:\s*"https:\/\/youtu\.be\/eLSh19ZZ2yM"/);
  assert.match(source, /function benProfileVideoUrlForLang\(lang\)/);
  assert.match(source, /const videoUrl = benProfileVideoUrlForLang\(lang\);/);
  assert.match(source, /if \(!videoUrl\) return;/);
});

test("bundled dream-step intro movie uses language-mapped SSOT links and hides when unavailable", () => {
  const source = fs.readFileSync(new URL("../ui/step-card.bundled.html", import.meta.url), "utf8");
  assert.match(source, /const DREAM_STEP_VIDEO_BY_LANG = \{/);
  assert.match(source, /en:\s*"https:\/\/youtu\.be\/94cmzR2w62o"/);
  assert.match(source, /nl:\s*"https:\/\/youtu\.be\/kksn8roVbQg"/);
  assert.match(source, /it:\s*"https:\/\/youtu\.be\/g-fbHy78uIw"/);
  assert.match(source, /de:\s*"https:\/\/youtu\.be\/KtzkZFE4m5Q"/);
  assert.match(source, /es:\s*"https:\/\/youtu\.be\/-36ryKgLiPo"/);
  assert.match(source, /function dreamStepVideoUrlForLang\(lang\)/);
  assert.match(source, /const shouldAppendDreamStepVideo = current === "dream" && showStepIntroChrome && dreamRuntimeMode === "self" && !isDreamDirectionView;/);
  assert.match(source, /appendDreamStepIntroVideo\(cardDescEl, lang\);/);
  assert.match(source, /const videoUrl = dreamStepVideoUrlForLang\(lang\);/);
  assert.match(source, /if \(!videoUrl\) return;/);
});

test("bundled purpose-step intro movie uses language-mapped SSOT links and hides when unavailable", () => {
  const source = fs.readFileSync(new URL("../ui/step-card.bundled.html", import.meta.url), "utf8");
  assert.match(source, /const PURPOSE_STEP_VIDEO_BY_LANG = \{/);
  assert.match(source, /en:\s*"https:\/\/youtu\.be\/OhtRcBRmiQ0"/);
  assert.match(source, /de:\s*"https:\/\/youtu\.be\/OfG_T2VDhtg"/);
  assert.match(source, /es:\s*"https:\/\/youtu\.be\/TTU7vAkaVJA"/);
  assert.match(source, /fr:\s*"https:\/\/youtu\.be\/EqoczF4mnGc"/);
  assert.match(source, /it:\s*"https:\/\/youtu\.be\/tISM_mLZDgk"/);
  assert.match(source, /nl:\s*"https:\/\/youtu\.be\/oS0tKfpLaYg"/);
  assert.match(source, /function purposeStepVideoUrlForLang\(lang\)/);
  assert.match(source, /const shouldAppendPurposeStepVideo = current === "purpose" && showStepIntroChrome;/);
  assert.match(source, /appendPurposeStepIntroVideo\(cardDescEl, lang\);/);
  assert.match(source, /const videoUrl = purposeStepVideoUrlForLang\(lang\);/);
  assert.match(source, /if \(!videoUrl\) return;/);
});
