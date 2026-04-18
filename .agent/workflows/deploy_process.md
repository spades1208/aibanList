---
description: 安全開發流程：先本地測試，後雲端部署
---

# 🚀 AI Banlist 安全部署流程

為了確保線上版本的穩定性，所有代碼變更必須遵循以下步驟：

1. **本地開發**：在 `c:\Users\User\Desktop\aiBanlist` 修改代碼。
2. **本地驗證**：
   - 確保本地伺服器已啟動於 `http://localhost:5500`。
   - 使用 `browser_subagent` 或引導用戶檢查 `http://localhost:5500`。
   - 確認 API 連線（雲端同步）與 UI 渲染無誤。
3. **正式發布**：
   - 只有在步驟 2 確認成功後，才能執行 `npx wrangler pages deploy frontend --project-name aibanlist`。
4. **線上複查**：部署後檢查 `https://aibanlist.pages.dev/` 確保同步成功。

// turbo
**注意**：除非用戶明確要求緊急修復，否則嚴禁跳過本地測試步驟。
