const axios = require('axios');
const mongoose = require('mongoose');

async function testSyncAllDividends() {
  try {
    const syncApiUrl = 'http://localhost:4002/api';

    console.log('=== Testing Sync All Dividends ===\n');

    // Test: Sync all dividend data
    console.log('1. Syncing all dividend data...');
    const syncResponse = await axios.post(`${syncApiUrl}/dividends/sync/all`);
    console.log('Sync Result:', JSON.stringify(syncResponse.data, null, 2));
    console.log('');

    // Wait for the data to be saved
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Query database to verify
    console.log('2. Querying database for dividend stocks...\n');

    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/questrade_portfolio');

    const positionSchema = new mongoose.Schema({}, { strict: false });
    const Position = mongoose.model('Position', positionSchema, 'positions');

    const dividendStocks = await Position.find({ isDividendStock: true })
      .sort({ 'dividendData.annualDividend': -1 });

    console.log(`Found ${dividendStocks.length} dividend-paying stocks:\n`);

    dividendStocks.forEach((pos, index) => {
      console.log(`${index + 1}. ${pos.symbol} (${pos.accountType})`);
      console.log(`   Person: ${pos.personName}`);
      console.log(`   Shares: ${pos.openQuantity}`);
      console.log(`   Annual Dividend: $${pos.dividendData?.annualDividend || 0}`);
      console.log(`   Yield on Cost: ${pos.dividendData?.yieldOnCost || 0}%`);
      console.log(`   Frequency: ${pos.dividendData?.dividendFrequency || 0}x/year`);
      console.log(`   Last Payment: $${pos.dividendData?.lastDividendAmount || 0} on ${pos.dividendData?.lastDividendDate ? new Date(pos.dividendData.lastDividendDate).toISOString().split('T')[0] : 'N/A'}`);
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

testSyncAllDividends();
