/**
 * Lightweight WebMCP (navigator.modelContext) polyfill and interceptor.
 * Ensures registerTool() works across all browsers (Chrome, Firefox, Brave, Edge, Safari)
 * while forwarding to native navigator.modelContext / document.modelContext when available.
 */

const registeredTools = new Map();
const toolChangeListeners = new Set();
const toolExecListeners = new Set();

let nativeTargets = [];
let installed = false;

function notifyToolsChanged() {
  for (const fn of toolChangeListeners) {
    try {
      fn(listRegisteredTools());
    } catch (err) {
      console.error('[webmcp-bridge] toolChange listener error:', err);
    }
  }
}

function notifyToolExecuted(event) {
  for (const fn of toolExecListeners) {
    try {
      fn(event);
    } catch (err) {
      console.error('[webmcp-bridge] toolExec listener error:', err);
    }
  }
}

function wrapTool(toolDef) {
  return {
    name: toolDef.name,
    description: toolDef.description || '',
    inputSchema: toolDef.inputSchema || { type: 'object', properties: {} },
    ...(toolDef.annotations ? { annotations: toolDef.annotations } : {}),
    execute: async (args = {}) => {
      const start = performance.now();
      try {
        const result = await toolDef.execute(args);
        notifyToolExecuted({
          name: toolDef.name,
          args,
          result,
          durationMs: Math.round(performance.now() - start),
          ok: true
        });
        return result;
      } catch (err) {
        notifyToolExecuted({
          name: toolDef.name,
          args,
          error: err?.message || String(err),
          durationMs: Math.round(performance.now() - start),
          ok: false
        });
        throw err;
      }
    }
  };
}

function patchModelContext(ctx, label) {
  if (!ctx || typeof ctx.registerTool !== 'function') {
    return false;
  }

  const originalRegister = ctx.registerTool.bind(ctx);
  nativeTargets.push(label);

  ctx.registerTool = (toolDef) => {
    const wrapped = wrapTool(toolDef);
    registeredTools.set(wrapped.name, wrapped);
    notifyToolsChanged();
    return originalRegister({
      name: wrapped.name,
      description: wrapped.description,
      inputSchema: wrapped.inputSchema,
      ...(wrapped.annotations ? { annotations: wrapped.annotations } : {}),
      execute: wrapped.execute
    });
  };

  return true;
}

export function installWebMcpPolyfill() {
  if (installed) {
    return { nativeTargets: [ ...nativeTargets ] };
  }
  installed = true;
  nativeTargets = [];

  if (typeof navigator !== 'undefined') {
    if (navigator.modelContext && typeof navigator.modelContext.registerTool === 'function') {
      patchModelContext(navigator.modelContext, 'navigator.modelContext');
    } else {
      const polyfillCtx = {
        registerTool: (toolDef) => {
          const wrapped = wrapTool(toolDef);
          registeredTools.set(wrapped.name, wrapped);
          notifyToolsChanged();
        }
      };

      try {
        Object.defineProperty(navigator, 'modelContext', {
          value: polyfillCtx,
          configurable: true,
          writable: true
        });
      } catch {
        navigator.modelContext = polyfillCtx;
      }
    }
  }

  if (typeof document !== 'undefined' && document.modelContext && typeof document.modelContext.registerTool === 'function') {
    patchModelContext(document.modelContext, 'document.modelContext');
  }

  return { nativeTargets: [ ...nativeTargets ] };
}

export function listRegisteredTools() {
  return Array.from(registeredTools.values()).map(({ name, description, inputSchema, annotations }) => ({
    name,
    description,
    inputSchema,
    annotations
  }));
}

export async function executeRegisteredTool(name, args = {}) {
  const tool = registeredTools.get(name);
  if (!tool) {
    throw new Error(`Unknown WebMCP tool: ${name}`);
  }
  const parsedArgs = typeof args === 'string' ? JSON.parse(args || '{}') : args;
  return tool.execute(parsedArgs);
}

export function onToolsChanged(fn) {
  toolChangeListeners.add(fn);
  return () => toolChangeListeners.delete(fn);
}

export function onToolExecuted(fn) {
  toolExecListeners.add(fn);
  return () => toolExecListeners.delete(fn);
}

export function getNativeTargets() {
  return [ ...nativeTargets ];
}
