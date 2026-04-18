import httpx
from typing import Any
from config import settings

D1_BASE = f"https://api.cloudflare.com/client/v4/accounts/{settings.cloudflare_account_id}/d1/database/{settings.cloudflare_d1_database_id}"

HEADERS = {
    "Authorization": f"Bearer {settings.cloudflare_api_token}",
    "Content-Type": "application/json",
}

async def get_db(request: Any = None):
    """取得資料庫連線，優先使用本地 REST API (開發環境)"""
    # 如果是在 Cloudflare Workers 環境中，FastAPI 可以 access 到 env
    if request and hasattr(request.state, "env") and hasattr(request.state.env, "DB"):
        return request.state.env.DB
    return None

async def query(sql: str, params: list = [], request: Any = None) -> list[dict]:
    """執行 D1 SQL 查詢"""
    db = await get_db(request)
    if db:
        # 使用 Cloudflare Native Binding
        result = await db.prepare(sql).bind(*params).all()
        return result.results
    
    # 否則使用 REST API (本地開發)
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{D1_BASE}/query",
            headers=HEADERS,
            json={"sql": sql, "params": params},
        )
        resp.raise_for_status()
        data = resp.json()
        if not data.get("success"):
            raise Exception(f"D1 query failed: {data.get('errors')}")
        return data["result"][0].get("results", [])

async def execute(sql: str, params: list = [], request: Any = None) -> dict:
    """執行 D1 SQL 寫入/更新，回傳 meta 資訊"""
    db = await get_db(request)
    if db:
        # 使用 Cloudflare Native Binding
        result = await db.prepare(sql).bind(*params).run()
        return result.meta
    
    # 否則使用 REST API (本地開發)
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{D1_BASE}/query",
            headers=HEADERS,
            json={"sql": sql, "params": params},
        )
        resp.raise_for_status()
        data = resp.json()
        if not data.get("success"):
            raise Exception(f"D1 execute failed: {data.get('errors')}")
        return data["result"][0].get("meta", {})

# ── 初始化資料表 ──────────────────────────────────────────
INIT_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    display_name TEXT,
    photo_url TEXT,
    role TEXT DEFAULT 'user',
    is_blacklisted INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS banlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    reason TEXT,
    banned_by TEXT,
    banned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active INTEGER DEFAULT 1
);
"""

async def init_tables(request: Any = None):
    for statement in INIT_SQL.strip().split(";"):
        stmt = statement.strip()
        if stmt:
            await execute(stmt, request=request)
