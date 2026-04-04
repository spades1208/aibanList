import asyncio
import httpx
import os

# Promotion script that manually parses .env
async def promote():
    env = {}
    with open("backend/.env", "r") as f:
        for line in f:
            if "=" in line and not line.startswith("#"):
                k, v = line.strip().split("=", 1)
                env[k] = v
    
    ACCOUNT_ID = env.get("CLOUDFLARE_ACCOUNT_ID")
    DATABASE_ID = env.get("CLOUDFLARE_D1_DATABASE_ID")
    TOKEN = env.get("CLOUDFLARE_API_TOKEN")
    
    if not all([ACCOUNT_ID, DATABASE_ID, TOKEN]):
        print("❌ .env is incomplete")
        return

    D1_BASE = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/d1/database/{DATABASE_ID}"
    HEADERS = {
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json",
    }
    
    # 1. 列表顯示所有使用者
    sql_list = "SELECT * FROM users"
    async with httpx.AsyncClient() as client:
        resp = await client.post(f"{D1_BASE}/query", headers=HEADERS, json={"sql": sql_list, "params": []})
        data = resp.json()
        users = data["result"][0].get("results", [])
        
        target_email = "waviskimo@gmail.com"
        target_uid = None
        
        print("👥 當前資料庫使用者：")
        for u in users:
            print(f"- {u['display_name']} ({u['email']}) Role: {u['role']} UID: {u['id']}")
            if u["email"] == target_email:
                target_uid = u["id"]
        
        if not target_uid:
            print(f"\n⚠️ 找不到 {target_email}。請確認網頁右下角是否有彈出「授權失敗」？")
            return

        # 2. 提升權限
        sql_upd = "UPDATE users SET role = 'admin' WHERE id = ?"
        resp_upd = await client.post(f"{D1_BASE}/query", headers=HEADERS, json={"sql": sql_upd, "params": [target_uid]})
        if resp_upd.json().get("success"):
            print(f"\n✨ 成功！{target_email} 已提升為管理員。請重新整理管理後台頁面。")

if __name__ == "__main__":
    asyncio.run(promote())
