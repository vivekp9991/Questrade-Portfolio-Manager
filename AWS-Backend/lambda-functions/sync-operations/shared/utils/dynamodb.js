/**
 * DynamoDB Client Utility
 * Provides helper functions for DynamoDB operations
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  BatchWriteCommand,
  BatchGetCommand
} = require('@aws-sdk/lib-dynamodb');

// Create DynamoDB client
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1'
});

// Create DocumentClient with marshalling options
const ddbDocClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true, // Remove undefined values
    convertEmptyValues: false // Don't convert empty strings
  },
  unmarshallOptions: {
    wrapNumbers: false // Don't wrap numbers in objects
  }
});

/**
 * Get a single item from DynamoDB
 */
async function getItem(tableName, key) {
  const command = new GetCommand({
    TableName: tableName,
    Key: key
  });

  const response = await ddbDocClient.send(command);
  return response.Item;
}

/**
 * Put an item into DynamoDB
 */
async function putItem(tableName, item) {
  const command = new PutCommand({
    TableName: tableName,
    Item: item
  });

  await ddbDocClient.send(command);
  return item;
}

/**
 * Update an item in DynamoDB
 */
async function updateItem(tableName, key, updates) {
  const updateExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};

  Object.keys(updates).forEach((field, index) => {
    const placeholder = `#field${index}`;
    const valuePlaceholder = `:value${index}`;

    updateExpressions.push(`${placeholder} = ${valuePlaceholder}`);
    expressionAttributeNames[placeholder] = field;
    expressionAttributeValues[valuePlaceholder] = updates[field];
  });

  const command = new UpdateCommand({
    TableName: tableName,
    Key: key,
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW'
  });

  const response = await ddbDocClient.send(command);
  return response.Attributes;
}

/**
 * Delete an item from DynamoDB
 */
async function deleteItem(tableName, key) {
  const command = new DeleteCommand({
    TableName: tableName,
    Key: key
  });

  await ddbDocClient.send(command);
}

/**
 * Query items from DynamoDB
 */
async function query(tableName, keyConditionExpression, expressionAttributeValues, options = {}) {
  // Merge ExpressionAttributeValues from both sources
  const mergedValues = {
    ...expressionAttributeValues,
    ...(options.ExpressionAttributeValues || {})
  };

  // Remove ExpressionAttributeValues from options to avoid duplication
  const { ExpressionAttributeValues: _, ...restOptions } = options;

  const command = new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: keyConditionExpression,
    ExpressionAttributeValues: mergedValues,
    ...restOptions
  });

  const response = await ddbDocClient.send(command);
  return {
    items: response.Items || [],
    lastEvaluatedKey: response.LastEvaluatedKey
  };
}

/**
 * Scan items from DynamoDB (use sparingly)
 */
async function scan(tableName, options = {}) {
  const command = new ScanCommand({
    TableName: tableName,
    ...options
  });

  const response = await ddbDocClient.send(command);
  return {
    items: response.Items || [],
    lastEvaluatedKey: response.LastEvaluatedKey
  };
}

/**
 * Batch write items (put or delete)
 */
async function batchWrite(tableName, items, operation = 'put') {
  const MAX_BATCH_SIZE = 25;
  const batches = [];

  for (let i = 0; i < items.length; i += MAX_BATCH_SIZE) {
    batches.push(items.slice(i, i + MAX_BATCH_SIZE));
  }

  const results = [];
  for (const batch of batches) {
    const requests = batch.map(item => {
      if (operation === 'put') {
        return { PutRequest: { Item: item } };
      } else if (operation === 'delete') {
        return { DeleteRequest: { Key: item } };
      }
    });

    const command = new BatchWriteCommand({
      RequestItems: {
        [tableName]: requests
      }
    });

    const response = await ddbDocClient.send(command);
    results.push(response);
  }

  return results;
}

/**
 * Batch get items
 */
async function batchGet(tableName, keys) {
  const MAX_BATCH_SIZE = 100;
  const batches = [];

  for (let i = 0; i < keys.length; i += MAX_BATCH_SIZE) {
    batches.push(keys.slice(i, i + MAX_BATCH_SIZE));
  }

  const allItems = [];
  for (const batch of batches) {
    const command = new BatchGetCommand({
      RequestItems: {
        [tableName]: {
          Keys: batch
        }
      }
    });

    const response = await ddbDocClient.send(command);
    allItems.push(...(response.Responses[tableName] || []));
  }

  return allItems;
}

module.exports = {
  ddbDocClient,
  getItem,
  putItem,
  updateItem,
  deleteItem,
  query,
  scan,
  batchWrite,
  batchGet
};
