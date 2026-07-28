import fs from 'fs/promises';
import path from 'path';

class HistoryStorage {
  constructor() {
    this.dataFile = path.resolve(process.cwd(), 'data', 'seenItems.json');
    this.seenSet = new Set();
  }

  async init() {
    try {
      await fs.mkdir(path.dirname(this.dataFile), { recursive: true });
      try {
        const data = await fs.readFile(this.dataFile, 'utf8');
        const list = JSON.parse(data);
        if (Array.isArray(list)) {
          this.seenSet = new Set(list);
        }
      } catch (err) {
        if (err.code !== 'ENOENT') {
          console.error('[HistoryStorage] Failed to read seenItems.json:', err.message);
        }
      }
    } catch (err) {
      console.error('[HistoryStorage] Init error:', err.message);
    }
  }

  async save() {
    try {
      const list = Array.from(this.seenSet);
      await fs.writeFile(this.dataFile, JSON.stringify(list, null, 2), 'utf8');
    } catch (err) {
      console.error('[HistoryStorage] Failed to save seenItems.json:', err.message);
    }
  }

  hasSeen(id) {
    return this.seenSet.has(id);
  }

  markAsSeen(id) {
    if (!this.hasSeen(id)) {
      this.seenSet.add(id);
      // Fire and forget save
      this.save().catch(() => {});
      return true;
    }
    return false;
  }
}

export const historyStorage = new HistoryStorage();
