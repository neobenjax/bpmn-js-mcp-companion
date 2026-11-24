import { MqttWsClient } from './mqtt-ws.js';

const DEFAULT_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt'
];

export function generateSessionId() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `bpmn-${hex}`;
}

export class RemoteAgentSession {
  constructor({ modeler, toolRegistry, onStatus, onActivity }) {
    this.modeler = modeler;
    this.toolRegistry = toolRegistry;
    this.onStatus = onStatus || (() => {});
    this.onActivity = onActivity || (() => {});

    this.sessionId = null;
    this.brokerUrl = DEFAULT_BROKERS[0];
    this.client = null;
    this.active = false;
    this.agentConnected = false;
    this.version = 0;
    this._suppressNextChange = false;
    this._onCommandStackChanged = this._onCommandStackChanged.bind(this);
    this._onImportDone = this._onImportDone.bind(this);
  }

  async enable(customBrokerUrl) {
    if (this.active) return this.sessionId;

    this.sessionId = generateSessionId();
    const candidates = customBrokerUrl
      ? [customBrokerUrl.trim()]
      : DEFAULT_BROKERS;

    this.onStatus({ state: 'connecting', sessionId: this.sessionId });

    let lastErr = null;
    for (const url of candidates) {
      try {
        const client = new MqttWsClient(url, {
          clientId: `browser_${this.sessionId}_${Math.random().toString(36).slice(2, 6)}`
        });
        await client.connect();
        this.client = client;
        this.brokerUrl = url;
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
      }
    }

    if (!this.client) {
      this.onStatus({
        state: 'error',
        sessionId: this.sessionId,
        error: lastErr?.message || 'Could not connect to relay broker'
      });
      throw lastErr || new Error('Could not connect to relay broker');
    }

    this.active = true;
    this.agentConnected = false;

    const cmdTopic = `bpmn-mcp/session/${this.sessionId}/cmd`;
    this.client.subscribe(cmdTopic);

    this.client.on('message', (topic, payload) => {
      if (topic === cmdTopic) {
        this._handleCommand(payload);
      }
    });

    this.client.on('close', () => {
      if (this.active) {
        this.onStatus({ state: 'disconnected', sessionId: this.sessionId, brokerUrl: this.brokerUrl });
      }
    });

    this.modeler.on('commandStack.changed', this._onCommandStackChanged);
    this.modeler.on('import.done', this._onImportDone);

    this.onStatus({
      state: 'waiting',
      sessionId: this.sessionId,
      brokerUrl: this.brokerUrl
    });
    this.onActivity({
      source: 'system',
      message: `Session ${this.sessionId} started via ${this.brokerUrl}`
    });

    return this.sessionId;
  }

  disable() {
    this.active = false;
    this.agentConnected = false;
    this.modeler.off('commandStack.changed', this._onCommandStackChanged);
    this.modeler.off('import.done', this._onImportDone);
    if (this.client) {
      this.client.close();
      this.client = null;
    }
    this.onStatus({ state: 'off', sessionId: null });
    this.onActivity({ source: 'system', message: 'Remote agent access disabled.' });
  }

  _onCommandStackChanged() {
    if (this._suppressNextChange) return;
    this._publishStateEvent('user_edit');
  }

  _onImportDone() {
    if (this._suppressNextChange) return;
    this._publishStateEvent('diagram_imported');
  }

  _publishStateEvent(reason) {
    if (!this.active || !this.client?.connected) return;
    this.version += 1;
    const eventTopic = `bpmn-mcp/session/${this.sessionId}/events`;
    try {
      this.client.publish(eventTopic, JSON.stringify({
        type: 'state_changed',
        reason,
        version: this.version,
        timestamp: new Date().toISOString()
      }));
    } catch {}
  }

  async _handleCommand(rawPayload) {
    let msg;
    try {
      msg = JSON.parse(rawPayload);
    } catch {
      return;
    }

    const { requestId, action, params, agentName } = msg;
    if (!requestId) return;

    if (!this.agentConnected) {
      this.agentConnected = true;
      this.onStatus({
        state: 'connected',
        sessionId: this.sessionId,
        brokerUrl: this.brokerUrl,
        agentName: agentName || 'AI Agent'
      });
      this.onActivity({
        source: 'agent',
        message: `${agentName || 'AI Agent'} connected to session.`
      });
    }

    const resTopic = `bpmn-mcp/session/${this.sessionId}/res`;

    try {
      let result;
      if (action === 'ping') {
        result = { pong: true, sessionId: this.sessionId, version: this.version };
      } else if (action === 'list_tools') {
        result = { tools: this.toolRegistry.listTools() };
      } else if (action === 'call_tool') {
        const toolName = params?.name;
        const toolArgs = params?.args || {};
        this._suppressNextChange = true;
        try {
          result = await this.toolRegistry.executeTool(toolName, toolArgs);
        } finally {
          this._suppressNextChange = false;
        }
        this.version += 1;
        this.onActivity({
          source: 'agent',
          message: `Executed ${toolName}`
        });
      } else {
        throw new Error(`Unknown action: ${action}`);
      }

      this.client.publish(resTopic, JSON.stringify({
        requestId,
        ok: true,
        version: this.version,
        result
      }));
    } catch (err) {
      this.onActivity({
        source: 'error',
        message: `Agent command failed: ${err.message}`
      });
      this.client.publish(resTopic, JSON.stringify({
        requestId,
        ok: false,
        error: err.message || String(err)
      }));
    }
  }
}
