/**
 * Portfolio Service
 * Core portfolio calculation logic
 */

const Decimal = require('decimal.js');
const logger = require('../../shared/utils/logger');
const { query } = require('../../shared/utils/dynamodb');

const ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE;
const POSITIONS_TABLE = process.env.POSITIONS_TABLE;
const ACTIVITIES_TABLE = process.env.ACTIVITIES_TABLE;
const SYMBOLS_TABLE = process.env.SYMBOLS_TABLE;

class PortfolioService {
  /**
   * Calculate complete portfolio
   */
  async calculatePortfolio(personName, accountId = null) {
    try {
      // Get positions
      let positions;
      if (accountId) {
        positions = await this.getAccountPositions(accountId);
      } else {
        positions = await this.getPersonPositions(personName);
      }

      // Calculate totals
      const totalMarketValue = positions.reduce(
        (sum, pos) => sum + (pos.currentMarketValue || 0),
        0
      );

      const totalCost = positions.reduce(
        (sum, pos) => sum + (pos.totalCost || 0),
        0
      );

      const totalPnl = totalMarketValue - totalCost;
      const totalPnlPercent = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

      // Group by symbol
      const holdings = this.groupPositionsBySymbol(positions);

      return {
        personName,
        accountId,
        summary: {
          totalMarketValue,
          totalCost,
          totalPnl,
          totalPnlPercent,
          positionsCount: positions.length,
          holdingsCount: holdings.length
        },
        holdings,
        lastUpdated: Date.now()
      };

    } catch (error) {
      logger.error(`Error calculating portfolio for ${personName}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Calculate portfolio performance
   */
  async calculatePerformance(personName, period) {
    try {
      const positions = await this.getPersonPositions(personName);

      const totalMarketValue = positions.reduce(
        (sum, pos) => sum + (pos.currentMarketValue || 0),
        0
      );

      const totalCost = positions.reduce(
        (sum, pos) => sum + (pos.totalCost || 0),
        0
      );

      const totalPnl = totalMarketValue - totalCost;
      const returnPercent = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

      // Placeholder for time-based calculations
      return {
        personName,
        period,
        metrics: {
          totalReturn: totalPnl,
          totalReturnPercent: returnPercent,
          marketValue: totalMarketValue,
          costBasis: totalCost
        },
        message: 'Advanced performance calculations to be implemented'
      };

    } catch (error) {
      logger.error(`Error calculating performance for ${personName}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Calculate asset allocation
   */
  async calculateAllocation(personName, groupBy) {
    try {
      const positions = await this.getPersonPositions(personName);

      const totalMarketValue = positions.reduce(
        (sum, pos) => sum + (pos.currentMarketValue || 0),
        0
      );

      // Group by specified criteria (simplified)
      const allocation = {};

      positions.forEach(pos => {
        const key = groupBy === 'currency' ? 'CAD' : 'Unknown'; // Placeholder
        if (!allocation[key]) {
          allocation[key] = {
            value: 0,
            percentage: 0,
            positions: []
          };
        }
        allocation[key].value += pos.currentMarketValue || 0;
        allocation[key].positions.push(pos.symbol);
      });

      // Calculate percentages
      Object.keys(allocation).forEach(key => {
        allocation[key].percentage = totalMarketValue > 0
          ? (allocation[key].value / totalMarketValue) * 100
          : 0;
      });

      return {
        personName,
        groupBy,
        totalMarketValue,
        allocation
      };

    } catch (error) {
      logger.error(`Error calculating allocation for ${personName}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Get positions for person
   */
  async getPersonPositions(personName) {
    const result = await query(
      POSITIONS_TABLE,
      'personName = :personName',
      { ':personName': personName },
      { IndexName: 'personName-symbol-index' }
    );
    return result.items;
  }

  /**
   * Get positions for account
   */
  async getAccountPositions(accountId) {
    const result = await query(
      POSITIONS_TABLE,
      'accountId = :accountId',
      { ':accountId': accountId }
    );
    return result.items;
  }

  /**
   * Group positions by symbol
   */
  groupPositionsBySymbol(positions) {
    const grouped = {};

    positions.forEach(pos => {
      const symbol = pos.symbol;
      if (!grouped[symbol]) {
        grouped[symbol] = {
          symbol,
          totalQuantity: 0,
          totalMarketValue: 0,
          totalCost: 0,
          accounts: []
        };
      }

      grouped[symbol].totalQuantity += pos.openQuantity || 0;
      grouped[symbol].totalMarketValue += pos.currentMarketValue || 0;
      grouped[symbol].totalCost += pos.totalCost || 0;
      grouped[symbol].accounts.push(pos.accountId);
    });

    return Object.values(grouped);
  }
}

module.exports = new PortfolioService();
