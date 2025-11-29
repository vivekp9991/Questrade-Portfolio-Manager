/**
 * Persons Handlers
 * Handle person (Questrade account) CRUD operations
 */

const logger = require('../../shared/utils/logger');
const response = require('../../shared/utils/response');
const personService = require('../services/personService');
const tokenManager = require('../services/tokenManager');

/**
 * GET /api/persons
 * Get all persons
 */
async function getAllPersons(event) {
  try {
    const userId = event.queryStringParameters?.userId;
    const persons = await personService.getAllPersons(userId);

    return response.success(persons);
  } catch (error) {
    logger.error('Get all persons handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * GET /api/persons/:personName
 * Get a specific person
 */
async function getPerson(event) {
  try {
    const personName = event.pathParameters?.personName;

    if (!personName) {
      return response.badRequest('personName is required');
    }

    const person = await personService.getPerson(personName);
    return response.success(person);

  } catch (error) {
    logger.error('Get person handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * POST /api/persons
 * Create a new person
 */
async function createPerson(event) {
  try {
    const body = JSON.parse(event.body || '{}');
    const { personName, userId, displayName, email } = body;

    if (!personName) {
      return response.badRequest('personName is required');
    }

    const person = await personService.createPerson({
      personName,
      userId,
      displayName,
      email
    });

    return response.created(person, 'Person created successfully');

  } catch (error) {
    logger.error('Create person handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * PUT /api/persons/:personName
 * Update a person
 */
async function updatePerson(event) {
  try {
    const personName = event.pathParameters?.personName;
    const body = JSON.parse(event.body || '{}');

    if (!personName) {
      return response.badRequest('personName is required');
    }

    const updatedPerson = await personService.updatePerson(personName, body);
    return response.success(updatedPerson, 'Person updated successfully');

  } catch (error) {
    logger.error('Update person handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * DELETE /api/persons/:personName
 * Delete a person (soft delete)
 */
async function deletePerson(event) {
  try {
    const personName = event.pathParameters?.personName;

    if (!personName) {
      return response.badRequest('personName is required');
    }

    // Delete person tokens first
    await tokenManager.deletePersonTokens(personName);

    // Then delete person
    const result = await personService.deletePerson(personName);
    return response.success(result, 'Person deleted successfully');

  } catch (error) {
    logger.error('Delete person handler error', { error: error.message });
    return response.handleError(error);
  }
}

/**
 * POST /api/persons/:personName/token
 * Update person's Questrade refresh token
 */
async function updatePersonToken(event) {
  try {
    const personName = event.pathParameters?.personName;
    const body = JSON.parse(event.body || '{}');
    const { refreshToken } = body;

    if (!personName) {
      return response.badRequest('personName is required');
    }

    if (!refreshToken) {
      return response.badRequest('refreshToken is required');
    }

    // Ensure person exists
    const personExists = await personService.personExists(personName);
    if (!personExists) {
      // Create person if it doesn't exist
      await personService.createPerson({ personName });
    }

    // Setup token
    const result = await tokenManager.setupPersonToken(personName, refreshToken);

    return response.success(result, 'Token updated successfully');

  } catch (error) {
    logger.error('Update person token handler error', { error: error.message });
    return response.handleError(error);
  }
}

module.exports = {
  getAllPersons,
  getPerson,
  createPerson,
  updatePerson,
  deletePerson,
  updatePersonToken
};
