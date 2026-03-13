const { spawn } = require('child_process');

console.log('Starting Electron app...');
console.log('Time:', new Date().toISOString());

var p = spawn('node_modules\\.bin\\electron.cmd', ['.'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: Object.assign({}, process.env, { ELECTRON_ENABLE_LOGGING: '1' }),
  shell: true,
  cwd: __dirname
});

var lineCount = 0;

p.stdout.on('data', function(d) {
  var lines = d.toString().split('\n');
  lines.forEach(function(line) {
    if (line.trim()) {
      lineCount++;
      console.log('[OUT] ' + line.trim());
    }
  });
});

p.stderr.on('data', function(d) {
  var lines = d.toString().split('\n');
  lines.forEach(function(line) {
    if (line.trim()) {
      lineCount++;
      console.log('[ERR] ' + line.trim());
    }
  });
});

p.on('error', function(err) {
  console.log('Process error:', err.message);
});

p.on('exit', function(code) {
  console.log('Process exited with code:', code);
  process.exit(0);
});

// 每5秒输出 heartbeat 防止 idle timeout
var heartbeatInterval = setInterval(function() {
  console.log('[HEARTBEAT] ' + new Date().toISOString() + ' lines=' + lineCount);
}, 5000);

// 45秒后强制终止
setTimeout(function() {
  clearInterval(heartbeatInterval);
  console.log('=== Timeout (45s) reached, killing Electron ===');
  console.log('Total lines captured: ' + lineCount);
  try { p.kill('SIGTERM'); } catch(e) {}
  try {
    require('child_process').execSync('taskkill /f /im electron.exe', { stdio: 'ignore' });
  } catch(e) {}
  setTimeout(function() {
    process.exit(0);
  }, 3000);
}, 45000);
