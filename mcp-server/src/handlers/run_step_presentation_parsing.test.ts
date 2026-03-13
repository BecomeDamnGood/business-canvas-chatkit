import test from "node:test";
import assert from "node:assert/strict";

import { __testOnly } from "./run_step_presentation.js";

test("presentation section parser keeps all products/services items across mixed run-on labels", () => {
  const lines = __testOnly.presentationLinesForSection(
    "Products and Services: Websites; Apps Target Group: Founders in SME Products and Services: Branding; Coaching",
    "productsservices"
  );

  assert.deepEqual(lines, ["Websites", "Apps", "Branding", "Coaching"]);
});

test("presentation section parser splits semicolon and bullet-like input without losing items", () => {
  const lines = __testOnly.presentationLinesForSection(
    "AI-compatible websites and apps; AI-tools and support; Branding; Strategy; Workshops",
    "productsservices"
  );

  assert.deepEqual(lines, [
    "AI-compatible websites and apps",
    "AI-tools and support",
    "Branding",
    "Strategy",
    "Workshops",
  ]);
});

test("presentation recap helpers read edited scalar and list sections from a structured recap", () => {
  const recap = [
    "Dit is wat je zei:",
    "",
    "Droom:",
    "Mindd maakt complexe keuzes rustig en helder.",
    "",
    "Producten en Diensten:",
    "• Strategisch bedrijfs- en communicatieadvies",
    "• Creatieve campagnes",
    "• DTP, posters en traditionele communicatiemiddelen",
  ].join("\n");

  const state = {
    ui_strings: {
      "ppt.heading.dream": "Droom",
      "ppt.heading.productsservices": "Producten en Diensten",
    },
  } as any;

  const deps = {
    uiDefaultString: (key: string) => {
      if (key === "ppt.heading.dream") return "Dream";
      if (key === "ppt.heading.productsservices") return "Products and Services";
      return "";
    },
    uiStringFromStateMap: (currentState: any, key: string, fallback: string) =>
      String(currentState?.ui_strings?.[key] || fallback || ""),
  };

  const dream = __testOnly.scalarSectionValueFromRecap({
    recap,
    state,
    deps,
    section: "dream",
  });
  const products = __testOnly.listSectionLinesFromRecap({
    recap,
    state,
    deps,
    section: "productsservices",
  });

  assert.equal(dream, "Mindd maakt complexe keuzes rustig en helder.");
  assert.deepEqual(products, [
    "Strategisch bedrijfs- en communicatieadvies",
    "Creatieve campagnes",
    "DTP, posters en traditionele communicatiemiddelen",
  ]);
});
