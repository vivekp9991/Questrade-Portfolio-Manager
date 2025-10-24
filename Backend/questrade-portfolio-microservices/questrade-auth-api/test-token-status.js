// Test script to check token status for all persons
const mongoose = require('mongoose');
const Token = require('./src/models/Token');
const Person = require('./src/models/Person');

async function checkTokenStatus() {
  try {
    // Connect to MongoDB - use the same database as the Auth API
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/questrade_auth';
    await mongoose.connect(mongoUri);
    console.log(`✅ Connected to MongoDB: ${mongoUri}`);

    // Get all tokens first to see what we have
    const allTokens = await Token.find({}).sort({ personName: 1, type: 1 });
    console.log(`\n📋 Found ${allTokens.length} tokens in database:\n`);

    // Group by personName
    const tokensByPerson = {};
    allTokens.forEach(token => {
      if (!tokensByPerson[token.personName]) {
        tokensByPerson[token.personName] = [];
      }
      tokensByPerson[token.personName].push(token);
    });

    console.log(`\n👥 Persons with tokens: ${Object.keys(tokensByPerson).join(', ')}\n`);

    // Get all persons from Person collection
    const persons = await Person.find({});
    console.log(`📋 Found ${persons.length} persons in Person collection:\n`);

    // If no persons in Person collection but we have tokens, process token owners
    const personNamesToCheck = persons.length > 0
      ? persons.map(p => p.personName)
      : Object.keys(tokensByPerson);

    console.log(`\n🔍 Checking token status for: ${personNamesToCheck.join(', ')}\n`);

    for (const personName of personNamesToCheck) {
      const person = persons.find(p => p.personName === personName);

      console.log(`\n${'='.repeat(60)}`);

      if (person) {
        console.log(`👤 Person: ${person.personName} (${person.displayName})`);
        console.log(`   Active: ${person.isActive}`);
        console.log(`   Has Valid Token: ${person.hasValidToken}`);
        console.log(`   Last Token Refresh: ${person.lastTokenRefresh || 'Never'}`);
        console.log(`   Last Token Error: ${person.lastTokenError || 'None'}`);
      } else {
        console.log(`👤 Person: ${personName}`);
        console.log(`   ⚠️  NOT FOUND in Person collection!`);
      }

      // Get refresh token
      const refreshToken = await Token.findOne({
        personName: personName,
        type: 'refresh',
        isActive: true
      }).sort({ createdAt: -1 });

      if (refreshToken) {
        console.log(`\n   🔑 Refresh Token:`);
        console.log(`      Created: ${refreshToken.createdAt}`);
        console.log(`      Expires: ${refreshToken.expiresAt}`);
        console.log(`      Is Expired: ${refreshToken.expiresAt < new Date()}`);
        console.log(`      Last Used: ${refreshToken.lastUsed || 'Never'}`);
        console.log(`      Error Count: ${refreshToken.errorCount || 0}`);
        console.log(`      Last Error: ${refreshToken.lastError || 'None'}`);
        console.log(`      Token Length: ${refreshToken.encryptedToken ? refreshToken.encryptedToken.length : 0} chars`);
      } else {
        console.log(`\n   ❌ No active refresh token found!`);
      }

      // Get access token
      const accessToken = await Token.findOne({
        personName: personName,
        type: 'access',
        isActive: true
      }).sort({ createdAt: -1 });

      if (accessToken) {
        const isExpired = accessToken.expiresAt < new Date();
        const minutesUntilExpiry = Math.floor((accessToken.expiresAt - new Date()) / 60000);

        console.log(`\n   🎫 Access Token:`);
        console.log(`      Created: ${accessToken.createdAt}`);
        console.log(`      Expires: ${accessToken.expiresAt}`);
        console.log(`      Is Expired: ${isExpired}`);
        if (!isExpired) {
          console.log(`      Expires in: ${minutesUntilExpiry} minutes`);
        }
        console.log(`      API Server: ${accessToken.apiServer}`);
        console.log(`      Last Used: ${accessToken.lastUsed || 'Never'}`);
        console.log(`      Token Length: ${accessToken.encryptedToken ? accessToken.encryptedToken.length : 0} chars`);
      } else {
        console.log(`\n   ⚠️  No active access token found (will be created on next request)`);
      }
    }

    console.log(`\n${'='.repeat(60)}\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  }
}

checkTokenStatus();
