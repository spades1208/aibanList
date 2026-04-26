import asyncio
import sys
import os

# Add parent directory to sys.path to allow importing services
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services import d1_service

async def run_migration():
    print("🚀 Starting Migration v3.0...")
    try:
        # 1. 增加 users 表的 reputation 欄位
        print("Adding 'reputation' to 'users' table...")
        await d1_service.execute("ALTER TABLE users ADD COLUMN reputation INTEGER DEFAULT 100")
        print("✅ Added 'reputation' column.")
    except Exception as e:
        if "duplicate column name" in str(e).lower():
            print("⚠️ Column 'reputation' already exists, skipping.")
        else:
            print(f"❌ Error adding 'reputation': {e}")

    try:
        # 2. 增加 match_records 表的 is_verified 欄位
        print("Adding 'is_verified' to 'match_records' table...")
        await d1_service.execute("ALTER TABLE match_records ADD COLUMN is_verified INTEGER DEFAULT 0")
        print("✅ Added 'is_verified' column.")
    except Exception as e:
        if "duplicate column name" in str(e).lower():
            print("⚠️ Column 'is_verified' already exists, skipping.")
        else:
            print(f"❌ Error adding 'is_verified': {e}")

    print("✨ Migration v3.0 completed.")

if __name__ == "__main__":
    asyncio.run(run_migration())
