#!/usr/bin/env node
/**
 * Quick script to sync dividend data
 * Usage: node scripts/sync-dividends.js [all|person|symbol] [value]
 *
 * Examples:
 *   node scripts/sync-dividends.js all
 *   node scripts/sync-dividends.js person Vivek
 *   node scripts/sync-dividends.js symbol HHIS.TO
 */

const axios = require('axios');

const SYNC_API_URL = process.env.SYNC_API_URL || 'http://localhost:4002/api';

async function syncDividends() {
  const args = process.argv.slice(2);
  const command = args[0] || 'all';
  const value = args[1];

  let url;
  let description;

  switch (command.toLowerCase()) {
    case 'all':
      url = `${SYNC_API_URL}/dividends/sync/all`;
      description = 'all stocks';
      break;

    case 'person':
      if (!value) {
        console.error('❌ Error: Person name required');
        console.log('Usage: node scripts/sync-dividends.js person <name>');
        process.exit(1);
      }
      url = `${SYNC_API_URL}/dividends/sync/person/${value}`;
      description = `person: ${value}`;
      break;

    case 'symbol':
      if (!value) {
        console.error('❌ Error: Symbol required');
        console.log('Usage: node scripts/sync-dividends.js symbol <symbol>');
        process.exit(1);
      }
      url = `${SYNC_API_URL}/dividends/sync/symbol/${value}`;
      description = `symbol: ${value}`;
      break;

    default:
      console.error(`❌ Unknown command: ${command}`);
      console.log('Usage: node scripts/sync-dividends.js [all|person|symbol] [value]');
      process.exit(1);
  }

  try {
    console.log(`🔄 Syncing dividend data for ${description}...\n`);

    const response = await axios.post(url);
    const data = response.data.data;

    console.log('✅ Sync completed successfully!\n');
    console.log('Results:');
    console.log(`  Total: ${data.total}`);
    console.log(`  Updated: ${data.updated}`);
    console.log(`  Errors: ${data.errors || 0}`);

  } catch (error) {
    if (error.response) {
      console.error('❌ API Error:', error.response.status);
      console.error('Message:', error.response.data);
    } else if (error.request) {
      console.error('❌ No response from server.');
      console.error('Make sure sync-api is running on port 4002');
    } else {
      console.error('❌ Error:', error.message);
    }
    process.exit(1);
  }
}

syncDividends();
