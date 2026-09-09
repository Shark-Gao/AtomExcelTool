const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const root = path.join(__dirname, '..');
const mainPath = path.join(root, 'src/electron/main/main.ts');
const mainSource = fs.readFileSync(mainPath, 'utf8');
const ast = ts.createSourceFile(mainPath, mainSource, ts.ScriptTarget.Latest, true);
function compile(source) {
    return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
}
function callback(channel) {
    let handler;
    function visit(node) {
        if (ts.isCallExpression(node) && node.expression.getText(ast).startsWith('ipcMain.') &&
            ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === channel) handler = node.arguments[1];
        ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.ok(handler, `Missing IPC handler ${channel}`);
    return compile(`module.exports = ${handler.getText(ast)}`);
}
function reporter(outgoing) {
    const module = { exports: {} };
    const http = { request(options, onResponse) {
        const request = new EventEmitter();
        let body = '';
        request.write = chunk => { body += chunk; };
        request.end = () => { outgoing.push(JSON.parse(body)); onResponse({ statusCode: 200, resume() {} }); };
        request.destroy = () => {};
        return request;
    } };
    vm.runInNewContext(compile(fs.readFileSync(path.join(root, 'src/electron/main/UsageReporter.ts'), 'utf8')), {
        module, exports: module.exports, Buffer, URL, setTimeout, clearTimeout,
        console: { log() {} }, require: name => name === 'electron' ? { app: { getVersion: () => 'test' } } :
            ['http', 'https'].includes(name) ? http : require(name),
    });
    return module.exports;
}

for (const stream of [false, true]) {
    test(`AI message reporting: stream=${stream}`, async () => {
        const outgoing = [];
        const usage = reporter(outgoing);
        const message = 'Test input\n<script>literal content</script> ' + 'long '.repeat(2000);
        const payload = { message, currentAtom: { privateContext: 'not-collected' }, requestId: 'test-request' };
        const service = { async chat() { return { success: true, content: 'done' }; },
            async *chatStream() { yield { type: 'text', content: 'done' }; } };
        const module = { exports: {} };
        vm.runInNewContext(callback(stream ? 'ai:chat-stream' : 'ai:chat'), {
            module, getCurrentAIService: () => service,
            knotModelConfig: { model: 'selected-model', apiToken: 'not-collected-token' },
            reportAIChat: usage.reportAIChat, console: { log() {}, error() {} },
        });
        await module.exports({ reply() {} }, payload);
        assert.equal(outgoing.length, 1);
        assert.equal(outgoing[0].event_type, 'ai_chat');
        assert.equal(outgoing[0].model, 'selected-model');
        assert.deepEqual(outgoing[0].event_params, { message, provider: 'knot', stream });
        assert.ok(!JSON.stringify(outgoing[0]).includes('not-collected'));
        assert.ok(!('currentAtom' in outgoing[0]));
    });
}

test('Reporting remains optional', () => {
    const outgoing = [];
    const usage = reporter(outgoing);
    const disabled = new usage.UsageReporter({ toolId: 'test', serverUrl: 'http://127.0.0.1/', enabled: false });
    disabled.reportAIChat('test', { event_params: { message: 'not-sent' } });
    assert.deepEqual(outgoing, []);
});
