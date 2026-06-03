const http = require('http');
const fs = require('fs');
const path = require('path');

const {
  PORT,
  HOST,
  URL_HOST,
  CONTENT_DIR,
  STATE_DIR,
  ownerPid,
  IDLE_TIMEOUT_MS,
  LIFECYCLE_CHECK_INTERVAL_MS,
  DEBOUNCE_DELAY_MS
} = require('./lib/config');

const { OPCODES, computeAcceptKey, encodeFrame, decodeFrame } = require('./lib/ws-protocol');
const { ActivityTracker } = require('./lib/activity-tracker');
const { LifecycleManager } = require('./lib/lifecycle-manager');
const { ClientManager } = require('./lib/client-manager');
const { createRequestHandler } = require('./lib/http-handler');
const { createUpgradeHandler } = require('./lib/ws-handler');
const { ensureDir, getNewestFile, appendToFile, writeJsonFile, deleteFileIfExists } = require('./lib/file-utils');
const { Logger } = require('./lib/logger');

const logger = new Logger('brainstorming-server');

const frameTemplate = fs.readFileSync(path.join(__dirname, 'frame-template.html'), 'utf-8');
const helperScript = fs.readFileSync(path.join(__dirname, 'helper.js'), 'utf-8');

const debounceTimers = new Map();

function startServer() {
  ensureDir(CONTENT_DIR);
  ensureDir(STATE_DIR);

  const activityTracker = new ActivityTracker(IDLE_TIMEOUT_MS);
  const clientManager = new ClientManager();

  const knownFiles = new Set(
    fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.html'))
  );

  function handleEvent(event) {
    if (event.choice) {
      const eventsFile = path.join(STATE_DIR, 'events');
      appendToFile(eventsFile, JSON.stringify(event) + '\n');
    }
  }

  const requestHandler = createRequestHandler(
    CONTENT_DIR,
    frameTemplate,
    helperScript,
    () => activityTracker.touch()
  );

  const upgradeHandler = createUpgradeHandler(
    clientManager,
    () => activityTracker.touch(),
    handleEvent
  );

  const server = http.createServer(requestHandler);
  server.on('upgrade', upgradeHandler);

  const watcher = fs.watch(CONTENT_DIR, (eventType, filename) => {
    if (!filename || !filename.endsWith('.html')) return;

    if (debounceTimers.has(filename)) clearTimeout(debounceTimers.get(filename));
    debounceTimers.set(filename, setTimeout(() => {
      debounceTimers.delete(filename);
      const filePath = path.join(CONTENT_DIR, filename);

      if (!fs.existsSync(filePath)) return;
      activityTracker.touch();

      if (!knownFiles.has(filename)) {
        knownFiles.add(filename);
        const eventsFile = path.join(STATE_DIR, 'events');
        deleteFileIfExists(eventsFile);
        logger.info('Screen added', { file: filePath });
      } else {
        logger.info('Screen updated', { file: filePath });
      }

      clientManager.broadcast({ type: 'reload' });
    }, DEBOUNCE_DELAY_MS));
  });
  watcher.on('error', (err) => logger.error('File watch error', { error: err.message }));

  function shutdown(reason) {
    logger.info('Server stopping', { reason });
    const infoFile = path.join(STATE_DIR, 'server-info');
    deleteFileIfExists(infoFile);
    writeJsonFile(
      path.join(STATE_DIR, 'server-stopped'),
      { reason, timestamp: Date.now() }
    );
    watcher.close();
    clientManager.closeAll(1001, 'Server shutting down');
    server.close(() => process.exit(0));
  }

  const lifecycleManager = new LifecycleManager({
    activityTracker,
    ownerPid,
    checkIntervalMs: LIFECYCLE_CHECK_INTERVAL_MS,
    onShutdown: shutdown
  });
  lifecycleManager.start();

  server.listen(PORT, HOST, () => {
    const info = {
      type: 'server-started',
      port: Number(PORT),
      host: HOST,
      url_host: URL_HOST,
      url: 'http://' + URL_HOST + ':' + PORT,
      screen_dir: CONTENT_DIR,
      state_dir: STATE_DIR
    };
    logger.info('Server started', info);
    writeJsonFile(path.join(STATE_DIR, 'server-info'), info);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { computeAcceptKey, encodeFrame, decodeFrame, OPCODES };