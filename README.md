# aiBanlist

Firebase Authentication + FastAPI + Cloudflare D1 全端管理系統。

## 🔑 啟動前：必填的金鑰

### Firebase Console
1. [Firebase Console](https://console.firebase.google.com/) → Authentication → 啟用 **Google**
2. 專案設定 → Web App → 複製 `firebaseConfig` → 貼到 `frontend/js/firebase-config.js`
3. 專案設定 → 服務帳戶 → **產生新的私密金鑰** → 把 JSON 改名為 `serviceAccountKey.json` 放到 `backend/`

### Cloudflare D1
1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → Workers & Pages → D1 → Create Database
2. My Profile → API Tokens → Create Token（D1 Edit 權限）
3. 填入 `backend/.env`：`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_D1_DATABASE_ID`、`CLOUDFLARE_API_TOKEN`

## 🚀 快速啟動（WSL）

```bash
# 1. 一鍵初始化環境
bash setup_wsl.sh

# 2. 填入金鑰
nano backend/.env

# 3. 啟動後端
cd backend && source .venv/bin/activate && uvicorn main:app --reload

# 4. 前端用 Live Server 或直接開 frontend/index.html
```

## 📁 專案結構

```
aiBanlist/
├── backend/
│   ├── main.py              # FastAPI 主程式
│   ├── config.py            # 環境變數設定
│   ├── requirements.txt
│   ├── .env.example         # 複製為 .env 並填入金鑰
│   ├── routers/
│   │   ├── auth.py          # POST /auth/verify, GET /auth/me
│   │   └── admin.py         # 後台管理 API（需 admin 角色）
│   ├── services/
│   │   ├── firebase_service.py  # Firebase Admin SDK
│   │   └── d1_service.py        # Cloudflare D1 REST API
│   └── models/schemas.py
├── frontend/
│   ├── index.html           # 登入頁
│   ├── admin.html           # 後台管理頁
│   └── js/
│       ├── firebase-config.js  # ⚠️ 填入你的 firebaseConfig
│       ├── auth.js
│       └── admin.js
├── setup_wsl.sh             # WSL 環境初始化
└── .gitignore
```

## API 端點

| Method | Path | 說明 | 權限 |
|--------|------|------|------|
| GET | `/` | 健康檢查 | 公開 |
| POST | `/auth/verify` | 驗證 Firebase Token | 公開 |
| GET | `/auth/me` | 取得目前使用者 | 登入 |
| GET | `/admin/users` | 列出所有使用者 | Admin |
| PATCH | `/admin/users/{uid}/role` | 修改角色 | Admin |
| GET | `/admin/banlist` | 封鎖名單 | Admin |
| POST | `/admin/banlist` | 新增封鎖 | Admin |
| DELETE | `/admin/banlist/{id}` | 解除封鎖 | Admin |

## 部署

- **前端**：將 `frontend/` 資料夾上傳至 Cloudflare Pages
- **後端**：部署 `backend/` 至任意支援 Python 的主機（VPS、Railway、Fly.io 等）
  - 記得設定環境變數（同 `.env`）
