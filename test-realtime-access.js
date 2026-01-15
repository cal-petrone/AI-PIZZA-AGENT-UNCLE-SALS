/**
 * Quick test to check if your OpenAI API key has Realtime API access
 * Run: node test-realtime-access.js
 */

require('dotenv').config();

const https = require('https');

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error('❌ OPENAI_API_KEY not found in .env file');
  process.exit(1);
}

console.log('Testing OpenAI API key access...\n');

// Test 1: Check available models
const options = {
  hostname: 'api.openai.com',
  path: '/v1/models',
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${apiKey}`
  }
};

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      
      if (response.error) {
        console.error('❌ API Error:', response.error.message);
        return;
      }

      const models = response.data || [];
      const realtimeModels = models.filter(m => 
        m.id && m.id.toLowerCase().includes('realtime')
      );

      console.log('📊 Available Realtime Models:');
      if (realtimeModels.length > 0) {
        realtimeModels.forEach(model => {
          console.log(`  ✅ ${model.id}`);
        });
        console.log('\n✅ Your API key HAS access to Realtime API!');
        console.log('\nTry using one of these model names in server.js:');
        realtimeModels.forEach(model => {
          console.log(`  - ${model.id}`);
        });
      } else {
        console.log('  ❌ No Realtime models found');
        console.log('\n❌ Your API key does NOT have Realtime API access.');
        console.log('\n📝 Next Steps:');
        console.log('1. Go to https://platform.openai.com/');
        console.log('2. Check your account tier (need Tier 1+)');
        console.log('3. Request Realtime API access if needed');
        console.log('4. See ENABLE_REALTIME_API_STEPS.md for details');
      }
    } catch (error) {
      console.error('❌ Error parsing response:', error.message);
      console.log('Raw response:', data.substring(0, 500));
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request error:', error.message);
});

req.end();





