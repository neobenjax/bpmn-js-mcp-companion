import { createBpmnTools } from './bpmn-tools.js';
import { RemoteAgentSession } from './remote-agent.js';
import { SAMPLE_DIAGRAM_XML } from './sample-diagram.js';

const BpmnModeler = window.BpmnJS;

const container = document.getElementById('js-drop-zone');
const canvasEl = document.getElementById('js-canvas');
const fileInput = document.getElementById('js-file-input');
const errorDetailsEl = document.getElementById('js-error-details');
const warningsBanner = document.getElementById('js-warnings-banner');

const downloadLink = document.getElementById('js-download-diagram');
const downloadSvgLink = document.getElementById('js-download-svg');

const webmcpBtn = document.getElementById('js-webmcp-btn');
const webmcpDrawer = document.getElementById('js-webmcp-drawer');
const webmcpClose = document.getElementById('js-webmcp-close');
const webmcpNativeStatus = document.getElementById('js-webmcp-native-status');
const webmcpToolsList = document.getElementById('js-webmcp-tools-list');

const copilotBtn = document.getElementById('js-copilot-btn');
const copilotDot = document.getElementById('js-copilot-dot');
const copilotLabel = document.getElementById('js-copilot-label');
const copilotDrawer = document.getElementById('js-copilot-drawer');
const copilotClose = document.getElementById('js-copilot-close');
const copilotToggle = document.getElementById('js-copilot-toggle');
const relayUrlInput = document.getElementById('js-relay-url');
const sessionPanel = document.getElementById('js-session-panel');
const sessionIdEl = document.getElementById('js-session-id');
const sessionStatusEl = document.getElementById('js-session-status');
const activityLogEl = document.getElementById('js-activity-log');

const shortcutsModal = document.getElementById('js-shortcuts-modal');

const modeler = new BpmnModeler({
  container: canvasEl,
  keyboard: { bindTo: window }
});

window.__bpmnModeler = modeler;

let lastWarnings = [];

function setDiagramActive() {
  container.classList.remove('with-error');
  container.classList.add('with-diagram');
}

function setDiagramError(err) {
  container.classList.remove('with-diagram');
  container.classList.add('with-error');
  errorDetailsEl.textContent = err?.message || String(err);
}

async function openDiagram(xml) {
  try {
    const { warnings } = await modeler.importXML(xml);
    lastWarnings = warnings || [];
    setDiagramActive();
    modeler.get('canvas').zoom('fit-viewport');

    if (lastWarnings.length > 0) {
      warningsBanner.classList.add('visible');
    } else {
      warningsBanner.classList.remove('visible');
    }

    await updateDownloadLinks();
  } catch (err) {
    console.error('Failed to import BPMN diagram:', err);
    setDiagramError(err);
  }
}

async function createNewDiagram() {
  try {
    await modeler.createDiagram();
    lastWarnings = [];
    warningsBanner.classList.remove('visible');
    setDiagramActive();
    modeler.get('canvas').zoom('fit-viewport');
    await updateDownloadLinks();
  } catch (err) {
    console.error('Failed to create diagram:', err);
    setDiagramError(err);
  }
}

async function updateDownloadLinks() {
  if (!container.classList.contains('with-diagram')) return;
  try {
    const { xml } = await modeler.saveXML({ format: true });
    downloadLink.href = 'data:application/bpmn20-xml;charset=UTF-8,' + encodeURIComponent(xml);
  } catch {}
  try {
    const { svg } = await modeler.saveSVG();
    downloadSvgLink.href = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  } catch {}
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

modeler.on('commandStack.changed', debounce(() => {
  updateDownloadLinks();
}, 350));

// File open & drag-and-drop
function openFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => openDiagram(e.target.result);
  reader.readAsText(file);
}

fileInput.addEventListener('change', (e) => {
  openFile(e.target.files[0]);
  fileInput.value = '';
});

container.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  container.classList.add('drag-over');
});

container.addEventListener('dragleave', () => {
  container.classList.remove('drag-over');
});

container.addEventListener('drop', (e) => {
  e.preventDefault();
  container.classList.remove('drag-over');
  const file = e.dataTransfer.files?.[0];
  if (file) openFile(file);
});

// Intro & toolbar buttons
document.getElementById('js-create-diagram').addEventListener('click', createNewDiagram);
document.getElementById('js-error-create').addEventListener('click', createNewDiagram);
document.getElementById('js-btn-new').addEventListener('click', createNewDiagram);
document.getElementById('js-sample-diagram').addEventListener('click', () => openDiagram(SAMPLE_DIAGRAM_XML));

document.getElementById('js-open-diagram').addEventListener('click', () => fileInput.click());
document.getElementById('js-error-open').addEventListener('click', () => fileInput.click());
document.getElementById('js-btn-open').addEventListener('click', () => fileInput.click());

document.getElementById('js-btn-undo').addEventListener('click', () => modeler.get('commandStack').undo());
document.getElementById('js-btn-redo').addEventListener('click', () => modeler.get('commandStack').redo());
document.getElementById('js-btn-fit').addEventListener('click', () => modeler.get('canvas').zoom('fit-viewport'));

document.getElementById('js-btn-shortcuts').addEventListener('click', () => shortcutsModal.classList.add('open'));
document.getElementById('js-shortcuts-close').addEventListener('click', () => shortcutsModal.classList.remove('open'));
shortcutsModal.addEventListener('click', (e) => {
  if (e.target === shortcutsModal) shortcutsModal.classList.remove('open');
});

document.getElementById('js-warnings-toggle').addEventListener('click', () => {
  alert(lastWarnings.map((w) => w.message || String(w)).join('\n\n'));
});
document.getElementById('js-warnings-close').addEventListener('click', () => {
  warningsBanner.classList.remove('visible');
});

// Global shortcuts Ctrl/Cmd+O and Ctrl/Cmd+S
window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {
    e.preventDefault();
    fileInput.click();
  } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    if (container.classList.contains('with-diagram')) {
      downloadLink.click();
    }
  }
});

// WebMCP Tools Registration
function appendActivity(source, message) {
  const item = document.createElement('div');
  item.className = `activity-item ${source}`;
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  item.textContent = `[${time}] ${message}`;
  activityLogEl.prepend(item);
  while (activityLogEl.children.length > 40) {
    activityLogEl.removeChild(activityLogEl.lastChild);
  }
}

const toolRegistry = createBpmnTools(modeler, {
  onDiagramReady: () => {
    setDiagramActive();
    updateDownloadLinks();
  },
  onToolExecuted: (ev) => {
    if (ev.ok) {
      appendActivity('agent', `Tool ${ev.name} (${ev.durationMs}ms)`);
    } else {
      appendActivity('error', `Tool ${ev.name} failed: ${ev.error}`);
    }
  }
});

// Populate WebMCP Inspector
const nativeTargets = toolRegistry.nativeTargets;
webmcpNativeStatus.textContent = nativeTargets.length > 0
  ? `Active (${nativeTargets.join(', ')})`
  : 'Polyfill/Bridge active (browser flag not enabled)';

document.getElementById('js-webmcp-label').textContent = `WebMCP (${toolRegistry.listTools().length} tools)`;

for (const tool of toolRegistry.listTools()) {
  const el = document.createElement('div');
  el.className = 'tool-item';
  el.innerHTML = `
    <div class="tool-item-header">
      <span>${tool.name}</span>
      <span style="font-size:10px;color:#6b7280;">${tool.annotations?.readOnlyHint ? 'READ' : 'WRITE'}</span>
    </div>
    <p>${tool.description}</p>
  `;
  webmcpToolsList.appendChild(el);
}

// Drawers toggle
webmcpBtn.addEventListener('click', () => {
  copilotDrawer.classList.remove('open');
  webmcpDrawer.classList.toggle('open');
});
webmcpClose.addEventListener('click', () => webmcpDrawer.classList.remove('open'));

copilotBtn.addEventListener('click', () => {
  webmcpDrawer.classList.remove('open');
  copilotDrawer.classList.toggle('open');
});
copilotClose.addEventListener('click', () => copilotDrawer.classList.remove('open'));

// Remote Agent Access (Interactive Copilot)
const remoteSession = new RemoteAgentSession({
  modeler,
  toolRegistry,
  onStatus: (status) => {
    copilotDot.className = 'status-dot';
    if (status.state === 'off') {
      copilotBtn.classList.remove('active');
      copilotLabel.textContent = 'Remote Agent: Off';
      copilotToggle.textContent = 'Enable Remote Agent Access';
      copilotToggle.classList.add('btn-primary');
      sessionPanel.classList.add('hidden');
    } else if (status.state === 'connecting') {
      copilotDot.classList.add('waiting');
      copilotLabel.textContent = 'Connecting...';
      copilotToggle.disabled = true;
    } else if (status.state === 'waiting') {
      copilotToggle.disabled = false;
      copilotBtn.classList.add('active');
      copilotDot.classList.add('waiting');
      copilotLabel.textContent = `Session: ${status.sessionId}`;
      copilotToggle.textContent = 'Disable Remote Agent Access';
      copilotToggle.classList.remove('btn-primary');
      sessionPanel.classList.remove('hidden');
      sessionIdEl.textContent = status.sessionId;
      sessionStatusEl.textContent = `Waiting for agent on ${status.brokerUrl}...`;
    } else if (status.state === 'connected') {
      copilotBtn.classList.add('active');
      copilotDot.classList.add('connected');
      copilotLabel.textContent = `Connected: ${status.sessionId}`;
      sessionStatusEl.textContent = `${status.agentName || 'AI Agent'} connected & syncing live!`;
    } else if (status.state === 'error' || status.state === 'disconnected') {
      copilotToggle.disabled = false;
      copilotDot.classList.add('error');
      copilotLabel.textContent = 'Remote Agent: Error';
      sessionStatusEl.textContent = status.error || 'Disconnected from relay.';
    }
  },
  onActivity: ({ source, message }) => {
    appendActivity(source, message);
  }
});

copilotToggle.addEventListener('click', async () => {
  if (remoteSession.active) {
    remoteSession.disable();
  } else {
    try {
      await remoteSession.enable(relayUrlInput.value);
    } catch (err) {
      alert(`Could not enable remote agent access: ${err.message}`);
    }
  }
});

function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  });
}

document.getElementById('js-copy-session').addEventListener('click', (e) => {
  copyText(sessionIdEl.textContent, e.currentTarget);
});

document.getElementById('js-copy-prompt').addEventListener('click', (e) => {
  const sid = sessionIdEl.textContent;
  const prompt = `Connect to my live BPMN diagram session "${sid}" using the bpmn-mcp-companion tools (get_diagram_summary / build_process / add_element / connect_elements / update_element / delete_elements / export_xml) and help me edit it.`;
  copyText(prompt, e.currentTarget);
});

document.getElementById('js-copy-mcp-config').addEventListener('click', (e) => {
  const config = JSON.stringify({
    mcpServers: {
      'bpmn-js-companion': {
        command: 'node',
        args: ['mcp-server/index.mjs']
      }
    }
  }, null, 2);
  copyText(config, e.currentTarget);
});
