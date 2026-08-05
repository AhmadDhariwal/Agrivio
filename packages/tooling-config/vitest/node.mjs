/**
 * Shared Vitest defaults for Node.js unit and API tests.
 * @typedef {{
 *   watch: false;
 *   globals: true;
 *   environment: 'node';
 *   reporters: ['default'];
 *   coverage: { provider: 'v8' };
 * }} AgrivioVitestNodeDefaults
 */

/** @type {AgrivioVitestNodeDefaults} */
export const agrivioVitestNodeDefaults = {
  watch: false,
  globals: true,
  environment: 'node',
  reporters: ['default'],
  coverage: {
    provider: 'v8',
  },
};

export default agrivioVitestNodeDefaults;
