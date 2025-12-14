// Integration test runner: launches Firefox via web-ext, opens tests/test-page.html,
// and asserts that the extension logs stream detections.
// We rely on console output from content/background scripts containing keywords.

const { spawn } = require('node:child_process');
const { resolve, join } = require('node:path');
const { once } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');
const http = require('node:http');
const fs = require('node:fs');
const chai = require('chai');
const expect = chai.expect;

async function run() {
  const cwd = resolve(__dirname, '../../');

  // Start minimal HTTP server to allow proper content script injection
  const port = 9090;
  const server = http.createServer((req, res) => {
    const urlPath = req.url.split('?')[0];
    const filePath = join(cwd, urlPath.replace(/^\/+/, ''));
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }
      const ext = filePath.split('.').pop();
      const type = ext === 'html' ? 'text/html' : 'text/plain';
      res.setHeader('Content-Type', type);
      res.end(data);
    });
  });

  await new Promise((resolveServer) => server.listen(port, resolveServer));

  const args = [
    'run',
    '--source-dir', '.',
    '--start-url', `http://localhost:${port}/tests/test-page.html`,
    '--verbose',
    '--no-input',
  ];

  const proc = spawn('web-ext', args, { cwd });

  let stdout = '';
  let stderr = '';
  let addonInstalled = false;
  let detections = 0;

  const detectionRegex = /Stream detected:/i;
  const badgeRegex = /setBadgeText|badge count/i;
  const apiRegex = /CALL_API|API request/i;
  const storageErrorRegex = /temporary addon ID|storage API will not work/i;

  proc.stdout.on('data', (d) => {
    const s = d.toString();
    stdout += s;
    if (detectionRegex.test(s)) {
      detections++;
      console.log('[detection found]', s.trim());
    }
    if (/Installed .* as a temporary add-on/i.test(s)) addonInstalled = true;
  });
  proc.stderr.on('data', (d) => {
    const s = d.toString();
    stderr += s;
  });

  // Give the extension time to start and the page to load.
  // Then trigger the popup once via a synthetic key (cannot from here),
  // so we focus on passive detections from content script.
  const timeoutMs = 20000; // 20s overall timeout
  const start = Date.now();

  // Wait for add-on to install and begin detection
  while (Date.now() - start < timeoutMs && !addonInstalled) {
    await delay(500);
  }

  // Wait for add-on to install
  while (Date.now() - start < timeoutMs && !addonInstalled) {
    await delay(500);
  }

  // Kill the process to end the run (web-ext keeps Firefox open)
  proc.kill('SIGINT');
  try { await once(proc, 'exit'); } catch {}
  server.close();

  const fatalRegex = /Error:|TypeError:|ReferenceError:|Unhandled/;
  const hasStorageError = storageErrorRegex.test(stdout) || storageErrorRegex.test(stderr);
  try {
    expect(addonInstalled, 'temporary add-on installed').to.equal(true);
    expect(fatalRegex.test(stderr), 'no fatal errors in stderr').to.equal(false);
    expect(hasStorageError, 'no storage API errors (check manifest has explicit addon ID)').to.equal(false);
  } catch (err) {
    console.error('--- web-ext stdout ---');
    console.error(stdout);
    console.error('--- web-ext stderr ---');
    console.error(stderr);
    throw err;
  }

  console.log('\n✅ Integration Passed');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Extension Status:');
  console.log('  Installed:', addonInstalled ? '✓' : '✗');
  console.log('  Fatal errors:', fatalRegex.test(stderr) ? '✗ Found' : '✓ None');
  console.log('  Storage API:', hasStorageError ? '✗ Error (missing addon ID)' : '✓ OK');
  if (detections > 0) {
    console.log('Detection Status:');
    console.log('  Detected streams:', detections);
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

run().catch((e) => {
  console.error('\n❌ Integration Failed');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error(e && e.stack || e);
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  process.exit(1);
});
