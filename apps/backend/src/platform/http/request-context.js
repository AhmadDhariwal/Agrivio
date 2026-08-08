const { AsyncLocalStorage } = require('node:async_hooks');

const storage = new AsyncLocalStorage();

function runWithRequestContext(context, fn) {
  storage.run(context, fn);
}

function getRequestContext() {
  return storage.getStore();
}

function getRequestId() {
  return storage.getStore()?.requestId;
}

module.exports = {
  runWithRequestContext,
  getRequestContext,
  getRequestId,
};
