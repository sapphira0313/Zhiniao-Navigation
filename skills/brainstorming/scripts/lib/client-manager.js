const { OPCODES, encodeFrame } = require('./ws-protocol');
const { Logger } = require('./logger');

const logger = new Logger('client-manager');

class ClientManager {
  constructor() {
    this.clients = new Set();
  }

  add(client) {
    this.clients.add(client);
  }

  remove(client) {
    this.clients.delete(client);
  }

  broadcast(message) {
    const frame = encodeFrame(OPCODES.TEXT, Buffer.from(JSON.stringify(message)));
    let successful = 0;
    let failed = 0;
    
    for (const socket of this.clients) {
      try {
        socket.write(frame);
        successful++;
      } catch (e) {
        failed++;
        this.clients.delete(socket);
      }
    }
    
    if (failed > 0) {
      logger.debug('Broadcast completed', { successful, failed, total: this.clients.size });
    }
  }

  getClientCount() {
    return this.clients.size;
  }

  closeAll(code = 1000, reason = '') {
    const closeBuf = Buffer.alloc(2 + reason.length);
    closeBuf.writeUInt16BE(code, 0);
    closeBuf.write(reason, 2);
    
    const closeFrame = encodeFrame(OPCODES.CLOSE, closeBuf);
    
    for (const socket of this.clients) {
      try {
        socket.end(closeFrame);
      } catch (e) {
        // Ignore errors during cleanup
      }
    }
    
    const count = this.clients.size;
    this.clients.clear();
    logger.info('Closed all clients', { count });
  }
}

module.exports = { ClientManager };