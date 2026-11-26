#!/usr/bin/env node
/**
 * Generic, zero-dependency stdio MCP server & one-shot CLI for webmcp-bridge.
 * Loads tool schemas from a build-time tools.manifest.json or dynamically from
 * the paired browser session over a private 127.0.0.1 WebSocket.
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { createLocalWsBridgeServer } from './ws-server.mjs';

function parseArgs(argv) {
  const args = {
    port: Number(process.env.WEBMCP_PORT || 49271),
    token: process.env.WEBMCP_TOKEN || null,
    manifest: process.env.WEBMCP_MANIFEST || null,
    listTools: false,
    call: null,
    callArgs: '{}',
    waitMs: 8000
  };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port' && argv[i + 1]) {
      args.port = Number(argv[++i]);
    } else if (argv[i] === '--token' && argv[i + 1]) {
      args.token = argv[++i];
    } else if (argv[i] === '--manifest' && argv[i + 1]) {
      args.manifest = argv[++i];
    } else if (argv[i] === '--list-tools') {
      args.listTools = true;
    } else if (argv[i] === '--call' && argv[i + 1]) {
      args.call = argv[++i];
    } else if (argv[i] === '--args' && argv[i + 1]) {
      args.callArgs = argv[++i];
    } else if (argv[i] === '--wait-ms' && argv[i + 1]) {
      args.waitMs = Number(argv[++i]);
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

const wsBridge = createLocalWsBridgeServer({
  port: config.port,
  expectedToken: config.token
});

async function waitForBrowserClient(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (wsBridge.hasConnectedClient()) {
      return;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for browser tab to connect to ws://127.0.0.1:${config.port}. Make sure Agent Bridge is enabled in the browser.`);
}

async function runOneShotCli() {
  if (!config.token) {
    console.error('Error: --token <pairingToken> is required in CLI mode.');
    process.exitCode = 1;
    wsBridge.close();
    return;
  }

  try {
    await waitForBrowserClient(config.waitMs);
    let result;
    if (config.listTools) {
      result = await wsBridge.sendCommand('list_tools', {});
    } else {
      const rawArgs = config.callArgs === '-' ? fs.readFileSync(0, 'utf8') : config.callArgs;
      const parsedArgs = JSON.parse(rawArgs || '{}');
      result = await wsBridge.sendCommand('call_tool', {
        name: config.call,
        args: parsedArgs
      });
    }
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (err) {
    console.error('Error:', err?.message || err);
    process.exitCode = 1;
  } finally {
    wsBridge.close();
  }
}

if (config.listTools || config.call) {
  runOneShotCli();
} else {
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

  const send = (msg) => {
    process.stdout.write(JSON.stringify(msg) + '\n');
  };

  const refreshLiveTools = async () => {
    if (!wsBridge.hasConnectedClient()) return false;
    try {
      const res = await wsBridge.sendCommand('list_tools', {});
      if (Array.isArray(res?.tools)) {
        cachedManifestTools = res.tools;
        return true;
      }
    } catch { /* ignore */ }
    return false;
  };

  const handleRequest = async (req) => {
    const { id, method, params } = req;

    if (method === 'initialize') {
      return send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: { listChanged: true } },
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
      if (cachedManifestTools.length === 0) {
        await refreshLiveTools();
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
          const updated = await refreshLiveTools();
          if (updated) {
            send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
          }
          result = {
            paired: true,
            ...ping,
            toolsDiscovered: cachedManifestTools.map((t) => t.name)
          };
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
  };

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
}
