/**
 * Questrade API Test Handler
 * For debugging and testing Questrade API endpoints
 */

const logger = require('../../shared/utils/logger');
const { success, badRequest, handleError } = require('../../shared/utils/response');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const axios = require('axios');
const crypto = require('crypto');

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TOKENS_TABLE = process.env.TOKENS_TABLE;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

/**
 * POST /api/test/questrade-api
 * Test Questrade API endpoints
 */
async function testQuestradeApi(event) {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { personName, endpoint, startDate, endDate } = body;

    if (!personName) {
      return badRequest('personName is required');
    }

    if (!endpoint) {
      return badRequest('endpoint is required');
    }

    logger.info(`Testing Questrade API for ${personName}`, { endpoint, startDate, endDate });

    // 1. Get valid access token
    const tokenData = await getValidAccessToken(personName);
    const { accessToken, apiServer } = tokenData;

    // 2. Build Questrade API URL based on endpoint type
    let url = `${apiServer}${endpoint}`;

    // Add date parameters if provided (for activities endpoint)
    if (startDate || endDate) {
      const params = new URLSearchParams();
      if (startDate) params.append('startTime', startDate);
      if (endDate) params.append('endTime', endDate);
      url += `?${params.toString()}`;
    }

    logger.info(`Making request to Questrade API`, { url: url.replace(accessToken, '***') });

    // 3. Make request to Questrade API
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      timeout: 30000
    });

    logger.info(`Questrade API response received`, {
      status: response.status,
      dataKeys: Object.keys(response.data || {})
    });

    // 4. Return raw response from Questrade
    return success({
      endpoint,
      url: url.replace(accessToken, '***'), // Hide token in response
      requestParams: { personName, endpoint, startDate, endDate },
      response: response.data,
      metadata: {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        timestamp: new Date().toISOString()
      }
    }, 'Questrade API test successful');

  } catch (error) {
    logger.error('Questrade API test error', {
      error: error.message,
      response: error.response?.data
    });

    // Return detailed error information
    return {
      statusCode: error.response?.status || 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true
      },
      body: JSON.stringify({
        success: false,
        error: error.message,
        questradeError: error.response?.data,
        questradeStatus: error.response?.status,
        questradeStatusText: error.response?.statusText,
        timestamp: new Date().toISOString()
      })
    };
  }
}

/**
 * Get valid access token for person
 */
async function getValidAccessToken(personName) {
  try {
    // Query for active access token
    const command = new QueryCommand({
      TableName: TOKENS_TABLE,
      KeyConditionExpression: 'personName = :personName AND tokenType = :tokenType',
      FilterExpression: 'isActive = :isActive',
      ExpressionAttributeValues: {
        ':personName': personName,
        ':tokenType': 'access',
        ':isActive': true
      },
      Limit: 1
    });

    const response = await docClient.send(command);

    if (!response.Items || response.Items.length === 0) {
      throw new Error(`No active access token found for ${personName}`);
    }

    const token = response.Items[0];

    // Check if token is encrypted
    let accessToken = token.accessToken;
    if (token.encryptedToken) {
      // Decrypt the token
      accessToken = decryptToken(token.encryptedToken);
    }

    return {
      accessToken,
      apiServer: token.apiServer
    };

  } catch (error) {
    logger.error(`Failed to get access token for ${personName}`, { error: error.message });
    throw error;
  }
}

/**
 * Decrypt token using AES-256-CBC
 */
function decryptToken(encryptedToken) {
  try {
    const [ivHex, encryptedHex] = encryptedToken.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');

    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(ENCRYPTION_KEY, 'utf-8'),
      iv
    );

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf-8');
  } catch (error) {
    logger.error('Failed to decrypt token', { error: error.message });
    throw new Error('Token decryption failed');
  }
}

module.exports = {
  testQuestradeApi
};
