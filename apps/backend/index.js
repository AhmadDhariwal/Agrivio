const path = require('path');
const {
  loadLocalDevelopmentEnv,
} = require('./src/platform/config/load-local-env');

loadLocalDevelopmentEnv({ backendRoot: path.resolve(__dirname) });
require('./src/main');
