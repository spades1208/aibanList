import asyncio
import os
import sys

# Add parent directory to sys.path to allow importing services
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services import d1_service

async def fix_names_in_records():
    # Define mapping from Simplified/Incorrect names to Traditional/Correct names
    MAPPING = {
        "杂货商": "雜貨商",
        "时空之影": "時空之影",
        "杰克": "傑克",
        "歌剧演员": "歌劇演員",
        "渔女": "漁女",
        "蜡像师": "蠟像師",
        "记录员": "記錄員",
        "跛腳羊": "跛腳羊", # To ensure consistent variant if needed
        "隐士": "隱士"
    }

    print("🚀 Starting name cleanup in 'match_records' table...")
    
    total_updated = 0
    try:
        for old_name, new_name in MAPPING.items():
            print(f"🔄 Updating '{old_name}' -> '{new_name}'...")
            
            # Update hunter_name
            meta_h = await d1_service.execute(
                "UPDATE match_records SET hunter_name = ? WHERE hunter_name = ?",
                [new_name, old_name]
            )
            rows_h = meta_h.get("rows_affected", 0)
            
            # Update within ban_survivors (stored as JSON string)
            # Since SQLite doesn't have deep JSON update easily via REST API 
            # without complex logic, we can use REPLACE for simple strings
            # Note: ban_survivors is ["Name1", "Name2"]
            # We look for '"OldName"' and replace with '"NewName"'
            old_json = f'"{old_name}"'
            new_json = f'"{new_name}"'
            meta_s = await d1_service.execute(
                "UPDATE match_records SET ban_survivors = REPLACE(ban_survivors, ?, ?) WHERE ban_survivors LIKE ?",
                [old_json, new_json, f'%{old_json}%']
            )
            rows_s = meta_s.get("rows_affected", 0)
            
            total_updated += rows_h + rows_s
            if rows_h > 0 or rows_s > 0:
                print(f"  ✅ Updated {rows_h} hunter names and {rows_s} ban survivor entries.")

        print(f"✨ Cleanup completed. Total entries affected: {total_updated}")
        
    except Exception as e:
        print(f"❌ Error during cleanup: {e}")

if __name__ == "__main__":
    asyncio.run(fix_names_in_records())
