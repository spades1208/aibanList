import asyncio
import csv
import os
import sys

# Add parent directory to sys.path to allow importing services
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services import d1_service

async def sync_hunters():
    csv_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "..", "h.csv")
    csv_path = os.path.abspath(csv_path)
    
    if not os.path.exists(csv_path):
        print(f"❌ Cannot find h.csv at {csv_path}")
        return

    print(f"🚀 Reading {csv_path}...")
    hunters = []
    with open(csv_path, mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("hunter_name"):
                hunters.append(row["hunter_name"])

    if not hunters:
        print("⚠️ No hunters found in CSV.")
        return

    print(f"🔄 Syncing {len(hunters)} hunters to Cloudflare D1...")
    
    try:
        # 1. Clear existing hunters (optional, or just insert ignore)
        # To be safe and clean, let's truncate or delete
        # Note: If there are foreign keys, be careful. 
        # Here we just want the options list to be correct.
        await d1_service.execute("DELETE FROM hunters")
        
        # 2. Insert all from CSV
        for name in hunters:
            await d1_service.execute("INSERT INTO hunters (name) VALUES (?)", [name])
            print(f"✅ Synced: {name}")

        print("✨ All hunters synced successfully!")
        
    except Exception as e:
        print(f"❌ Error during sync: {e}")

if __name__ == "__main__":
    asyncio.run(sync_hunters())
