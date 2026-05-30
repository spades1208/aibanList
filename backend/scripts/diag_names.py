import asyncio
import os
import sys

# Add parent directory to sys.path to allow importing services
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services import d1_service

async def diag_data():
    print("🔍 Diagnostic: Fetching hunter_name from records...")
    try:
        rows = await d1_service.query("SELECT DISTINCT hunter_name FROM match_records")
        for r in rows:
            name = r.get("hunter_name")
            print(f"Name in DB: '{name}' | Bytes: {name.encode('utf-8') if name else 'None'}")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    asyncio.run(diag_data())
