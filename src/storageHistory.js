import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HISTORY_FILE = path.join(__dirname, '../data/seenItems.json');

/**
 * Storage manager for deduplicating push notifications
 */
export class HistoryStorage {
  constructor(filePath = HISTORY_FILE) {
    this.filePath = filePath;
    this.seenIds = new Set();
  }

  async init() {
    try {
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });

      try {
        const content = await fs.readFile(this.filePath, 'utf-8');
        const data = JSON.parse(content);
        if (Array.isArray(data)) {
          data.forEach(id => this.seenIds.add(String(id)));
        }
      } catch (err) {
        if (err.code === 'ENOENT') {
          await this.save();
        } else {
          console.error('[HistoryStorage] Error reading history file:', err);
        }
      }
    } catch (err) {
      console.error('[HistoryStorage] Failed to initialize history storage:', err);
    }
  }

  async save() {
    try {
      // Keep at most 5000 latest items to avoid memory bloat
      const arrayData = Array.from(this.seenIds).slice(-5000);
      await fs.writeFile(this.filePath, JSON.stringify(arrayData, null, 2), 'utf-8');
    } catch (err) {
      console.error('[HistoryStorage] Error saving history file:', err);
    }
  }

  isSeen(id) {
    return this.seenIds.has(String(id));
  }

  async addSeen(id) {
    const key = String(id);
    if (!this.seenIds.has(key)) {
      this.seenIds.add(key);
      await this.save();
      return true;
    }
    return false;
  }
}

export const historyStorage = new HistoryStorage();
