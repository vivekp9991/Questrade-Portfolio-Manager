const mongoose = require('mongoose');

// Position Schema (simplified)
const positionSchema = new mongoose.Schema({}, { strict: false });
const Position = mongoose.model('Position', positionSchema);

async function queryHHIS() {
  try {
    // Connect to MongoDB
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/questrade_portfolio';
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    // Query for HHIS.TO
    const positions = await Position.find({ symbol: 'HHIS.TO' });

    console.log('\n=== HHIS.TO Position Data ===\n');
    console.log(JSON.stringify(positions, null, 2));
    console.log(`\nFound ${positions.length} position(s) for HHIS.TO`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDisconnected from MongoDB');
  }
}

queryHHIS();
