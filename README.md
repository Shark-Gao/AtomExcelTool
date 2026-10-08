# Vue 3 + TypeScript + Vite

This template should help get you started developing with Vue 3 and TypeScript in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

Learn more about the recommended Project Setup and IDE Support in the [Vue Docs TypeScript Guide](https://vuejs.org/guide/typescript/overview.html#project-setup).

## Usage Event Reporting

The application reports usage events to the configured internal statistics server
(`http://10.30.243.17:9876/api/notify` by default; see `UsageReporter.ts`).
Both regular and streaming AI chat report the submitted user message in
`event_params.message`, together with the selected model, provider, and stream flag.
Only that submission is included, not conversation history, system prompts, API
credentials, AI responses, or the current atom context. The message is stored in
the usage dashboard, so users should be informed of this collection and avoid
submitting sensitive text that must not enter usage statistics.

Existing usage metadata and other event parameters remain compatible. Reporting
is asynchronous and does not block chat. Messages sent by older versions cannot
be reconstructed from historical events that did not include the text.

Run the reporting tests without contacting the statistics or AI servers:

```shell
node --test scripts/test-usage-reporting.cjs
```

### Code Editor Events

The code editor currently belongs to the atom playground, not an Excel cell.
Its reports contain only the code being edited and its parsing result:

- `open_code_editor`: full code when the editor is opened.
- `edit_code_editor`: previous and current code when changed text is saved by
  closing the editor (including Escape). No edit event is emitted if unchanged.
- `parse_code_editor`: code, extracted expression, and success/failure status.
  Successful results include the root atom class, nested atom types, and parsed
  JSON. Failed results include the error instead of guessed atom names.

No individual keystrokes, unrelated workbook cells, or guessed file associations
are collected. Closing the editor saves its workspace text, not the Excel file.
Users should be informed that submitted editor code enters usage statistics.
Older events without these fields cannot be reconstructed.

```shell
node --test scripts/test-usage-reporting.cjs scripts/test-code-editor-reporting.cjs
```
