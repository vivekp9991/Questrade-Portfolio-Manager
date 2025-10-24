const axios = require('axios');

async function syncAllDividends() {
  try {
    console.log('🔄 Starting dividend sync for all stocks...\n');

    const syncApiUrl = process.env.SYNC_API_URL || 'http://localhost:4002/api';

    const response = await axios.post(`${syncApiUrl}/dividends/sync/all`);

    console.log('✅ Sync completed successfully!\n');
    console.log('Results:');
    console.log(`  Total positions: ${response.data.data.total}`);
    console.log(`  Updated: ${response.data.data.updated}`);
    console.log(`  Errors: ${response.data.data.errors}`);

    return response.data;

  } catch (error) {
    if (error.response) {
      console.error('❌ API Error:', error.response.status);
      console.error('Message:', error.response.data);
    } else if (error.request) {
      console.error('❌ No response from server. Is the sync-api running on port 4002?');
    } else {
      console.error('❌ Error:', error.message);
    }
    process.exit(1);
  }
}

syncAllDividends();
