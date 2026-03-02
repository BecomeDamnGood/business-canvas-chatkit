# 100% Parity-inventaris old 2.0 UI vs huidige UI

Datum: 2026-03-02
Repository: `/Users/MinddMacBen/business-canvas-chatkit`

Bronset (verplicht gebruikt):
- current: `mcp-server/ui/step-card.bundled.html`, `mcp-server/src/i18n/ui_strings_defaults.ts`, `mcp-server/src/i18n/ui_strings/locales/ui_strings_*.ts`, `mcp-server/docs/ui-interface-contract.md`, `mcp-server/scripts/copy-ui-dist.mjs`, `mcp-server/src/server/http_routes.ts`, `mcp-server/Dockerfile`
- old 2.0: `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html`, `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.template.html`, `mcp-server/docs/compare/old_v2_2026-02-14/docs/ui-interface-contract.md`, `mcp-server/docs/compare/old_v2_2026-02-14/root/button-contract.md`, `mcp-server/docs/compare/old_v2_2026-02-14/root/button-teksten-en-bold-varianten.md`

Methodiek:
- Geen runtime/server/UI logic aangepast.
- Alleen statische codevergelijking met pad+regelbewijs.
- Waar key-level renderbewijs ontbreekt: `ONBEWEZEN`.

## HARD POLICY — GEEN NIEUWE GUARDS/FALLBACKS/CHECKS

Bij conflict geldt dit blok boven alle andere instructies.

Dit traject is een vereenvoudigingstraject.
Doel: terug naar old 2.0 robuust gedrag zonder extra controlelagen.

### Verboden (absoluut)
- Geen nieuwe guards.
- Geen nieuwe fallbacks.
- Geen retries, polling of recovery-paden.
- Geen fail-close of fail-open logica.
- Geen extra contractstrictness.
- Geen state-gates, ingest-gates, order-gates of stale-gates.
- Geen mode-coercion die schermen forceert.
- Geen nieuwe veiligheids-branches.
- Geen nieuwe feature-flags.
- Geen architectuur-uitbreiding.

### Toegestaan
- Bestaande guard-, fallback- en check-code verwijderen.
- Flow terugzetten naar old 2.0 gedrag.
- Labels, layout en renderpaden herstellen naar old 2.0.
- Bestaande i18n (11 talen + EN fallback) en transportcontract behouden.

### Werkregel
Elke wijziging moet aantoonbaar:
1. complexiteit verlagen;
2. guard-, fallback- en check-oppervlak verkleinen.

Als een wijziging nieuw controle-oppervlak toevoegt: afkeuren.

### Definitie van klaar
- Netto resultaat: minder branches, minder checks, minder gates.
- Geen nieuwe guard-, fallback- of check-code toegevoegd.
- Open, start en render werkt direct zoals old 2.0.

## 1) Catalogus-naar-UI matrix (100%)
| key | old render-locatie(s) | current render-locatie(s) | UI-element | state/view | status | bewijs_status |
|---|---|---|---|---|---|---|
| `bigwhy.tooLong.message` | `-` | `-` | `unknown` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `bigwhy.tooLong.question` | `-` | `-` | `unknown` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `btnDreamConfirm` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1236,1316,2665,2666,2667` | `mcp-server/ui/step-card.bundled.html:765` | `button` | `interactive` | `gebruikt maar anders` | `BEWEZEN` |
| `btnGoToNextStep` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1233,1308,1774,1785,1786` | `mcp-server/ui/step-card.bundled.html:762` | `button` | `interactive` | `gebruikt maar anders` | `BEWEZEN` |
| `btnScoringContinue` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1215,1330,2531,2532,2533` | `mcp-server/ui/step-card.bundled.html:739` | `button` | `interactive` | `gebruikt maar anders` | `BEWEZEN` |
| `btnStart` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1061,1230,1234,1312,1772` | `mcp-server/ui/step-card.bundled.html:760,763,817,826,835` | `button` | `prestart` | `gebruikt maar anders` | `BEWEZEN` |
| `btnSwitchToSelfDream` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1235,1322,1776,1789,1790` | `mcp-server/ui/step-card.bundled.html:764` | `button` | `interactive` | `gebruikt maar anders` | `BEWEZEN` |
| `byText` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:326,1173,1309,2090,2095` | `mcp-server/ui/step-card.bundled.html:657,789,816,825,834` | `header/subtitle` | `prestart` | `gebruikt maar anders` | `BEWEZEN` |
| `contract.headline.define` | `-` | `-` | `prompt/body` | `interactive` | `ontbreekt` | `ONBEWEZEN` |
| `contract.headline.refine` | `-` | `-` | `prompt/body` | `interactive` | `ontbreekt` | `ONBEWEZEN` |
| `contract.headline.strategy.moreFocus` | `-` | `-` | `prompt/body` | `interactive` | `ontbreekt` | `ONBEWEZEN` |
| `contract.headline.withOptions` | `-` | `-` | `prompt/body` | `interactive` | `ontbreekt` | `ONBEWEZEN` |
| `contract.headline.withoutOptions` | `-` | `-` | `prompt/body` | `interactive` | `ontbreekt` | `ONBEWEZEN` |
| `contract.recap.noOutput` | `-` | `-` | `prompt/body` | `interactive` | `ontbreekt` | `ONBEWEZEN` |
| `dev.error.prefix` | `-` | `-` | `error/notice` | `prestart+interactive` | `ontbreekt` | `ONBEWEZEN` |
| `dev.error.unhandled_rejection` | `-` | `-` | `error/notice` | `prestart+interactive` | `ontbreekt` | `ONBEWEZEN` |
| `dev.error.unknown` | `-` | `-` | `error/notice` | `prestart+interactive` | `ontbreekt` | `ONBEWEZEN` |
| `dreamBuilder.question.base` | `-` | `-` | `dream/scoring` | `interactive` | `ontbreekt` | `ONBEWEZEN` |
| `dreamBuilder.question.more` | `-` | `-` | `dream/scoring` | `interactive` | `ontbreekt` | `ONBEWEZEN` |
| `dreamBuilder.startExercise` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1317,2700` | `-` | `dream/scoring` | `interactive` | `ontbreekt` | `BEWEZEN` |
| `dreamBuilder.statements.count` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1319,2581` | `-` | `dream/scoring` | `interactive` | `ontbreekt` | `BEWEZEN` |
| `dreamBuilder.statements.empty` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1320` | `-` | `dream/scoring` | `interactive` | `ontbreekt` | `BEWEZEN` |
| `dreamBuilder.statements.title` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1318,2579` | `-` | `dream/scoring` | `interactive` | `ontbreekt` | `BEWEZEN` |
| `dreamBuilder.switchSelf.headline` | `-` | `-` | `dream/scoring` | `interactive` | `ontbreekt` | `ONBEWEZEN` |
| `error.contract.body` | `-` | `-` | `error/notice` | `prestart+interactive` | `ontbreekt` | `ONBEWEZEN` |
| `error.contract.title` | `-` | `-` | `error/notice` | `prestart+interactive` | `ontbreekt` | `ONBEWEZEN` |
| `error.generic.body` | `-` | `-` | `error/notice` | `prestart+interactive` | `ontbreekt` | `ONBEWEZEN` |
| `error.generic.title` | `-` | `-` | `error/notice` | `prestart+interactive` | `ontbreekt` | `ONBEWEZEN` |
| `error.session_upgrade.body` | `-` | `-` | `error/notice` | `prestart+interactive` | `ontbreekt` | `ONBEWEZEN` |
| `error.session_upgrade.title` | `-` | `-` | `error/notice` | `prestart+interactive` | `ontbreekt` | `ONBEWEZEN` |
| `error.unknownAction` | `-` | `-` | `error/notice` | `prestart+interactive` | `ontbreekt` | `ONBEWEZEN` |
| `errorMessage` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1324,1807,1903` | `mcp-server/ui/step-card.bundled.html:819,828,837,846,855` | `error/notice` | `prestart+interactive` | `gebruikt maar anders` | `BEWEZEN` |
| `generic.choicePrompt.shareOrOption` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1321,2596` | `-` | `prompt/body` | `interactive` | `ontbreekt` | `BEWEZEN` |
| `hydration.retry.action` | `-` | `-` | `error/notice` | `prestart+interactive` | `ontbreekt` | `ONBEWEZEN` |
| `hydration.retry.body` | `-` | `-` | `error/notice` | `prestart+interactive` | `ontbreekt` | `ONBEWEZEN` |
| `hydration.retry.title` | `-` | `-` | `error/notice` | `prestart+interactive` | `ontbreekt` | `ONBEWEZEN` |
| `inputPlaceholder` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1311,2715` | `-` | `input` | `interactive` | `ontbreekt` | `BEWEZEN` |
| `invariant.prompt.ask.default` | `-` | `-` | `prompt/body` | `interactive` | `ontbreekt` | `ONBEWEZEN` |
| `media.image.alt` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `menuLabel.DREAM_EXPLAINER_MENU_REFINE.ACTION_DREAM_EXPLAINER_REFINE_ADJUST` | `-` | `-` | `button` | `interactive` | `ontbreekt` | `ONBEWEZEN` |
| `menuLabel.DREAM_EXPLAINER_MENU_REFINE.ACTION_DREAM_EXPLAINER_REFINE_CONFIRM` | `-` | `-` | `button` | `interactive` | `ontbreekt` | `ONBEWEZEN` |
| `menuLabel.DREAM_EXPLAINER_MENU_SWITCH_SELF.ACTION_DREAM_SWITCH_TO_SELF` | `-` | `-` | `button` | `interactive` | `ontbreekt` | `ONBEWEZEN` |
| `menuLabel.DREAM_MENU_INTRO.ACTION_DREAM_INTRO_EXPLAIN_MORE` | `-` | `-` | `button` | `interactive` | `ontbreekt` | `ONBEWEZEN` |
| `menuLabel.DREAM_MENU_INTRO.ACTION_DREAM_INTRO_START_EXERCISE` | `-` | `-` | `button` | `interactive` | `ontbreekt` | `ONBEWEZEN` |
| `menuLabel.DREAM_MENU_REFINE.ACTION_DREAM_REFINE_CONFIRM` | `-` | `-` | `button` | `interactive` | `ontbreekt` | `ONBEWEZEN` |
| `menuLabel.DREAM_MENU_REFINE.ACTION_DREAM_REFINE_START_EXERCISE` | `-` | `-` | `button` | `interactive` | `ontbreekt` | `ONBEWEZEN` |
| `menuLabel.DREAM_MENU_SUGGESTIONS.ACTION_DREAM_SUGGESTIONS_PICK_ONE` | `-` | `-` | `button` | `interactive` | `ontbreekt` | `ONBEWEZEN` |
| `menuLabel.DREAM_MENU_SUGGESTIONS.ACTION_DREAM_SUGGESTIONS_START_EXERCISE` | `-` | `-` | `button` | `interactive` | `ontbreekt` | `ONBEWEZEN` |
| `menuLabel.DREAM_MENU_WHY.ACTION_DREAM_WHY_GIVE_SUGGESTIONS` | `-` | `-` | `button` | `interactive` | `ontbreekt` | `ONBEWEZEN` |
| `menuLabel.DREAM_MENU_WHY.ACTION_DREAM_WHY_START_EXERCISE` | `-` | `-` | `button` | `interactive` | `ontbreekt` | `ONBEWEZEN` |
| `menuLabel.STEP0_MENU_META_RETURN.ACTION_STEP0_META_RETURN` | `-` | `-` | `button` | `interactive` | `ontbreekt` | `ONBEWEZEN` |
| `menuLabel.STEP0_MENU_READY_START.ACTION_STEP0_READY_START` | `-` | `-` | `button` | `interactive` | `ontbreekt` | `ONBEWEZEN` |
| `meta.benProfile.paragraph1` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `meta.benProfile.paragraph2` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `meta.benProfile.paragraph3` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `meta.benProfile.paragraph4` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `meta.modelCredibility.body` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `motivation.continuePrompt` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `motivation.continueTemplate` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `motivation.essencePrefix` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `motivation.opener` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `motivation.provenLine` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `offtopic.companyFallback` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `offtopic.current.template` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `offtopic.redirect.template` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `offtopic.step.bigwhy` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `offtopic.step.dream` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `offtopic.step.entity` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `offtopic.step.presentation` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `offtopic.step.productsservices` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `offtopic.step.purpose` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `offtopic.step.role` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `offtopic.step.rulesofthegame` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `offtopic.step.strategy` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `offtopic.step.targetgroup` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `optionsDisplayError` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1325,2129` | `-` | `unknown` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `ppt.heading.dream` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `ppt.heading.entity` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `ppt.heading.productsservices` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `ppt.heading.purpose` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `ppt.heading.role` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `ppt.heading.rulesofthegame` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `ppt.heading.strategy` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `ppt.heading.targetgroup` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `presentation.error` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `presentation.ready` | `-` | `-` | `content/meta` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `prestart.headline` | `-` | `mcp-server/ui/step-card.bundled.html:1038,1082` | `prestart-body` | `prestart` | `afwijkend` | `BEWEZEN` |
| `prestart.loading` | `-` | `-` | `prestart-body` | `prestart` | `ontbreekt` | `ONBEWEZEN` |
| `prestart.meta.how.label` | `-` | `mcp-server/ui/step-card.bundled.html:1045,1089` | `prestart-body` | `prestart` | `afwijkend` | `BEWEZEN` |
| `prestart.meta.how.value` | `-` | `mcp-server/ui/step-card.bundled.html:1046,1090` | `prestart-body` | `prestart` | `afwijkend` | `BEWEZEN` |
| `prestart.meta.time.label` | `-` | `mcp-server/ui/step-card.bundled.html:1047,1091` | `prestart-body` | `prestart` | `afwijkend` | `BEWEZEN` |
| `prestart.meta.time.value` | `-` | `mcp-server/ui/step-card.bundled.html:1048,1092` | `prestart-body` | `prestart` | `afwijkend` | `BEWEZEN` |
| `prestart.outcomes.item1` | `-` | `mcp-server/ui/step-card.bundled.html:1042,1086` | `prestart-body` | `prestart` | `afwijkend` | `BEWEZEN` |
| `prestart.outcomes.item2` | `-` | `mcp-server/ui/step-card.bundled.html:1043,1087` | `prestart-body` | `prestart` | `afwijkend` | `BEWEZEN` |
| `prestart.outcomes.item3` | `-` | `mcp-server/ui/step-card.bundled.html:1044,1088` | `prestart-body` | `prestart` | `afwijkend` | `BEWEZEN` |
| `prestart.outcomes.title` | `-` | `mcp-server/ui/step-card.bundled.html:1041,1085` | `prestart-body` | `prestart` | `afwijkend` | `BEWEZEN` |
| `prestart.proven.body` | `-` | `mcp-server/ui/step-card.bundled.html:1040,1084` | `prestart-body` | `prestart` | `afwijkend` | `BEWEZEN` |
| `prestart.proven.title` | `-` | `mcp-server/ui/step-card.bundled.html:1039,1083` | `prestart-body` | `prestart` | `afwijkend` | `BEWEZEN` |
| `prestartWelcome` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1305,1374,1377,2281,2310` | `mcp-server/ui/step-card.bundled.html:382,820,829,838,847` | `unknown` | `ONBEWEZEN` | `gebruikt maar anders` | `BEWEZEN` |
| `scoring.aria.scoreInput` | `-` | `-` | `dream/scoring` | `interactive` | `ontbreekt` | `ONBEWEZEN` |
| `scoring.avg.empty` | `-` | `-` | `dream/scoring` | `interactive` | `ontbreekt` | `ONBEWEZEN` |
| `scoring.categoryFallback` | `-` | `-` | `dream/scoring` | `interactive` | `ontbreekt` | `ONBEWEZEN` |
| `scoring.input.placeholder` | `-` | `-` | `dream/scoring` | `interactive` | `ontbreekt` | `ONBEWEZEN` |
| `scoringAvg` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1332,2389,2483` | `-` | `unknown` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `scoringDreamQuestion` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1329,2428` | `-` | `unknown` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `scoringIntro1` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1326,2444` | `-` | `unknown` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `scoringIntro3` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1328,2444` | `-` | `unknown` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `sectionTitle.bigwhyOf` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1337,1338` | `-` | `title` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `sectionTitle.bigwhyOfFuture` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1338` | `-` | `title` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `sectionTitle.dream` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1334,1384` | `-` | `title` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `sectionTitle.entityOf` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1341,1342` | `-` | `title` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `sectionTitle.entityOfFuture` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1342` | `-` | `title` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `sectionTitle.presentation` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1351,1386` | `-` | `title` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `sectionTitle.productsservicesOf` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1347,1348` | `-` | `title` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `sectionTitle.productsservicesOfFuture` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1348` | `-` | `title` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `sectionTitle.purposeOf` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1335,1336` | `-` | `title` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `sectionTitle.purposeOfFuture` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1336` | `-` | `title` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `sectionTitle.roleOf` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1339,1340` | `-` | `title` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `sectionTitle.roleOfFuture` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1340` | `-` | `title` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `sectionTitle.rulesofthegameOf` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1349,1350` | `-` | `title` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `sectionTitle.rulesofthegameOfFuture` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1350` | `-` | `title` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `sectionTitle.step_0` | `-` | `mcp-server/ui/step-card.bundled.html:1429` | `title` | `ONBEWEZEN` | `afwijkend` | `BEWEZEN` |
| `sectionTitle.strategyOf` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1343,1344` | `-` | `title` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `sectionTitle.strategyOfFuture` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1344` | `-` | `title` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `sectionTitle.targetgroupOf` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1345,1346` | `-` | `title` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `sectionTitle.targetgroupOfFuture` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1346` | `-` | `title` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `sendTitle` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1323,2100` | `-` | `input` | `interactive` | `ontbreekt` | `BEWEZEN` |
| `startHint` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1067,1231,1310,2246,2247` | `mcp-server/ui/step-card.bundled.html:512,761,818,827,836` | `unknown` | `ONBEWEZEN` | `gebruikt maar anders` | `BEWEZEN` |
| `step0.carddesc` | `-` | `-` | `unknown` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `step0.question.initial` | `-` | `mcp-server/ui/step-card.bundled.html:1481` | `unknown` | `ONBEWEZEN` | `afwijkend` | `BEWEZEN` |
| `step0.readiness.statement.existing` | `-` | `-` | `unknown` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `step0.readiness.statement.starting` | `-` | `-` | `unknown` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `step0.readiness.suffix` | `-` | `-` | `unknown` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `stepLabel.validation` | `-` | `mcp-server/ui/step-card.bundled.html:1429` | `title` | `ONBEWEZEN` | `afwijkend` | `BEWEZEN` |
| `strategy.current.template` | `-` | `-` | `unknown` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `strategy.focuspoints.count.template` | `-` | `-` | `unknown` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `strategy.focuspoints.warning.template` | `-` | `-` | `unknown` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `title.bigwhy` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1297` | `-` | `title` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `title.dream` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1295` | `-` | `title` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `title.entity` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1299` | `-` | `title` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `title.presentation` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1304` | `-` | `title` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `title.productsservices` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1302` | `-` | `title` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `title.purpose` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1296` | `-` | `title` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `title.role` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1298` | `-` | `title` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `title.rulesofthegame` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1303` | `-` | `title` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `title.step_0` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1294` | `-` | `title` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `title.strategy` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1300` | `-` | `title` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `title.targetgroup` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1301` | `-` | `title` | `ONBEWEZEN` | `ontbreekt` | `BEWEZEN` |
| `tool.title` | `-` | `-` | `unknown` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `transient.connecting` | `-` | `-` | `error/notice` | `prestart+interactive` | `ontbreekt` | `ONBEWEZEN` |
| `transient.connection_failed` | `-` | `-` | `error/notice` | `prestart+interactive` | `ontbreekt` | `ONBEWEZEN` |
| `transient.rate_limited` | `-` | `-` | `error/notice` | `prestart+interactive` | `ontbreekt` | `ONBEWEZEN` |
| `transient.timeout` | `-` | `-` | `error/notice` | `prestart+interactive` | `ontbreekt` | `ONBEWEZEN` |
| `uiSubtitle` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1243,1306,2089,2093,2094` | `mcp-server/ui/step-card.bundled.html:771,800,814,823,832` | `header/subtitle` | `prestart` | `gebruikt maar anders` | `BEWEZEN` |
| `uiTitle.template` | `-` | `-` | `unknown` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |
| `uiUseWidgetToContinue` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1307` | `mcp-server/ui/step-card.bundled.html:815,824,833,842,851` | `header/subtitle` | `prestart` | `gebruikt maar anders` | `BEWEZEN` |
| `wording.choice.context.default` | `-` | `-` | `wording-choice` | `interactive` | `ontbreekt` | `ONBEWEZEN` |
| `wording.feedback.user_pick.ack.default` | `-` | `-` | `wording-choice` | `interactive` | `ontbreekt` | `ONBEWEZEN` |
| `wording.feedback.user_pick.reason.default` | `-` | `-` | `wording-choice` | `interactive` | `ontbreekt` | `ONBEWEZEN` |
| `wordingChoice.chooseVersion` | `-` | `-` | `wording-choice` | `interactive` | `ontbreekt` | `ONBEWEZEN` |
| `wordingChoice.useInputFallback` | `-` | `-` | `wording-choice` | `interactive` | `ontbreekt` | `ONBEWEZEN` |
| `wordingChoiceHeading` | `-` | `mcp-server/ui/step-card.bundled.html:517,744` | `unknown` | `ONBEWEZEN` | `afwijkend` | `BEWEZEN` |
| `wordingChoiceInstruction` | `-` | `mcp-server/ui/step-card.bundled.html:518,755` | `unknown` | `ONBEWEZEN` | `afwijkend` | `BEWEZEN` |
| `wordingChoiceSuggestionLabel` | `-` | `-` | `unknown` | `ONBEWEZEN` | `ontbreekt` | `ONBEWEZEN` |

## 2) Volledige UI-elementeninventaris

### 2.1 ID-inventaris (alle zichtbare + conditionele id-elementen)
| id | old aanwezig (regels) | current aanwezig (regels) | old wiring (regels) | current wiring (regels) | status | ernst |
|---|---|---|---|---|---|---|
| `actions` | `-` | `mcp-server/ui/step-card.bundled.html:691` | `-` | `mcp-server/ui/step-card.bundled.html:795` | `afwijking` | `hoog` |
| `badge` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1190` | `mcp-server/ui/step-card.bundled.html:684` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1767,2240` | `mcp-server/ui/step-card.bundled.html:790` | `GEVERIFIEERD GELIJK` | `laag` |
| `btnDreamConfirm` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1236` | `mcp-server/ui/step-card.bundled.html:765` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2665,2708,2834` | `-` | `afwijking` | `middel` |
| `btnGoToNextStep` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1233` | `mcp-server/ui/step-card.bundled.html:762` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1774,2659,2695,2864` | `-` | `afwijking` | `middel` |
| `btnOk` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1232` | `-` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1773,2245,2267,2856` | `-` | `afwijking` | `hoog` |
| `btnScoringContinue` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1215` | `mcp-server/ui/step-card.bundled.html:739` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2531,2537` | `-` | `afwijking` | `middel` |
| `btnStart` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1230` | `mcp-server/ui/step-card.bundled.html:760` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1772,2091,2244,2842` | `-` | `afwijking` | `middel` |
| `btnStartDreamExercise` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1234` | `mcp-server/ui/step-card.bundled.html:763` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1775,2627,2698,2872` | `-` | `afwijking` | `middel` |
| `btnStartText` | `-` | `mcp-server/ui/step-card.bundled.html:760` | `-` | `-` | `afwijking` | `middel` |
| `btnSwitchToSelfDream` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1235` | `mcp-server/ui/step-card.bundled.html:764` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1776,2432,2628,2703,2880` | `-` | `afwijking` | `middel` |
| `byText` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1173` | `mcp-server/ui/step-card.bundled.html:657` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2090` | `mcp-server/ui/step-card.bundled.html:789` | `GEVERIFIEERD GELIJK` | `laag` |
| `bylineLogo` | `-` | `mcp-server/ui/step-card.bundled.html:659` | `-` | `-` | `afwijking` | `middel` |
| `card` | `-` | `mcp-server/ui/step-card.bundled.html:687` | `-` | `mcp-server/ui/step-card.bundled.html:792` | `afwijking` | `middel` |
| `cardDesc` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1195` | `mcp-server/ui/step-card.bundled.html:688` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1803,1904,2278,2322` | `mcp-server/ui/step-card.bundled.html:793` | `GEVERIFIEERD GELIJK` | `laag` |
| `cardTitle` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1193` | `mcp-server/ui/step-card.bundled.html:686` | `-` | `-` | `afwijking` | `middel` |
| `choiceWrap` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1227` | `mcp-server/ui/step-card.bundled.html:758` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2103,2273,2417,2630,2639,2648` | `-` | `afwijking` | `middel` |
| `controls` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1229` | `mcp-server/ui/step-card.bundled.html:759` | `-` | `-` | `afwijking` | `middel` |
| `debugOverlay` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1244` | `mcp-server/ui/step-card.bundled.html:772` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2671` | `-` | `afwijking` | `middel` |
| `error` | `-` | `mcp-server/ui/step-card.bundled.html:700` | `-` | `mcp-server/ui/step-card.bundled.html:799` | `afwijking` | `middel` |
| `inlineNotice` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1196` | `mcp-server/ui/step-card.bundled.html:710` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1732,1739` | `-` | `afwijking` | `middel` |
| `input` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1221` | `mcp-server/ui/step-card.bundled.html:697` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1770,2713,2716,2787,2801` | `-` | `afwijking` | `middel` |
| `inputForm` | `-` | `mcp-server/ui/step-card.bundled.html:693` | `-` | `mcp-server/ui/step-card.bundled.html:796` | `afwijking` | `hoog` |
| `inputSend` | `-` | `mcp-server/ui/step-card.bundled.html:695` | `-` | `mcp-server/ui/step-card.bundled.html:798` | `afwijking` | `hoog` |
| `inputText` | `-` | `mcp-server/ui/step-card.bundled.html:694` | `-` | `mcp-server/ui/step-card.bundled.html:797` | `afwijking` | `hoog` |
| `inputWrap` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1220` | `mcp-server/ui/step-card.bundled.html:692` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2243` | `-` | `afwijking` | `middel` |
| `meta` | `-` | `mcp-server/ui/step-card.bundled.html:666` | `-` | `mcp-server/ui/step-card.bundled.html:787` | `afwijking` | `middel` |
| `presentationDownload` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1202` | `mcp-server/ui/step-card.bundled.html:717` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2330` | `-` | `afwijking` | `middel` |
| `presentationPreview` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1197` | `mcp-server/ui/step-card.bundled.html:712` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2327` | `-` | `afwijking` | `middel` |
| `presentationThumb` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1199` | `mcp-server/ui/step-card.bundled.html:714` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2328` | `-` | `afwijking` | `middel` |
| `presentationThumbLink` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1198` | `mcp-server/ui/step-card.bundled.html:713` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2329` | `-` | `afwijking` | `middel` |
| `prompt` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1218` | `mcp-server/ui/step-card.bundled.html:690` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2279,2405,2426,2569,2614` | `mcp-server/ui/step-card.bundled.html:794` | `GEVERIFIEERD GELIJK` | `laag` |
| `purposeInstructionHint` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1205` | `mcp-server/ui/step-card.bundled.html:721` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2345` | `-` | `afwijking` | `middel` |
| `scoringClusters` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1213` | `mcp-server/ui/step-card.bundled.html:731` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2461` | `-` | `afwijking` | `middel` |
| `scoringIntro` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1212` | `mcp-server/ui/step-card.bundled.html:730` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2442` | `-` | `afwijking` | `middel` |
| `scoringPanel` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1211` | `mcp-server/ui/step-card.bundled.html:729` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2437,2562` | `-` | `afwijking` | `middel` |
| `sectionTitle` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1192` | `mcp-server/ui/step-card.bundled.html:685` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2250` | `mcp-server/ui/step-card.bundled.html:791` | `GEVERIFIEERD GELIJK` | `laag` |
| `send` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1222` | `mcp-server/ui/step-card.bundled.html:698` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1760,1771,2092,2796` | `-` | `afwijking` | `middel` |
| `startHint` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1231` | `mcp-server/ui/step-card.bundled.html:761` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2246` | `-` | `afwijking` | `middel` |
| `statementsCount` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1208` | `mcp-server/ui/step-card.bundled.html:725` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2358` | `-` | `afwijking` | `middel` |
| `statementsList` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1209` | `mcp-server/ui/step-card.bundled.html:726` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2359` | `-` | `afwijking` | `middel` |
| `statementsPanel` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1206` | `mcp-server/ui/step-card.bundled.html:723` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2356` | `-` | `afwijking` | `middel` |
| `statementsTitle` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1207` | `mcp-server/ui/step-card.bundled.html:724` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2357` | `-` | `afwijking` | `middel` |
| `status` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1239` | `mcp-server/ui/step-card.bundled.html:680` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2728` | `mcp-server/ui/step-card.bundled.html:786` | `GEVERIFIEERD GELIJK` | `laag` |
| `stepper` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1182` | `mcp-server/ui/step-card.bundled.html:669` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2020` | `-` | `afwijking` | `middel` |
| `uiSubtitle` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1243` | `mcp-server/ui/step-card.bundled.html:771` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2089,2728` | `mcp-server/ui/step-card.bundled.html:800` | `GEVERIFIEERD GELIJK` | `laag` |
| `uiTitle` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1171` | `mcp-server/ui/step-card.bundled.html:655` | `-` | `mcp-server/ui/step-card.bundled.html:788` | `afwijking` | `middel` |
| `wordingChoiceHeading` | `-` | `mcp-server/ui/step-card.bundled.html:744` | `-` | `-` | `afwijking` | `middel` |
| `wordingChoiceInstruction` | `-` | `mcp-server/ui/step-card.bundled.html:755` | `-` | `-` | `afwijking` | `middel` |
| `wordingChoicePickSuggestion` | `-` | `mcp-server/ui/step-card.bundled.html:753` | `-` | `-` | `afwijking` | `middel` |
| `wordingChoicePickUser` | `-` | `mcp-server/ui/step-card.bundled.html:748` | `-` | `-` | `afwijking` | `middel` |
| `wordingChoiceSuggestionCard` | `-` | `mcp-server/ui/step-card.bundled.html:750` | `-` | `-` | `afwijking` | `middel` |
| `wordingChoiceSuggestionList` | `-` | `mcp-server/ui/step-card.bundled.html:752` | `-` | `-` | `afwijking` | `middel` |
| `wordingChoiceSuggestionText` | `-` | `mcp-server/ui/step-card.bundled.html:751` | `-` | `-` | `afwijking` | `middel` |
| `wordingChoiceUserCard` | `-` | `mcp-server/ui/step-card.bundled.html:745` | `-` | `-` | `afwijking` | `middel` |
| `wordingChoiceUserList` | `-` | `mcp-server/ui/step-card.bundled.html:747` | `-` | `-` | `afwijking` | `middel` |
| `wordingChoiceUserText` | `-` | `mcp-server/ui/step-card.bundled.html:746` | `-` | `-` | `afwijking` | `middel` |
| `wordingChoiceWrap` | `-` | `mcp-server/ui/step-card.bundled.html:743` | `-` | `-` | `afwijking` | `middel` |

### 2.2 Class-inventaris (markup classes old/current)
| class | old aanwezig (regels) | current aanwezig (regels) | status | ernst |
|---|---|---|---|---|
| `actions` | `-` | `mcp-server/ui/step-card.bundled.html:691` | `afwijking` | `middel` |
| `avgScore` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2389,2483` | `mcp-server/ui/step-card.bundled.html:735` | `GEVERIFIEERD GELIJK` | `laag` |
| `badge` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1190` | `mcp-server/ui/step-card.bundled.html:684` | `GEVERIFIEERD GELIJK` | `laag` |
| `bar` | `-` | `mcp-server/ui/step-card.bundled.html:679` | `afwijking` | `middel` |
| `body` | `-` | `mcp-server/ui/step-card.bundled.html:682` | `afwijking` | `middel` |
| `bootstrap-wait-shell` | `-` | `mcp-server/ui/step-card.bundled.html:703` | `afwijking` | `middel` |
| `bootstrap-wait-title` | `-` | `mcp-server/ui/step-card.bundled.html:704` | `afwijking` | `middel` |
| `btn` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1215,1230,1232,1233,1234,1235,1236` | `mcp-server/ui/step-card.bundled.html:739,760,762,763,764,765` | `GEVERIFIEERD GELIJK` | `laag` |
| `byline` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1172` | `mcp-server/ui/step-card.bundled.html:656,660` | `GEVERIFIEERD GELIJK` | `laag` |
| `bylineLogo` | `-` | `mcp-server/ui/step-card.bundled.html:660` | `afwijking` | `middel` |
| `card` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1188,1189,1193,1195` | `mcp-server/ui/step-card.bundled.html:677,683,686,687,688` | `GEVERIFIEERD GELIJK` | `laag` |
| `card-stage` | `-` | `mcp-server/ui/step-card.bundled.html:677` | `afwijking` | `middel` |
| `cardDesc` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1195` | `mcp-server/ui/step-card.bundled.html:688` | `GEVERIFIEERD GELIJK` | `laag` |
| `cardInner` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1189` | `mcp-server/ui/step-card.bundled.html:683` | `GEVERIFIEERD GELIJK` | `laag` |
| `cardTitle` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1193` | `mcp-server/ui/step-card.bundled.html:686` | `GEVERIFIEERD GELIJK` | `laag` |
| `choiceBtn` | `-` | `mcp-server/ui/step-card.bundled.html:748,753` | `afwijking` | `middel` |
| `choiceWrap` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1227` | `mcp-server/ui/step-card.bundled.html:758` | `GEVERIFIEERD GELIJK` | `laag` |
| `cta-arrow` | `-` | `mcp-server/ui/step-card.bundled.html:760` | `afwijking` | `middel` |
| `error` | `-` | `mcp-server/ui/step-card.bundled.html:700` | `afwijking` | `middel` |
| `inlineNotice` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1196` | `mcp-server/ui/step-card.bundled.html:710` | `GEVERIFIEERD GELIJK` | `laag` |
| `input` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1220` | `mcp-server/ui/step-card.bundled.html:692,693` | `GEVERIFIEERD GELIJK` | `laag` |
| `inputWrap` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1220` | `mcp-server/ui/step-card.bundled.html:692` | `GEVERIFIEERD GELIJK` | `laag` |
| `is-hidden` | `-` | `mcp-server/ui/step-card.bundled.html:697,772` | `afwijking` | `middel` |
| `legacy-panels` | `-` | `mcp-server/ui/step-card.bundled.html:702` | `afwijking` | `middel` |
| `meta` | `-` | `mcp-server/ui/step-card.bundled.html:666` | `afwijking` | `middel` |
| `page-header` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1169` | `mcp-server/ui/step-card.bundled.html:653` | `GEVERIFIEERD GELIJK` | `laag` |
| `presentationActions` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1201` | `mcp-server/ui/step-card.bundled.html:716` | `GEVERIFIEERD GELIJK` | `laag` |
| `presentationDownload` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1202` | `mcp-server/ui/step-card.bundled.html:717` | `GEVERIFIEERD GELIJK` | `laag` |
| `presentationPreview` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1197` | `mcp-server/ui/step-card.bundled.html:712` | `GEVERIFIEERD GELIJK` | `laag` |
| `presentationThumb` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1198,1199` | `mcp-server/ui/step-card.bundled.html:713,714` | `GEVERIFIEERD GELIJK` | `laag` |
| `presentationThumbLink` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1198` | `mcp-server/ui/step-card.bundled.html:713` | `GEVERIFIEERD GELIJK` | `laag` |
| `prestartBlock` | `-` | `mcp-server/ui/step-card.bundled.html:1112,1114,1117,1122,1124` | `afwijking` | `middel` |
| `prestartBlockBody` | `-` | `mcp-server/ui/step-card.bundled.html:1117` | `afwijking` | `middel` |
| `prestartBlockTitle` | `-` | `mcp-server/ui/step-card.bundled.html:1114,1124` | `afwijking` | `middel` |
| `prestartHeadline` | `-` | `mcp-server/ui/step-card.bundled.html:1109` | `afwijking` | `middel` |
| `prestartMetaGrid` | `-` | `mcp-server/ui/step-card.bundled.html:1134` | `afwijking` | `middel` |
| `prestartMetaItem` | `-` | `mcp-server/ui/step-card.bundled.html:1136,1140` | `afwijking` | `middel` |
| `prestartMetaLabel` | `-` | `mcp-server/ui/step-card.bundled.html:1136,1140` | `afwijking` | `middel` |
| `prestartMetaValue` | `-` | `mcp-server/ui/step-card.bundled.html:1137,1141` | `afwijking` | `middel` |
| `prestartOutcomes` | `-` | `mcp-server/ui/step-card.bundled.html:1126` | `afwijking` | `middel` |
| `prestartWelcome` | `-` | `mcp-server/ui/step-card.bundled.html:1107` | `afwijking` | `middel` |
| `primary` | `-` | `-` | `afwijking` | `middel` |
| `prompt` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1218` | `mcp-server/ui/step-card.bundled.html:690` | `GEVERIFIEERD GELIJK` | `laag` |
| `purposeInstructionHint` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1205` | `mcp-server/ui/step-card.bundled.html:721` | `GEVERIFIEERD GELIJK` | `laag` |
| `row` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1229` | `mcp-server/ui/step-card.bundled.html:759` | `GEVERIFIEERD GELIJK` | `laag` |
| `scoringClusterHeader` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2484` | `mcp-server/ui/step-card.bundled.html:732` | `GEVERIFIEERD GELIJK` | `laag` |
| `scoringClusterRows` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2484` | `mcp-server/ui/step-card.bundled.html:733` | `GEVERIFIEERD GELIJK` | `laag` |
| `scoringContinueWrap` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1214` | `mcp-server/ui/step-card.bundled.html:738` | `GEVERIFIEERD GELIJK` | `laag` |
| `scoringIntro` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1212` | `mcp-server/ui/step-card.bundled.html:730` | `GEVERIFIEERD GELIJK` | `laag` |
| `scoringPanel` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1211` | `mcp-server/ui/step-card.bundled.html:729` | `GEVERIFIEERD GELIJK` | `laag` |
| `sectionTitle` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1192` | `mcp-server/ui/step-card.bundled.html:685` | `GEVERIFIEERD GELIJK` | `laag` |
| `send` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1222` | `mcp-server/ui/step-card.bundled.html:698` | `GEVERIFIEERD GELIJK` | `laag` |
| `shell` | `-` | `mcp-server/ui/step-card.bundled.html:678` | `afwijking` | `middel` |
| `skeleton-line` | `-` | `mcp-server/ui/step-card.bundled.html:705,706,707` | `afwijking` | `middel` |
| `startHint` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1231` | `mcp-server/ui/step-card.bundled.html:761` | `GEVERIFIEERD GELIJK` | `laag` |
| `statementsCount` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1208` | `mcp-server/ui/step-card.bundled.html:725` | `GEVERIFIEERD GELIJK` | `laag` |
| `statementsList` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1209` | `mcp-server/ui/step-card.bundled.html:726` | `GEVERIFIEERD GELIJK` | `laag` |
| `statementsPanel` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1206` | `mcp-server/ui/step-card.bundled.html:723` | `GEVERIFIEERD GELIJK` | `laag` |
| `statementsTitle` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1207` | `mcp-server/ui/step-card.bundled.html:724` | `GEVERIFIEERD GELIJK` | `laag` |
| `status` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1239` | `mcp-server/ui/step-card.bundled.html:680` | `GEVERIFIEERD GELIJK` | `laag` |
| `stepper` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1181,1182` | `mcp-server/ui/step-card.bundled.html:668,669` | `GEVERIFIEERD GELIJK` | `laag` |
| `stepperRow` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1181` | `mcp-server/ui/step-card.bundled.html:668` | `GEVERIFIEERD GELIJK` | `laag` |
| `subtitle` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1243` | `mcp-server/ui/step-card.bundled.html:771` | `GEVERIFIEERD GELIJK` | `laag` |
| `themeName` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2392,2484` | `mcp-server/ui/step-card.bundled.html:734` | `GEVERIFIEERD GELIJK` | `laag` |
| `title` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1171` | `mcp-server/ui/step-card.bundled.html:655` | `GEVERIFIEERD GELIJK` | `laag` |
| `wordingChoiceCard` | `-` | `mcp-server/ui/step-card.bundled.html:745,750` | `afwijking` | `middel` |
| `wordingChoiceHeading` | `-` | `mcp-server/ui/step-card.bundled.html:744` | `afwijking` | `middel` |
| `wordingChoiceInstruction` | `-` | `mcp-server/ui/step-card.bundled.html:755` | `afwijking` | `middel` |
| `wordingChoiceList` | `-` | `mcp-server/ui/step-card.bundled.html:747,752` | `afwijking` | `middel` |
| `wordingChoiceSelectBtn` | `-` | `-` | `afwijking` | `middel` |
| `wordingChoiceText` | `-` | `mcp-server/ui/step-card.bundled.html:746,751` | `afwijking` | `middel` |
| `wordingChoiceWrap` | `-` | `mcp-server/ui/step-card.bundled.html:743` | `afwijking` | `middel` |
| `wrap` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1170,1187` | `mcp-server/ui/step-card.bundled.html:654,676` | `GEVERIFIEERD GELIJK` | `laag` |

## 3) Button + Action contract matrix

### 3.1 Core controls en actioncodes
| UI-control / contract-item | verwacht actioncode (old 2.0) | old dispatch-locatie | current dispatch-locatie | mismatch | ernst | bewijs_status |
|---|---|---|---|---|---|---|
| `btnStart` | `ACTION_START` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2852` | `mcp-server/ui/step-card.bundled.html:1507,1508,1370` | `ja` | `hoog` | `BEWEZEN` |
| `btnOk` (step_0 confirm) | `ACTION_CONFIRM_CONTINUE` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2861` | `-` | `ja` | `blokkerend` | `BEWEZEN` |
| `btnGoToNextStep` | `ACTION_DREAM_EXPLAINER_NEXT_STEP` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2869` | `-` | `ja` | `hoog` | `BEWEZEN` |
| `btnStartDreamExercise` | `ACTION_CONFIRM_CONTINUE` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2877` | `-` | `ja` | `hoog` | `BEWEZEN` |
| `btnSwitchToSelfDream` | `ACTION_DREAM_SWITCH_TO_SELF` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2885` | `-` | `ja` | `hoog` | `BEWEZEN` |
| menu choice buttons (`choiceWrap`) | `ui.action_codes[index]` + `menu_id` verplicht | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2113,2118,2136,2156,2183,2200` | `mcp-server/ui/step-card.bundled.html:1228,1290,1370` | `ja` | `hoog` | `BEWEZEN` |
| fallback choice dispatch | `niet toegestaan` volgens old contract | `mcp-server/docs/compare/old_v2_2026-02-14/root/button-contract.md:5` | `mcp-server/ui/step-card.bundled.html:1385` | `ja` | `blokkerend` | `BEWEZEN` |
| text submit | `ACTION_TEXT_SUBMIT` (old contractregel) | `mcp-server/docs/compare/old_v2_2026-02-14/root/button-contract.md:29-31`, runtime: `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2831` | `mcp-server/ui/step-card.bundled.html:1566` (stuurt vrije tekst) | `ja` | `hoog` | `BEWEZEN` |
| scoring submit | `ACTION_DREAM_EXPLAINER_SUBMIT_SCORES` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2825` | `-` | `ja` | `hoog` | `BEWEZEN` |
| ActionCode-only policy | `verplicht` | `mcp-server/docs/compare/old_v2_2026-02-14/root/button-contract.md:7-10` | huidige runtime heeft label-fallback pad: `mcp-server/ui/step-card.bundled.html:1385` | `ja` | `blokkerend` | `BEWEZEN` |

### 3.2 Menu/actioncode matrix (alle `menuLabel.*` keys uit catalogus)
| menuLabel key | verwacht actioncode (uit key) | old dispatch-locatie | current dispatch-locatie | mismatch | ernst | bewijs_status |
|---|---|---|---|---|---|---|
| `menuLabel.DREAM_EXPLAINER_MENU_REFINE.ACTION_DREAM_EXPLAINER_REFINE_ADJUST` | `ACTION_DREAM_EXPLAINER_REFINE_ADJUST` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2118,2200` | `mcp-server/ui/step-card.bundled.html:1228,1290,1370 (+ label-fallback 1385)` | `ja` | `hoog` | `BEWEZEN` |
| `menuLabel.DREAM_EXPLAINER_MENU_REFINE.ACTION_DREAM_EXPLAINER_REFINE_CONFIRM` | `ACTION_DREAM_EXPLAINER_REFINE_CONFIRM` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2118,2200` | `mcp-server/ui/step-card.bundled.html:1228,1290,1370 (+ label-fallback 1385)` | `ja` | `hoog` | `BEWEZEN` |
| `menuLabel.DREAM_EXPLAINER_MENU_SWITCH_SELF.ACTION_DREAM_SWITCH_TO_SELF` | `ACTION_DREAM_SWITCH_TO_SELF` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2118,2200` | `mcp-server/ui/step-card.bundled.html:1228,1290,1370 (+ label-fallback 1385)` | `ja` | `hoog` | `BEWEZEN` |
| `menuLabel.DREAM_MENU_INTRO.ACTION_DREAM_INTRO_EXPLAIN_MORE` | `ACTION_DREAM_INTRO_EXPLAIN_MORE` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2118,2200` | `mcp-server/ui/step-card.bundled.html:1228,1290,1370 (+ label-fallback 1385)` | `ja` | `hoog` | `BEWEZEN` |
| `menuLabel.DREAM_MENU_INTRO.ACTION_DREAM_INTRO_START_EXERCISE` | `ACTION_DREAM_INTRO_START_EXERCISE` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2118,2200` | `mcp-server/ui/step-card.bundled.html:1228,1290,1370 (+ label-fallback 1385)` | `ja` | `hoog` | `BEWEZEN` |
| `menuLabel.DREAM_MENU_REFINE.ACTION_DREAM_REFINE_CONFIRM` | `ACTION_DREAM_REFINE_CONFIRM` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2118,2200` | `mcp-server/ui/step-card.bundled.html:1228,1290,1370 (+ label-fallback 1385)` | `ja` | `hoog` | `BEWEZEN` |
| `menuLabel.DREAM_MENU_REFINE.ACTION_DREAM_REFINE_START_EXERCISE` | `ACTION_DREAM_REFINE_START_EXERCISE` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2118,2200` | `mcp-server/ui/step-card.bundled.html:1228,1290,1370 (+ label-fallback 1385)` | `ja` | `hoog` | `BEWEZEN` |
| `menuLabel.DREAM_MENU_SUGGESTIONS.ACTION_DREAM_SUGGESTIONS_PICK_ONE` | `ACTION_DREAM_SUGGESTIONS_PICK_ONE` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2118,2200` | `mcp-server/ui/step-card.bundled.html:1228,1290,1370 (+ label-fallback 1385)` | `ja` | `hoog` | `BEWEZEN` |
| `menuLabel.DREAM_MENU_SUGGESTIONS.ACTION_DREAM_SUGGESTIONS_START_EXERCISE` | `ACTION_DREAM_SUGGESTIONS_START_EXERCISE` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2118,2200` | `mcp-server/ui/step-card.bundled.html:1228,1290,1370 (+ label-fallback 1385)` | `ja` | `hoog` | `BEWEZEN` |
| `menuLabel.DREAM_MENU_WHY.ACTION_DREAM_WHY_GIVE_SUGGESTIONS` | `ACTION_DREAM_WHY_GIVE_SUGGESTIONS` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2118,2200` | `mcp-server/ui/step-card.bundled.html:1228,1290,1370 (+ label-fallback 1385)` | `ja` | `hoog` | `BEWEZEN` |
| `menuLabel.DREAM_MENU_WHY.ACTION_DREAM_WHY_START_EXERCISE` | `ACTION_DREAM_WHY_START_EXERCISE` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2118,2200` | `mcp-server/ui/step-card.bundled.html:1228,1290,1370 (+ label-fallback 1385)` | `ja` | `hoog` | `BEWEZEN` |
| `menuLabel.STEP0_MENU_META_RETURN.ACTION_STEP0_META_RETURN` | `ACTION_STEP0_META_RETURN` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2118,2200` | `mcp-server/ui/step-card.bundled.html:1228,1290,1370 (+ label-fallback 1385)` | `ja` | `hoog` | `BEWEZEN` |
| `menuLabel.STEP0_MENU_READY_START.ACTION_STEP0_READY_START` | `ACTION_STEP0_READY_START` | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2118,2200` | `mcp-server/ui/step-card.bundled.html:1228,1290,1370 (+ label-fallback 1385)` | `ja` | `hoog` | `BEWEZEN` |

## 4) Styling parity matrix
| Styling item | old 2.0 bewijs | current bewijs | status | ernst | bewijs_status |
|---|---|---|---|---|---|
| Font stack | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:50,180` (system-ui stack) | `mcp-server/ui/step-card.bundled.html:42,112,239,281,370` (DM Sans/DM Serif) + `:6-10` (Google Fonts load) | `afwijking` | `hoog` | `BEWEZEN` |
| Header title typografie | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:262-271` | `mcp-server/ui/step-card.bundled.html:111-118` | `afwijking` | `middel` | `BEWEZEN` |
| Byline tekst zichtbaarheid | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:326-327` (`#byText` hidden) | `mcp-server/ui/step-card.bundled.html:657` (`#byText` zichtbaar, geen hide-regel) | `afwijking` | `hoog` | `BEWEZEN` |
| Logo bron | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1175` (inline data URI) | `mcp-server/ui/step-card.bundled.html:661` (`/ui/assets/...`) | `afwijking` | `blokkerend` | `BEWEZEN` |
| Stepper constructie | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2019,2237-2239` (dynamisch buildStepper) | `mcp-server/ui/step-card.bundled.html:669-670` (statische `<i>` reeks) | `afwijking` | `middel` | `BEWEZEN` |
| Prestart 2-koloms meta | old rich prestart in default string: `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1278-1291`, render via `:2281` | current grid aanwezig `mcp-server/ui/step-card.bundled.html:412,1134-1143`, maar alleen als rich keys aanwezig `:1094-1105` | `gebruikt maar anders` | `hoog` | `BEWEZEN` |
| Card container structuur | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1188-1243` | `mcp-server/ui/step-card.bundled.html:678-771` | `afwijking` | `middel` | `BEWEZEN` |
| Input control stijl/structuur | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1220-1224,894,936` | `mcp-server/ui/step-card.bundled.html:693-699,501,506` | `afwijking` | `hoog` | `BEWEZEN` |
| Responsive breakpoint | `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:144,1116` | `mcp-server/ui/step-card.bundled.html:588,597` | `afwijking` | `middel` | `BEWEZEN` |
| Legacy panel visibility class | old gebruikt zichtbare controls in runtime flow (`mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2625-2669`) | current plaatst controls in `.legacy-panels.is-hidden` (`mcp-server/ui/step-card.bundled.html:702-767`) | `afwijking` | `hoog` | `BEWEZEN` |

## 5) Assets + deploy parity
| Item | runtime verwacht | build/deploy feitelijk | mismatch | ernst | bewijs_status |
|---|---|---|---|---|---|
| Logo asset | `mcp-server/ui/step-card.bundled.html:661` verwacht `/ui/assets/business-model_by_ben-steenstra.svg` | `mcp-server/scripts/copy-ui-dist.mjs:9,25` kopieert alleen `step-card.bundled.html`; `mcp-server/Dockerfile:41-48` kopieert alleen `dist` + `assets/presentation`; `mcp-server/dist/ui` bevat geen assetsmap | `ja` | `blokkerend` | `BEWEZEN` |
| Runtime UI SSOT file | `ui/step-card.bundled.html` | server serveert exact dit pad: `mcp-server/src/server/http_routes.ts:277-279,313-321` | `nee` | `laag` | `GEVERIFIEERD GELIJK` |
| `/ui/*` static serving | assets mogen via `/ui/*` | route ondersteunt `/ui/*`: `mcp-server/src/server/http_routes.ts:274-282,303-312` | `nee` | `laag` | `GEVERIFIEERD GELIJK` |
| Template beschikbaarheid | old had template-bron | server blokkeert `step-card.template.html`: `mcp-server/src/server/http_routes.ts:297-300` | `ja` | `middel` | `BEWEZEN` |

## 6) First-paint timeline (feitelijk)
1. Init runtime en lees host-tooloutput.
   - Current: `mcp-server/ui/step-card.bundled.html:1569-1578`.
2. Current controleert of `_meta.widget_result` direct aanwezig is.
   - Current: `mcp-server/ui/step-card.bundled.html:1580-1583`.
3. Bij afwezige payload injecteert current synthetische prestart-fallback.
   - Current: `mcp-server/ui/step-card.bundled.html:1584` (`set_globals_fallback`).
4. Fallback bevat minimale `ui_strings` subset.
   - Current: `mcp-server/ui/step-card.bundled.html:997-1003`.
5. Render loopt met mode-normalisatie naar prestart voor meerdere modes (`waiting_locale/recovery/blocked/failed`).
   - Current: `mcp-server/ui/step-card.bundled.html:1411-1416`.
6. Eerste paint kan daardoor minimale/EN-achtige prestart tonen.
   - Current fallback strings: `mcp-server/ui/step-card.bundled.html:976-988`.
7. Latere host event update rendert pas echte payload.
   - Current listeners: `mcp-server/ui/step-card.bundled.html:1590-1601`.
8. Old 2.0 doet op `openai:set_globals` geen synthetische fallback-ingest; het triggert `render()` op beschikbare data.
   - Old: `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2889-2892`.

## 7) Definitieve gatenlijst
| ID | Bevinding | Ernst | Type | Bewijs |
|---|---|---|---|---|
| G-01 | `btnOk` ontbreekt in current runtime-flow (step_0 readiness knoppariteit ontbreekt) | `blokkerend` | `functioneel verschil` | old: `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:1232,2266,2642,2856-2862`; current: geen `btnOk` id in DOM (`/tmp/id_inventory.md`, row `btnOk`) |
| G-02 | Current heeft label-based fallback dispatch (`callRunStep(choiceLabel)`) | `blokkerend` | `functioneel verschil` | `mcp-server/ui/step-card.bundled.html:1376-1388`, `:1385`; old contract verbiedt fallback: `mcp-server/docs/compare/old_v2_2026-02-14/root/button-contract.md:19-21` |
| G-03 | Logo-pad verwacht `/ui/assets/...`, maar build/runtime image levert assets niet mee | `blokkerend` | `functioneel verschil` | `mcp-server/ui/step-card.bundled.html:661`; `mcp-server/scripts/copy-ui-dist.mjs:9,25`; `mcp-server/Dockerfile:41-48` |
| G-04 | First-paint fallback injectie maakt minimale prestart vóór echte payload mogelijk | `hoog` | `functioneel verschil` | `mcp-server/ui/step-card.bundled.html:1582-1585`, `:990-1020` |
| G-05 | Fallback prestart-state mist rich prestart keys | `hoog` | `functioneel verschil` | fallback keys: `mcp-server/ui/step-card.bundled.html:997-1003`; rich keys vereist door markup: `:1083-1092`, `:1112-1143` |
| G-06 | Old event-wiring voor meerdere controls ontbreekt in current actieve flow | `hoog` | `functioneel verschil` | old wiring: `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2842-2887`; current actieve render via `#actions/#inputForm`: `mcp-server/ui/step-card.bundled.html:1348-1404` |
| G-07 | Typografie verschilt door externe Google Fonts in current | `hoog` | `pure vormgeving` | current: `mcp-server/ui/step-card.bundled.html:6-10,42`; old: `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:50,180` |
| G-08 | Header byline-tekst blijft zichtbaar in current; old verborg deze | `hoog` | `pure vormgeving` | old: `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:326-327`; current span zichtbaar: `mcp-server/ui/step-card.bundled.html:657` |
| G-09 | Stepper-opbouw dynamisch in old, statisch in current | `middel` | `pure vormgeving` | old: `mcp-server/docs/compare/old_v2_2026-02-14/ui/step-card.bundled.html:2019,2237-2239`; current: `mcp-server/ui/step-card.bundled.html:669-670` |
| G-10 | Contractdoc current verbiedt client fallback/language fallback, runtime doet het wel | `middel` | `functioneel verschil` | doc: `mcp-server/docs/ui-interface-contract.md:66,74-78`; runtime: `mcp-server/ui/step-card.bundled.html:931-957,976-988,990-1020,1582-1585` |

## 8) Compleetheidsverklaring
- totaal aantal catalogus-keys: **164**
- aantal gemapt (BEWEZEN): **68**
- aantal ongemapt (ONBEWEZEN): **96**
- lijst van ongemapte keys:
- `bigwhy.tooLong.message`
- `bigwhy.tooLong.question`
- `contract.headline.define`
- `contract.headline.refine`
- `contract.headline.strategy.moreFocus`
- `contract.headline.withOptions`
- `contract.headline.withoutOptions`
- `contract.recap.noOutput`
- `dev.error.prefix`
- `dev.error.unhandled_rejection`
- `dev.error.unknown`
- `dreamBuilder.question.base`
- `dreamBuilder.question.more`
- `dreamBuilder.switchSelf.headline`
- `error.contract.body`
- `error.contract.title`
- `error.generic.body`
- `error.generic.title`
- `error.session_upgrade.body`
- `error.session_upgrade.title`
- `error.unknownAction`
- `hydration.retry.action`
- `hydration.retry.body`
- `hydration.retry.title`
- `invariant.prompt.ask.default`
- `media.image.alt`
- `menuLabel.DREAM_EXPLAINER_MENU_REFINE.ACTION_DREAM_EXPLAINER_REFINE_ADJUST`
- `menuLabel.DREAM_EXPLAINER_MENU_REFINE.ACTION_DREAM_EXPLAINER_REFINE_CONFIRM`
- `menuLabel.DREAM_EXPLAINER_MENU_SWITCH_SELF.ACTION_DREAM_SWITCH_TO_SELF`
- `menuLabel.DREAM_MENU_INTRO.ACTION_DREAM_INTRO_EXPLAIN_MORE`
- `menuLabel.DREAM_MENU_INTRO.ACTION_DREAM_INTRO_START_EXERCISE`
- `menuLabel.DREAM_MENU_REFINE.ACTION_DREAM_REFINE_CONFIRM`
- `menuLabel.DREAM_MENU_REFINE.ACTION_DREAM_REFINE_START_EXERCISE`
- `menuLabel.DREAM_MENU_SUGGESTIONS.ACTION_DREAM_SUGGESTIONS_PICK_ONE`
- `menuLabel.DREAM_MENU_SUGGESTIONS.ACTION_DREAM_SUGGESTIONS_START_EXERCISE`
- `menuLabel.DREAM_MENU_WHY.ACTION_DREAM_WHY_GIVE_SUGGESTIONS`
- `menuLabel.DREAM_MENU_WHY.ACTION_DREAM_WHY_START_EXERCISE`
- `menuLabel.STEP0_MENU_META_RETURN.ACTION_STEP0_META_RETURN`
- `menuLabel.STEP0_MENU_READY_START.ACTION_STEP0_READY_START`
- `meta.benProfile.paragraph1`
- `meta.benProfile.paragraph2`
- `meta.benProfile.paragraph3`
- `meta.benProfile.paragraph4`
- `meta.modelCredibility.body`
- `motivation.continuePrompt`
- `motivation.continueTemplate`
- `motivation.essencePrefix`
- `motivation.opener`
- `motivation.provenLine`
- `offtopic.companyFallback`
- `offtopic.current.template`
- `offtopic.redirect.template`
- `offtopic.step.bigwhy`
- `offtopic.step.dream`
- `offtopic.step.entity`
- `offtopic.step.presentation`
- `offtopic.step.productsservices`
- `offtopic.step.purpose`
- `offtopic.step.role`
- `offtopic.step.rulesofthegame`
- `offtopic.step.strategy`
- `offtopic.step.targetgroup`
- `ppt.heading.dream`
- `ppt.heading.entity`
- `ppt.heading.productsservices`
- `ppt.heading.purpose`
- `ppt.heading.role`
- `ppt.heading.rulesofthegame`
- `ppt.heading.strategy`
- `ppt.heading.targetgroup`
- `presentation.error`
- `presentation.ready`
- `prestart.loading`
- `scoring.aria.scoreInput`
- `scoring.avg.empty`
- `scoring.categoryFallback`
- `scoring.input.placeholder`
- `step0.carddesc`
- `step0.readiness.statement.existing`
- `step0.readiness.statement.starting`
- `step0.readiness.suffix`
- `strategy.current.template`
- `strategy.focuspoints.count.template`
- `strategy.focuspoints.warning.template`
- `tool.title`
- `transient.connecting`
- `transient.connection_failed`
- `transient.rate_limited`
- `transient.timeout`
- `uiTitle.template`
- `wording.choice.context.default`
- `wording.feedback.user_pick.ack.default`
- `wording.feedback.user_pick.reason.default`
- `wordingChoice.chooseVersion`
- `wordingChoice.useInputFallback`
- `wordingChoiceSuggestionLabel`

- verklaring: **audit niet compleet** (omdat ONBEWEZEN > 0)
