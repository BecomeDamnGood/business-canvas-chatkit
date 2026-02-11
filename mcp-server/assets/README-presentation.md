## Presentation template and fonts

This directory contains the presentation template and related assets used for LibreOffice rendering.

### Source ZIP (single source of truth)

- Place the ZIP you receive from design here:
  - `assets/presentation_source/ppt_v1_2.zip`
- The ZIP **must** contain at least:
  - `presentation.pptx`
  - `fonts/` directory with all required font files
- The `fonts` directory must live in the **same directory** as `presentation.pptx` inside the ZIP.

### Build-time preparation (template + fonts)

During the build step, a prepare script will:

- Unzip `assets/presentation_source/ppt_v1_2.zip` to a temporary directory.
- Copy `presentation.pptx` to:
  - `assets/presentation.pptx` (this is the single source PPTX the app uses)
- Copy the `fonts` directory as-is to:
  - `assets/presentation/fonts`

The runtime Docker image copies the entire `assets/` directory and then installs the fonts from `assets/presentation/fonts` into the system font directory so that LibreOffice can use them.

### Local development flow

To make sure your local server uses the latest PPTX + fonts:

- Place the latest ZIP from design at `assets/presentation_source/ppt_v1_2.zip`.
- Run:
  - `npm run build` (or at least `node scripts/prepare-presentation-assets.mjs`) in the `mcp-server` directory.
- Then start the server with either:
  - `node dist/server.js` (production-like), or
  - `npm run dev` (after running the prepare script once to update `assets/presentation.pptx`).

