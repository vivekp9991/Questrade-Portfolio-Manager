/**
 * User Service
 * Handles user account operations (login, JWT users)
 */

const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const logger = require('../../shared/utils/logger');
const { getItem, putItem, updateItem, query } = require('../../shared/utils/dynamodb');
const { hashPassword, verifyPassword } = require('../../shared/utils/crypto');

const USERS_TABLE = process.env.USERS_TABLE;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h';
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 30 * 60 * 1000; // 30 minutes

class UserService {
  /**
   * Create a new user
   */
  async createUser(userData) {
    try {
      const { username, password, email, displayName, role } = userData;

      // Validate required fields
      if (!username || !password) {
        const error = new Error('Username and password are required');
        error.name = 'ValidationError';
        throw error;
      }

      // Check if username already exists
      const existing = await this.getUserByUsername(username);
      if (existing) {
        const error = new Error('Username already exists');
        error.name = 'ConflictError';
        throw error;
      }

      const userId = uuidv4();
      const hashedPassword = hashPassword(password);

      const newUser = {
        userId,
        username: username.toLowerCase(),
        password: hashedPassword,
        email: email || null,
        displayName: displayName || username,
        role: role || 'user',
        isActive: true,
        loginAttempts: 0,
        lockUntil: null,
        lastLogin: null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await putItem(USERS_TABLE, newUser);

      logger.info(`User created: ${username}`);

      // Return user without password
      const { password: _, ...userWithoutPassword } = newUser;
      return userWithoutPassword;
    } catch (error) {
      logger.error('Error creating user', { error: error.message });
      throw error;
    }
  }

  /**
   * Get user by userId
   */
  async getUser(userId) {
    try {
      const user = await getItem(USERS_TABLE, { userId });
      if (user) {
        const { password, ...userWithoutPassword } = user;
        return userWithoutPassword;
      }
      return null;
    } catch (error) {
      logger.error(`Error getting user ${userId}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Get user by username
   */
  async getUserByUsername(username) {
    try {
      const result = await query(
        USERS_TABLE,
        'username = :username',
        { ':username': username.toLowerCase() },
        { IndexName: 'username-index', Limit: 1 }
      );

      return result.items[0] || null;
    } catch (error) {
      logger.error(`Error getting user by username: ${username}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Verify user credentials and generate JWT
   */
  async login(username, password) {
    try {
      // Find user
      const user = await this.getUserByUsername(username);

      if (!user) {
        logger.warn(`Login attempt with invalid username: ${username}`);
        const error = new Error('Invalid username or password');
        error.name = 'UnauthorizedError';
        throw error;
      }

      // Check if account is active
      if (!user.isActive) {
        logger.warn(`Login attempt for inactive user: ${username}`);
        const error = new Error('Account is inactive. Please contact administrator.');
        error.name = 'UnauthorizedError';
        throw error;
      }

      // Check if account is locked
      if (user.lockUntil && user.lockUntil > Date.now()) {
        logger.warn(`Login attempt for locked user: ${username}`);
        const error = new Error('Account is temporarily locked due to too many failed login attempts. Please try again later.');
        error.name = 'UnauthorizedError';
        throw error;
      }

      // Verify password
      const isPasswordValid = verifyPassword(password, user.password);

      if (!isPasswordValid) {
        logger.warn(`Failed login attempt for user: ${username}`);

        // Increment login attempts
        const loginAttempts = (user.loginAttempts || 0) + 1;
        const updates = {
          loginAttempts,
          updatedAt: Date.now()
        };

        // Lock account if max attempts reached
        if (loginAttempts >= MAX_LOGIN_ATTEMPTS) {
          updates.lockUntil = Date.now() + LOCK_TIME;
          logger.warn(`Account locked for user: ${username}`);
        }

        await updateItem(USERS_TABLE, { userId: user.userId }, updates);

        const error = new Error('Invalid username or password');
        error.name = 'UnauthorizedError';
        throw error;
      }

      // Reset login attempts on successful login
      await updateItem(USERS_TABLE, { userId: user.userId }, {
        loginAttempts: 0,
        lockUntil: null,
        lastLogin: Date.now(),
        updatedAt: Date.now()
      });

      // Generate JWT token
      const token = jwt.sign(
        {
          userId: user.userId,
          username: user.username,
          role: user.role
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      // PHASE 3: Calculate token expiry time (24 hours from now)
      const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours in milliseconds

      logger.info(`Successful login for user: ${username}`);

      return {
        token,
        expiresAt, // PHASE 3: Include expiry time
        user: {
          userId: user.userId,
          username: user.username,
          displayName: user.displayName,
          email: user.email,
          role: user.role,
          lastLogin: Date.now()
        }
      };
    } catch (error) {
      logger.error('Login error', { error: error.message });
      throw error;
    }
  }

  /**
   * Verify JWT token
   */
  verifyToken(token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      return decoded;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        const err = new Error('Token has expired');
        err.name = 'TokenExpiredError';
        throw err;
      }
      const err = new Error('Invalid token');
      err.name = 'JsonWebTokenError';
      throw err;
    }
  }

  /**
   * Refresh JWT token
   */
  async refreshToken(token) {
    try {
      // Verify token (even if expired, we can refresh)
      const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });

      // Get user from database
      const user = await this.getUser(decoded.userId);

      if (!user || !user.isActive) {
        const error = new Error('Invalid token or inactive user');
        error.name = 'UnauthorizedError';
        throw error;
      }

      // Generate new token
      const newToken = jwt.sign(
        {
          userId: user.userId,
          username: user.username,
          role: user.role
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      // PHASE 3: Calculate token expiry time (24 hours from now)
      const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours in milliseconds

      logger.info(`Token refreshed for user: ${user.username}`);

      return {
        token: newToken,
        expiresAt, // PHASE 3: Include expiry time
        user: {
          userId: user.userId,
          username: user.username,
          displayName: user.displayName,
          email: user.email,
          role: user.role
        }
      };
    } catch (error) {
      logger.error('Token refresh error', { error: error.message });
      throw error;
    }
  }

  /**
   * Update user
   */
  async updateUser(userId, updates) {
    try {
      const user = await getItem(USERS_TABLE, { userId });
      if (!user) {
        const error = new Error('User not found');
        error.name = 'NotFoundError';
        throw error;
      }

      // Prevent updating certain fields
      const allowedFields = ['email', 'displayName', 'isActive'];
      const filteredUpdates = {};

      Object.keys(updates).forEach(key => {
        if (allowedFields.includes(key)) {
          filteredUpdates[key] = updates[key];
        }
      });

      // Hash password if provided
      if (updates.password) {
        filteredUpdates.password = hashPassword(updates.password);
      }

      filteredUpdates.updatedAt = Date.now();

      const updatedUser = await updateItem(USERS_TABLE, { userId }, filteredUpdates);

      logger.info(`User updated: ${userId}`);

      // Return without password
      const { password, ...userWithoutPassword } = updatedUser;
      return userWithoutPassword;
    } catch (error) {
      logger.error(`Error updating user ${userId}`, { error: error.message });
      throw error;
    }
  }
}

module.exports = new UserService();
