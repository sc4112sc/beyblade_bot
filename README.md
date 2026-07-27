# Telegram 推播機器人 (Telegram Push Bot)

這是一個基於 Node.js、[grammY](https://grammy.dev/) 框架與 Express 開發的 Telegram 推播機器人專案。

支援以下核心功能：
- 🤖 **Telegram 互動指令**：支援 `/start`, `/myid`, `/subscribe`, `/unsubscribe`, `/status`, `/help`
- 📡 **HTTP RESTful API**：可讓外部系統（如 Webhook, CI/CD, 監控服務, 前後端應用）直接調用發送指定對象推播與全體廣播
- 🔒 **API 安全防護**：支援 API Key 標頭權限驗證 (`X-API-KEY`)
- 💾 **輕量資料庫**：自動儲存已訂閱用戶與群組資訊
- 💻 **CLI 命令列工具**：可直接在終端機發送測試或自動化訊息

---

## 快速開始

### 1. 取得 Telegram Bot Token
1. 在 Telegram 中搜尋 [@BotFather](https://t.me/botfather)。
2. 發送 `/newbot` 指令，並依提示輸入機器人的名稱與 Username。
3. 創建完成後，BotFather 會提供一串 **HTTP API Token**（例如：`123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`）。

### 2. 安裝依賴套件
```bash
npm install
```

### 3. 設定環境變數
將 `.env.example` 複製或編輯為 `.env` 檔案：
```ini
TELEGRAM_BOT_TOKEN=你的 Telegram Bot Token
PORT=3000
API_SECRET_KEY=my_secret_push_key
```

### 4. 啟動服務
- **正式運行**：
  ```bash
  npm start
  ```
- **開發模式 (Hot Reload)**：
  ```bash
  npm run dev
  ```

---

## Telegram 機器人指令說明

| 指令 | 說明 |
| --- | --- |
| `/start` | 啟動機器人並自動完成訂閱，顯示 Chat ID |
| `/myid` | 查詢目前的 Chat ID（可用於特定推播設定） |
| `/subscribe` | 訂閱推播通告 |
| `/unsubscribe` | 取消訂閱推播通告 |
| `/status` | 查看目前個人訂閱狀態與機器人總訂閱數 |
| `/help` | 顯示機器人與 API 使用說明 |

---

## HTTP RESTful API 規格

所有保護的 Endpoint 皆需在 Header 加入 API 金鑰（即 `.env` 中的 `API_SECRET_KEY`）：
`X-API-KEY: my_secret_push_key` 或 `Authorization: Bearer my_secret_push_key`

### 1. 健康檢查 (Public)
- **URL**: `GET /health`

### 2. 發送指定對象推播 (Protected)
- **URL**: `POST /api/send`
- **Header**: `X-API-KEY: my_secret_push_key`
- **Request Body (JSON)**:
  ```json
  {
    "chatId": "123456789",
    "message": "<b>[系統通知]</b> 您的訂單已出貨！",
    "parseMode": "HTML",
    "photoUrl": "https://example.com/image.png"
  }
  ```
- **cURL 範例**:
  ```bash
  curl -X POST http://localhost:3000/api/send \
    -H "Content-Type: application/json" \
    -H "X-API-KEY: my_secret_push_key" \
    -d '{
      "chatId": "123456789",
      "message": "🔥 <b>緊急通知</b>：系統維護完成。"
    }'
  ```

### 3. 發送全體訂閱者廣播 (Protected)
- **URL**: `POST /api/broadcast`
- **Header**: `X-API-KEY: my_secret_push_key`
- **Request Body (JSON)**:
  ```json
  {
    "message": "📢 <b>全體公告</b>：本週末將進行系統升級。",
    "parseMode": "HTML"
  }
  ```
- **cURL 範例**:
  ```bash
  curl -X POST http://localhost:3000/api/broadcast \
    -H "Content-Type: application/json" \
    -H "X-API-KEY: my_secret_push_key" \
    -d '{
      "message": "📢 <b>全體公告</b>：系統維護預告。"
    }'
  ```

### 4. 取得訂閱者列表 (Protected)
- **URL**: `GET /api/subscribers`
- **Header**: `X-API-KEY: my_secret_push_key`

---

## CLI 命令列工具

您也可以直接使用命令列發送推播訊息：

```bash
# 發送給單一用戶/群組
npm run push -- --chatId=123456789 --message="Hello from CLI"

# 帶有圖片推播
npm run push -- --chatId=123456789 --message="帶圖推播" --photoUrl="https://example.com/pic.jpg"

# 全體廣播
npm run push -- --broadcast --message="CLI 廣播訊息"
```

---

## 專案目錄結構

```
.
├── .env                  # 環境變數設定檔
├── .env.example          # 環境變數範本
├── package.json          # 專案依賴與腳本
├── README.md             # 說明文件
├── data/
│   └── subscribers.json  # 已訂閱使用者本機儲存 (自動產生)
└── src/
    ├── index.js          # 主入口檔案
    ├── bot.js            # Telegram Bot 指令處理器 (grammY)
    ├── server.js         # Express HTTP API 伺服器
    ├── storage.js        # Subscriber 輕量儲存邏輯
    └── cli.js            # CLI 命令行推播腳本
```
