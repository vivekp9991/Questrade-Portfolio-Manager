/**
 * Daily Sync Scheduler Lambda Handler
 * Triggers MASTER CANDLE sync to update symbols-master table (SINGLE SOURCE OF TRUTH)
 * This is invoked by EventBridge on a schedule (daily at market close)
 */

const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const SYNC_LAMBDA_NAME = process.env.SYNC_LAMBDA_NAME || 'questrade-sync-operations-dev';
const lambda = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
  console.log('[DAILY SYNC SCHEDULER] Starting scheduled master candle sync...');
  console.log('[DAILY SYNC SCHEDULER] Event:', JSON.stringify(event, null, 2));
  console.log('[DAILY SYNC SCHEDULER] Target Lambda:', SYNC_LAMBDA_NAME);

  try {
    // Invoke the sync-operations Lambda directly to trigger MASTER CANDLE sync
    // This updates symbols-master table (SINGLE SOURCE OF TRUTH) with market data
    const payload = {
      httpMethod: 'POST',
      rawPath: '/api/sync/master-candles',
      requestContext: {
        http: {
          method: 'POST'
        }
      },
      body: JSON.stringify({ triggerType: 'SCHEDULED' })
    };

    console.log('[DAILY SYNC SCHEDULER] Invoking Lambda with payload:', JSON.stringify(payload));

    const command = new InvokeCommand({
      FunctionName: SYNC_LAMBDA_NAME,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify(payload)
    });

    const response = await lambda.send(command);
    const result = JSON.parse(Buffer.from(response.Payload).toString());

    console.log('[DAILY SYNC SCHEDULER] Lambda invocation completed');
    console.log('[DAILY SYNC SCHEDULER] Response:', JSON.stringify(result, null, 2));

    if (result.statusCode === 200) {
      const body = JSON.parse(result.body);
      console.log('[DAILY SYNC SCHEDULER] Master candle sync completed successfully');
      console.log('[DAILY SYNC SCHEDULER] Sync result:', JSON.stringify(body, null, 2));

      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Master candle sync completed',
          timestamp: new Date().toISOString(),
          result: body
        })
      };
    } else {
      throw new Error(`Sync failed with status ${result.statusCode}: ${result.body}`);
    }

  } catch (error) {
    console.error('[DAILY SYNC SCHEDULER] Error during master candle sync:', error.message);
    console.error('[DAILY SYNC SCHEDULER] Error stack:', error.stack);

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Master candle sync failed',
        error: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};
