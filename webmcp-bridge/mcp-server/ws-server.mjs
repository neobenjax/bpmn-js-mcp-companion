/* eslint-disable no-bitwise */
/**
 * Zero-dependency RFC 6455 WebSocket server bound strictly to 127.0.0.1.
 * Authenticates browser connections using a 256-bit pairing token.
 */

import http from 'node:http';
import crypto from 'node:crypto';

const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function encodeFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  let header;

  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  return Buffer.concat([ header, payload ]);
}

function decodeFrames(buffer, onMessage, onClose) {
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const firstByte = buffer[offset];
    const secondByte = buffer[offset + 1];
    const opcode = firstByte & 0x0f;
    const masked = (secondByte & 0x80) !== 0;
    let payloadLen = secondByte & 0x7f;
    let cursor = offset + 2;

    if (payloadLen === 126) {
      if (cursor + 2 > buffer.length) break;
      payloadLen = buffer.readUInt16BE(cursor);
      cursor += 2;
    } else if (payloadLen === 127) {
      if (cursor + 8 > buffer.length) break;
      payloadLen = Number(buffer.readBigUInt64BE(cursor));
      cursor += 8;
    }

    const maskLen = masked ? 4 : 0;
    if (cursor + maskLen + payloadLen > buffer.length) break;

    let payload = buffer.subarray(cursor + maskLen, cursor + maskLen + payloadLen);
    if (masked) {
      const mask = buffer.subarray(cursor, cursor + 4);
      const unmasked = Buffer.allocUnsafe(payloadLen);
      for (let i = 0; i < payloadLen; i++) {
        unmasked[i] = payload[i] ^ mask[i % 4];
      }
      payload = unmasked;
    }

    offset = cursor + maskLen + payloadLen;

    if (opcode === 0x8) {
      onClose();
      return buffer.subarray(offset);
    }
    if (opcode === 0x1 || opcode === 0x2) {
      onMessage(payload.toString('utf8'));
    }
  }

  return buffer.subarray(offset);
}

function tokensEqual(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function createLocalWsBridgeServer({ port = 49271, expectedToken = null } = {}) {
  const clients = new Map();
  const pendingRequests = new Map();
  let activeToken = expectedToken;

  const server = http.createServer((req, res) => {
    res.writeHead(426, { 'Content-Type': 'text/plain' });
    res.end('WebSocket upgrade required');
  });

  server.on('upgrade', (req, socket) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const token = url.searchParams.get('token');
    const wsKey = req.headers['sec-websocket-key'];

    if (!wsKey || !token || token.length < 16) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    if (activeToken && !tokensEqual(token, activeToken)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    const accept = crypto
      .createHash('sha1')
      .update(wsKey + WS_MAGIC)
      .digest('base64');

    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '\r\n'
    ].join('\r\n'));

    const existing = clients.get(token);
    if (existing) {
      try { existing.destroy(); } catch { /* ignore */ }
    }
    clients.set(token, socket);

    let rx = Buffer.alloc(0);

    socket.on('data', (chunk) => {
      rx = Buffer.concat([ rx, chunk ]);
      rx = decodeFrames(
        rx,
        (text) => {
          let msg;
          try {
            msg = JSON.parse(text);
          } catch {
            return;
          }
          const waiter = pendingRequests.get(msg.requestId);
          if (waiter) {
            pendingRequests.delete(msg.requestId);
            clearTimeout(waiter.timer);
            if (msg.ok) {
              waiter.resolve(msg.result);
            } else {
              waiter.reject(new Error(msg.error || 'Browser tool execution failed'));
            }
          }
        },
        () => {
          if (clients.get(token) === socket) {
            clients.delete(token);
          }
          socket.destroy();
        }
      );
    });

    socket.on('close', () => {
      if (clients.get(token) === socket) {
        clients.delete(token);
      }
    });

    socket.on('error', () => {
      if (clients.get(token) === socket) {
        clients.delete(token);
      }
    });
  });

  server.listen(port, '127.0.0.1');

  return {
    setExpectedToken(token) {
      activeToken = token;
      for (const [ tok, sock ] of clients.entries()) {
        if (!tokensEqual(tok, token)) {
          try { sock.destroy(); } catch { /* ignore */ }
          clients.delete(tok);
        }
      }
    },

    getActiveToken() {
      return activeToken;
    },

    hasConnectedClient(token = activeToken) {
      if (!token) return false;
      for (const tok of clients.keys()) {
        if (tokensEqual(tok, token)) return true;
      }
      return false;
    },

    sendCommand(action, params = {}, timeoutMs = 15000) {
      if (!activeToken) {
        return Promise.reject(new Error('No pairing token set. Call webmcp_pair(token) first or set WEBMCP_TOKEN.'));
      }

      let targetSocket = null;
      for (const [ tok, sock ] of clients.entries()) {
        if (tokensEqual(tok, activeToken)) {
          targetSocket = sock;
          break;
        }
      }

      if (!targetSocket || targetSocket.destroyed) {
        return Promise.reject(new Error('Browser session is not connected. Enable Agent Bridge in your browser tab.'));
      }

      const requestId = `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingRequests.delete(requestId);
          reject(new Error('Timeout waiting for browser session to respond.'));
        }, timeoutMs);

        pendingRequests.set(requestId, { resolve, reject, timer });
        targetSocket.write(encodeFrame(JSON.stringify({ requestId, action, params })));
      });
    },

    close() {
      for (const sock of clients.values()) {
        try { sock.destroy(); } catch { /* ignore */ }
      }
      clients.clear();
      server.close();
    }
  };
}
