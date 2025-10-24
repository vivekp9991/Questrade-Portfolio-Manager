const mongoose = require('mongoose');

// Define schemas
const activitySchema = new mongoose.Schema({}, { strict: false });
const positionSchema = new mongoose.Schema({}, { strict: false });
const dailyPriceSchema = new mongoose.Schema({}, { strict: false });

const Activity = mongoose.model('Activity', activitySchema, 'activities');
const Position = mongoose.model('Position', positionSchema, 'positions');
const DailyPrice = mongoose.model('DailyPrice', dailyPriceSchema, 'dailyprices');

async function checkHHISDividends() {
  try {
    // Connect to MongoDB
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/questrade_portfolio';
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    // 1. Check Position dividend data
    console.log('\n=== HHIS.TO Position Dividend Data ===\n');
    const positions = await Position.find({ symbol: 'HHIS.TO' });
    positions.forEach(pos => {
      console.log(`Account: ${pos.accountId} (${pos.accountType})`);
      console.log('Dividend Data:', JSON.stringify(pos.dividendData, null, 2));
      console.log('Is Dividend Stock:', pos.isDividendStock);
      console.log('---');
    });

    // 2. Check Activity collection for dividend transactions
    console.log('\n=== HHIS.TO Dividend Activities ===\n');
    const dividendActivities = await Activity.find({
      symbol: 'HHIS.TO',
      type: { $in: ['Dividends', 'Dividend', 'DIV'] }
    }).sort({ tradeDate: -1 });

    console.log(`Found ${dividendActivities.length} dividend activities`);
    dividendActivities.forEach(act => {
      console.log({
        date: act.tradeDate,
        type: act.type,
        symbol: act.symbol,
        quantity: act.quantity,
        price: act.price,
        grossAmount: act.grossAmount,
        netAmount: act.netAmount,
        description: act.description
      });
    });

    // 3. Check ALL activities for HHIS.TO to see what types exist
    console.log('\n=== All HHIS.TO Activities by Type ===\n');
    const allActivities = await Activity.find({ symbol: 'HHIS.TO' }).sort({ tradeDate: -1 });
    console.log(`Found ${allActivities.length} total activities for HHIS.TO`);

    const activityTypes = {};
    allActivities.forEach(act => {
      if (!activityTypes[act.type]) {
        activityTypes[act.type] = [];
      }
      activityTypes[act.type].push({
        date: act.tradeDate,
        description: act.description,
        netAmount: act.netAmount,
        grossAmount: act.grossAmount
      });
    });

    console.log('Activity types found:');
    Object.keys(activityTypes).forEach(type => {
      console.log(`\n${type} (${activityTypes[type].length} transactions):`);
      activityTypes[type].slice(0, 3).forEach(act => {
        console.log(`  ${act.date}: ${act.description} - Net: ${act.netAmount}, Gross: ${act.grossAmount}`);
      });
    });

    // 4. Check DailyPrice collection for dividend data
    console.log('\n=== HHIS.TO Daily Price Dividend Data ===\n');
    const dailyPrices = await DailyPrice.find({ symbol: 'HHIS.TO' })
      .sort({ date: -1 })
      .limit(5);

    console.log(`Found ${dailyPrices.length} daily price records`);
    dailyPrices.forEach(dp => {
      console.log({
        date: dp.date,
        close: dp.close,
        dividendAmount: dp.dividendAmount,
        hasData: !!dp.dividendAmount
      });
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDisconnected from MongoDB');
  }
}

checkHHISDividends();
