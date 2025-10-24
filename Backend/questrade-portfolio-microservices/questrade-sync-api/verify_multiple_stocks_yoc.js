const mongoose = require('mongoose');

async function verifyMultipleStocks() {
  try {
    await mongoose.connect('mongodb://localhost:27017/questrade_portfolio');

    const positionSchema = new mongoose.Schema({}, { strict: false });
    const Position = mongoose.model('Position', positionSchema, 'positions');
    const Activity = mongoose.model('Activity', new mongoose.Schema({}, {strict: false}), 'activities');

    // Get top 5 dividend stocks
    const positions = await Position.find({ isDividendStock: true })
      .sort({ 'dividendData.annualDividend': -1 })
      .limit(5);

    console.log('=== Yield on Cost Verification for Top 5 Dividend Stocks ===\n');

    for (const pos of positions) {
      const activities = await Activity.find({
        symbol: pos.symbol,
        accountId: pos.accountId,
        type: 'Dividend'
      }).sort({ transactionDate: -1 }).limit(1);

      const lastDividendPerShare = activities[0]?.price || 0;
      const frequency = pos.dividendData.dividendFrequency;

      // Your formula: ((dividend * 12) / avg_cost) * 100
      const calculatedYOC = ((lastDividendPerShare * frequency) / pos.averageEntryPrice) * 100;
      const storedYOC = pos.dividendData.yieldOnCost;
      const match = Math.abs(calculatedYOC - storedYOC) < 0.01;

      console.log(`${pos.symbol} (${pos.accountType})`);
      console.log(`  Last Dividend/Share: $${lastDividendPerShare}`);
      console.log(`  Frequency: ${frequency}x/year`);
      console.log(`  Annual Dividend/Share: $${(lastDividendPerShare * frequency).toFixed(2)}`);
      console.log(`  Avg Cost/Share: $${pos.averageEntryPrice.toFixed(2)}`);
      console.log(`  Formula: (($${lastDividendPerShare} * ${frequency}) / $${pos.averageEntryPrice.toFixed(2)}) * 100`);
      console.log(`  Calculated YOC: ${calculatedYOC.toFixed(2)}%`);
      console.log(`  Stored YOC: ${storedYOC}%`);
      console.log(`  ✅ Match: ${match ? 'YES' : 'NO'}`);
      console.log('');
    }

    await mongoose.connection.close();
    console.log('✅ All calculations verified!');

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

verifyMultipleStocks();
