import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, '../data/subscribers.json');

/**
 * Storage manager for managing subscribers
 */
export class StorageManager {
  constructor(filePath = DATA_FILE) {
    this.filePath = filePath;
    this.subscribers = new Map();
  }

  /**
   * Initialize storage and load existing subscribers
   */
  async init() {
    try {
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });

      try {
        const content = await fs.readFile(this.filePath, 'utf-8');
        const data = JSON.parse(content);
        if (Array.isArray(data)) {
          data.forEach(sub => this.subscribers.set(String(sub.chatId), sub));
        }
      } catch (err) {
        if (err.code === 'ENOENT') {
          await this.save();
        } else {
          console.error('[Storage] Error reading subscribers file:', err);
        }
      }
    } catch (err) {
      console.error('[Storage] Failed to initialize storage:', err);
    }
  }

  /**
   * Save subscribers map to JSON file
   */
  async save() {
    try {
      const arrayData = Array.from(this.subscribers.values());
      await fs.writeFile(this.filePath, JSON.stringify(arrayData, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Storage] Error saving subscribers file:', err);
    }
  }

  /**
   * Add or update a subscriber
   * @param {string|number} chatId 
   * @param {object} info 
   */
  async addSubscriber(chatId, info = {}) {
    const id = String(chatId);
    const subscriber = {
      chatId: id,
      name: info.name || info.title || info.username || 'Unknown',
      type: info.type || 'private',
      subscribedAt: new Date().toISOString(),
      ...info
    };

    this.subscribers.set(id, subscriber);
    await this.save();
    return subscriber;
  }

  /**
   * Remove a subscriber
   * @param {string|number} chatId 
   */
  async removeSubscriber(chatId) {
    const id = String(chatId);
    const removed = this.subscribers.delete(id);
    if (removed) {
      await this.save();
    }
    return removed;
  }

  /**
   * Get subscriber info
   * @param {string|number} chatId 
   */
  getSubscriber(chatId) {
    return this.subscribers.get(String(chatId));
  }

  /**
   * Get all subscribers list
   */
  getAllSubscribers() {
    return Array.from(this.subscribers.values());
  }

  /**
   * Check if a chatId is subscribed
   * @param {string|number} chatId 
   */
  isSubscribed(chatId) {
    return this.subscribers.has(String(chatId));
  }
}

export const storage = new StorageManager();
