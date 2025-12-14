// Test configuration helper for httpbin endpoint setup
// Creates a test config with httpbin endpoint that captures cookies/headers

const fs = require('fs');
const path = require('path');

/**
 * Generate test configuration with httpbin endpoint
 * @param {Object} options - Configuration options
 * @param {boolean} options.includeCookies - Enable cookie capture
 * @param {boolean} options.includePageHeaders - Enable header capture
 * @returns {string} JSON configuration
 */
function generateTestConfig(options = {}) {
  const {
    includeCookies = true,
    includePageHeaders = true,
  } = options;

  const config = {
    apiEndpoints: [
      {
        name: 'httpbin Test',
        endpointTemplate: 'https://httpbin.org/anything',
        method: 'POST',
        bodyTemplate: JSON.stringify({
          streamUrl: '{{streamUrl}}',
          pageUrl: '{{pageUrl}}',
          pageTitle: '{{pageTitle}}',
          timestamp: '{{timestamp}}',
          test: 'stream-call-integration'
        }),
        includeCookies,
        includePageHeaders,
      }
    ]
  };

  return JSON.stringify(config, null, 2);
}

/**
 * Write test configuration to a temp file
 */
function writeTestConfig(options) {
  const config = generateTestConfig(options);
  const configPath = path.join(__dirname, 'test-config.json');
  fs.writeFileSync(configPath, config);
  console.log(`✓ Test config written to: ${configPath}`);
  return configPath;
}

/**
 * Print instructions for manual test setup
 */
function printManualSetupInstructions() {
  console.log('\n📋 Manual Test Setup Instructions:');
  console.log('=====================================\n');
  console.log('1. Build the extension:');
  console.log('   npm run build\n');
  console.log('2. Load extension in Firefox:');
  console.log('   web-ext run --start-url https://www.ertecho.gr/radio/trito/\n');
  console.log('3. Configure httpbin endpoint:');
  console.log('   a. Click extension icon → Options');
  console.log('   b. Add endpoint:');
  console.log('      - Name: httpbin Test');
  console.log('      - URL: https://httpbin.org/anything');
  console.log('      - Method: POST');
  console.log('      - ☑ Include page cookies');
  console.log('      - ☑ Include page headers');
  console.log('   c. Save endpoint\n');
  console.log('4. Test stream detection:');
  console.log('   a. Wait for streams to be detected (badge shows count)');
  console.log('   b. Click extension icon to open popup');
  console.log('   c. Click "📞 Call API" for a detected stream\n');
  console.log('5. Verify httpbin response:');
  console.log('   - Check console for API response');
  console.log('   - Verify "headers" object includes:');
  console.log('     • Cookie: (if page has cookies)');
  console.log('     • User-Agent: Firefox/...');
  console.log('     • Accept: ...');
  console.log('     • Referer: ...');
  console.log('   - Verify "json" object includes:');
  console.log('     • streamUrl: detected stream URL');
  console.log('     • pageUrl: https://www.ertecho.gr/...');
  console.log('     • pageTitle: ΕΡΤ Τρίτο Πρόγραμμα or similar');
  console.log('     • timestamp: ISO datetime\n');
  console.log('✅ Success if all fields present!\n');
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node test-helper.js [options]\n');
    console.log('Options:');
    console.log('  --generate        Generate test-config.json file');
    console.log('  --no-cookies      Disable cookie capture');
    console.log('  --no-headers      Disable header capture');
    console.log('  --instructions    Print manual setup instructions');
    console.log('  --help, -h        Show this help\n');
    process.exit(0);
  }

  if (args.includes('--generate')) {
    const options = {
      includeCookies: !args.includes('--no-cookies'),
      includePageHeaders: !args.includes('--no-headers'),
    };
    writeTestConfig(options);
  }

  if (args.includes('--instructions')) {
    printManualSetupInstructions();
  }

  if (!args.length) {
    printManualSetupInstructions();
  }
}

module.exports = {
  generateTestConfig,
  writeTestConfig,
  printManualSetupInstructions,
};
