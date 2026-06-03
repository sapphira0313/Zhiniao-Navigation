const fs = require('fs');
const path = require('path');
const { Logger } = require('./logger');

const logger = new Logger('file-utils');

function ensureDir(dir) {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.debug('Created directory', { dir });
    }
    return true;
  } catch (e) {
    logger.error('Error creating directory', { dir, error: e.message });
    return false;
  }
}

function safePathJoin(baseDir, fileName) {
  if (!fileName) {
    throw new Error('File name is required');
  }
  
  const resolved = path.resolve(baseDir, fileName);
  
  if (!resolved.startsWith(path.resolve(baseDir))) {
    throw new Error('Path traversal detected');
  }
  
  return resolved;
}

function getNewestFile(dir, extension) {
  try {
    const files = fs.readdirSync(dir);
    let newest = null;
    let newestTime = 0;
    
    for (const file of files) {
      if (!file.endsWith(extension)) continue;
      
      const filePath = path.join(dir, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile() && stat.mtime.getTime() > newestTime) {
          newestTime = stat.mtime.getTime();
          newest = filePath;
        }
      } catch (e) {
        logger.warn('Error accessing file', { path: filePath, error: e.message });
      }
    }
    
    return newest;
  } catch (e) {
    logger.error('Error reading directory', { dir, error: e.message });
    return null;
  }
}

function appendToFile(filePath, content) {
  try {
    fs.appendFileSync(filePath, content);
    return true;
  } catch (e) {
    logger.error('Error appending to file', { path: filePath, error: e.message });
    return false;
  }
}

function writeJsonFile(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    ensureDir(dir);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    logger.error('Error writing JSON file', { path: filePath, error: e.message });
    return false;
  }
}

function deleteFileIfExists(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (e) {
    logger.warn('Error deleting file', { path: filePath, error: e.message });
    return false;
  }
}

function cleanupOldFiles(dir, maxAgeMs) {
  try {
    const files = fs.readdirSync(dir);
    const now = Date.now();
    let removed = 0;
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile() && now - stat.mtime.getTime() > maxAgeMs) {
          fs.unlinkSync(filePath);
          removed++;
        }
      } catch (e) {
        logger.warn('Error removing file', { path: filePath, error: e.message });
      }
    }
    
    if (removed > 0) {
      logger.debug('Cleaned up old files', { removed });
    }
  } catch (e) {
    logger.error('Error cleaning up files', { dir, error: e.message });
  }
}

module.exports = {
  ensureDir,
  safePathJoin,
  getNewestFile,
  appendToFile,
  writeJsonFile,
  deleteFileIfExists,
  cleanupOldFiles
};