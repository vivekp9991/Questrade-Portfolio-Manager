/**
 * Token Refresh Scheduler
 * Automatically refreshes Questrade tokens for all active persons every 25 minutes
 * This prevents WebSocket disconnections due to token expiration (30-minute limit)
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const axios = require('axios');

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamodb = DynamoDBDocumentClient.from(client);

const PERSONS_TABLE = process.env.PERSONS_TABLE;
const TOKENS_TABLE = process.env.TOKENS_TABLE;
const CACHE_TABLE = process.env.CACHE_TABLE;
const QUESTRADE_AUTH_URL = process.env.QUESTRADE_AUTH_URL || 'https://login.questrade.com';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;

// Simple encryption/decryption using crypto module
const crypto = require('crypto');
const ALGORITHM = 'aes-256-cbc';

function encrypt(text) {
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').substring(0, 32));
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText) {
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').substring(0, 32));
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Get all active persons
 */
async function getAllActivePersons() {
  const params = {
    TableName: PERSONS_TABLE,
    FilterExpression: 'isActive = :isActive',
    ExpressionAttributeValues: {
      ':isActive': true
    }
  };

  const result = await dynamodb.send(new ScanCommand(params));
  return result.Items || [];
}

/**
 * Get refresh token for a person
 */
async function getRefreshToken(personName) {
  const params = {
    TableName: TOKENS_TABLE,
    KeyConditionExpression: 'personName = :personName AND tokenType = :tokenType',
    ExpressionAttributeValues: {
      ':personName': personName,
      ':tokenType': 'refresh'
    },
    FilterExpression: 'isActive = :isActive',
    ExpressionAttributeValues: {
      ':personName': personName,
      ':tokenType': 'refresh',
      ':isActive': true
    },
    ScanIndexForward: false,
    Limit: 1
  };

  const result = await dynamodb.send(new QueryCommand(params));

  if (!result.Items || result.Items.length === 0) {
    throw new Error(`No active refresh token found for ${personName}`);
  }

  return result.Items[0];
}

/**
 * Deactivate old tokens for a person
 */
async function deactivateOldTokens(personName) {
  const params = {
    TableName: TOKENS_TABLE,
    KeyConditionExpression: 'personName = :personName',
    ExpressionAttributeValues: {
      ':personName': personName
    }
  };

  const result = await dynamodb.send(new QueryCommand(params));

  for (const token of result.Items || []) {
    await dynamodb.send(new UpdateCommand({
      TableName: TOKENS_TABLE,
      Key: {
        personName: token.personName,
        tokenType: token.tokenType
      },
      UpdateExpression: 'SET isActive = :isActive',
      ExpressionAttributeValues: {
        ':isActive': false
      }
    }));
  }
}

/**
 * Check if refresh token is expiring soon (< 1 day)
 */
async function isRefreshTokenExpiringSoon(personName) {
  try {
    const refreshTokenDoc = await getRefreshToken(personName);
    const expiresAt = refreshTokenDoc.expiresAt;
    const now = Date.now();
    const oneDayInMs = 24 * 60 * 60 * 1000; // 24 hours
    const timeRemaining = expiresAt - now;

    console.log(`[${personName}] Refresh token check: expires at ${new Date(expiresAt).toISOString()}, time remaining: ${Math.floor(timeRemaining / (60 * 60 * 1000))} hours`);

    return timeRemaining < oneDayInMs;
  } catch (error) {
    console.error(`[${personName}] Error checking refresh token expiry:`, error.message);
    return false;
  }
}

/**
 * Refresh token for a person
 */
async function refreshTokenForPerson(personName) {
  try {
    console.log(`[${personName}] Starting token refresh...`);

    // Get refresh token
    const refreshTokenDoc = await getRefreshToken(personName);
    const refreshToken = decrypt(refreshTokenDoc.encryptedToken);

    console.log(`[${personName}] Found refresh token, calling Questrade API...`);

    // Call Questrade OAuth endpoint
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    });

    const response = await axios.post(
      `${QUESTRADE_AUTH_URL}/oauth2/token`,
      params.toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000
      }
    );

    const {
      access_token,
      refresh_token: newRefreshToken,
      api_server,
      expires_in
    } = response.data;

    if (!access_token || !newRefreshToken) {
      throw new Error('Invalid response from Questrade API - missing tokens');
    }

    // Format the API server URL
    let formattedApiServer = api_server;
    if (formattedApiServer && formattedApiServer.endsWith('/')) {
      formattedApiServer = formattedApiServer.slice(0, -1);
    }
    if (formattedApiServer && !formattedApiServer.startsWith('http://') && !formattedApiServer.startsWith('https://')) {
      formattedApiServer = `https://${formattedApiServer}`;
    }

    console.log(`[${personName}] Got new tokens, preparing to store...`);

    const now = Date.now();
    const expiresAt = now + (expires_in * 1000);
    const ttl = Math.floor(expiresAt / 1000) + 86400; // Add 24 hours buffer for TTL

    console.log(`[${personName}] Storing new access token (expires at ${new Date(expiresAt).toISOString()})...`);

    // Store new access token
    await dynamodb.send(new UpdateCommand({
      TableName: TOKENS_TABLE,
      Key: {
        personName,
        tokenType: 'access'
      },
      UpdateExpression: 'SET encryptedToken = :token, apiServer = :apiServer, expiresAt = :expiresAt, isActive = :isActive, createdAt = :createdAt, updatedAt = :updatedAt, #ttl = :ttl, usageCount = :usageCount',
      ExpressionAttributeNames: {
        '#ttl': 'ttl'
      },
      ExpressionAttributeValues: {
        ':token': encrypt(access_token),
        ':apiServer': formattedApiServer,
        ':expiresAt': expiresAt,
        ':isActive': true,
        ':createdAt': now,
        ':updatedAt': now,
        ':ttl': ttl,
        ':usageCount': 0
      }
    }));

    console.log(`[${personName}] Storing new refresh token...`);

    // Calculate refresh token expiry (7 days from now)
    const refreshTokenExpiresAt = now + (7 * 24 * 60 * 60 * 1000); // 7 days
    const refreshTokenTtl = Math.floor(refreshTokenExpiresAt / 1000); // TTL in seconds

    // Store new refresh token with expiry
    await dynamodb.send(new UpdateCommand({
      TableName: TOKENS_TABLE,
      Key: {
        personName,
        tokenType: 'refresh'
      },
      UpdateExpression: 'SET encryptedToken = :token, isActive = :isActive, updatedAt = :updatedAt, expiresAt = :expiresAt, #ttl = :ttl, usageCount = :usageCount, errorCount = :errorCount, lastError = :lastError',
      ExpressionAttributeNames: {
        '#ttl': 'ttl'
      },
      ExpressionAttributeValues: {
        ':token': encrypt(newRefreshToken),
        ':isActive': true,
        ':updatedAt': now,
        ':expiresAt': refreshTokenExpiresAt,
        ':ttl': refreshTokenTtl,
        ':usageCount': 0,
        ':errorCount': 0,
        ':lastError': null
      }
    }));

    console.log(`[${personName}] Updating person record...`);

    // Update person record
    await dynamodb.send(new UpdateCommand({
      TableName: PERSONS_TABLE,
      Key: {
        personName
      },
      UpdateExpression: 'SET lastTokenRefresh = :lastRefresh, hasValidToken = :hasValidToken, lastTokenError = :noError',
      ExpressionAttributeValues: {
        ':lastRefresh': now,
        ':hasValidToken': true,
        ':noError': null
      }
    }));

    console.log(`[${personName}] ✓ Token refresh successful (expires in ${expires_in}s)`);

    return {
      personName,
      success: true,
      expiresAt,
      expiresIn: expires_in,
      apiServer: formattedApiServer
    };

  } catch (error) {
    console.error(`[${personName}] ✗ Token refresh failed:`, error.message);

    // Update person record with error
    try {
      await dynamodb.send(new UpdateCommand({
        TableName: PERSONS_TABLE,
        Key: {
          personName
        },
        UpdateExpression: 'SET lastTokenError = :error, lastTokenRefresh = :lastRefresh',
        ExpressionAttributeValues: {
          ':error': error.message,
          ':lastRefresh': Date.now()
        }
      }));
    } catch (updateError) {
      console.error(`[${personName}] Failed to update error status:`, updateError.message);
    }

    return {
      personName,
      success: false,
      error: error.message
    };
  }
}

/**
 * Fetch and cache USD/CAD exchange rate from Twelve Data API
 * Stores in DynamoDB cache for fast retrieval
 */
async function updateExchangeRate() {
  console.log('\n[EXCHANGE RATE] Starting update...');

  // Check if API key is configured
  if (!TWELVE_DATA_API_KEY) {
    console.log('[EXCHANGE RATE] ⚠️ TWELVE_DATA_API_KEY not configured, skipping');
    return { success: false, error: 'API key not configured' };
  }

  if (!CACHE_TABLE) {
    console.log('[EXCHANGE RATE] ⚠️ CACHE_TABLE not configured, skipping');
    return { success: false, error: 'Cache table not configured' };
  }

  try {
    // Fetch from Twelve Data API
    const apiUrl = `https://api.twelvedata.com/quote?symbol=USD/CAD&apikey=${TWELVE_DATA_API_KEY}`;
    console.log('[EXCHANGE RATE] Fetching from Twelve Data API...');

    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(`Twelve Data API returned ${response.status}`);
    }

    const data = await response.json();

    // Check for API error
    if (data.status === 'error' || data.code) {
      throw new Error(data.message || `API error: ${data.code}`);
    }

    // Extract rate
    const rate = parseFloat(data.close);

    if (!rate || isNaN(rate)) {
      throw new Error('Invalid rate in API response');
    }

    console.log(`[EXCHANGE RATE] ✓ Fetched rate: ${rate}`);

    // Store in DynamoDB cache
    const cacheItem = {
      cacheKey: 'exchange-rate-USD-CAD',
      data: {
        rate: parseFloat(rate.toFixed(4)),
        base: 'USD',
        target: 'CAD',
        pair: 'USD/CAD',
        source: 'twelvedata.com',
        lastUpdated: data.datetime || new Date().toISOString(),
        open: parseFloat(data.open),
        high: parseFloat(data.high),
        low: parseFloat(data.low),
        close: parseFloat(data.close),
        previousClose: parseFloat(data.previous_close),
        change: parseFloat(data.change),
        percentChange: parseFloat(data.percent_change),
        timestamp: Date.now()
      },
      expiresAt: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
      ttl: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
      cachedAt: Date.now(),
      updatedAt: Date.now()
    };

    await dynamodb.send(new UpdateCommand({
      TableName: CACHE_TABLE,
      Key: {
        cacheKey: 'exchange-rate-USD-CAD'
      },
      UpdateExpression: 'SET #data = :data, expiresAt = :expiresAt, #ttl = :ttl, cachedAt = :cachedAt, updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#data': 'data',
        '#ttl': 'ttl'
      },
      ExpressionAttributeValues: {
        ':data': cacheItem.data,
        ':expiresAt': cacheItem.expiresAt,
        ':ttl': cacheItem.ttl,
        ':cachedAt': cacheItem.cachedAt,
        ':updatedAt': cacheItem.updatedAt
      }
    }));

    console.log('[EXCHANGE RATE] ✓ Cached to DynamoDB');

    return {
      success: true,
      rate: rate,
      source: 'twelvedata.com'
    };

  } catch (error) {
    console.error('[EXCHANGE RATE] ✗ Update failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Main handler - triggered by EventBridge schedule (every 4 minutes)
 */
exports.handler = async (event) => {
  console.log('========================================');
  console.log('Token Refresh Scheduler - Starting');
  console.log(`Triggered at: ${new Date().toISOString()}`);
  console.log('========================================');

  try {
    // Get all active persons
    const persons = await getAllActivePersons();
    console.log(`\nFound ${persons.length} active persons`);

    if (persons.length === 0) {
      console.log('No active persons found. Nothing to refresh.');
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'No active persons to refresh',
          timestamp: new Date().toISOString()
        })
      };
    }

    // Check refresh tokens and renew if expiring soon (< 1 day)
    console.log('\nChecking refresh token expiry for all persons...\n');
    const refreshTokenChecks = await Promise.all(
      persons.map(async person => {
        const isExpiringSoon = await isRefreshTokenExpiringSoon(person.personName);
        return { personName: person.personName, needsRenewal: isExpiringSoon };
      })
    );

    const personsNeedingRenewal = refreshTokenChecks.filter(p => p.needsRenewal);
    if (personsNeedingRenewal.length > 0) {
      console.log(`\n⚠️  ${personsNeedingRenewal.length} person(s) have refresh tokens expiring within 24 hours!`);
      personsNeedingRenewal.forEach(p => console.log(`   - ${p.personName}`));
      console.log('\n🔄 Proactively refreshing tokens to extend refresh token validity...\n');
    } else {
      console.log('✓ All refresh tokens are valid for > 24 hours\n');
    }

    // Refresh tokens for all persons in parallel
    console.log('Starting token refresh for all persons...\n');
    const results = await Promise.all(
      persons.map(person => refreshTokenForPerson(person.personName))
    );

    // Summarize results
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const renewed = personsNeedingRenewal.length;

    console.log('\n========================================');
    console.log('Token Refresh Summary:');
    console.log(`✓ Successful: ${successful}`);
    console.log(`✗ Failed: ${failed}`);
    console.log(`🔄 Refresh tokens renewed: ${renewed}`);
    console.log(`Total: ${results.length}`);
    console.log('========================================\n');

    if (failed > 0) {
      console.log('Failed refreshes:');
      results.filter(r => !r.success).forEach(r => {
        console.log(`  - ${r.personName}: ${r.error}`);
      });
    }

    // Update exchange rate (don't let this fail the entire handler)
    let exchangeRateResult;
    try {
      exchangeRateResult = await updateExchangeRate();
    } catch (error) {
      console.error('[EXCHANGE RATE] Unexpected error:', error.message);
      exchangeRateResult = { success: false, error: error.message };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Token refresh completed',
        timestamp: new Date().toISOString(),
        summary: {
          total: results.length,
          successful,
          failed
        },
        exchangeRate: exchangeRateResult,
        results
      })
    };

  } catch (error) {
    console.error('Fatal error in token refresh scheduler:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Token refresh failed',
        error: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};
