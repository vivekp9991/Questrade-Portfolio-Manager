const axios = require('axios');

async function testDividendEndpoint() {
  try {
    const syncApiUrl = process.env.SYNC_API_URL || 'http://localhost:4002/api';
    const endpoint = `/activities/dividends/Vivek`;
    const fullUrl = `${syncApiUrl}${endpoint}`;

    console.log(`Testing: ${fullUrl}?symbol=HHIS.TO\n`);

    const response = await axios.get(fullUrl, {
      params: { symbol: 'HHIS.TO' },
      timeout: 10000
    });

    console.log('Response Status:', response.status);
    console.log('Success:', response.data.success);
    console.log('Data Length:', response.data.data?.length || 0);
    console.log('\nDividend Activities:');
    console.log(JSON.stringify(response.data.data, null, 2));

  } catch (error) {
    if (error.response) {
      console.error('API Error:', error.response.status, error.response.statusText);
      console.error('Response:', error.response.data);
    } else if (error.request) {
      console.error('No response from server. Is the sync-api running?');
      console.error('Error:', error.message);
    } else {
      console.error('Request Error:', error.message);
    }
  }
}

testDividendEndpoint();
