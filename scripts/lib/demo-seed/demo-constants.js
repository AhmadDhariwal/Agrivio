/**
 * Agrivio Deterministic Demo Dataset Constants.
 * Strict non-production test credentials and canonical plan definitions.
 */

const DEMO_ORG_NAME = 'Agrivio Demo Agrochemicals (Pvt) Ltd';
const SECONDARY_TRIAL_ORG_NAME = 'Agrivio Secondary Trial Org';
const SECONDARY_SUSPENDED_ORG_NAME = 'Agrivio Suspended Demo Org';

const DEMO_PASSWORD = 'DemoPassword123!';

const DEMO_USERS = Object.freeze({
  superAdmin: {
    email: 'demo.admin@agrivio.test',
    displayName: 'Platform Super Admin',
    role: 'Super Admin',
  },
  owner: {
    email: 'demo.owner@agrivio.test',
    displayName: 'Chaudhry Tariq Mahmood (Owner)',
    role: 'Owner',
  },
  manager: {
    email: 'demo.manager@agrivio.test',
    displayName: 'Mian Aslam Javed (Manager)',
    role: 'Manager',
  },
  cashier: {
    email: 'demo.cashier@agrivio.test',
    displayName: 'Muhammad Usman (Cashier)',
    role: 'Cashier',
  },
  storeKeeper: {
    email: 'demo.storekeeper@agrivio.test',
    displayName: 'Rashid Ali (Store Keeper)',
    role: 'Store Keeper',
  },
  trialOwner: {
    email: 'demo.trial-owner@agrivio.test',
    displayName: 'Haji Nawaz Trial Owner',
    role: 'Owner',
  },
  suspendedOwner: {
    email: 'demo.suspended-owner@agrivio.test',
    displayName: 'Sardar Akram Suspended Owner',
    role: 'Owner',
  },
});

function resolveReferenceDate() {
  const envDate = process.env.AGRIVIO_DEMO_REFERENCE_DATE;
  if (typeof envDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(envDate.trim())) {
    return envDate.trim();
  }
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

function calculateRelativeDate(baseDateIso, offsetDays) {
  const date = new Date(`${baseDateIso}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

module.exports = {
  DEMO_ORG_NAME,
  SECONDARY_TRIAL_ORG_NAME,
  SECONDARY_SUSPENDED_ORG_NAME,
  DEMO_PASSWORD,
  DEMO_USERS,
  resolveReferenceDate,
  calculateRelativeDate,
};
