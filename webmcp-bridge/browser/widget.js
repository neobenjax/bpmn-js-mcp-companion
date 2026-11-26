/**
 * Self-contained Shadow DOM floating widget for WebMCP inspection & Agent Bridge pairing.
 * Zero CSS/HTML impact on the host application.
 */

const WIDGET_STYLES = `
  :host {
    all: initial;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
    font-size: 13px;
    color: #1f2937;
  }
  * { box-sizing: border-box; }
  .topbar {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 7px 13px;
    border-radius: 999px;
    border: 1px solid #d0d7de;
    background: rgba(255, 255, 255, 0.96);
    color: #1f2937;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
    transition: all 0.15s;
  }
  .pill:hover { border-color: #9ca3af; background: #ffffff; }
  .pill.active { border-color: #0d6efd; background: #eff6ff; color: #0d6efd; }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #9ca3af;
    display: inline-block;
  }
  .dot.waiting { background: #f59e0b; box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.2); }
  .dot.connected { background: #10b981; box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2); }
  .dot.error { background: #ef4444; }
  .drawer {
    position: fixed;
    top: 60px;
    right: 16px;
    width: 390px;
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 88px);
    background: #ffffff;
    border: 1px solid #d8dce3;
    border-radius: 10px;
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.15);
    z-index: 9999;
    display: none;
    flex-direction: column;
    overflow: hidden;
  }
  .drawer.open { display: flex; }
  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid #e5e7eb;
    background: #f9fafb;
  }
  .drawer-header h2 { margin: 0; font-size: 14px; font-weight: 600; }
  .drawer-body {
    padding: 14px 16px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .card {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 12px;
    background: #fafafa;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 7px 12px;
    border-radius: 6px;
    border: 1px solid #d0d7de;
    background: #ffffff;
    color: #24292f;
    font-size: 12.5px;
    font-weight: 500;
    cursor: pointer;
  }
  .btn:hover { background: #f3f4f6; }
  .btn-primary { background: #0d6efd; border-color: #0d6efd; color: #ffffff; }
  .btn-primary:hover { background: #0b5ed7; }
  .btn-sm { padding: 4px 9px; font-size: 12px; }
  .input {
    width: 100%;
    padding: 7px 10px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .token-box {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    background: #111827;
    color: #f9fafb;
    padding: 8px 10px;
    border-radius: 6px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11.5px;
    word-break: break-all;
  }
  .log {
    max-height: 160px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 12px;
  }
  .log-item { padding: 5px 8px; border-radius: 5px; background: #f3f4f6; color: #374151; }
  .log-item.agent { background: #eff6ff; color: #1e40af; }
  .log-item.error { background: #fef2f2; color: #991b1b; }
  .tool-item {
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 8px 10px;
    background: #ffffff;
  }
  .tool-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    font-weight: 600;
    color: #0d6efd;
  }
  .tool-desc { margin: 4px 0 0; font-size: 12px; color: #4b5563; }
  .hidden { display: none !important; }
`;

export function createBridgeWidget({ defaultWsUrl, siteBaseUrl, onToggle, onCopyConfig }) {
  const host = document.createElement('div');
  host.setAttribute('data-webmcp-bridge', '');
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = WIDGET_STYLES;

  const root = document.createElement('div');
  root.innerHTML = `
    <div class="topbar">
      <button type="button" class="pill" id="btn-tools">
        <span class="dot connected"></span>
        <span id="lbl-tools">WebMCP (0 tools)</span>
      </button>
      <button type="button" class="pill" id="btn-bridge">
        <span class="dot" id="dot-bridge"></span>
        <span id="lbl-bridge">Agent Bridge: Off</span>
      </button>
    </div>

    <aside class="drawer" id="drawer-tools">
      <div class="drawer-header">
        <h2>WebMCP Tools</h2>
        <button type="button" class="btn btn-sm" id="close-tools">&times;</button>
      </div>
      <div class="drawer-body">
        <div class="card">
          <div style="font-size:12px;"><strong>Status:</strong> <span id="native-status">Checking...</span></div>
        </div>
        <div id="tools-list" style="display:flex;flex-direction:column;gap:8px;"></div>
      </div>
    </aside>

    <aside class="drawer" id="drawer-bridge">
      <div class="drawer-header">
        <h2>Local Agent Bridge</h2>
        <button type="button" class="btn btn-sm" id="close-bridge">&times;</button>
      </div>
      <div class="drawer-body">
        <div class="card">
          <p style="margin:0 0 8px;font-size:12px;color:#374151;">
            Connect this live browser session to your local AI Agent Harness over a private <code>127.0.0.1</code> WebSocket. Your diagrams never leave your machine.
          </p>
          <p style="margin:0 0 10px;font-size:11.5px;color:#4b5563;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:7px 9px;">
            <strong>Security note:</strong> If your agent is not configured yet, it will ask your permission before downloading the 2 zero-dependency bridge scripts from this site&apos;s origin and verifying their SHA-256 checksums.
          </p>
          <button type="button" class="btn btn-primary" id="btn-toggle" style="width:100%;">
            Enable Agent Bridge
          </button>
          <details style="margin-top:10px;">
            <summary style="font-size:12px;color:#6b7280;cursor:pointer;">Connection settings</summary>
            <div style="margin-top:8px;">
              <label style="font-size:11.5px;color:#4b5563;display:block;margin-bottom:4px;">WebSocket URL</label>
              <input type="text" class="input" id="input-ws-url" />
            </div>
          </details>
        </div>

        <div class="card hidden" id="panel-session">
          <div style="font-size:12px;font-weight:600;margin-bottom:6px;">Session Pairing Token (256-bit)</div>
          <div class="token-box">
            <span id="txt-token"></span>
            <button type="button" class="btn btn-sm" id="btn-copy-token">Copy</button>
          </div>
          <div id="txt-status" style="font-size:12px;color:#4b5563;margin-top:8px;">Waiting for local MCP server...</div>
          <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
            <button type="button" class="btn btn-sm" id="btn-copy-prompt">Copy Agent Prompt</button>
            <button type="button" class="btn btn-sm" id="btn-copy-config">Copy MCP Config</button>
          </div>
        </div>

        <div class="card">
          <div style="font-size:12px;font-weight:600;margin-bottom:6px;">Activity Log</div>
          <div class="log" id="activity-log">
            <div class="log-item">Agent bridge is off.</div>
          </div>
        </div>
      </div>
    </aside>
  `;

  shadow.appendChild(style);
  shadow.appendChild(root);
  document.body.appendChild(host);

  const el = (id) => shadow.getElementById(id);
  const wsUrlInput = el('input-ws-url');
  wsUrlInput.value = defaultWsUrl;

  const toolsDrawer = el('drawer-tools');
  const bridgeDrawer = el('drawer-bridge');

  el('btn-tools').addEventListener('click', () => {
    bridgeDrawer.classList.remove('open');
    toolsDrawer.classList.toggle('open');
  });
  el('close-tools').addEventListener('click', () => toolsDrawer.classList.remove('open'));

  el('btn-bridge').addEventListener('click', () => {
    toolsDrawer.classList.remove('open');
    bridgeDrawer.classList.toggle('open');
  });
  el('close-bridge').addEventListener('click', () => bridgeDrawer.classList.remove('open'));

  el('btn-toggle').addEventListener('click', () => {
    onToggle(wsUrlInput.value.trim() || defaultWsUrl);
  });

  function copyWithFeedback(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = orig; }, 1400);
    });
  }

  el('btn-copy-token').addEventListener('click', (e) => {
    copyWithFeedback(el('txt-token').textContent, e.currentTarget);
  });

  el('btn-copy-prompt').addEventListener('click', (e) => {
    const token = el('txt-token').textContent;
    const bridgeBase = `${siteBaseUrl}webmcp-bridge/mcp-server`;
    const prompt = [
      `Connect to my live browser session using WebMCP Bridge (pairing token: "${token}").`,
      '1. If the `webmcp_pair` MCP tool is already available, call `webmcp_pair(token="' + token + '")` and then help me edit my diagram.',
      '2. Otherwise, BEFORE downloading or running anything, explain to me and ask my permission for a one-time setup to:',
      `   - Download the 2 zero-dependency Node.js bridge files (${bridgeBase}/index.mjs and ${bridgeBase}/ws-server.mjs) plus ${bridgeBase}/checksums.json into ~/.webmcp-bridge/`,
      '   - Verify their SHA-256 checksums match checksums.json before executing.',
      '3. Once I approve and verify, use the CLI immediately in this session without requiring an IDE restart:',
      `   - List tools: node ~/.webmcp-bridge/index.mjs --token "${token}" --list-tools`,
      `   - Call tool:  node ~/.webmcp-bridge/index.mjs --token "${token}" --call <toolName> --args '<json>'`
    ].join('\n');
    copyWithFeedback(prompt, e.currentTarget);
  });

  el('btn-copy-config').addEventListener('click', (e) => {
    const token = el('txt-token').textContent;
    copyWithFeedback(onCopyConfig(token), e.currentTarget);
  });

  return {
    setTools(tools, nativeTargets) {
      el('lbl-tools').textContent = `WebMCP (${tools.length} tools)`;
      el('native-status').textContent = nativeTargets.length > 0
        ? `Native (${nativeTargets.join(', ')})`
        : 'Polyfill active (works in all browsers)';

      const list = el('tools-list');
      list.textContent = '';
      for (const tool of tools) {
        const item = document.createElement('div');
        item.className = 'tool-item';

        const header = document.createElement('div');
        header.className = 'tool-header';
        const nameSpan = document.createElement('span');
        nameSpan.textContent = tool.name;
        const badge = document.createElement('span');
        badge.style.cssText = 'font-size:10px;color:#6b7280;';
        badge.textContent = tool.annotations?.readOnlyHint ? 'READ' : 'WRITE';
        header.appendChild(nameSpan);
        header.appendChild(badge);

        const desc = document.createElement('p');
        desc.className = 'tool-desc';
        desc.textContent = tool.description;

        item.appendChild(header);
        item.appendChild(desc);
        list.appendChild(item);
      }
    },

    setStatus({ state, token, wsUrl, error }) {
      const dot = el('dot-bridge');
      const btn = el('btn-bridge');
      const lbl = el('lbl-bridge');
      const toggle = el('btn-toggle');
      const panel = el('panel-session');
      const statusTxt = el('txt-status');

      dot.className = 'dot';
      if (state === 'off') {
        btn.classList.remove('active');
        lbl.textContent = 'Agent Bridge: Off';
        toggle.textContent = 'Enable Agent Bridge';
        toggle.classList.add('btn-primary');
        panel.classList.add('hidden');
      } else if (state === 'connecting') {
        btn.classList.add('active');
        dot.classList.add('waiting');
        lbl.textContent = 'Bridge: Connecting...';
        toggle.textContent = 'Disable Agent Bridge';
        toggle.classList.remove('btn-primary');
        panel.classList.remove('hidden');
        el('txt-token').textContent = token;
        statusTxt.textContent = `Connecting to ${wsUrl}...`;
      } else if (state === 'connected') {
        btn.classList.add('active');
        dot.classList.add('connected');
        lbl.textContent = 'Bridge: Paired';
        toggle.textContent = 'Disable Agent Bridge';
        toggle.classList.remove('btn-primary');
        panel.classList.remove('hidden');
        el('txt-token').textContent = token;
        statusTxt.textContent = `Connected to local agent at ${wsUrl}`;
      } else if (state === 'error') {
        btn.classList.add('active');
        dot.classList.add('error');
        lbl.textContent = 'Bridge: Retrying...';
        toggle.textContent = 'Disable Agent Bridge';
        toggle.classList.remove('btn-primary');
        panel.classList.remove('hidden');
        el('txt-token').textContent = token;
        statusTxt.textContent = error || 'Waiting for local MCP server...';
      }
    },

    appendLog(source, message) {
      const log = el('activity-log');
      const item = document.createElement('div');
      item.className = `log-item ${source}`;
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      item.textContent = `[${time}] ${message}`;
      log.prepend(item);
      while (log.children.length > 40) {
        log.removeChild(log.lastChild);
      }
    },

    destroy() {
      host.remove();
    }
  };
}
