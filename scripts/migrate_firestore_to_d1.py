import json
import asyncio
import os
import httpx
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv

# 1. 載入環境變數
env_path = os.path.join(os.path.dirname(__file__), "..", "backend", ".env")
load_dotenv(env_path)

# Cloudflare D1 Config
CLOUDFLARE_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID")
CLOUDFLARE_D1_DATABASE_ID = os.getenv("CLOUDFLARE_D1_DATABASE_ID")
CLOUDFLARE_API_TOKEN = os.getenv("CLOUDFLARE_API_TOKEN")

D1_URL = f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/d1/database/{CLOUDFLARE_D1_DATABASE_ID}/query"
HEADERS = {
    "Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}",
    "Content-Type": "application/json",
}

# 2. 初始化 Firestore
CRED_PATH = os.path.join(os.path.dirname(__file__), "..", "backend", "serviceAccountKey.json")
if not firebase_admin._apps:
    cred = credentials.Certificate(CRED_PATH)
    firebase_admin.initialize_app(cred)
db = firestore.client()

async def execute_d1_sql(sql, params=[]):
    """執行單個 D1 SQL"""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            D1_URL,
            headers=HEADERS,
            json={"sql": sql, "params": params},
        )
        data = resp.json()
        if not data.get("success"):
            print(f"❌ D1 Error: {data.get('errors')}")
            return None
        return data["result"][0]

async def migrate_users():
    print("🚀 正在遷移 Users...")
    users = db.collection("users").stream()
    count = 0
    for doc in users:
        u = doc.to_dict()
        uid = doc.id
        email = u.get("email", "")
        display = u.get("displayName") or u.get("display_name", "")
        photo = u.get("photoURL") or u.get("photo_url", "")
        role = (u.get("role") or "user").lower()
        
        sql = """
        INSERT INTO users (id, email, display_name, photo_url, role)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            email=excluded.email,
            display_name=excluded.display_name,
            photo_url=excluded.photo_url,
            role=excluded.role
        """
        await execute_d1_sql(sql, [uid, email, display, photo, role])
        count += 1
    print(f"✅ Users 遷移完成，共 {count} 筆。")

async def migrate_records():
    print("🚀 正在遷移 Match Records...")
    records = db.collection("match_records").stream()
    count = 0
    for doc in records:
        r = doc.to_dict()
        # D1 欄位：map_name, ban_survivors (JSON), hunter_name, version, badge_level, source, reported_at, added_by_uid, added_by_name
        map_name = r.get("map_name", "未知地圖")
        hunter_name = r.get("hunter_name", "未知監管者")
        ban_survivors = json.dumps(r.get("ban_survivors", [])) 
        version = r.get("version") or r.get("version_id", "unknown")
        badge = r.get("badge_level", "unknown")
        source = r.get("source", "migration")
        
        # 預設為系統
        uid = r.get("added_by_uid", "system")
        name = r.get("added_by_name", "系統預設")
        
        sql = """
        INSERT INTO match_records (map_name, ban_survivors, hunter_name, version, badge_level, source, added_by_uid, added_by_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """
        await execute_d1_sql(sql, [map_name, ban_survivors, hunter_name, version, badge, source, uid, name])
        count += 1
        if count % 50 == 0:
            print(f"  已搬移 {count} 筆...")
            
    print(f"✅ Match Records 遷移完成，共 {count} 筆。")

async def migrate_banlist():
    print("🚀 正在遷移 Banlist...")
    bans = db.collection("banlist").stream()
    count = 0
    for doc in bans:
        b = doc.to_dict()
        sql = """
        INSERT INTO banlist (user_id, reason, banned_by, is_active)
        VALUES (?, ?, ?, ?)
        """
        await execute_d1_sql(sql, [
            b.get("user_id", ""), 
            b.get("reason", ""), 
            b.get("banned_by", "admin"), 
            1 if b.get("is_active", True) else 0
        ])
        count += 1
    print(f"✅ Banlist 遷移完成，共 {count} 筆。")

async def migrate_configs():
    print("🚀 正在遷移 Configs...")
    v_doc = db.collection("configs").document("current_version").get()
    if v_doc.exists:
        v = v_doc.to_dict().get("value", "Season 41")
        await execute_d1_sql(
            "INSERT INTO configs (key, value) VALUES ('current_version', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            [v]
        )
        print("✅ Configs (current_version) 遷移完成。")

async def main():
    await migrate_users()
    await migrate_records()
    await migrate_banlist()
    await migrate_configs()
    print("\n✨ 全數數據遷移作業已完成！")

if __name__ == "__main__":
    asyncio.run(main())
