const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { parse } = require('@vue/compiler-sfc');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const plain = value => JSON.parse(JSON.stringify(value));

function reporting() {
  const events = [];
  const window = { usageBridge: {
    reportOpenCodeEditor(payload) { events.push({ event: 'open_code_editor', ...plain(payload) }); return Promise.resolve(); },
    reportEvent(event, payload) { events.push({ event, ...plain(payload) }); return Promise.resolve(); }
  } };
  const module = { exports: {} };
  vm.runInNewContext(compile(fs.readFileSync(path.join(root, 'src/utils/codeEditorReporting.ts'), 'utf8')),
    { window, module, exports: module.exports });
  return { events, window, ...module.exports };
}

function functionsFromSfc(file, names, bindings) {
  const { descriptor } = parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const ast = ts.createSourceFile(file + '.ts', descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true);
  const functions = new Map();
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) functions.set(node.name.text, node.getText(ast));
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(functions.size, names.length);
  const context = vm.createContext(bindings);
  vm.runInContext(compile([...functions.values()].join('\n')), context);
  return context;
}

function editor(modelValue = 'return OriginalAtom()') {
  const reportingState = reporting();
  const emitted = [];
  const context = functionsFromSfc('src/components/CodeEditor.vue', ['openModal', 'closeModal'], {
    ...reportingState, props: { modelValue, language: 'typescript', readonly: false },
    openedValue: '', tempValue: { value: '' }, isModalOpen: { value: false }, editor: null,
    emit(...args) { emitted.push(args); }, nextTick() {}, disposeEditor() {}
  });
  return { context, emitted, ...reportingState };
}

test('Opening reports full code exactly once without guessing an atom or workbook', () => {
  const content = 'return TestAtom()\n'.repeat(2000);
  const { context, events } = editor(content);
  context.openModal();
  context.openModal();
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], { event: 'open_code_editor', event_params: {
    source: 'atom_playground', language: 'typescript', content
  } });
});

test('Unchanged close saves the existing value without reporting an edit', () => {
  const { context, events, emitted } = editor();
  context.openModal();
  context.closeModal();
  context.closeModal();
  assert.equal(events.length, 1);
  assert.equal(emitted.length, 2);
  assert.deepEqual(emitted[0], ['update:modelValue', 'return OriginalAtom()']);
});

test('Changed close reports before and after, including clearing all code', () => {
  for (const content of ['return ChangedAtom()', '']) {
    const { context, events, emitted } = editor();
    context.openModal();
    context.editor = { getValue: () => content };
    context.closeModal();
    context.closeModal();
    assert.equal(events.length, 2);
    assert.equal(events[1].event, 'edit_code_editor');
    assert.equal(events[1].event_params.previous_content, 'return OriginalAtom()');
    assert.equal(events[1].event_params.content, content);
    assert.deepEqual(emitted[0], ['update:modelValue', content]);
  }
});

test('Read-only editors and calls to close an unopened editor emit nothing', () => {
  const { context, events, emitted } = editor();
  context.closeModal();
  context.props.readonly = true;
  context.openModal();
  assert.equal(events.length, 0);
  assert.equal(emitted.length, 0);
});

test('Reporting failure cannot prevent opening or saving', async () => {
  const { context, window, emitted } = editor();
  window.usageBridge.reportOpenCodeEditor = () => { throw new Error('bridge unavailable'); };
  window.usageBridge.reportEvent = () => Promise.reject(new Error('offline'));
  context.openModal();
  context.tempValue.value = 'new content';
  context.closeModal();
  await Promise.resolve();
  assert.deepEqual(emitted[0], ['update:modelValue', 'new content']);
  assert.equal(context.isModalOpen.value, false);
});

test('Atom names come from parsed JSON, including nested atoms and deduplication', () => {
  const { collectAtomClassNames } = reporting();
  assert.deepEqual(plain(collectAtomClassNames({ _ClassName: 'Root', children: [
    { _ClassName: 'Child' }, { _ClassName: 'Child' }, null, { _ClassName: '' }, { text: 'NotAnAtom()' }
  ] })), ['Root', 'Child']);
  assert.deepEqual(plain(collectAtomClassNames(null)), []);
});

function parser(result) {
  const state = reporting();
  const applied = [];
  state.window.delegateBridge = { async parseExpression() { return result; } };
  const context = functionsFromSfc('src/App.vue', ['parseCodeEditorContent'], {
    ...state, codeEditorInput: { value: 'return TestAtom();' }, codeEditorParseResult: { value: '' },
    codeEditorParseError: { value: null }, applyNormalizedObject(value) { applied.push(value); },
    console: { warn() {}, error() {} }
  });
  return { context, applied, ...state };
}

test('Successful parsing reports code, actual atom names and parsed content', async () => {
  const json = { _ClassName: 'Root', condition: { _ClassName: 'Child', value: 3 } };
  const { context, events, applied } = parser({ ok: true, json: JSON.stringify(json) });
  await context.parseCodeEditorContent();
  assert.equal(applied.length, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'parse_code_editor');
  assert.equal(events[0].event_params.content, 'return TestAtom();');
  assert.equal(events[0].event_params.expression, 'TestAtom()');
  assert.equal(events[0].event_params.className, 'Root');
  assert.deepEqual(events[0].event_params.atom_types, ['Root', 'Child']);
  assert.deepEqual(events[0].event_params.parsed_content, json);
  assert.equal(events[0].event_params.status, 'success');
});

test('Failed parsing reports the failure without claiming a parsed atom', async () => {
  const { context, events, applied } = parser({ ok: false, error: 'invalid expression' });
  await context.parseCodeEditorContent();
  assert.equal(applied.length, 0);
  assert.equal(events[0].event_params.status, 'failed');
  assert.equal(events[0].event_params.error_message, 'invalid expression');
  assert.ok(!('atom_types' in events[0].event_params));
});
