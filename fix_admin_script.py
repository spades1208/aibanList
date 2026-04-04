import asyncio
import httpx
from backend.config import settings

async def promote_user(email: str):
    D1_BASE = f"https://api.cloudflare.com/client/v4/accounts/{settings.cloudflare_account_id}/d1/database/{settings.cloudflare_d1_database_id}"
    HEADERS = {
        "Authorization": f"Bearer {settings.cloudflare_api_token}",
        "Content-Type": "application/json",
    }
    
    # 1. 查找 UID
    sql_find = "SELECT id FROM users WHERE email = ?"
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{D1_BASE}/query",
            headers=HEADERS,
            json={"sql": sql_find, "params": [email]},
        )
        data = resp.json()
        if not data.get("success"):
            print(f"❌ 查詢失敗: {data}")
            return
            
        results = data["result"][0].get("results", [])
        if not results:
            print(f"⚠️ 找不到信箱為 {email} 的使用者。請確認您是否已經登入過網站一次。")
            return
            
        uid = results[0]["id"]
        
        # 2. 提升為 Admin
        sql_update = "UPDATE users SET role = 'admin' WHERE id = ?"
        resp_upd = await client.post(
            f"{D1_BASE}/query",
            headers=HEADERS,
            json={"sql": sql_update, "params": [uid]},
        )
        data_upd = resp_upd.json()
        if data_upd.get("success"):
            print(f"✅ 成功將 {email} (UID: {uid}) 提升為管理員 (Admin)！")
        else:
            print(f"❌ 更新失敗: {data_upd}")

if __name__ == "__main__":
    import sys
    target_email = "waviskimo@gmail.com"
    asyncio.run(promote_user(target_email))
