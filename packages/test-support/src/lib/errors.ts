export class ReplicaSetUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'ReplicaSetUnavailableError';
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}
