#!/usr/bin/env node
// Validate httpbin API response for stream-call integration testing
// Usage: node validate-response.js <httpbin-response.json>

const fs = require('fs');
const path = require('path');

function validateHttpbinResponse(response) {
  const issues = [];
  const passed = [];

  // Check required structure
  if (!response.headers) {
    issues.push('❌ Missing "headers" object');
  } else {
    passed.push('✅ Response has headers object');

    // Validate headers
    if (response.headers['User-Agent']) {
      passed.push('✅ User-Agent header present: ' + response.headers['User-Agent'].substring(0, 50));
    } else {
      issues.push('⚠️  User-Agent header missing (includePageHeaders may be disabled)');
    }

    if (response.headers['Cookie']) {
      passed.push('✅ Cookie header present: ' + response.headers['Cookie'].substring(0, 50));
    } else {
      issues.push('ℹ️  Cookie header missing (page may have no cookies or includeCookies disabled)');
    }

    if (response.headers['Referer']) {
      passed.push('✅ Referer header present: ' + response.headers['Referer']);
    } else {
      issues.push('⚠️  Referer header missing');
    }

    if (response.headers['Content-Type'] === 'application/json') {
      passed.push('✅ Content-Type is application/json');
    } else {
      issues.push('❌ Content-Type not application/json: ' + response.headers['Content-Type']);
    }
  }

  if (!response.json) {
    issues.push('❌ Missing "json" object (request body)');
  } else {
    passed.push('✅ Response has json body object');

    // Validate body fields
    if (response.json.streamUrl) {
      const streamUrl = response.json.streamUrl;
      passed.push('✅ streamUrl present: ' + streamUrl);

      // Check stream format
      if (/\.(m3u8|mpd|mp3|aac|ogg)/.test(streamUrl)) {
        passed.push('✅ streamUrl is valid media format');
      } else {
        issues.push('⚠️  streamUrl may not be a media file: ' + streamUrl);
      }
    } else {
      issues.push('❌ streamUrl missing in body');
    }

    if (response.json.pageUrl) {
      passed.push('✅ pageUrl present: ' + response.json.pageUrl);
    } else {
      issues.push('⚠️  pageUrl missing in body');
    }

    if (response.json.pageTitle) {
      passed.push('✅ pageTitle present: ' + response.json.pageTitle);
    } else {
      issues.push('⚠️  pageTitle missing in body');
    }

    if (response.json.timestamp) {
      passed.push('✅ timestamp present: ' + response.json.timestamp);

      // Validate ISO format
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(response.json.timestamp)) {
        passed.push('✅ timestamp is valid ISO format');
      } else {
        issues.push('⚠️  timestamp not in ISO format: ' + response.json.timestamp);
      }
    } else {
      issues.push('❌ timestamp missing in body');
    }
  }

  // Print results
  console.log('\n📊 httpbin Response Validation');
  console.log('================================\n');

  if (passed.length > 0) {
    console.log('✅ Passed Checks:');
    passed.forEach(p => console.log('   ' + p));
    console.log('');
  }

  if (issues.length > 0) {
    console.log('⚠️  Issues Found:');
    issues.forEach(i => console.log('   ' + i));
    console.log('');
  }

  const criticalIssues = issues.filter(i => i.startsWith('❌'));
  if (criticalIssues.length === 0) {
    console.log('✅ VALIDATION PASSED');
    console.log(`   ${passed.length} checks passed, ${issues.length} warnings\n`);
    return true;
  } else {
    console.log('❌ VALIDATION FAILED');
    console.log(`   ${criticalIssues.length} critical issues\n`);
    return false;
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node validate-response.js <httpbin-response.json>');
    console.log('');
    console.log('Validates httpbin.org/anything response for stream-call integration.');
    console.log('');
    console.log('Example:');
    console.log('  # Save response from browser console to file');
    console.log('  console.save(response, "response.json")');
    console.log('  ');
    console.log('  # Or manually copy response and save as JSON file');
    console.log('  node validate-response.js response.json');
    console.log('');
    console.log('Expected structure:');
    console.log('  {');
    console.log('    "headers": {');
    console.log('      "Cookie": "...",');
    console.log('      "User-Agent": "...",');
    console.log('      "Referer": "..."');
    console.log('    },');
    console.log('    "json": {');
    console.log('      "streamUrl": "https://.../stream.m3u8",');
    console.log('      "pageUrl": "https://...",');
    console.log('      "pageTitle": "...",');
    console.log('      "timestamp": "2025-..."');
    console.log('    }');
    console.log('  }');
    console.log('');
    process.exit(0);
  }

  const filePath = args[0];

  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const response = JSON.parse(content);

    const valid = validateHttpbinResponse(response);
    process.exit(valid ? 0 : 1);
  } catch (err) {
    console.error('❌ Error reading or parsing JSON:', err.message);
    process.exit(1);
  }
}

module.exports = { validateHttpbinResponse };
