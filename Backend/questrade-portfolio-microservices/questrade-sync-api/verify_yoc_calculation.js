const mongoose = require('mongoose');

async function verifyYOC() {
  try {
    await mongoose.connect('mongodb://localhost:27017/questrade_portfolio');

    const positionSchema = new mongoose.Schema({}, { strict: false });
    const Position = mongoose.model('Position', positionSchema, 'positions');
    const Activity = mongoose.model('Activity', new mongoose.Schema({}, {strict: false}), 'activities');

    const positions = await Position.find({ symbol: 'HHIS.TO' });

    console.log('=== HHIS.TO Yield on Cost Verification ===\n');

    for (const pos of positions) {
      console.log(`Account: ${pos.accountId} (${pos.accountType})`);
      console.log(`Person: ${pos.personName}`);
      console.log('---');

      // Get dividend activities for this account
      const activities = await Activity.find({
        symbol: 'HHIS.TO',
        accountId: pos.accountId,
        type: 'Dividend'
      }).sort({ transactionDate: -1 });

      console.log(`Dividend Activities: ${activities.length}`);
      if (activities.length > 0) {
        console.log('\nRecent dividends:');
        activities.slice(0, 3).forEach(act => {
          console.log(`  ${new Date(act.transactionDate).toISOString().split('T')[0]}: $${act.netAmount} (price: $${act.price})`);
        });
      }

      const lastDividendPerShare = activities[0]?.price || 0;

      console.log(`\n📊 Calculation Breakdown:`);
      console.log(`  Current Shares: ${pos.openQuantity}`);
      console.log(`  Average Cost Per Share: $${pos.averageEntryPrice}`);
      console.log(`  Total Cost: $${pos.totalCost}`);
      console.log(`  Last Dividend Per Share: $${lastDividendPerShare}`);
      console.log(`  Dividend Frequency: ${pos.dividendData.dividendFrequency}x/year (Monthly)`);

      // Manual calculation
      const annualDividendPerShare = lastDividendPerShare * pos.dividendData.dividendFrequency;
      const calculatedYOC = (annualDividendPerShare / pos.averageEntryPrice) * 100;

      console.log(`\n🧮 Formula: ((dividend_per_share * frequency) / avg_cost_per_share) * 100`);
      console.log(`  = (($${lastDividendPerShare} * ${pos.dividendData.dividendFrequency}) / $${pos.averageEntryPrice}) * 100`);
      console.log(`  = ($${annualDividendPerShare} / $${pos.averageEntryPrice}) * 100`);
      console.log(`  = ${calculatedYOC.toFixed(4)}%`);

      console.log(`\n✅ Stored in DB: ${pos.dividendData.yieldOnCost}%`);
      console.log(`✅ Manually Calculated: ${calculatedYOC.toFixed(2)}%`);
      console.log(`✅ Match: ${Math.abs(pos.dividendData.yieldOnCost - calculatedYOC) < 0.01 ? 'YES' : 'NO'}`);

      // Also verify your formula: ((dividend *12)/ AVG COST) *100
      const yourFormulaYOC = ((lastDividendPerShare * 12) / pos.averageEntryPrice) * 100;
      console.log(`\n📝 Your Formula: ((dividend * 12) / avg_cost) * 100`);
      console.log(`  = (($${lastDividendPerShare} * 12) / $${pos.averageEntryPrice}) * 100`);
      console.log(`  = ${yourFormulaYOC.toFixed(2)}%`);
      console.log(`  Same as code formula: ${Math.abs(yourFormulaYOC - calculatedYOC) < 0.01 ? 'YES' : 'NO'}`);

      console.log('\n' + '='.repeat(70) + '\n');
    }

    await mongoose.connection.close();

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

verifyYOC();
