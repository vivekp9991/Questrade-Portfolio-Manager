/**
 * Token Refresh Scheduler (keepalive)
 *
 * Runs on a LOW-frequency schedule (see template.yaml — rate(12 hours)). Its only
 * job is to keep each login's SINGLE-USE refresh token alive within its 3-day window
 * by rotating it ONLY when it's getting stale. Access tokens (30 min) are obtained
 * on-demand by the sync/API paths via the shared token service.
 *
 * All refresh goes through shared/utils/tokenManager (DynamoDB-locked, serialized),
 * so the scheduler can never race the sync and invalidate a token. Transient errors
 * never disable a login; only invalid_grant marks it needs-reauth.
 *
 * See Questrade-AWS/docs/01-phase-1-token-service.md.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const tokenManager = require('../shared/utils/tokenManager');

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamodb = DynamoDBDocumentClient.from(client);

const PERSONS_TABLE = process.env.PERSONS_TABLE;
const CACHE_TABLE = process.env.CACHE_TABLE;
const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;

/**
 * Active persons eligible for keepalive (skip ones flagged needs-reauth).
 */
async function getEligiblePersons() {
  const result = await dynamodb.send(new ScanCommand({
    TableName: PERSONS_TABLE,
    FilterExpression: 'isActive = :isActive AND (attribute_not_exists(needsReauth) OR needsReauth = :false)',
    ExpressionAttributeValues: { ':isActive': true, ':false': false }
  }));
  return result.Items || [];
}

/**
 * Fetch and cache USD/CAD exchange rate (unchanged behaviour; runs at scheduler cadence).
 */
async function updateExchangeRate() {
  if (!TWELVE_DATA_API_KEY) return { success: false, error: 'API key not configured' };
  if (!CACHE_TABLE) return { success: false, error: 'Cache table not configured' };

  try {
    const response = await fetch(`https://api.twelvedata.com/quote?symbol=USD/CAD&apikey=${TWELVE_DATA_API_KEY}`);
    if (!response.ok) throw new Error(`Twelve Data API returned ${response.status}`);
    const data = await response.json();
    if (data.status === 'error' || data.code) throw new Error(data.message || `API error: ${data.code}`);

    const rate = parseFloat(data.close);
    if (!rate || isNaN(rate)) throw new Error('Invalid rate in API response');

    const now = Date.now();
    await dynamodb.send(new UpdateCommand({
      TableName: CACHE_TABLE,
      Key: { cacheKey: 'exchange-rate-USD-CAD' },
      UpdateExpression: 'SET #data = :data, expiresAt = :expiresAt, #ttl = :ttl, cachedAt = :cachedAt, updatedAt = :updatedAt',
      ExpressionAttributeNames: { '#data': 'data', '#ttl': 'ttl' },
      ExpressionAttributeValues: {
        ':data': {
          rate: parseFloat(rate.toFixed(4)), base: 'USD', target: 'CAD', pair: 'USD/CAD',
          source: 'twelvedata.com', lastUpdated: data.datetime || new Date().toISOString(),
          open: parseFloat(data.open), high: parseFloat(data.high), low: parseFloat(data.low),
          close: parseFloat(data.close), previousClose: parseFloat(data.previous_close),
          change: parseFloat(data.change), percentChange: parseFloat(data.percent_change), timestamp: now
        },
        ':expiresAt': now + (24 * 60 * 60 * 1000),
        ':ttl': Math.floor(now / 1000) + (24 * 60 * 60),
        ':cachedAt': now,
        ':updatedAt': now
      }
    }));
    console.log(`[EXCHANGE RATE] cached rate ${rate}`);
    return { success: true, rate, source: 'twelvedata.com' };
  } catch (error) {
    console.error('[EXCHANGE RATE] update failed:', error.message);
    return { success: false, error: error.message };
  }
}

exports.handler = async () => {
  console.log('Token keepalive scheduler — start', new Date().toISOString());

  const summary = { refreshed: 0, skipped: 0, needsReauth: 0, transient: 0, errors: [] };

  try {
    const persons = await getEligiblePersons();
    console.log(`Eligible persons: ${persons.length}`);

    // Keepalive each person via the locked shared token service. Rotate only if stale.
    for (const person of persons) {
      try {
        const r = await tokenManager.keepAliveIfStale(person.personName);
        if (r.refreshed) { summary.refreshed++; console.log(`[${person.personName}] rotated (age ~${r.ageHours}h)`); }
        else { summary.skipped++; console.log(`[${person.personName}] fresh (age ~${r.ageHours ?? '?'}h) — skipped`); }
      } catch (error) {
        if (error.name === 'ReauthRequiredError') {
          summary.needsReauth++;
          console.error(`[${person.personName}] needs re-auth: ${error.message}`);
        } else {
          // RetryableTokenError / transient — login NOT disabled; next run retries.
          summary.transient++;
          console.warn(`[${person.personName}] transient keepalive failure: ${error.message}`);
        }
        summary.errors.push({ personName: person.personName, error: error.message });
      }
    }

    const exchangeRate = await updateExchangeRate().catch((e) => ({ success: false, error: e.message }));

    console.log('Token keepalive summary:', JSON.stringify(summary));
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Keepalive completed', timestamp: new Date().toISOString(), summary, exchangeRate })
    };
  } catch (error) {
    console.error('Fatal error in keepalive scheduler:', error);
    return { statusCode: 500, body: JSON.stringify({ message: 'Keepalive failed', error: error.message }) };
  }
};
