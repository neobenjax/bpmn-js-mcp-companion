#!/usr/bin/env node
/**
 * One-shot CLI to inspect or modify a live browser BPMN session.
 * Usage:
 *   node mcp-server/cli.mjs <sessionId> <toolName> [jsonArgs]
 * Example:
 *   node mcp-server/cli.mjs bpmn-a8f3k9m2 bpmn_get_diagram_summary
 *   node mcp-server/cli.mjs bpmn-a8f3k9m2 bpmn_add_element '{"type":"bpmn:UserTask","name":"Review"}'
 */

import { sendSessionCommand, closeAllConnections } from './session-client.mjs';

const [,, sessionId, toolName, rawArgs] = process.argv;

if (!sessionId || !toolName) {
  console.error('Usage: node mcp-server/cli.mjs <sessionId> <toolName> [jsonArgs]');
  process.exit(1);
}

const args = rawArgs ? JSON.parse(rawArgs) : {};

try {
  const result = toolName === 'ping'
    ? await sendSessionCommand(sessionId, 'ping', {})
    : await sendSessionCommand(sessionId, 'call_tool', { name: toolName, args });
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error('Error:', err.message || err);
  process.exitCode = 1;
} finally {
  closeAllConnections();
}
