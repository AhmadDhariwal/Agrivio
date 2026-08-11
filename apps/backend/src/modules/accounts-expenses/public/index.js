/**
 * Accounts and Expenses public contract for F05/F06 (R1-F04-012).
 * Exposes signed account-movement posting without persistence leakage.
 */

const { createAccountsModule, createAccountsService } = require('../accounts.module');

module.exports = {
  createAccountsModule,
  createAccountsService,
};
