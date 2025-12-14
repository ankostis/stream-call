// Integration test: Real stream page with httpbin validation
// Tests stream extraction, API calls, and header/cookies capture using httpbin.org

const { spawn } = require('node:child_process');
const { resolve } = require('node:path');
const { once } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');
const chai = require('chai');
const expect = chai.expect;

async function run() {
  const cwd = resolve(__dirname, '../../');

  // Configure test parameters
  const TEST_URL = 'https://www.ertecho.gr/radio/trito/';
  const HTTPBIN_URL = 'https://httpbin.org/anything';

  console.log(`\n🧪 Integration Test: Real Stream Page`);
  console.log(`   Stream URL: ${TEST_URL}`);
  console.log(`   API Endpoint: ${HTTPBIN_URL}\n`);

  const webExtPath = resolve(cwd, 'node_modules/.bin/web-ext');
  const args = [
    'run',
    '--source-dir', '.',
    '--start-url', TEST_URL,
    '--verbose',
    '--no-input',
  ];

  const proc = spawn(webExtPath, args, { cwd });

  let stdout = '';
  let stderr = '';
  let addonInstalled = false;
  let streamDetections = 0;
  let apiCalls = 0;
  let cookiesSent = false;
  let headersSent = false;
  const detectedStreams = new Set();

  // Patterns to detect various events
  const patterns = {
    addonInstall: /Installed .* as a temporary add-on/i,
    streamDetect: /Stream detected:|STREAM_DETECTED/i,
    streamUrl: /https?:\/\/[^\s"']+\.(m3u8|mpd|mp3|aac|ogg)/i,
    apiCall: /CALL_API|calling.*API|sending to endpoint/i,
    httpbinRequest: /httpbin\.org\/anything/i,
    cookieHeader: /Cookie:/i,
    userAgent: /User-Agent:/i,
    apiSuccess: /success.*true|API.*success|200|sent successfully/i,
    apiError: /API.*error|API.*failed|fetch.*error/i,
  };

  proc.stdout.on('data', (d) => {
    const s = d.toString();
    stdout += s;

    // Track addon installation
    if (patterns.addonInstall.test(s)) {
      addonInstalled = true;
      console.log('✓ Addon installed');
    }

    // Track stream detections
    if (patterns.streamDetect.test(s)) {
      streamDetections++;

      // Extract stream URL if present
      const streamMatch = s.match(patterns.streamUrl);
      if (streamMatch) {
        const streamUrl = streamMatch[0];
        if (!detectedStreams.has(streamUrl)) {
          detectedStreams.add(streamUrl);
          console.log(`✓ Stream detected [${detectedStreams.size}]:`, streamUrl.substring(0, 60) + '...');
        }
      }
    }

    // Track API calls
    if (patterns.apiCall.test(s) || patterns.httpbinRequest.test(s)) {
      apiCalls++;
      console.log('✓ API call initiated');
    }

    // Track cookies sent
    if (patterns.cookieHeader.test(s)) {
      cookiesSent = true;
      console.log('✓ Cookies header detected');
    }

    // Track headers sent
    if (patterns.userAgent.test(s)) {
      headersSent = true;
      console.log('✓ User-Agent header detected');
    }

    // Track API success
    if (patterns.apiSuccess.test(s)) {
      console.log('✓ API call successful');
    }

    // Track API errors
    if (patterns.apiError.test(s)) {
      console.log('⚠ API call error detected');
    }
  });

  proc.stderr.on('data', (d) => {
    const s = d.toString();
    stderr += s;
  });

  // Test execution with timeout
  const timeoutMs = 30000; // 30s for real page load + stream detection
  const start = Date.now();

  console.log('⏳ Waiting for addon installation...');
  // Wait for add-on to install
  while (Date.now() - start < timeoutMs && !addonInstalled) {
    await delay(500);
  }

  if (addonInstalled) {
    console.log('⏳ Waiting for stream detection (15s)...');
    // Give time for page to load and streams to be detected
    await delay(15000);
  }

  // Kill the process
  console.log('\n🛑 Stopping Firefox...\n');
  proc.kill('SIGINT');
  try {
    await Promise.race([
      once(proc, 'exit'),
      delay(5000).then(() => { proc.kill('SIGKILL'); })
    ]);
  } catch {}

  // Analyze results
  console.log('📊 Test Results:');
  console.log('================');
  console.log(`Addon installed: ${addonInstalled ? '✅' : '❌'}`);
  console.log(`Stream detections: ${streamDetections} (unique: ${detectedStreams.size})`);
  console.log(`API calls: ${apiCalls}`);
  console.log(`Cookies sent: ${cookiesSent ? '✅' : '❌'}`);
  console.log(`Headers sent: ${headersSent ? '✅' : '❌'}`);
  console.log('');

  // Fatal error checks
  const fatalRegex = /Error:|TypeError:|ReferenceError:|Unhandled/;
  const storageErrorRegex = /temporary addon ID|storage API will not work/i;
  const hasStorageError = storageErrorRegex.test(stdout) || storageErrorRegex.test(stderr);
  const hasFatalError = fatalRegex.test(stderr);

  // Assertions
  const failures = [];

  try {
    expect(addonInstalled, 'addon installed').to.equal(true);
    console.log('✅ Addon installation');
  } catch (err) {
    console.log('❌ Addon installation:', err.message);
    failures.push(err.message);
  }

  try {
    expect(hasFatalError, 'no fatal errors').to.equal(false);
    console.log('✅ No fatal errors');
  } catch (err) {
    console.log('❌ Fatal errors detected:', err.message);
    failures.push(err.message);
  }

  try {
    expect(hasStorageError, 'no storage errors').to.equal(false);
    console.log('✅ No storage API errors');
  } catch (err) {
    console.log('❌ Storage errors:', err.message);
    failures.push(err.message);
  }

  try {
    expect(streamDetections, 'at least one stream detected').to.be.greaterThan(0);
    console.log('✅ Stream detection');
  } catch (err) {
    console.log('❌ Stream detection:', err.message);
    failures.push(err.message);
  }

  // Optional checks (nice to have but not critical)
  if (apiCalls > 0) {
    console.log('✅ API calls verified');
  } else {
    console.log('⚠️  No API calls detected (requires manual popup interaction)');
  }

  if (cookiesSent) {
    console.log('✅ Cookie header capture verified');
  } else {
    console.log('ℹ️  Cookie header not detected (may require endpoint with includeCookies=true)');
  }

  if (headersSent) {
    console.log('✅ Headers capture verified');
  } else {
    console.log('ℹ️  Headers not detected (may require endpoint with includePageHeaders=true)');
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  if (failures.length === 0) {
    console.log('✅ ALL CRITICAL TESTS PASSED');
    console.log('='.repeat(50) + '\n');
    process.exit(0);
  } else {
    console.log('❌ SOME TESTS FAILED');
    console.log('='.repeat(50));
    console.log('\nFailed checks:');
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    console.log('\n--- Captured stdout (last 2000 chars) ---');
    console.log(stdout.slice(-2000));
    console.log('\n--- Captured stderr (last 1000 chars) ---');
    console.log(stderr.slice(-1000));
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
