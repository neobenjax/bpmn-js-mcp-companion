#!/usr/bin/env node
/**
 * Zero-dependency MCP (Model Context Protocol) stdio server for bpmn-js-mcp-companion.
 * Connects harness AI agents (Claude Code, Cursor, Codex, Antigravity, etc.)
 * to a live browser BPMN session via its temporary Session ID.
 */

import readline from 'node:readline';
import { sendSessionCommand, closeAllConnections } from './session-client.mjs';

const SESSION_PROP = {
  sessionId: {
    type: 'string',
    description: 'Temporary Session ID shown in the browser Remote Agent Access panel (e.g. bpmn-a8f3k9m2)'
  },
  brokerUrl: {
    type: 'string',
    description: 'Optional custom WebSocket/MQTT relay URL (defaults to wss://broker.emqx.io:8084/mqtt)'
  }
};

const TOOLS = [
  {
    name: 'bpmn_ping_session',
    description: 'Verify connectivity to a live browser BPMN session.',
    inputSchema: {
      type: 'object',
      properties: { ...SESSION_PROP },
      required: ['sessionId']
    }
  },
  {
    name: 'bpmn_create_diagram',
    description: 'Create a new BPMN 2.0 diagram with a single StartEvent in the connected browser session.',
    inputSchema: {
      type: 'object',
      properties: { ...SESSION_PROP },
      required: ['sessionId']
    }
  },
  {
    name: 'bpmn_import_xml',
    description: 'Import a BPMN 2.0 XML string into the connected browser session.',
    inputSchema: {
      type: 'object',
      properties: {
        ...SESSION_PROP,
        xml: { type: 'string', description: 'Valid BPMN 2.0 XML document' }
      },
      required: ['sessionId', 'xml']
    }
  },
  {
    name: 'bpmn_export_xml',
    description: 'Export the current BPMN 2.0 diagram as formatted XML from the browser session.',
    inputSchema: {
      type: 'object',
      properties: {
        ...SESSION_PROP,
        format: { type: 'boolean', description: 'Pretty-print XML (default true)' }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'bpmn_export_svg',
    description: 'Export the current BPMN 2.0 diagram as SVG from the browser session.',
    inputSchema: {
      type: 'object',
      properties: { ...SESSION_PROP },
      required: ['sessionId']
    }
  },
  {
    name: 'bpmn_get_diagram_summary',
    description: 'Get the current live state of all shapes, connections, labels, and bounds in the browser session.',
    inputSchema: {
      type: 'object',
      properties: { ...SESSION_PROP },
      required: ['sessionId']
    }
  },
  {
    name: 'bpmn_add_element',
    description: 'Add a BPMN element (e.g. bpmn:UserTask, bpmn:ServiceTask, bpmn:ExclusiveGateway, bpmn:EndEvent) to the live diagram.',
    inputSchema: {
      type: 'object',
      properties: {
        ...SESSION_PROP,
        type: { type: 'string', description: 'BPMN element type' },
        id: { type: 'string' },
        name: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' },
        parentId: { type: 'string' },
        sourceElementId: { type: 'string' },
        connectFromSource: { type: 'boolean' },
        flowName: { type: 'string' }
      },
      required: ['sessionId', 'type']
    }
  },
  {
    name: 'bpmn_connect_elements',
    description: 'Connect two existing elements in the live diagram.',
    inputSchema: {
      type: 'object',
      properties: {
        ...SESSION_PROP,
        sourceId: { type: 'string' },
        targetId: { type: 'string' },
        type: { type: 'string' },
        name: { type: 'string' }
      },
      required: ['sessionId', 'sourceId', 'targetId']
    }
  },
  {
    name: 'bpmn_update_element',
    description: 'Update an element label, properties, position, or dimensions in the live diagram.',
    inputSchema: {
      type: 'object',
      properties: {
        ...SESSION_PROP,
        elementId: { type: 'string' },
        name: { type: 'string' },
        properties: { type: 'object' },
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' }
      },
      required: ['sessionId', 'elementId']
    }
  },
  {
    name: 'bpmn_delete_elements',
    description: 'Delete one or more elements by ID from the live diagram.',
    inputSchema: {
      type: 'object',
      properties: {
        ...SESSION_PROP,
        elementIds: { type: 'array', items: { type: 'string' } }
      },
      required: ['sessionId', 'elementIds']
    }
  },
  {
    name: 'bpmn_replace_element',
    description: 'Morph/replace an existing element with a different BPMN type.',
    inputSchema: {
      type: 'object',
      properties: {
        ...SESSION_PROP,
        elementId: { type: 'string' },
        newType: { type: 'string' }
      },
      required: ['sessionId', 'elementId', 'newType']
    }
  },
  {
    name: 'bpmn_undo',
    description: 'Undo the last modeling action in the live diagram.',
    inputSchema: {
      type: 'object',
      properties: { ...SESSION_PROP },
      required: ['sessionId']
    }
  },
  {
    name: 'bpmn_redo',
    description: 'Redo the last undone modeling action in the live diagram.',
    inputSchema: {
      type: 'object',
      properties: { ...SESSION_PROP },
      required: ['sessionId']
    }
  },
  {
    name: 'bpmn_zoom_fit',
    description: 'Fit the BPMN diagram to the browser viewport.',
    inputSchema: {
      type: 'object',
      properties: {
        ...SESSION_PROP,
        level: { type: 'string' }
      },
      required: ['sessionId']
    }
  },
  {
    name: 'bpmn_build_process',
    description: 'Build a complete BPMN process from a list of nodes and flows with automatic left-to-right layout.',
    inputSchema: {
      type: 'object',
      properties: {
        ...SESSION_PROP,
        clearExisting: { type: 'boolean' },
        nodes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              type: { type: 'string' },
              name: { type: 'string' },
              x: { type: 'number' },
              y: { type: 'number' }
            },
            required: ['id', 'type']
          }
        },
        flows: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              from: { type: 'string' },
              to: { type: 'string' },
              name: { type: 'string' }
            },
            required: ['from', 'to']
          }
        }
      },
      required: ['sessionId', 'nodes']
    }
  }
];

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
          name: 'bpmn-js-mcp-companion',
          version: '1.0.0'
        }
      }
    });
  }

  if (method === 'notifications/initialized') {
    return;
  }

  if (method === 'tools/list') {
    return send({
      jsonrpc: '2.0',
      id,
      result: { tools: TOOLS }
    });
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const rawArgs = params?.arguments || {};
    const { sessionId, brokerUrl, ...toolArgs } = rawArgs;

    try {
      if (!sessionId) {
        throw new Error('Missing required parameter: sessionId');
      }

      let result;
      if (toolName === 'bpmn_ping_session') {
        result = await sendSessionCommand(sessionId, 'ping', {}, { brokerUrl });
      } else {
        result = await sendSessionCommand(
          sessionId,
          'call_tool',
          { name: toolName, args: toolArgs },
          { brokerUrl }
        );
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
              text: err.message || String(err)
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
    const req = JSON.parse(trimmed);
    handleRequest(req);
  } catch (err) {
    console.error('[bpmn-mcp] Invalid JSON:', err);
  }
});

rl.on('close', () => {
  closeAllConnections();
  process.exit(0);
});
