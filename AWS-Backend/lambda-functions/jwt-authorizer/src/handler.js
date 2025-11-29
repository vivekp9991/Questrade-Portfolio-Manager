/**
 * JWT Authorizer Lambda Function
 * Validates JWT tokens and generates IAM policies for API Gateway
 */

const jwt = require('jsonwebtoken');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const ddbDocClient = DynamoDBDocumentClient.from(client);

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const USERS_TABLE = process.env.USERS_TABLE;

/**
 * Generate IAM policy
 */
function generatePolicy(principalId, effect, resource, context = {}) {
  const authResponse = {
    principalId
  };

  if (effect && resource) {
    authResponse.policyDocument = {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource
        }
      ]
    };
  }

  // Add context to pass to downstream Lambda functions
  if (Object.keys(context).length > 0) {
    authResponse.context = context;
  }

  return authResponse;
}

/**
 * Main handler function
 */
exports.handler = async (event) => {
  console.log('Authorizer event:', JSON.stringify(event, null, 2));

  try {
    // Extract token from Authorization header
    const token = event.headers?.authorization?.replace('Bearer ', '') ||
                  event.headers?.Authorization?.replace('Bearer ', '');

    if (!token) {
      console.log('No token provided');
      throw new Error('Unauthorized');
    }

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      console.log('Token verification failed:', err.message);
      throw new Error('Unauthorized');
    }

    console.log('Token decoded:', decoded);

    // Check if user exists and is active in DynamoDB
    const getUserCommand = new GetCommand({
      TableName: USERS_TABLE,
      Key: { userId: decoded.userId }
    });

    const userResult = await ddbDocClient.send(getUserCommand);

    if (!userResult.Item) {
      console.log('User not found:', decoded.userId);
      throw new Error('Unauthorized');
    }

    if (!userResult.Item.isActive) {
      console.log('User is inactive:', decoded.userId);
      throw new Error('Unauthorized');
    }

    // Generate Allow policy
    const policy = generatePolicy(
      decoded.userId,
      'Allow',
      event.routeArn || '*',
      {
        userId: decoded.userId,
        username: decoded.username,
        role: decoded.role || 'user'
      }
    );

    console.log('Authorization successful for user:', decoded.username);
    return policy;

  } catch (error) {
    console.error('Authorization error:', error);

    // Return Deny policy
    return generatePolicy('user', 'Deny', event.routeArn || '*');
  }
};
