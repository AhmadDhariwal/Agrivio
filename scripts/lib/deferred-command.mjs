/**
 * Prints a clear deferral message for root commands owned by later F00 work items.
 */
export function deferredCommand(command, roadmapId) {
  console.error(
    `[agrivio] Root command "${command}" is reserved by the frozen command contract ` +
      `and will be implemented in ${roadmapId}.`,
  );
  process.exit(1);
}
