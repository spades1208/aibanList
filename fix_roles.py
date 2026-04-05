import asyncio
import os
import httpx
from dotenv import load_dotenv

# 載入環境變數
env_path = os.path.join(os.path.dirname(__file__), "backend", ".env")
load_dotenv(env_path)

CLOUDFLARE_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID")
CLOUDFLARE_D1_DATABASE_ID = os.getenv("CLOUDFLARE_D1_DATABASE_ID")
CLOUDFLARE_API_TOKEN = os.getenv("CLOUDFLARE_API_TOKEN")

D1_URL = f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/d1/database/{CLOUDFLARE_D1_DATABASE_ID}/query"
HEADERS = {
    "Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}",
    "Content-Type": "application/json",
}

async def execute_sql(sql, params=[]):
    async with httpx.AsyncClient() as client:
        resp = await client.post(D1_URL, headers=HEADERS, json={"sql": sql, "params": params})
        return resp.json()

async def main():
    print("🚀 正在檢查 D1 使用者權限...")
    res = await execute_sql("SELECT id, email, role FROM users")
    if not res.get("success"):
        print(f"❌ 查詢失敗: {res.get('errors')}")
        return

    users = res["result"][0].get("results", [])
    for u in users:
        print(f"Found user: {u['email']} (Role: {u['role']})")
        # 如果是主管理員或原本應該是管理員的人，強制轉為 admin
        if u['email'].lower() == "waviskimo@gmail.com" and u['role'].lower() != "admin":
            print(f"⚠️ 正在修復 {u['email']} 的管理員權限...")
            await execute_sql("UPDATE users SET role = 'admin' WHERE id = ?", [u['id']])
            print("✅ 修復成功！")

if __name__ == "__main__":
    asyncio.run(main())
