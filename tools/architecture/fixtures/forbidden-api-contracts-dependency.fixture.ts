/**
 * INTENTIONAL ARCHITECTURE VIOLATION FIXTURE — not production code.
 *
 * Scanned as if it lived at:
 *   packages/api-contracts/src/lib/leak.ts
 *
 * Forbidden: api-contracts importing Express / Mongoose
 * (REPOSITORY_STRUCTURE.md / TOOLCHAIN.md package rules).
 */
import express from 'express';
import mongoose from 'mongoose';

export const leak = { express, mongoose };
