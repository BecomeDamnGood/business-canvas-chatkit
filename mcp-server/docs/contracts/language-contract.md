# Language Contract

This contract defines language detection, lock timing, override behavior, and propagation.

## Detection Timing

1. Evaluate language before specialist call.
2. Use explicit override first (`language: xx` or equivalent directive).
3. If no override exists and language is unlocked:
- detect language from first meaningful user message.
- meaningful means: enough alphabetic content and non-empty intent input.
4. After detection, set:
- `state.language = <detected>`
- `state.language_locked = "true"`
- `state.language_override = "false"`

## Override Rules

1. Explicit override always wins.
2. On explicit override, set:
- `state.language = <override>`
- `state.language_locked = "true"`
- `state.language_override = "true"`
3. When `language_override="true"`, no auto-detection may replace current language.

## Lock Persistence

- Once locked, language stays stable across steps and specialists.
- Lock reset is only allowed on explicit session reset/restart behavior.

## UI String Translation

1. `ui_strings_lang` must match effective language.
2. If effective language changes and cache is stale/missing:
- resolve UI strings for language
- persist in `ui_strings`
- set `ui_strings_lang`

## Affected Components

- specialist prompts (`LANGUAGE` input)
- render labels/titles/buttons
- menu and wording-choice UI content

