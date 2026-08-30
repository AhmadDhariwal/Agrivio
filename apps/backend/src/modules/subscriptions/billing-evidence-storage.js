const { createHash, randomUUID } = require('node:crypto');
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const EVIDENCE_REF_PREFIX = 'evidence://';
const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
const ALLOWED_EVIDENCE_TYPES = Object.freeze({
  'image/png': { label: 'png', magic: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
  'image/jpeg': { label: 'jpeg', magic: Buffer.from([0xff, 0xd8, 0xff]) },
  'application/pdf': { label: 'pdf', magic: Buffer.from('%PDF') },
});

function checksumOf(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function sanitizeFileName(value) {
  if (typeof value !== 'string') {
    return 'evidence.bin';
  }
  const trimmed = value
    .trim()
    .replace(/[/\\]/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, '');
  if (trimmed.length === 0) {
    return 'evidence.bin';
  }
  return trimmed.slice(0, 255);
}

function normalizeContentType(value) {
  return String(value || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
}

function isSafeEvidencePathSegment(value) {
  return /^[A-Za-z0-9._-]+$/.test(value) && value !== '.' && value !== '..';
}

function parseEvidenceStorageRef(storageRef) {
  if (typeof storageRef !== 'string') {
    return null;
  }
  const trimmed = storageRef.trim();
  if (!trimmed.startsWith(EVIDENCE_REF_PREFIX)) {
    return null;
  }
  const remainder = trimmed.slice(EVIDENCE_REF_PREFIX.length);
  const slash = remainder.indexOf('/');
  if (slash <= 0 || slash === remainder.length - 1) {
    return null;
  }
  const organizationId = remainder.slice(0, slash);
  const objectId = remainder.slice(slash + 1);
  if (!isSafeEvidencePathSegment(organizationId) || !isSafeEvidencePathSegment(objectId)) {
    return null;
  }
  return { organizationId, objectId, storageRef: trimmed };
}

function assertAllowedEvidenceFile(file) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    const error = new Error('Payment evidence file is required');
    error.code = 'EVIDENCE_REQUIRED';
    throw error;
  }
  if (file.buffer.length > MAX_EVIDENCE_BYTES) {
    const error = new Error('Payment evidence exceeds 5MB');
    error.code = 'EVIDENCE_TOO_LARGE';
    throw error;
  }
  const contentType = normalizeContentType(file.contentType);
  const allowed = ALLOWED_EVIDENCE_TYPES[contentType];
  if (allowed === undefined) {
    const error = new Error('Payment evidence must be PNG, JPEG, or PDF');
    error.code = 'EVIDENCE_TYPE_INVALID';
    throw error;
  }
  if (!file.buffer.subarray(0, allowed.magic.length).equals(allowed.magic)) {
    const error = new Error('Payment evidence contents do not match the declared type');
    error.code = 'EVIDENCE_TYPE_MISMATCH';
    throw error;
  }
  return {
    contentType,
    originalFileName: sanitizeFileName(file.originalFileName),
    size: file.buffer.length,
    checksum: checksumOf(file.buffer),
  };
}

function toPublicMeta(record) {
  return {
    evidenceStorageRef: record.storageRef,
    organizationId: String(record.organizationId),
    originalFileName: record.originalFileName,
    contentType: record.contentType,
    size: record.size,
    checksum: record.checksum,
    uploadedAt: new Date(record.uploadedAt).toISOString(),
    uploadedBy: record.uploadedBy ?? null,
  };
}

function createMemoryBillingEvidenceStorage() {
  const objects = new Map();

  return {
    kind: 'memory',
    async put(input) {
      const validated = assertAllowedEvidenceFile(input);
      const organizationId = String(input.organizationId);
      const objectId = randomUUID();
      const storageRef = `${EVIDENCE_REF_PREFIX}${organizationId}/${objectId}`;
      const record = {
        storageRef,
        organizationId,
        originalFileName: validated.originalFileName,
        contentType: validated.contentType,
        size: validated.size,
        checksum: validated.checksum,
        uploadedAt: input.uploadedAt ?? new Date(),
        uploadedBy: input.uploadedBy ?? null,
        buffer: Buffer.from(input.buffer),
      };
      objects.set(storageRef, record);
      return toPublicMeta(record);
    },
    async getMeta(storageRef) {
      const record = objects.get(String(storageRef));
      return record === undefined ? null : toPublicMeta(record);
    },
    async read(storageRef) {
      const record = objects.get(String(storageRef));
      if (record === undefined) {
        return null;
      }
      return {
        ...toPublicMeta(record),
        buffer: Buffer.from(record.buffer),
      };
    },
  };
}

function objectPaths(rootDir, parsed) {
  const directory = join(rootDir, parsed.organizationId);
  return {
    directory,
    binPath: join(directory, `${parsed.objectId}.bin`),
    metaPath: join(directory, `${parsed.objectId}.json`),
  };
}

function createLocalBillingEvidenceStorage(options = {}) {
  const rootDir = options.rootDir ?? join(tmpdir(), 'agrivio-billing-evidence');

  return {
    kind: 'local',
    async put(input) {
      const validated = assertAllowedEvidenceFile(input);
      const organizationId = String(input.organizationId);
      const objectId = randomUUID();
      const storageRef = `${EVIDENCE_REF_PREFIX}${organizationId}/${objectId}`;
      const parsed = parseEvidenceStorageRef(storageRef);
      const paths = objectPaths(rootDir, parsed);
      await mkdir(paths.directory, { recursive: true });
      const record = {
        storageRef,
        organizationId,
        originalFileName: validated.originalFileName,
        contentType: validated.contentType,
        size: validated.size,
        checksum: validated.checksum,
        uploadedAt: (input.uploadedAt ?? new Date()).toISOString(),
        uploadedBy: input.uploadedBy ?? null,
      };
      await writeFile(paths.binPath, input.buffer);
      await writeFile(paths.metaPath, JSON.stringify(record));
      return toPublicMeta(record);
    },
    async getMeta(storageRef) {
      const parsed = parseEvidenceStorageRef(storageRef);
      if (parsed === null) {
        return null;
      }
      try {
        const raw = await readFile(objectPaths(rootDir, parsed).metaPath, 'utf8');
        return toPublicMeta(JSON.parse(raw));
      } catch {
        return null;
      }
    },
    async read(storageRef) {
      const parsed = parseEvidenceStorageRef(storageRef);
      if (parsed === null) {
        return null;
      }
      const paths = objectPaths(rootDir, parsed);
      try {
        const [metaRaw, buffer] = await Promise.all([
          readFile(paths.metaPath, 'utf8'),
          readFile(paths.binPath),
        ]);
        return {
          ...toPublicMeta(JSON.parse(metaRaw)),
          buffer,
        };
      } catch {
        return null;
      }
    },
  };
}

function createBillingEvidenceStorage(options = {}) {
  if (options.adapter === 'local') {
    return createLocalBillingEvidenceStorage(options);
  }
  return createMemoryBillingEvidenceStorage();
}

module.exports = {
  ALLOWED_EVIDENCE_TYPES,
  EVIDENCE_REF_PREFIX,
  MAX_EVIDENCE_BYTES,
  assertAllowedEvidenceFile,
  createBillingEvidenceStorage,
  createLocalBillingEvidenceStorage,
  createMemoryBillingEvidenceStorage,
  normalizeContentType,
  parseEvidenceStorageRef,
  sanitizeFileName,
};
