/**
 * INTENTIONAL ARCHITECTURE VIOLATION FIXTURE — not production code.
 *
 * Scanned as if it lived at:
 *   packages/tooling-config/src/lib/leak.ts
 *
 * Forbidden: tooling-config depending on application code.
 */
import { createApp } from '../../../apps/backend/src/app.js';

export const leak = createApp;
