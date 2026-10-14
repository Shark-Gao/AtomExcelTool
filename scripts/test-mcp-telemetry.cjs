const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

test('MCP reports use the configured endpoint for every event', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/electron/mcp/McpUsageReporter.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const destinations = [];
  const events = [];
  let host = '127.0.0.1';
  const http = { request(options, onResponse) {
    destinations.push(options.hostname);
    const request = new EventEmitter();
    request.write = chunk => events.push(JSON.parse(chunk));
    request.end = () => onResponse({ statusCode: 200, resume() {} });
    request.destroy = () => {};
    return request;
  } };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, Buffer, URL,
    console: { error() {} },
    require: name => name === '../shared/TelemetryConfig'
      ? { getTelemetryEndpoint: () => `http://${host}:9876/api/notify` }
      : ['http', 'https'].includes(name) ? http : require(name),
  });

  module.exports.reportMcpServerStart();
  host = '127.0.0.2';
  module.exports.reportMcpToolCall('test_tool');

  assert.deepEqual(destinations, ['127.0.0.1', '127.0.0.2']);
  assert.deepEqual(events.map(event => event.event_type), ['mcp_server_start', 'mcp_tool_call']);
});
