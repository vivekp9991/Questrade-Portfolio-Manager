/**
 * Monthly Dividend Sync Lambda
 * Triggered by EventBridge on 1st of every month at 8 AM EST
 * Calls sync-operations Lambda to fetch dividend data from Questrade
 */

const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const lambda = new LambdaClient({});
const SYNC_FUNCTION_NAME = process.env.SYNC_FUNCTION_NAME || 'questrade-sync-operations-dev';

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
  console.log('[MONTHLY DIVIDEND SYNC] Starting monthly dividend sync...');
  console.log('[MONTHLY DIVIDEND SYNC] Event:', JSON.stringify(event, null, 2));

  try {
    // Prepare payload for sync-operations Lambda
    const payload = {
      httpMethod: 'POST',
      rawPath: '/api/sync/questrade-dividends',
      requestContext: {
        http: {
          method: 'POST',
          path: '/api/sync/questrade-dividends'
        }
      },
      body: JSON.stringify({
        triggerType: 'SCHEDULED'
      })
    };

    console.log('[MONTHLY DIVIDEND SYNC] Invoking sync-operations Lambda...');

    // Invoke sync-operations Lambda
    const invokeCommand = new InvokeCommand({
      FunctionName: SYNC_FUNCTION_NAME,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify(payload)
    });

    const response = await lambda.send(invokeCommand);

    // Parse response
    const responsePayload = JSON.parse(Buffer.from(response.Payload).toString());
    console.log('[MONTHLY DIVIDEND SYNC] Sync response:', JSON.stringify(responsePayload, null, 2));

    if (responsePayload.statusCode === 200) {
      const body = JSON.parse(responsePayload.body);
      console.log(`[MONTHLY DIVIDEND SYNC] ✅ Success: ${body.message}`);
      console.log(`[MONTHLY DIVIDEND SYNC] Results: ${JSON.stringify(body.data.results)}`);

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: 'Monthly dividend sync completed successfully',
          results: body.data.results,
          timestamp: new Date().toISOString()
        })
      };
    } else {
      console.error('[MONTHLY DIVIDEND SYNC] ❌ Sync failed:', responsePayload);
      throw new Error(`Sync failed with status ${responsePayload.statusCode}`);
    }

  } catch (error) {
    console.error('[MONTHLY DIVIDEND SYNC] Error:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};
