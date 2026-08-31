const { execSync } = require('child_process');
const path = require('path');

function which(name) {
  try {
    const isWindows = process.platform === 'win32';
    const cmd = isWindows ? `where ${name}` : `which ${name}`;
    const result = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const first = result.split(/\r?\n/)[0].trim();
    return first.length > 0 ? first : null;
  } catch {
    return null;
  }
}

function resolveSafePath(filePath, label) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  const resolved = path.resolve(filePath.trim());
  // Reject path traversal artifacts
  if (filePath.includes('..') || filePath.includes('\0')) {
    throw new Error(`${label} must not contain path traversal sequences`);
  }
  return resolved;
}

module.exports = {
  which,
  resolveSafePath,
};
