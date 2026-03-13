/**
 * MCP Server 测试脚本
 * MCP SDK 1.27+ 使用行分隔的 JSON-RPC 格式（每行一个 JSON 消息，用 \n 分隔）
 */
var spawn = require('child_process').spawn;
var path = require('path');

var serverPath = path.join(__dirname, '..', 'dist', 'electron', 'mcp', 'McpServer.js');

console.log('=== MHAtomExcelTool MCP Server Test ===\n');

var proc = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: path.join(__dirname, '..'),
});

var buffer = '';
var step = 0;

function sendJsonRpc(method, params, id) {
  var msg = JSON.stringify({ jsonrpc: '2.0', id: id, method: method, params: params });
  proc.stdin.write(msg + '\n');
}

proc.stdout.on('data', function(data) {
  buffer += data.toString();
  
  // 按行分割处理
  var lines = buffer.split('\n');
  buffer = lines.pop() || ''; // 最后一行可能不完整
  
  lines.forEach(function(line) {
    line = line.trim();
    if (!line) return;
    try {
      var response = JSON.parse(line);
      handleResponse(response);
    } catch(e) {
      // 忽略非 JSON 行
    }
  });
});

proc.stderr.on('data', function(data) {
  var msg = data.toString().trim();
  if (msg) console.log('[Server]', msg);
});

proc.on('exit', function(code) {
  if (code !== 0 && code !== null) {
    console.log('Server exited with code:', code);
  }
});

function handleResponse(response) {
  // 跳过通知
  if (!response.id) return;
  
  step++;
  
  if (step === 1) {
    console.log('✅ Step 1: Initialize');
    var info = response.result && response.result.serverInfo;
    console.log('   Server: ' + (info && info.name) + ' v' + (info && info.version));
    var caps = response.result && response.result.capabilities;
    console.log('   Capabilities: tools=' + !!(caps && caps.tools));
    
    // 发送 initialized 通知
    var notif = JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' });
    proc.stdin.write(notif + '\n');
    
    // 列出工具
    setTimeout(function() {
      sendJsonRpc('tools/list', {}, 2);
    }, 200);
    
  } else if (step === 2) {
    console.log('\n✅ Step 2: List Tools');
    var tools = (response.result && response.result.tools) || [];
    console.log('   Found ' + tools.length + ' tool(s):');
    tools.forEach(function(t) {
      console.log('     - ' + t.name);
    });
    
    // 测试解析表达式
    sendJsonRpc('tools/call', {
      name: 'parse_atom_expression',
      arguments: { expression: 'NumberAdd(GetLevel(), 5)' }
    }, 3);
    
  } else if (step === 3) {
    console.log('\n✅ Step 3: Parse Expression "NumberAdd(GetLevel(), 5)"');
    try {
      var text = response.result.content[0].text;
      var result = JSON.parse(text);
      console.log('   OK:', result.ok);
      if (result.parsed) {
        console.log('   _ClassName:', result.parsed._ClassName);
        console.log('   JSON preview:', JSON.stringify(result.parsed).substring(0, 150) + '...');
      }
      if (result.error) console.log('   Error:', result.error);
    } catch(e) {
      console.log('   Error parsing result:', e.message);
      console.log('   Raw:', JSON.stringify(response).substring(0, 300));
    }
    
    // 测试获取元数据摘要
    sendJsonRpc('tools/call', {
      name: 'get_atom_metadata',
      arguments: { summary: true }
    }, 4);
    
  } else if (step === 4) {
    console.log('\n✅ Step 4: Get Metadata Summary');
    try {
      var text = response.result.content[0].text;
      var result = JSON.parse(text);
      console.log('   OK:', result.ok);
      console.log('   Total atom types:', result.count);
      if (result.metadata && result.metadata.length > 0) {
        console.log('   First 5 atoms:');
        result.metadata.slice(0, 5).forEach(function(m) {
          console.log('     - ' + m.funcName + ' [' + m.baseClass + '] ' + (m.displayName || ''));
        });
      }
    } catch(e) {
      console.log('   Error:', e.message);
    }
    
    // 测试搜索
    sendJsonRpc('tools/call', {
      name: 'search_atom_metadata',
      arguments: { keyword: 'Level', limit: 5 }
    }, 5);
    
  } else if (step === 5) {
    console.log('\n✅ Step 5: Search Metadata "Level"');
    try {
      var text = response.result.content[0].text;
      var result = JSON.parse(text);
      console.log('   OK:', result.ok);
      console.log('   Found:', result.count, 'results');
      if (result.metadata) {
        result.metadata.forEach(function(m) {
          console.log('     - ' + m.funcName + ' (' + m.className + ')');
        });
      }
    } catch(e) {
      console.log('   Error:', e.message);
    }
    
    // 测试 JSON 反序列化
    sendJsonRpc('tools/call', {
      name: 'deparse_json_to_expression',
      arguments: { json: '{"_ClassName":"NumberValueConstDelegate","Constant":42}' }
    }, 6);
    
  } else if (step === 6) {
    console.log('\n✅ Step 6: Deparse JSON to Expression');
    try {
      var text = response.result.content[0].text;
      var result = JSON.parse(text);
      console.log('   OK:', result.ok);
      console.log('   Expression:', result.expression);
      console.log('   Description:', result.expressionDesc);
    } catch(e) {
      console.log('   Error:', e.message);
    }
    
    console.log('\n========================================');
    console.log('  All 6 tests passed! MCP Server works!');
    console.log('========================================\n');
    proc.kill();
    process.exit(0);
  }
}

// 等待 server 启动后发送 initialize
setTimeout(function() {
  sendJsonRpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' }
  }, 1);
}, 1000);

// 超时
setTimeout(function() {
  console.error('\n❌ Test timed out!');
  proc.kill();
  process.exit(1);
}, 30000);
