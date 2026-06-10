/**
 * Person Service
 * Handles person (Questrade account) operations
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../../shared/utils/logger');
const { getItem, putItem, updateItem, deleteItem, query, scan } = require('../../shared/utils/dynamodb');

const PERSONS_TABLE = process.env.PERSONS_TABLE;
const TOKENS_TABLE = process.env.TOKENS_TABLE;
const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE;
const POSITIONS_TABLE = process.env.POSITIONS_TABLE;
const ACTIVITIES_TABLE = process.env.ACTIVITIES_TABLE;

class PersonService {
  /**
   * Get all persons
   * Returns active persons first, sorted by personName
   */
  async getAllPersons(userId = null) {
    try {
      let persons = [];

      if (userId) {
        // Query by userId using GSI
        const result = await query(
          PERSONS_TABLE,
          'userId = :userId',
          { ':userId': userId },
          { IndexName: 'userId-index' }
        );
        persons = result.items || [];
      } else {
        // Scan all persons (including inactive for admin view)
        const result = await scan(PERSONS_TABLE);
        persons = result.items || [];
      }

      // Sort persons: active first, then alphabetically by personName
      persons.sort((a, b) => {
        // First sort by active status (active = true comes first)
        if (a.isActive !== b.isActive) {
          return a.isActive ? -1 : 1;
        }
        // Then sort alphabetically by personName
        return (a.personName || '').localeCompare(b.personName || '');
      });

      return persons;
    } catch (error) {
      logger.error('Error getting all persons', { error: error.message });
      throw error;
    }
  }

  /**
   * Get person by personName
   */
  async getPerson(personName) {
    try {
      const person = await getItem(PERSONS_TABLE, { personName });

      if (!person) {
        const error = new Error(`Person '${personName}' not found`);
        error.name = 'NotFoundError';
        throw error;
      }

      return person;
    } catch (error) {
      logger.error(`Error getting person ${personName}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Create a new person
   */
  async createPerson(personData) {
    try {
      const { personName, userId, displayName, email } = personData;

      // Validate required fields
      if (!personName) {
        const error = new Error('personName is required');
        error.name = 'ValidationError';
        throw error;
      }

      // Check if person already exists
      const existing = await getItem(PERSONS_TABLE, { personName });
      if (existing) {
        // If person exists but is inactive, reactivate them
        if (!existing.isActive) {
          logger.info(`Reactivating inactive person: ${personName}`);
          const updates = {
            isActive: true,
            updatedAt: Date.now()
          };
          // Update userId and email if provided
          if (userId) updates.userId = userId;
          if (email) updates.email = email;
          if (displayName) updates.displayName = displayName;

          const reactivated = await updateItem(PERSONS_TABLE, { personName }, updates);
          logger.info(`Person reactivated: ${personName}`);
          return reactivated;
        }

        // Person exists and is active - this is a conflict
        const error = new Error(`Person '${personName}' already exists`);
        error.name = 'ConflictError';
        throw error;
      }

      const newPerson = {
        personName,
        displayName: displayName || personName,
        hasValidToken: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastTokenRefresh: null,
        lastTokenError: null,
        lastSyncDate: null
      };

      // Only include userId and email if they have values (sparse index for userId GSI)
      if (userId) {
        newPerson.userId = userId;
      }
      if (email) {
        newPerson.email = email;
      }

      await putItem(PERSONS_TABLE, newPerson);

      logger.info(`Person created: ${personName}`);
      return newPerson;
    } catch (error) {
      logger.error('Error creating person', { error: error.message });
      throw error;
    }
  }

  /**
   * Update person
   */
  async updatePerson(personName, updates) {
    try {
      // Check if person exists
      const person = await getItem(PERSONS_TABLE, { personName });
      if (!person) {
        const error = new Error(`Person '${personName}' not found`);
        error.name = 'NotFoundError';
        throw error;
      }

      // Prevent updating certain fields
      const allowedFields = ['displayName', 'email', 'isActive', 'userId'];
      const filteredUpdates = {};

      Object.keys(updates).forEach(key => {
        if (allowedFields.includes(key)) {
          filteredUpdates[key] = updates[key];
        }
      });

      filteredUpdates.updatedAt = Date.now();

      const updatedPerson = await updateItem(PERSONS_TABLE, { personName }, filteredUpdates);

      logger.info(`Person updated: ${personName}`);
      return updatedPerson;
    } catch (error) {
      logger.error(`Error updating person ${personName}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Delete person (hard delete - removes ALL data)
   */
  async deletePerson(personName) {
    try {
      // Check if person exists
      const person = await getItem(PERSONS_TABLE, { personName });
      if (!person) {
        const error = new Error(`Person '${personName}' not found`);
        error.name = 'NotFoundError';
        throw error;
      }

      logger.info(`Starting hard delete for person: ${personName}`);

      // Delete all tokens for this person
      try {
        const tokensResult = await query(
          TOKENS_TABLE,
          'personName = :pn',
          { ':pn': personName }
        );
        for (const token of (tokensResult.items || [])) {
          await deleteItem(TOKENS_TABLE, {
            personName: token.personName,
            tokenType: token.tokenType
          });
        }
        logger.info(`Deleted ${tokensResult.items?.length || 0} tokens for ${personName}`);
      } catch (error) {
        logger.error(`Error deleting tokens for ${personName}`, { error: error.message });
      }

      // Delete all accounts for this person
      try {
        const accountsResult = await query(
          ACCOUNTS_TABLE,
          'personName = :pn',
          { ':pn': personName },
          { IndexName: 'personName-index' }
        );
        for (const account of (accountsResult.items || [])) {
          await deleteItem(ACCOUNTS_TABLE, {
            accountNumber: account.accountNumber
          });
        }
        logger.info(`Deleted ${accountsResult.items?.length || 0} accounts for ${personName}`);
      } catch (error) {
        logger.error(`Error deleting accounts for ${personName}`, { error: error.message });
      }

      // Delete all positions for this person
      try {
        const positionsResult = await query(
          POSITIONS_TABLE,
          'personName = :pn',
          { ':pn': personName },
          { IndexName: 'personName-index' }
        );
        for (const position of (positionsResult.items || [])) {
          await deleteItem(POSITIONS_TABLE, {
            accountId: position.accountId,
            symbolId: position.symbolId
          });
        }
        logger.info(`Deleted ${positionsResult.items?.length || 0} positions for ${personName}`);
      } catch (error) {
        logger.error(`Error deleting positions for ${personName}`, { error: error.message });
      }

      // Delete all activities for this person
      try {
        const activitiesResult = await query(
          ACTIVITIES_TABLE,
          'personName = :pn',
          { ':pn': personName },
          { IndexName: 'personName-date-index' }
        );
        for (const activity of (activitiesResult.items || [])) {
          await deleteItem(ACTIVITIES_TABLE, {
            accountNumber: activity.accountNumber,
            activityId: activity.activityId
          });
        }
        logger.info(`Deleted ${activitiesResult.items?.length || 0} activities for ${personName}`);
      } catch (error) {
        logger.error(`Error deleting activities for ${personName}`, { error: error.message });
      }

      // Finally, delete the person record
      await deleteItem(PERSONS_TABLE, { personName });

      logger.info(`Person hard deleted: ${personName}`);
      return {
        success: true,
        message: `Person '${personName}' and all associated data deleted`
      };
    } catch (error) {
      logger.error(`Error deleting person ${personName}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Check if person exists
   */
  async personExists(personName) {
    try {
      const person = await getItem(PERSONS_TABLE, { personName });
      return !!person;
    } catch (error) {
      logger.error(`Error checking if person exists: ${personName}`, { error: error.message });
      return false;
    }
  }
}

module.exports = new PersonService();
