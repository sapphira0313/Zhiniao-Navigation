const { OPCODES, computeAcceptKey, decodeFrame, encodeFrame } = require('./ws-protocol');
const { parseJsonMessage } = require('./validation');
const { Logger } = require('./logger');

const logger = new Logger('ws-handler');

function createUpgradeHandler(clientManager, onActivity, onMessage) {
  return function handleUpgrade(req, socket) {
    const key = req.headers['sec-websocket-key'];
    if (!key) { 
      socket.destroy(); 
      logger.debug('Rejected connection: missing WebSocket key');
      return; 
    }

    const accept = computeAcceptKey(key);
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
    );

    let buffer = Buffer.alloc(0);
    clientManager.add(socket);
    logger.debug('Client connected', { clientCount: clientManager.getClientCount() });

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length > 0) {
        let result;
        try {
          result = decodeFrame(buffer);
        } catch (e) {
          logger.error('Frame decode error', { error: e.message });
          socket.end(encodeFrame(OPCODES.CLOSE, Buffer.alloc(0)));
          clientManager.remove(socket);
          return;
        }
        if (!result) break;
        buffer = buffer.slice(result.bytesConsumed);

        switch (result.opcode) {
          case OPCODES.TEXT:
            handleTextMessage(result.payload.toString());
            break;
          case OPCODES.CLOSE:
            socket.end(encodeFrame(OPCODES.CLOSE, Buffer.alloc(0)));
            clientManager.remove(socket);
            return;
          case OPCODES.PING:
            socket.write(encodeFrame(OPCODES.PONG, result.payload));
            break;
          case OPCODES.PONG:
            break;
          default: {
            logger.warn('Unknown opcode received', { opcode: result.opcode });
            const closeBuf = Buffer.alloc(2);
            closeBuf.writeUInt16BE(1003);
            socket.end(encodeFrame(OPCODES.CLOSE, closeBuf));
            clientManager.remove(socket);
            return;
          }
        }
      }
    });

    socket.on('close', () => {
      clientManager.remove(socket);
      logger.debug('Client disconnected', { clientCount: clientManager.getClientCount() });
    });
    
    socket.on('error', (err) => {
      logger.error('Socket error', { error: err.message });
      clientManager.remove(socket);
    });

    function handleTextMessage(text) {
      const parsed = parseJsonMessage(text);
      if (!parsed.success) {
        logger.warn('Invalid WebSocket message', { error: parsed.error });
        return;
      }

      if (onActivity) onActivity();
      logger.debug('User event received', { type: parsed.event.type });
      
      if (onMessage) {
        try {
          onMessage(parsed.event);
        } catch (e) {
          logger.error('Error handling message', { error: e.message });
        }
      }
    }
  };
}

module.exports = { createUpgradeHandler };