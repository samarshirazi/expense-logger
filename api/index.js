/**
 * Vercel serverless entry point.
 *
 * This file used to duplicate every route from server/index.js, which
 * caused the household / shopping / voice / push routes (added in
 * Phases 1-5) to be missing in production until this refactor.
 *
 * Now it just re-exports the Express app from server/index.js. Any new
 * route registered there ships to production automatically. server/index.js
 * already loads .env and only calls app.listen() when run directly.
 */

module.exports = require('../server/index.js');
