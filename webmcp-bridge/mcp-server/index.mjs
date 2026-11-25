#!/usr/bin/env node
/**
 * Generic, zero-dependency stdio MCP server for webmcp-bridge.
 * Loads tool schemas from a build-time tools.manifest.json and dispatches calls
 * to the paired browser session over a private 127.0.0.1 WebSocket.
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { createLocalWsBridgeServer } from './ws-server.mjs';

function parseArgs(argv) {
  const args = {
    port: Number(process.env.WEBMCP_PORT || 49271),
    token: process.env.WEBMCP_TOKEN || null,
    manifest: process.env.WEBMCP_MANIFEST || null
  };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port' && argv[i + 1]) {
      args.port = Number(argv[++i]);
    } else if (argv[i] === '--token' && argv[i + 1]) {
      args.token = argv[++i];
    } else if (argv[i] === '--manifest' && argv[i + 1]) {
      args.manifest = argv[++i];
    }
  }
  return args;
}

const config = parseArgs(process.argv.slice(2));

function loadManifestTools(manifestPath) {
  if (!manifestPath) return [];
  const resolved = path.resolve(manifestPath);
  if (!fs.existsSync(resolved)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    return Array.isArray(data.tools) ? data.tools : [];
  } catch {
    return [];
  }
}

const PAIR_TOOL = {
  name: 'webmcp_pair',
  description: 'Pair this MCP server with a live browser session using the 256-bit token shown in the browser Agent Bridge panel.',
  inputSchema: {
    type: 'object',
    properties: {
      token: {
        type: 'string',
        description: '256-bit pairing token copied from the browser Agent Bridge drawer'
      }
    },
    required: [ 'token' ]
  }
};

let cachedManifestTools = loadManifestTools(config.manifest);
const wsBridge = createLocalWsBridgeServer({
  port: config.port,
  expectedToken: config.token
});

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

async function handleRequest(req) {
  const { id, method, params } = req;

  if (method === 'initialize') {
    return send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: {
          name: 'webmcp-bridge',
          version: '1.0.0'
        }
      }
    });
  }

  if (method === 'notifications/initialized') {
    return;
  }

  if (method === 'tools/list') {
    if (cachedManifestTools.length === 0 && wsBridge.hasConnectedClient()) {
      try {
        const res = await wsBridge.sendCommand('list_tools', {});
        if (Array.isArray(res?.tools)) {
          cachedManifestTools = res.tools;
        }
      } catch { /* ignore */ }
    }

    return send({
      jsonrpc: '2.0',
      id,
      result: {
        tools: [ PAIR_TOOL, ...cachedManifestTools ]
      }
    });
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const toolArgs = params?.arguments || {};

    try {
      let result;
      if (toolName === 'webmcp_pair') {
        if (!toolArgs.token || typeof toolArgs.token !== 'string') {
          throw new Error('Missing required parameter: token');
        }
        wsBridge.setExpectedToken(toolArgs.token.trim());
        const ping = await wsBridge.sendCommand('ping', {});
        result = { paired: true, ...ping };
      } else {
        result = await wsBridge.sendCommand('call_tool', {
          name: toolName,
          args: toolArgs
        });
      }

      return send({
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        }
      });
    } catch (err) {
      return send({
        jsonrpc: '2.0',
        id,
        result: {
          isError: true,
          content: [
            {
              type: 'text',
              text: err?.message || String(err)
            }
          ]
        }
      });
    }
  }

  if (id !== undefined) {
    send({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` }
    });
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    handleRequest(JSON.parse(trimmed));
  } catch (err) {
    console.error('[webmcp-bridge] Invalid JSON:', err);
  }
});

rl.on('close', () => {
  wsBridge.close();
  process.exit(0);
});
