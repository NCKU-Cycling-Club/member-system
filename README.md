# 成大單車社社員系統 v6-github

這個版本把前端搬到 **GitHub Pages**，資料仍由 **Apps Script + Google Sheet** 管理。
為避免瀏覽器直接呼叫 Apps Script 時的 CORS / redirect 問題，中間使用一個很薄的 **Cloudflare Worker API Proxy**。

## 架構

GitHub Pages → Cloudflare Worker → Apps Script → Google Sheet / Drive

## 1. 建立 GitHub Organization / Repository

建議 repo：`member-system`，放在社團 Organization，不放個人帳號。把本資料夾內容 push 到 `main`。

GitHub：Settings → Pages → Deploy from branch → `main` / root。

## 2. Apps Script

1. 用 `apps-script/Code.gs` 取代目前後端 Code.gs。
2. Apps Script「專案設定 → 指令碼屬性」新增：`API_SHARED_SECRET`，值請用至少 32 字元隨機字串。
3. 執行一次 `setup()`。
4. 部署 Web App：執行身分＝我；存取＝所有人。
5. 複製 `/exec` 網址。

> 舊的 Apps Script HTML 介面可以暫時保留當備援；GitHub 版實際走 `doPost()` API。

## 3. Cloudflare Worker

建立一個 Worker，把 `cloudflare-worker/worker.js` 貼上或用 Wrangler 部署。設定三個環境變數/Secrets：

- `APPS_SCRIPT_URL`：Apps Script `/exec` 網址
- `API_SHARED_SECRET`：和 Apps Script 指令碼屬性相同
- `ALLOWED_ORIGIN`：GitHub Pages origin，例如 `https://ncku-cycling-club.github.io`

若 Pages 是自訂網域，就改成自訂網域 origin。

## 4. 前端設定

修改 `config.js`：

```js
window.APP_CONFIG = {
  API_URL: 'https://你的-worker.workers.dev/'
};
```

Commit + push 後 GitHub Pages 會更新。

## 5. 測試順序

1. 開 GitHub Pages，頁首應顯示 `社員系統 v6-github`。
2. 一般社員登入。
3. 活動報名 / 取消。
4. 簽到。
5. 社車領取 / 歸還。
6. 幹部 Gmail 驗證碼登入。
7. 後台活動、社員、社車管理。
8. 圖片上傳與顯示。

## 交接重點

- GitHub repo 必須屬於社團 Organization。
- Apps Script / Sheet / Drive 必須屬於社團共用帳號或 Shared Drive。
- Cloudflare 帳號建議用社團共用信箱，並至少兩位幹部有 Owner/Admin。
- `API_SHARED_SECRET` 不准 commit 到 GitHub。
- 每年交接只需更新 GitHub/Cloudflare/Google 權限，不需重建網站。

## 檔案

- `index.html`：頁面結構
- `styles.css`：樣式
- `app.js`：所有前端邏輯
- `config.js`：Worker URL（可公開）
- `apps-script/Code.gs`：Google Apps Script 後端
- `cloudflare-worker/worker.js`：API Proxy

- Pages deploy trigger
