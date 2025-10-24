const express = require('express');
const router = express.Router();
const Person = require('../models/Person');
const tokenManager = require('../services/tokenManager');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// Get all persons
router.get('/', asyncHandler(async (req, res) => {
  const persons = await Person.find({ isActive: true })
    .select('-__v')
    .sort({ personName: 1 });
  
  res.json({
    success: true,
    data: persons
  });
}));

// Get specific person
router.get('/:personName', asyncHandler(async (req, res) => {
  const { personName } = req.params;
  
  const person = await Person.findOne({ personName, isActive: true })
    .select('-__v');
  
  if (!person) {
    return res.status(404).json({
      success: false,
      error: 'Person not found'
    });
  }

  // Get token status
  const tokenStatus = await tokenManager.getTokenStatus(personName);

  res.json({
    success: true,
    data: {
      ...person.toObject(),
      tokenStatus
    }
  });
}));

// Create new person
// Create new person
router.post('/', asyncHandler(async (req, res) => {
  const { personName, refreshToken, displayName, email, phoneNumber } = req.body;
  
  if (!personName || !refreshToken) {
    return res.status(400).json({
      success: false,
      error: 'Person name and refresh token are required'
    });
  }

  // Check if person already exists
  const existingPerson = await Person.findOne({ personName });
  if (existingPerson && existingPerson.isActive) {
    return res.status(400).json({
      success: false,
      error: 'Person already exists'
    });
  }

  // Create the person record first
  let person = await Person.create({
    personName,
    displayName: displayName || personName,
    email,
    phoneNumber,
    hasValidToken: false,
    isActive: true
  });

  try {
    // Setup token (this will validate and store the token)
    await tokenManager.setupPersonToken(personName, refreshToken);

    // Update the person record to reflect successful token setup
    person = await Person.findOneAndUpdate(
      { personName },
      {
        hasValidToken: true,
        lastTokenRefresh: new Date()
      },
      { new: true, runValidators: true }
    );

    logger.info(`Person created/updated: ${personName}`);

    res.status(201).json({
      success: true,
      data: person,
      message: 'Person created successfully'
    });
  } catch (error) {
    // If token setup fails, delete the person record we just created
    await Person.deleteOne({ personName });
    logger.error(`Failed to setup token for ${personName}, person record deleted:`, error.message);

    // Re-throw with a clean error message
    const errorMessage = error.response?.data?.error
      || error.response?.data?.message
      || error.message
      || 'Failed to validate refresh token';

    return res.status(400).json({
      success: false,
      error: errorMessage
    });
  }
}));

// Update person
router.put('/:personName', asyncHandler(async (req, res) => {
  const { personName } = req.params;
  const { displayName, email, phoneNumber, preferences } = req.body;
  
  const person = await Person.findOne({ personName, isActive: true });
  
  if (!person) {
    return res.status(404).json({
      success: false,
      error: 'Person not found'
    });
  }

  // Update fields
  if (displayName !== undefined) person.displayName = displayName;
  if (email !== undefined) person.email = email;
  if (phoneNumber !== undefined) person.phoneNumber = phoneNumber;
  if (preferences) person.preferences = { ...person.preferences.toObject(), ...preferences };

  await person.save();

  logger.info(`Person updated: ${personName}`);
  
  res.json({
    success: true,
    data: person,
    message: 'Person updated successfully'
  });
}));

// Delete person (soft delete)
router.delete('/:personName', asyncHandler(async (req, res) => {
  const { personName } = req.params;
  const { permanent = false } = req.query;
  
  const person = await Person.findOne({ personName });
  
  if (!person) {
    return res.status(404).json({
      success: false,
      error: 'Person not found'
    });
  }

  if (permanent === 'true') {
    // Permanent deletion
    await tokenManager.deletePersonTokens(personName);
    await Person.deleteOne({ personName });
    
    logger.info(`Person permanently deleted: ${personName}`);
    
    res.json({
      success: true,
      message: 'Person permanently deleted'
    });
  } else {
    // Soft delete
    person.isActive = false;
    await person.save();
    await tokenManager.deletePersonTokens(personName);
    
    logger.info(`Person deactivated: ${personName}`);
    
    res.json({
      success: true,
      message: 'Person deactivated successfully'
    });
  }
}));

// Update person's refresh token
router.post('/:personName/token', asyncHandler(async (req, res) => {
  const { personName } = req.params;
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      error: 'Refresh token is required'
    });
  }

  try {
    const result = await tokenManager.setupPersonToken(personName, refreshToken);

    res.json({
      success: true,
      data: result,
      message: 'Refresh token updated successfully'
    });
  } catch (error) {
    logger.error(`Failed to update token for ${personName}:`, error.message);

    // Extract clean error message
    const errorMessage = error.response?.data?.error
      || error.response?.data?.message
      || error.message
      || 'Failed to validate refresh token';

    return res.status(400).json({
      success: false,
      error: errorMessage
    });
  }
}));

module.exports = router;