import { deferredCommand } from './lib/deferred-command.mjs';

const command = process.argv[2];
const roadmapId = process.argv[3];

if (!command || !roadmapId) {
  console.error('Usage: node scripts/deferred-command.mjs <command> <roadmap-id>');
  process.exit(1);
}

deferredCommand(command, roadmapId);
