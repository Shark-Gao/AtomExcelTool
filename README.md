# Vue 3 + TypeScript + Vite

This template should help get you started developing with Vue 3 and TypeScript in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

Learn more about the recommended Project Setup and IDE Support in the [Vue Docs TypeScript Guide](https://vuejs.org/guide/typescript/overview.html#project-setup).

## Usage Event Reporting

The application reports usage events to the configured internal statistics server
(`http://10.30.129.88:9876/api/notify` by default; see `UsageReporter.ts`).
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
