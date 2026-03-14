// import https from 'https';
// import http from 'http';

const BASE_URL = 'http://localhost:8080';

async function testRSSEndpoint() {
  console.log('🧪 Testing RSS endpoint...\n');

  // Test 1: RSS feed endpoint
  console.log('1. Testing /rss.xml endpoint...');
  try {
    const response = await fetch(`${BASE_URL}/rss.xml`);

    console.log(`   Status: ${response.status}`);
    console.log(`   Content-Type: ${response.headers.get('content-type')}`);
    console.log(`   Cache-Control: ${response.headers.get('cache-control')}`);
    console.log(`   Content-Length: ${response.headers.get('content-length')}`);

    if (response.ok) {
      const content = await response.text();
      console.log(`   ✅ RSS feed retrieved successfully (${content.length} bytes)`);
      console.log(`   📝 Preview: ${content.substring(0, 100)}...`);
    } else {
      console.log(`   ❌ Failed to retrieve RSS feed: ${response.statusText}`);
    }
  } catch (error) {
    console.log(`   ❌ Error testing RSS endpoint: ${error.message}`);
  }

  console.log();

  // Test 2: Health check endpoint
  console.log('2. Testing /rss-health endpoint...');
  try {
    const response = await fetch(`${BASE_URL}/rss-health`);

    console.log(`   Status: ${response.status}`);
    console.log(`   Content-Type: ${response.headers.get('content-type')}`);

    if (response.ok) {
      const health = await response.json();
      console.log(`   ✅ Health check retrieved successfully`);
      console.log(`   📊 Status: ${health.status}`);
      console.log(`   🕒 Timestamp: ${health.timestamp}`);
      console.log(`   🌍 Environment: ${health.environment}`);
      if (health.rssStats) {
        console.log(`   📈 RSS File Size: ${health.rssStats.size} bytes`);
        console.log(`   📅 Last Modified: ${health.rssStats.lastModified}`);
      }
    } else {
      console.log(`   ❌ Failed to retrieve health check: ${response.statusText}`);
    }
  } catch (error) {
    console.log(`   ❌ Error testing health endpoint: ${error.message}`);
  }

  console.log();

  // Test 3: curl/wget compatibility
  console.log('3. Testing curl/wget compatibility...');
  try {
    // Simulate curl request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${BASE_URL}/rss.xml`, {
      headers: {
        'User-Agent': 'curl/7.68.0',
        'Accept': '*/*'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const content = await response.text();
      console.log(`   ✅ curl/wget compatible - retrieved ${content.length} bytes`);

      // Check if it's valid XML
      if (content.startsWith('<?xml')) {
        console.log(`   ✅ Valid XML format detected`);
      } else {
        console.log(`   ⚠️  May not be valid XML`);
      }
    } else {
      console.log(`   ❌ curl/wget test failed: ${response.statusText}`);
    }
  } catch (error) {
    console.log(`   ❌ Error testing curl/wget compatibility: ${error.message}`);
  }

  console.log('\n🎉 RSS endpoint testing completed!');
}

// Run the tests
testRSSEndpoint().catch(console.error);