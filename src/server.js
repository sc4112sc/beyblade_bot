import express from 'express';
import cors from 'cors';
import { storage } from './storage.js';

/**
 * Express HTTP Server setup for Telegram Push API
 * @param {import('grammy').Bot} bot 
 * @returns {express.Application}
 */
export function createServer(bot) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // API Key Authentication Middleware
  const authenticateApiKey = (req, res, next) => {
    const apiKey = process.env.API_SECRET_KEY;
    if (!apiKey) {
      return next(); // If no secret key is set, bypass authentication
    }

    const headerKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    if (!headerKey || headerKey !== apiKey) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid or missing API key (Header: X-API-KEY)'
      });
    }

    next();
  };

  // Health check endpoint (Public)
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      botConnected: Boolean(bot),
      subscribersCount: storage.getAllSubscribers().length,
      timestamp: new Date().toISOString()
    });
  });

  // Get list of subscribers (Protected)
  app.get('/api/subscribers', authenticateApiKey, (req, res) => {
    const subscribers = storage.getAllSubscribers();
    res.json({
      success: true,
      count: subscribers.length,
      subscribers
    });
  });

  // Push message to specific chatId (Protected)
  app.post('/api/send', authenticateApiKey, async (req, res) => {
    const { chatId, message, parseMode = 'HTML', photoUrl } = req.body;

    if (!chatId || !message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: "chatId" and "message"'
      });
    }

    if (!bot) {
      return res.status(503).json({
        success: false,
        error: 'Bot service unavailable. Check TELEGRAM_BOT_TOKEN environment variable.'
      });
    }

    try {
      let sentMsg;
      if (photoUrl) {
        sentMsg = await bot.api.sendPhoto(chatId, photoUrl, {
          caption: message,
          parse_mode: parseMode
        });
      } else {
        sentMsg = await bot.api.sendMessage(chatId, message, {
          parse_mode: parseMode
        });
      }

      return res.json({
        success: true,
        messageId: sentMsg.message_id,
        chatId: String(chatId),
        sentAt: new Date().toISOString()
      });
    } catch (err) {
      console.error(`[API Send Error] Failed to send message to chatId ${chatId}:`, err.message);
      return res.status(500).json({
        success: false,
        error: `Failed to send Telegram message: ${err.message}`
      });
    }
  });

  // Broadcast message to all subscribers (Protected)
  app.post('/api/broadcast', authenticateApiKey, async (req, res) => {
    const { message, parseMode = 'HTML', photoUrl } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: "message"'
      });
    }

    if (!bot) {
      return res.status(503).json({
        success: false,
        error: 'Bot service unavailable. Check TELEGRAM_BOT_TOKEN environment variable.'
      });
    }

    const subscribers = storage.getAllSubscribers();
    if (subscribers.length === 0) {
      return res.json({
        success: true,
        message: 'No active subscribers found.',
        sentCount: 0,
        failedCount: 0
      });
    }

    const results = {
      total: subscribers.length,
      sentCount: 0,
      failedCount: 0,
      failures: []
    };

    for (const sub of subscribers) {
      try {
        if (photoUrl) {
          await bot.api.sendPhoto(sub.chatId, photoUrl, {
            caption: message,
            parse_mode: parseMode
          });
        } else {
          await bot.api.sendMessage(sub.chatId, message, {
            parse_mode: parseMode
          });
        }
        results.sentCount++;
      } catch (err) {
        results.failedCount++;
        results.failures.push({
          chatId: sub.chatId,
          name: sub.name,
          error: err.message
        });

        // If user blocked bot or deleted account, option to un-subscribe
        if (err.description?.includes('bot was blocked by the user') || err.error_code === 403) {
          await storage.removeSubscriber(sub.chatId);
        }
      }
    }

    return res.json({
      success: true,
      results
    });
  });

  return app;
}
