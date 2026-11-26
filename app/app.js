import { mountWebMcpBridge } from './webmcp-bridge/browser/index.js';
import { registerBpmnTools } from './bpmn-tools.js';
import { SAMPLE_DIAGRAM_XML } from './sample-diagram.js';

const BpmnModeler = window.BpmnJS;

const container = document.getElementById('js-drop-zone');
const canvasEl = document.getElementById('js-canvas');
const fileInput = document.getElementById('js-file-input');
const errorDetailsEl = document.getElementById('js-error-details');
const warningsBanner = document.getElementById('js-warnings-banner');

const downloadLink = document.getElementById('js-download-diagram');
const downloadSvgLink = document.getElementById('js-download-svg');

const shortcutsModal = document.getElementById('js-shortcuts-modal');

const modeler = new BpmnModeler({
  container: canvasEl
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
  } catch { /* ignore */ }
  try {
    const { svg } = await modeler.saveSVG();
    downloadSvgLink.href = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  } catch { /* ignore */ }
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

// Mount generic WebMCP Bridge & register BPMN tools
mountWebMcpBridge();

registerBpmnTools(modeler, {
  onDiagramReady: () => {
    setDiagramActive();
    updateDownloadLinks();
  }
});
