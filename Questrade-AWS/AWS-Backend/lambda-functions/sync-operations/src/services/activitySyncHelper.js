/**
 * Activity Sync Helper
 * PHASE 1.2: Optimized activities sync (yesterday only for daily sync)
 */

const logger = require('../../shared/utils/logger');
const questradeApi = require('./questradeApiService');

class ActivitySyncHelper {
  /**
   * Format date for Questrade API (ISO 8601 with Z suffix)
   */
  formatQuestradeDate(date) {
    return date.toISOString();
  }

  /**
   * PHASE 1.2: Fetch activities since last sync (daily sync)
   * FIXED: Changed from "yesterday only" to "since last sync" to handle missed syncs
   * This prevents data gaps when syncs fail for multiple days
   */
  async fetchActivitiesYesterday(personName, accountNumber) {
    const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
    const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');

    const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
    const dynamodb = DynamoDBDocumentClient.from(client);

    // Get person to check last sync timestamp
    let lastSyncTime;
    try {
      const result = await dynamodb.send(new GetCommand({
        TableName: process.env.PERSONS_TABLE,
        Key: { personName }
      }));

      if (result.Item && result.Item.lastActivitiesSync) {
        // Start from last successful sync
        lastSyncTime = new Date(parseInt(result.Item.lastActivitiesSync));
        logger.info(`[ACTIVITIES] Starting from last sync: ${lastSyncTime.toISOString()}`);
      } else {
        // No last sync found, default to 7 days ago for safety
        lastSyncTime = new Date();
        lastSyncTime.setDate(lastSyncTime.getDate() - 7);
        logger.info(`[ACTIVITIES] No last sync found, starting from 7 days ago: ${lastSyncTime.toISOString()}`);
      }
    } catch (error) {
      // If can't read person, default to yesterday as fallback
      logger.warn(`[ACTIVITIES] Could not read last sync time, defaulting to yesterday:`, error.message);
      lastSyncTime = new Date();
      lastSyncTime.setDate(lastSyncTime.getDate() - 1);
      lastSyncTime.setHours(0, 0, 0, 0);
    }

    const now = new Date();

    const startTime = this.formatQuestradeDate(lastSyncTime);
    const endTime = this.formatQuestradeDate(now);

    logger.info(`[ACTIVITIES] Daily sync (since last sync): ${startTime} to ${endTime}`);

    try {
      const activities = await questradeApi.getActivities(
        personName,
        accountNumber,
        startTime,
        endTime
      );

      logger.info(`[ACTIVITIES] Fetched ${activities.length} activities for ${accountNumber} (since last sync)`);
      return activities;

    } catch (error) {
      logger.error(`[ACTIVITIES] Failed to fetch activities since last sync for ${accountNumber}:`, error.message);
      return [];
    }
  }

  /**
   * Fetch activities for a specific date range (historical sync)
   */
  async fetchActivitiesRange(personName, accountNumber, startDate, endDate) {
    const startTime = this.formatQuestradeDate(startDate);
    const endTime = this.formatQuestradeDate(endDate);

    logger.info(`[ACTIVITIES] Fetching range: ${startTime} to ${endTime}`);

    try {
      const activities = await questradeApi.getActivities(
        personName,
        accountNumber,
        startTime,
        endTime
      );

      logger.info(`[ACTIVITIES] Fetched ${activities.length} activities for ${accountNumber}`);
      return activities;

    } catch (error) {
      logger.error(`[ACTIVITIES] Failed to fetch activities range for ${accountNumber}:`, error.message);
      return [];
    }
  }

  /**
   * Fetch activities for past month (for initial/manual sync)
   */
  async fetchActivitiesPastMonth(personName, accountNumber) {
    const now = new Date();
    const oneMonthAgo = new Date();
    oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);

    return await this.fetchActivitiesRange(personName, accountNumber, oneMonthAgo, now);
  }

  /**
   * Fetch activities for past year in chunks (for historical sync)
   * Split into 30-day chunks to avoid API limits
   */
  async fetchActivitiesPastYear(personName, accountNumber) {
    const allActivities = [];
    const now = new Date();
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    // Split into 30-day chunks
    let currentStart = new Date(oneYearAgo);
    while (currentStart < now) {
      let currentEnd = new Date(currentStart);
      currentEnd.setDate(currentEnd.getDate() + 30);

      if (currentEnd > now) {
        currentEnd = now;
      }

      const activities = await this.fetchActivitiesRange(
        personName,
        accountNumber,
        currentStart,
        currentEnd
      );

      allActivities.push(...activities);

      // Move to next chunk
      currentStart = new Date(currentEnd);
      currentStart.setDate(currentStart.getDate() + 1);

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    logger.info(`[ACTIVITIES] Fetched ${allActivities.length} activities total for past year`);
    return allActivities;
  }

  /**
   * Fetch historical activities in 30-day chunks (for first-time setup)
   * PHASE 3: This will be used for initial 5-year historical sync
   * Note: Questrade API has 31-day limit per request
   */
  async fetchActivitiesHistorical(personName, accountNumber, years = 5) {
    const allActivities = [];
    const now = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - years);

    logger.info(`[ACTIVITIES] Fetching ${years} years of historical activities in 30-day chunks...`);

    // Split into 30-day chunks to comply with Questrade API limit
    let currentStart = new Date(startDate);
    let chunkCount = 0;

    while (currentStart < now) {
      let currentEnd = new Date(currentStart);
      currentEnd.setDate(currentEnd.getDate() + 30);

      if (currentEnd > now) {
        currentEnd = now;
      }

      chunkCount++;
      const activities = await this.fetchActivitiesRange(
        personName,
        accountNumber,
        currentStart,
        currentEnd
      );

      allActivities.push(...activities);

      // Move to next chunk
      currentStart = new Date(currentEnd);
      currentStart.setDate(currentStart.getDate() + 1);

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    logger.info(`[ACTIVITIES] Fetched ${allActivities.length} activities for last ${years} years (${chunkCount} chunks)`);
    return allActivities;
  }
}

module.exports = new ActivitySyncHelper();
