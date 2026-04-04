#!/bin/bash
# aiBanlist WSL 環境初始化腳本
# 執行方式：bash setup_wsl.sh

set -e
echo "🚀 開始初始化 aiBanlist 後端環境..."

# 1. 更新套件
echo "📦 更新 apt 套件清單..."
sudo apt-get update -qq

# 2. 安裝 Python 3 與 venv（Ubuntu 預設可能缺少）
echo "🐍 確認 Python3 與 pip..."
sudo apt-get install -y python3 python3-pip python3-venv -qq

# 3. 進到 backend 資料夾（腳本假設從專案根目錄執行）
cd "$(dirname "$0")/backend"
echo "📂 工作目錄：$(pwd)"

# 4. 建立虛擬環境
if [ ! -d ".venv" ]; then
  echo "🔧 建立虛擬環境 .venv ..."
  python3 -m venv .venv
fi

# 5. 安裝依賴
echo "📥 安裝 Python 套件..."
source .venv/bin/activate
pip install --upgrade pip -q
pip install -r requirements.txt -q
echo "✅ 套件安裝完成"

# 6. 建立 .env（若尚未存在）
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo ""
  echo "⚠️  已從 .env.example 建立 .env"
  echo "    請編輯 backend/.env 填入以下金鑰："
  echo "    - FIREBASE_CREDENTIALS_PATH（下載 serviceAccountKey.json 後指定路徑）"
  echo "    - CLOUDFLARE_ACCOUNT_ID"
  echo "    - CLOUDFLARE_D1_DATABASE_ID"
  echo "    - CLOUDFLARE_API_TOKEN"
fi

# 7. 建立 __init__.py 讓 Python 把子資料夾視為模組
touch routers/__init__.py services/__init__.py models/__init__.py

echo ""
echo "🎉 初始化完成！啟動後端指令："
echo "   cd backend && source .venv/bin/activate && uvicorn main:app --reload"
echo ""
echo "📖 Swagger UI 文件：http://localhost:8000/docs"
