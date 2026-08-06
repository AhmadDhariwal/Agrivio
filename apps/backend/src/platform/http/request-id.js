// @ts-check
import { randomUUID } from 'node:crypto';
import { API_REQUEST_ID_HEADER } from '@agrivio/api-contracts';

const OPAQUE_REQUEST_ID_PATTERN = /^[\w.-]{8,128}$/;

/**
 * Accepts a client-supplied correlation id when it matches the opaque format.
 * Client ids are correlation hints only — never a security boundary.
 * @param {string | undefined} rawHeader
 * @returns {string}
 */
export function resolveRequestId(rawHeader) {
  if (typeof rawHeader === 'string') {
    const trimmed = rawHeader.trim();
    if (OPAQUE_REQUEST_ID_PATTERN.test(trimmed)) {
      return trimmed;
    }
  }

  return randomUUID();
}

export { API_REQUEST_ID_HEADER };
