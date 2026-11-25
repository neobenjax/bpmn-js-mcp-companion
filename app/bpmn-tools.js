/**
 * BPMN-JS WebMCP Tool Definitions
 * Registers bpmn-js modeler capabilities as standard WebMCP tools via navigator.modelContext.
 */

const EMPTY_PROCESS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  targetNamespace="http://bpmn.io/schema/bpmn"
  id="Definitions_1">
  <bpmn:process id="Process_1" isExecutable="false" />
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1" />
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

function normalizeBpmnType(type) {
  if (!type) return 'bpmn:Task';
  if (type.includes(':')) return type;
  return `bpmn:${type}`;
}

function serializeElement(el) {
  const bo = el.businessObject || {};
  const isConnection = Array.isArray(el.waypoints);
  const base = {
    id: el.id,
    type: el.type,
    name: bo.name || undefined,
    parentId: el.parent?.id || undefined
  };

  if (isConnection) {
    return {
      ...base,
      kind: 'connection',
      sourceId: el.source?.id,
      targetId: el.target?.id,
      waypoints: el.waypoints.map((w) => ({ x: Math.round(w.x), y: Math.round(w.y) }))
    };
  }

  return {
    ...base,
    kind: el.type === 'label' ? 'label' : 'shape',
    x: Math.round(el.x || 0),
    y: Math.round(el.y || 0),
    width: Math.round(el.width || 0),
    height: Math.round(el.height || 0),
    incoming: (el.incoming || []).map((c) => c.id),
    outgoing: (el.outgoing || []).map((c) => c.id)
  };
}

function computeLayeredLayout(nodes, flows) {
  const nodeMap = new Map(nodes.map((n) => [ n.id, n ]));
  const inDegree = new Map(nodes.map((n) => [ n.id, 0 ]));
  const adj = new Map(nodes.map((n) => [ n.id, [] ]));

  for (const f of flows || []) {
    if (nodeMap.has(f.from) && nodeMap.has(f.to)) {
      adj.get(f.from).push(f.to);
      inDegree.set(f.to, (inDegree.get(f.to) || 0) + 1);
    }
  }

  const layerOf = new Map();
  const queue = [];
  for (const n of nodes) {
    if ((inDegree.get(n.id) || 0) === 0) {
      layerOf.set(n.id, 0);
      queue.push(n.id);
    }
  }
  if (queue.length === 0 && nodes.length > 0) {
    layerOf.set(nodes[0].id, 0);
    queue.push(nodes[0].id);
  }

  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];
    const currLayer = layerOf.get(curr) || 0;
    for (const next of adj.get(curr) || []) {
      const nextLayer = Math.max(layerOf.get(next) || 0, currLayer + 1);
      if (!layerOf.has(next) || nextLayer > layerOf.get(next)) {

        // guard against cycles
        if (nextLayer <= nodes.length) {
          layerOf.set(next, nextLayer);
          queue.push(next);
        }
      }
    }
  }

  for (const n of nodes) {
    if (!layerOf.has(n.id)) layerOf.set(n.id, 0);
  }

  const layers = new Map();
  for (const n of nodes) {
    const l = layerOf.get(n.id);
    if (!layers.has(l)) layers.set(l, []);
    layers.get(l).push(n);
  }

  const coords = new Map();
  const baseX = 180;
  const stepX = 190;
  const centerY = 240;
  const stepY = 120;

  for (const [ layerIdx, layerNodes ] of layers.entries()) {
    const count = layerNodes.length;
    layerNodes.forEach((n, idx) => {
      const yOffset = (idx - (count - 1) / 2) * stepY;
      coords.set(n.id, {
        x: typeof n.x === 'number' ? n.x : baseX + layerIdx * stepX,
        y: typeof n.y === 'number' ? n.y : Math.round(centerY + yOffset)
      });
    });
  }

  return coords;
}

export function registerBpmnTools(modeler, hooks = {}) {
  const notifyDiagramReady = hooks.onDiagramReady || (() => {});

  const tools = [
    {
      name: 'bpmn_create_diagram',
      description: 'Create a new BPMN 2.0 diagram with a single StartEvent, replacing the current canvas.',
      inputSchema: {
        type: 'object',
        properties: {}
      },
      execute: async () => {
        const res = await modeler.createDiagram();
        notifyDiagramReady();
        return { ok: true, warnings: res.warnings || [] };
      }
    },
    {
      name: 'bpmn_import_xml',
      description: 'Import a complete BPMN 2.0 XML string into the modeler.',
      inputSchema: {
        type: 'object',
        properties: {
          xml: { type: 'string', description: 'Valid BPMN 2.0 XML document' }
        },
        required: [ 'xml' ]
      },
      execute: async ({ xml }) => {
        const res = await modeler.importXML(xml);
        const canvas = modeler.get('canvas');
        canvas.zoom('fit-viewport');
        notifyDiagramReady();
        return { ok: true, warnings: res.warnings || [] };
      }
    },
    {
      name: 'bpmn_export_xml',
      description: 'Export the current BPMN 2.0 diagram as formatted XML.',
      inputSchema: {
        type: 'object',
        properties: {
          format: { type: 'boolean', description: 'Pretty-print XML (default true)' }
        }
      },
      annotations: { readOnlyHint: true },
      execute: async ({ format = true } = {}) => {
        const { xml } = await modeler.saveXML({ format });
        return { ok: true, xml };
      }
    },
    {
      name: 'bpmn_export_svg',
      description: 'Export the current BPMN 2.0 diagram as an SVG string.',
      inputSchema: {
        type: 'object',
        properties: {}
      },
      annotations: { readOnlyHint: true },
      execute: async () => {
        const { svg } = await modeler.saveSVG();
        return { ok: true, svg };
      }
    },
    {
      name: 'bpmn_get_diagram_summary',
      description: 'Get a structured JSON summary of all shapes, connections, labels, and bounds currently in the BPMN diagram.',
      inputSchema: {
        type: 'object',
        properties: {}
      },
      annotations: { readOnlyHint: true },
      execute: async () => {
        const elementRegistry = modeler.get('elementRegistry');
        const canvas = modeler.get('canvas');
        const root = canvas.getRootElement();
        const all = elementRegistry.getAll();
        const elements = all
          .filter((el) => el !== root && el.type !== 'label')
          .map(serializeElement);
        return {
          ok: true,
          rootId: root?.id,
          rootType: root?.type,
          count: elements.length,
          elements
        };
      }
    },
    {
      name: 'bpmn_add_element',
      description: 'Add a BPMN element (e.g. bpmn:Task, bpmn:UserTask, bpmn:ServiceTask, bpmn:ExclusiveGateway, bpmn:ParallelGateway, bpmn:StartEvent, bpmn:EndEvent) to the diagram. Can auto-place and connect from sourceElementId.',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'BPMN element type (e.g. bpmn:UserTask, bpmn:ExclusiveGateway, bpmn:EndEvent)' },
          id: { type: 'string', description: 'Optional custom element ID' },
          name: { type: 'string', description: 'Label / name for the element' },
          x: { type: 'number', description: 'X coordinate (center)' },
          y: { type: 'number', description: 'Y coordinate (center)' },
          parentId: { type: 'string', description: 'Optional parent container ID (defaults to root process/plane)' },
          sourceElementId: { type: 'string', description: 'Optional existing element ID to auto-place after and connect from' },
          connectFromSource: { type: 'boolean', description: 'Connect from sourceElementId with SequenceFlow (default true when sourceElementId is set)' },
          flowName: { type: 'string', description: 'Optional label for the connecting sequence flow' }
        },
        required: [ 'type' ]
      },
      execute: async (args) => {
        const elementFactory = modeler.get('elementFactory');
        const elementRegistry = modeler.get('elementRegistry');
        const modeling = modeler.get('modeling');
        const canvas = modeler.get('canvas');
        const autoPlace = modeler.get('autoPlace', false);

        const bpmnType = normalizeBpmnType(args.type);
        const shapeOptions = { type: bpmnType };
        if (args.id) shapeOptions.id = args.id;

        const shape = elementFactory.createShape(shapeOptions);
        if (args.name) {
          shape.businessObject.name = args.name;
        }

        let created;
        const source = args.sourceElementId ? elementRegistry.get(args.sourceElementId) : null;

        if (source && typeof args.x !== 'number' && typeof args.y !== 'number' && autoPlace) {
          created = autoPlace.append(source, shape);
          if (args.flowName && created.incoming?.length) {
            const lastFlow = created.incoming[created.incoming.length - 1];
            modeling.updateLabel(lastFlow, args.flowName);
          }
        } else {
          const parent = (args.parentId && elementRegistry.get(args.parentId)) || canvas.getRootElement();
          const pos = {
            x: typeof args.x === 'number' ? args.x : (source ? source.x + (source.width || 100) + 110 : 250),
            y: typeof args.y === 'number' ? args.y : (source ? source.y + (source.height || 80) / 2 : 200)
          };
          created = modeling.createShape(shape, pos, parent);
          if (source && args.connectFromSource !== false) {
            const flow = modeling.connect(source, created);
            if (args.flowName) {
              modeling.updateLabel(flow, args.flowName);
            }
          }
        }

        notifyDiagramReady();
        return { ok: true, element: serializeElement(created) };
      }
    },
    {
      name: 'bpmn_connect_elements',
      description: 'Connect two existing BPMN elements with a SequenceFlow, MessageFlow, or Association.',
      inputSchema: {
        type: 'object',
        properties: {
          sourceId: { type: 'string', description: 'Source element ID' },
          targetId: { type: 'string', description: 'Target element ID' },
          type: { type: 'string', description: 'Optional connection type (e.g. bpmn:SequenceFlow, bpmn:MessageFlow, bpmn:Association)' },
          name: { type: 'string', description: 'Optional label / condition text on the connection' }
        },
        required: [ 'sourceId', 'targetId' ]
      },
      execute: async ({ sourceId, targetId, type, name }) => {
        const elementRegistry = modeler.get('elementRegistry');
        const modeling = modeler.get('modeling');
        const source = elementRegistry.get(sourceId);
        const target = elementRegistry.get(targetId);
        if (!source) throw new Error(`Source element not found: ${sourceId}`);
        if (!target) throw new Error(`Target element not found: ${targetId}`);

        const attrs = type ? { type: normalizeBpmnType(type) } : undefined;
        const conn = modeling.connect(source, target, attrs);
        if (name) {
          modeling.updateLabel(conn, name);
        }
        notifyDiagramReady();
        return { ok: true, connection: serializeElement(conn) };
      }
    },
    {
      name: 'bpmn_update_element',
      description: 'Update an element label, businessObject properties, position (dx/dy or x/y), or dimensions.',
      inputSchema: {
        type: 'object',
        properties: {
          elementId: { type: 'string', description: 'ID of the element to update' },
          name: { type: 'string', description: 'New label/name' },
          properties: { type: 'object', description: 'Key-value properties to set on the BPMN businessObject' },
          x: { type: 'number', description: 'New top-left X coordinate' },
          y: { type: 'number', description: 'New top-left Y coordinate' },
          width: { type: 'number', description: 'New width' },
          height: { type: 'number', description: 'New height' }
        },
        required: [ 'elementId' ]
      },
      execute: async ({ elementId, name, properties, x, y, width, height }) => {
        const elementRegistry = modeler.get('elementRegistry');
        const modeling = modeler.get('modeling');
        const el = elementRegistry.get(elementId);
        if (!el) throw new Error(`Element not found: ${elementId}`);

        if (typeof name === 'string') {
          modeling.updateLabel(el, name);
        }
        if (properties && typeof properties === 'object') {
          modeling.updateProperties(el, properties);
        }
        if (typeof x === 'number' || typeof y === 'number') {
          const dx = typeof x === 'number' ? x - (el.x || 0) : 0;
          const dy = typeof y === 'number' ? y - (el.y || 0) : 0;
          if (dx !== 0 || dy !== 0) {
            modeling.moveElements([ el ], { x: dx, y: dy });
          }
        }
        if (typeof width === 'number' || typeof height === 'number') {
          modeling.resizeShape(el, {
            x: el.x,
            y: el.y,
            width: typeof width === 'number' ? width : el.width,
            height: typeof height === 'number' ? height : el.height
          });
        }
        notifyDiagramReady();
        return { ok: true, element: serializeElement(elementRegistry.get(el.id) || el) };
      }
    },
    {
      name: 'bpmn_delete_elements',
      description: 'Delete one or more BPMN elements by their IDs.',
      inputSchema: {
        type: 'object',
        properties: {
          elementIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of element IDs to remove'
          }
        },
        required: [ 'elementIds' ]
      },
      execute: async ({ elementIds }) => {
        const elementRegistry = modeler.get('elementRegistry');
        const modeling = modeler.get('modeling');
        const elements = (elementIds || [])
          .map((id) => elementRegistry.get(id))
          .filter(Boolean);
        if (elements.length === 0) {
          return { ok: false, error: 'No matching elements found' };
        }
        modeling.removeElements(elements);
        notifyDiagramReady();
        return { ok: true, removedIds: elements.map((e) => e.id) };
      }
    },
    {
      name: 'bpmn_replace_element',
      description: 'Morph/replace an existing element with a different BPMN type (e.g. bpmn:Task -> bpmn:UserTask).',
      inputSchema: {
        type: 'object',
        properties: {
          elementId: { type: 'string', description: 'Element ID to replace' },
          newType: { type: 'string', description: 'Target BPMN type (e.g. bpmn:ServiceTask, bpmn:ParallelGateway)' }
        },
        required: [ 'elementId', 'newType' ]
      },
      execute: async ({ elementId, newType }) => {
        const elementRegistry = modeler.get('elementRegistry');
        const bpmnReplace = modeler.get('bpmnReplace');
        const el = elementRegistry.get(elementId);
        if (!el) throw new Error(`Element not found: ${elementId}`);
        const replaced = bpmnReplace.replaceElement(el, { type: normalizeBpmnType(newType) });
        notifyDiagramReady();
        return { ok: true, element: serializeElement(replaced) };
      }
    },
    {
      name: 'bpmn_undo',
      description: 'Undo the last modeling action in the BPMN editor.',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => {
        const commandStack = modeler.get('commandStack');
        if (!commandStack.canUndo()) return { ok: false, message: 'Nothing to undo' };
        commandStack.undo();
        return { ok: true };
      }
    },
    {
      name: 'bpmn_redo',
      description: 'Redo the last undone modeling action in the BPMN editor.',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => {
        const commandStack = modeler.get('commandStack');
        if (!commandStack.canRedo()) return { ok: false, message: 'Nothing to redo' };
        commandStack.redo();
        return { ok: true };
      }
    },
    {
      name: 'bpmn_zoom_fit',
      description: 'Fit the BPMN diagram to the viewport or set a specific zoom level.',
      inputSchema: {
        type: 'object',
        properties: {
          level: { type: 'string', description: 'Zoom level: "fit-viewport" (default) or numeric string like "1.0"' }
        }
      },
      execute: async ({ level = 'fit-viewport' } = {}) => {
        const canvas = modeler.get('canvas');
        const numeric = Number(level);
        const target = level === 'fit-viewport' || Number.isNaN(numeric) ? 'fit-viewport' : numeric;
        const newZoom = canvas.zoom(target);
        return { ok: true, zoom: newZoom };
      }
    },
    {
      name: 'bpmn_build_process',
      description: 'Build a complete BPMN process from a list of nodes and flows with automatic left-to-right layout.',
      inputSchema: {
        type: 'object',
        properties: {
          clearExisting: { type: 'boolean', description: 'Clear existing diagram before building (default true)' },
          nodes: {
            type: 'array',
            description: 'List of BPMN nodes to create',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                type: { type: 'string', description: 'e.g. bpmn:StartEvent, bpmn:UserTask, bpmn:ServiceTask, bpmn:ExclusiveGateway, bpmn:EndEvent' },
                name: { type: 'string' },
                x: { type: 'number' },
                y: { type: 'number' }
              },
              required: [ 'id', 'type' ]
            }
          },
          flows: {
            type: 'array',
            description: 'Sequence flows connecting nodes by their IDs',
            items: {
              type: 'object',
              properties: {
                from: { type: 'string' },
                to: { type: 'string' },
                name: { type: 'string' }
              },
              required: [ 'from', 'to' ]
            }
          }
        },
        required: [ 'nodes' ]
      },
      execute: async ({ clearExisting = true, nodes = [], flows = [] }) => {
        if (clearExisting) {
          await modeler.importXML(EMPTY_PROCESS_XML);
        }

        const elementFactory = modeler.get('elementFactory');
        const elementRegistry = modeler.get('elementRegistry');
        const modeling = modeler.get('modeling');
        const canvas = modeler.get('canvas');
        const root = canvas.getRootElement();

        const coords = computeLayeredLayout(nodes, flows);
        const createdShapes = new Map();

        for (const n of nodes) {
          const pos = coords.get(n.id);
          const shape = elementFactory.createShape({
            id: n.id,
            type: normalizeBpmnType(n.type)
          });
          if (n.name) {
            shape.businessObject.name = n.name;
          }
          const created = modeling.createShape(shape, pos, root);
          createdShapes.set(n.id, created);
        }

        const createdFlows = [];
        for (const f of flows) {
          const src = createdShapes.get(f.from) || elementRegistry.get(f.from);
          const dst = createdShapes.get(f.to) || elementRegistry.get(f.to);
          if (src && dst) {
            const conn = modeling.connect(src, dst);
            if (f.name) {
              modeling.updateLabel(conn, f.name);
            }
            createdFlows.push(serializeElement(conn));
          }
        }

        canvas.zoom('fit-viewport');
        notifyDiagramReady();

        return {
          ok: true,
          nodesCreated: createdShapes.size,
          flowsCreated: createdFlows.length,
          elements: Array.from(createdShapes.values()).map(serializeElement)
        };
      }
    }
  ];

  if (typeof navigator !== 'undefined' && navigator.modelContext?.registerTool) {
    for (const tool of tools) {
      navigator.modelContext.registerTool(tool);
    }
  }

  return tools;
}
