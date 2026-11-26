#!/usr/bin/env node
/**
 * Build-time WebMCP tool manifest extractor.
 * Evaluates a host app's tool-registration module against a mock navigator.modelContext
 * and writes a static tools.manifest.json for the generic mcp-server.
 *
 * Usage:
 *   node webmcp-bridge/build/extract-tools.mjs --entry app/bpmn-tools.js --export registerBpmnTools --out webmcp-bridge/tools.manifest.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function parseArgs(argv) {
  const args = {
    entry: null,
    exportName: 'default',
    out: 'webmcp-bridge/tools.manifest.json'
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--entry' && argv[i + 1]) args.entry = argv[++i];
    else if (argv[i] === '--export' && argv[i + 1]) args.exportName = argv[++i];
    else if (argv[i] === '--out' && argv[i + 1]) args.out = argv[++i];
  }
  return args;
}

const { entry, exportName, out } = parseArgs(process.argv.slice(2));

if (!entry) {
  console.error('Usage: extract-tools.mjs --entry <module> [--export <fnName>] [--out <manifest.json>]');
  process.exit(1);
}

const collected = [];
const mockModelContext = {
  registerTool(toolDef) {
    collected.push({
      name: toolDef.name,
      description: toolDef.description || '',
      inputSchema: toolDef.inputSchema || { type: 'object', properties: {} },
      ...(toolDef.annotations ? { annotations: toolDef.annotations } : {})
    });
  }
};

// Provide minimal browser globals for build-time discovery
if (typeof globalThis.navigator === 'undefined') {
  Object.defineProperty(globalThis, 'navigator', {
    value: { modelContext: mockModelContext },
    configurable: true
  });
} else {
  Object.defineProperty(globalThis.navigator, 'modelContext', {
    value: mockModelContext,
    configurable: true
  });
}

const modUrl = pathToFileURL(path.resolve(entry)).href;
const mod = await import(modUrl);
const registerFn = mod[exportName] || mod.default;

if (typeof registerFn !== 'function') {
  throw new Error(`Export "${exportName}" not found in ${entry}`);
}

// Call with a dummy modeler stub; tool schemas are static at registration time
registerFn({});

const outPath = path.resolve(out);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: entry,
  tools: collected
}, null, 2) + '\n');

console.log(`Extracted ${collected.length} WebMCP tools to ${out}`);
