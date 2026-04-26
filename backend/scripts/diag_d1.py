import asyncio
import httpx
import os
from dotenv import load_dotenv

# 載入環境變數
load_dotenv(".env")

ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID")
DB_ID = os.getenv("CLOUDFLARE_D1_DATABASE_ID")
API_TOKEN = os.getenv("CLOUDFLARE_API_TOKEN")

D1_BASE = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/d1/database/{DB_ID}"
HEADERS = {
    "Authorization": f"Bearer {API_TOKEN}",
    "Content-Type": "application/json",
}

async def diag():
    print(f"🔍 Checking D1 Database: {DB_ID}")
    print(f"Using Token: {API_TOKEN[:5]}...{API_TOKEN[-5:] if API_TOKEN else 'None'}")
    
    async with httpx.AsyncClient() as client:
        # 測試 1: 檢查表結構
        print("\n--- Test 1: Check Schema ---")
        sql = "PRAGMA table_info(users)"
        resp = await client.post(f"{D1_BASE}/query", headers=HEADERS, json={"sql": sql, "params": []})
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.text}")
        
        # 測試 2: 嘗試修復 (單獨執行)
        print("\n--- Test 2: Try Migrate (Reputation) ---")
        sql_fix = "ALTER TABLE users ADD COLUMN reputation INTEGER DEFAULT 100"
        resp = await client.post(f"{D1_BASE}/query", headers=HEADERS, json={"sql": sql_fix, "params": []})
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.text}")

        print("\n--- Test 3: Try Migrate (Is Verified) ---")
        sql_fix2 = "ALTER TABLE match_records ADD COLUMN is_verified INTEGER DEFAULT 0"
        resp = await client.post(f"{D1_BASE}/query", headers=HEADERS, json={"sql": sql_fix2, "params": []})
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.text}")

if __name__ == "__main__":
    asyncio.run(diag())
