const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const sourcePath = path.join(__dirname, '..', 'src/electron/shared/TelemetryConfig.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadConfig(moduleDirectory, { electron = false, execPath = process.execPath } = {}) {
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require,
    __dirname: moduleDirectory,
    process: { execPath, versions: { electron: electron ? '38.4.0' : undefined } },
  }, { filename: sourcePath });
  return module.exports;
}

function tempProject(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mhatom-telemetry-test-'));
  t.after(() => {
    const resolved = path.resolve(base);
    const tempRoot = path.resolve(os.tmpdir());
    assert.equal(path.dirname(resolved), tempRoot);
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return base;
}

test('development config lives at project root and is created with the default host', t => {
  const projectRoot = tempProject(t);
  const config = loadConfig(path.join(projectRoot, 'dist', 'electron', 'shared'));
  const configPath = path.join(projectRoot, 'telemetry.json');
  assert.equal(config.getTelemetryConfigPath(), configPath);
  assert.equal(config.getTelemetryEndpoint(), 'http://10.30.129.12:9876/api/notify');
  assert.deepEqual(JSON.parse(fs.readFileSync(configPath, 'utf8')), {
    server_host: '10.30.129.12',
  });
});

test('packaged Electron and standalone MCP read the same EXE-adjacent config', t => {
  const appRoot = tempProject(t);
  const main = loadConfig(
    path.join(appRoot, 'resources', 'app.asar', 'dist', 'electron', 'shared'),
    { electron: true, execPath: path.join(appRoot, 'MHAtomExcelTool.exe') }
  );
  const mcp = loadConfig(
    path.join(appRoot, 'resources', 'app.asar.unpacked', 'dist', 'electron', 'shared'),
    { execPath: path.join(appRoot, 'other-node', 'node.exe') }
  );
  const configPath = path.join(appRoot, 'telemetry.json');
  assert.equal(main.getTelemetryConfigPath(), configPath);
  assert.equal(mcp.getTelemetryConfigPath(), configPath);

  fs.writeFileSync(configPath, '{ "server_host": "server-01.example.com" }\n');
  assert.equal(main.getTelemetryEndpoint(), 'http://server-01.example.com:9876/api/notify');
  fs.writeFileSync(configPath, '{ "server_host": "10.30.129.25" }\n');
  assert.equal(mcp.getTelemetryEndpoint(), 'http://10.30.129.25:9876/api/notify');
});

test('existing config is preserved and each call sees a changed host', t => {
  const projectRoot = tempProject(t);
  const config = loadConfig(path.join(projectRoot, 'dist', 'electron', 'shared'));
  const configPath = config.getTelemetryConfigPath();
  const original = '{ "server_host": "server-01.example.com" }\n';
  fs.writeFileSync(configPath, original);
  assert.equal(config.getTelemetryEndpoint(), 'http://server-01.example.com:9876/api/notify');
  assert.equal(fs.readFileSync(configPath, 'utf8'), original);
  fs.writeFileSync(configPath, '{ "server_host": "10.30.129.25" }\n');
  assert.equal(config.getTelemetryEndpoint(), 'http://10.30.129.25:9876/api/notify');
});

test('invalid config fails with the file path instead of using the default', t => {
  const projectRoot = tempProject(t);
  const config = loadConfig(path.join(projectRoot, 'dist', 'electron', 'shared'));
  const configPath = config.getTelemetryConfigPath();
  for (const content of [
    '{ broken json',
    '{}',
    '{ "server_host": "" }',
    '{ "server_host": "999.999.999.999" }',
    '{ "server_host": "server/other" }',
    '{ "server_host": "-invalid-host" }',
  ]) {
    fs.writeFileSync(configPath, content);
    assert.throws(() => config.getTelemetryEndpoint(), error =>
      typeof error?.message === 'string' && error.message.includes(configPath)
    );
  }
});
