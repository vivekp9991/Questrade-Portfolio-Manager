const axios = require('axios');

async function testDividendSync() {
  try {
    const syncApiUrl = 'http://localhost:4002/api';

    console.log('=== Testing Dividend Sync ===\n');

    // Test 1: Sync dividend data for HHIS.TO
    console.log('1. Syncing dividends for HHIS.TO...');
    const syncResponse = await axios.post(`${syncApiUrl}/dividends/sync/symbol/HHIS.TO`);
    console.log('Sync Result:', JSON.stringify(syncResponse.data, null, 2));
    console.log('');

    // Wait a moment for the data to be saved
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 2: Query position data to verify dividend data was saved
    console.log('2. Querying position data for HHIS.TO...');

    // We need to use the Position model directly
    const mongoose = require('mongoose');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/questrade_portfolio');

    const positionSchema = new mongoose.Schema({}, { strict: false });
    const Position = mongoose.model('Position', positionSchema, 'positions');

    const positions = await Position.find({ symbol: 'HHIS.TO' });

    console.log(`Found ${positions.length} positions for HHIS.TO\n`);

    positions.forEach((pos, index) => {
      console.log(`Position ${index + 1}:`);
      console.log(`  Account: ${pos.accountId} (${pos.accountType})`);
      console.log(`  Person: ${pos.personName}`);
      console.log(`  Shares: ${pos.openQuantity}`);
      console.log(`  Is Dividend Stock: ${pos.isDividendStock}`);
      console.log(`  Dividend Data:`);
      console.log(`    Annual Dividend/Share: $${pos.dividendData?.annualDividendPerShare || 0}`);
      console.log(`    Yield on Cost: ${pos.dividendData?.yieldOnCost || 0}%`);
      console.log(`    Current Yield: ${pos.dividendData?.currentYield || 0}%`);
      console.log(`    Frequency: ${pos.dividendData?.dividendFrequency || 0} times/year`);
      console.log(`    Total Received: $${pos.dividendData?.totalReceived || 0}`);
      console.log(`    Last Dividend: $${pos.dividendData?.lastDividendAmount || 0} on ${pos.dividendData?.lastDividendDate || 'N/A'}`);
      console.log(`    Last Updated: ${pos.lastDividendUpdate || 'Never'}`);
      console.log('');
    });

    await mongoose.connection.close();
    console.log('✅ Test completed successfully!');

  } catch (error) {
    if (error.response) {
      console.error('API Error:', error.response.status, error.response.data);
    } else {
      console.error('Error:', error.message);
    }
    process.exit(1);
  }
}

testDividendSync();
