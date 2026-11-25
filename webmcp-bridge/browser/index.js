import {
  installWebMcpPolyfill,
  listRegisteredTools,
  executeRegisteredTool,
  onToolsChanged,
  onToolExecuted,
  getNativeTargets
} from './webmcp-polyfill.js';
import { createBridgeWidget } from './widget.js';

const DEFAULT_WS_URL = 'ws://127.0.0.1:49271';

function generatePairingToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Mounts the WebMCP polyfill, floating inspector/pairing widget, and local WebSocket bridge.
 * Completely agnostic of the host application.
 */
export function mountWebMcpBridge(options = {}) {
  const defaultWsUrl = options.wsUrl || DEFAULT_WS_URL;
  const manifestPath = options.manifestPath || 'webmcp-bridge/tools.manifest.json';

  installWebMcpPolyfill();

  let active = false;
  let ws = null;
  let token = null;
  let currentUrl = defaultWsUrl;
  let reconnectTimer = null;

  const widget = createBridgeWidget({
    defaultWsUrl,
    onToggle: (url) => {
      if (active) {
        disable();
      } else {
        enable(url);
      }
    },
    onCopyConfig: (tok) => JSON.stringify({
      mcpServers: {
        'webmcp-bridge': {
          command: 'node',
          args: [ 'webmcp-bridge/mcp-server/index.mjs', '--manifest', manifestPath ],
          env: {
            WEBMCP_TOKEN: tok
          }
        }
      }
    }, null, 2)
  });

  const refreshTools = () => {
    widget.setTools(listRegisteredTools(), getNativeTargets());
  };

  const unsubTools = onToolsChanged(refreshTools);
  const unsubExec = onToolExecuted((ev) => {
    if (ev.ok) {
      widget.appendLog('agent', `Executed ${ev.name} (${ev.durationMs}ms)`);
    } else {
      widget.appendLog('error', `${ev.name} failed: ${ev.error}`);
    }
  });

  refreshTools();

  function clearReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function connectSocket() {
    if (!active) return;
    clearReconnect();

    const separator = currentUrl.includes('?') ? '&' : '?';
    const targetUrl = `${currentUrl}${separator}token=${encodeURIComponent(token)}`;
    widget.setStatus({ state: 'connecting', token, wsUrl: currentUrl });

    try {
      ws = new WebSocket(targetUrl);
    } catch (err) {
      widget.setStatus({ state: 'error', token, wsUrl: currentUrl, error: err.message });
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      widget.setStatus({ state: 'connected', token, wsUrl: currentUrl });
      widget.appendLog('system', `Connected to ${currentUrl}`);
    };

    ws.onmessage = async (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      const { requestId, action, params } = msg;
      if (!requestId) return;

      try {
        let result;
        if (action === 'ping') {
          result = { pong: true, toolsCount: listRegisteredTools().length };
        } else if (action === 'list_tools') {
          result = { tools: listRegisteredTools() };
        } else if (action === 'call_tool') {
          result = await executeRegisteredTool(params?.name, params?.args || {});
        } else {
          throw new Error(`Unknown action: ${action}`);
        }

        ws.send(JSON.stringify({ requestId, ok: true, result }));
      } catch (err) {
        ws.send(JSON.stringify({ requestId, ok: false, error: err?.message || String(err) }));
      }
    };

    ws.onerror = () => {
      if (active) {
        widget.setStatus({
          state: 'error',
          token,
          wsUrl: currentUrl,
          error: 'Local MCP server not reachable yet. Retrying...'
        });
      }
    };

    ws.onclose = () => {
      ws = null;
      if (active) {
        widget.setStatus({
          state: 'error',
          token,
          wsUrl: currentUrl,
          error: 'Disconnected. Retrying local MCP server...'
        });
        scheduleReconnect();
      }
    };
  }

  function scheduleReconnect() {
    clearReconnect();
    if (!active) return;
    reconnectTimer = setTimeout(connectSocket, 2500);
  }

  function enable(url = defaultWsUrl) {
    active = true;
    currentUrl = url;
    token = generatePairingToken();
    widget.appendLog('system', 'Agent bridge enabled. Waiting for local MCP server...');
    connectSocket();
  }

  function disable() {
    active = false;
    clearReconnect();
    if (ws) {
      try { ws.close(); } catch { /* ignore */ }
      ws = null;
    }
    token = null;
    widget.setStatus({ state: 'off' });
    widget.appendLog('system', 'Agent bridge disabled.');
  }

  return {
    enable,
    disable,
    getToken: () => token,
    destroy() {
      disable();
      unsubTools();
      unsubExec();
      widget.destroy();
    }
  };
}
