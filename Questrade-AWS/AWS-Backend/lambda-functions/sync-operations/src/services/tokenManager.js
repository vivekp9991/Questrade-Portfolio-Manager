/**
 * Re-export of the canonical shared token service.
 * Implementation lives in shared/utils/tokenManager.js (see docs/01-phase-1-token-service.md).
 * Kept as a thin shim so existing imports (`require('./tokenManager')`) keep working.
 */
module.exports = require('../../shared/utils/tokenManager');
