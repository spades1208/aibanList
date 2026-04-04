import asyncio
import httpx
import os
from backend.config import settings

# Manual query script to check D1 users
async def check_users():
    D1_BASE = f"https://api.cloudflare.com/client/v4/accounts/{settings.cloudflare_account_id}/d1/database/{settings.cloudflare_d1_database_id}"
    HEADERS = {
        "Authorization": f"Bearer {settings.cloudflare_api_token}",
        "Content-Type": "application/json",
    }
    
    sql = "SELECT * FROM users"
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{D1_BASE}/query",
            headers=HEADERS,
            json={"sql": sql, "params": []},
        )
        data = resp.json()
        if not data.get("success"):
            print(f"Error: {data}")
            return
        users = data["result"][0].get("results", [])
        for u in users:
            print(f"UID: {u['id']}, Email: {u['email']}, Role: {u['role']}")

if __name__ == "__main__":
    asyncio.run(check_users())
