import asyncio
import os
import httpx
from dotenv import load_dotenv

# 載入環境變數
env_path = os.path.join(os.path.dirname(__file__), "..", "backend", ".env")
load_dotenv(env_path)

CLOUDFLARE_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID")
CLOUDFLARE_D1_DATABASE_ID = os.getenv("CLOUDFLARE_D1_DATABASE_ID")
CLOUDFLARE_API_TOKEN = os.getenv("CLOUDFLARE_API_TOKEN")

D1_URL = f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/d1/database/{CLOUDFLARE_D1_DATABASE_ID}/query"
HEADERS = {
    "Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}",
    "Content-Type": "application/json",
}

async def execute_sql(sql_list):
    async with httpx.AsyncClient() as client:
        for sql in sql_list:
            print(f"Executing: {sql}")
            resp = await client.post(D1_URL, headers=HEADERS, json={"sql": sql})
            print(f"Result: {resp.status_code} - {resp.text[:200]}")

async def main():
    sql_commands = [
        "ALTER TABLE match_records ADD COLUMN added_by_uid TEXT;",
        "ALTER TABLE match_records ADD COLUMN added_by_name TEXT;",
        "UPDATE match_records SET added_by_uid = 'system', added_by_name = '系統預設' WHERE added_by_uid IS NULL;"
    ]
    await execute_sql(sql_commands)
    print("✅ Schema update and legacy data patching complete!")

if __name__ == "__main__":
    asyncio.run(main())
