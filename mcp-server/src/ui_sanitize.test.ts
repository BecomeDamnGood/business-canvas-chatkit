import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { renderInlineText, renderSingleValueCardContent, renderStructuredText } from "../ui/lib/ui_text.ts";
import { extractChoicesFromPrompt } from "../ui/lib/ui_choices.ts";
import { canonicalizeWidgetPayload } from "../ui/lib/locale_bootstrap_runtime.ts";
import { readDreamBuilderViewContract, renderChoiceButtons, resolveWidgetBodyText } from "../ui/lib/ui_render.ts";
import { setIsLoading } from "../ui/lib/ui_state.ts";

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

test("bundled runtime does not retain legacy render-source fallbacks", () => {
  const source = fs.readFileSync(new URL("../ui/step-card.bundled.html", import.meta.url), "utf8");
  assert.doesNotMatch(source, /structuredContent\.result/);
  assert.doesNotMatch(source, /root\.result/);
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
