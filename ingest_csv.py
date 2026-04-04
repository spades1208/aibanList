import csv
import firebase_admin
from firebase_admin import credentials, firestore
import os

# ── 設定區域 ──────────────────────────────────────────────
CRED_PATH = os.path.join("backend", "serviceAccountKey.json")

def init_firestore():
    if not firebase_admin._apps:
        cred = credentials.Certificate(CRED_PATH)
        firebase_admin.initialize_app(cred)
    return firestore.client()

def load_mapping(file_path, id_col, name_col):
    """讀取對應表 CSV 並回傳 ID -> Name 字典"""
    mapping = {}
    if not os.path.exists(file_path):
        return mapping
    with open(file_path, mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            mapping[row[id_col]] = row[name_col]
    return mapping

def ingest_match_data(db):
    """處理 match_record.csv 並匯入 Firestore"""
    # 1. 載入對應表
    map_map = load_mapping("map.csv", "map_id", "map_name")
    suv_map = load_mapping("suv.csv", "survivor_id", "survivor_name")
    hunter_map = load_mapping("h.csv", "hunter_id", "hunter_name")
    
    print(f"✅ 載入對應表完成：地圖 {len(map_map)} 筆, 求生者 {len(suv_map)} 筆, 監管者 {len(hunter_map)} 筆。")

    match_file = "match_record.csv"
    if not os.path.exists(match_file):
        print("❌ 找不到 match_record.csv，中止匯入。")
        return

    print(f"🚀 正在處理 {match_file} -> 集合 match_records...")
    
    with open(match_file, mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        batch = db.batch()
        count = 0
        
        for row in reader:
            # 轉換 ID 為名稱
            m_id = row.get("map_id")
            h_id = row.get("hunter_id")
            b1_id = row.get("ban1_survivor_id")
            b2_id = row.get("ban2_survivor_id")
            b3_id = row.get("ban3_survivor_id")

            # 建立 Firestore 存儲格式
            ban_names = [suv_map.get(b) for b in [b1_id, b2_id, b3_id] if b and b in suv_map]
            
            clean_record = {
                "map_name": map_map.get(m_id, "未知地圖"),
                "hunter_name": hunter_map.get(h_id, "未知監管者"),
                "ban_survivors": ban_names,
                "match_date": row.get("match_date", ""),
                "version_id": row.get("version_id", "")
            }

            doc_ref = db.collection("match_records").document()
            batch.set(doc_ref, clean_record)
            count += 1
            
            if count % 500 == 0:
                batch.commit()
                batch = db.batch()
        
        batch.commit()
    print(f"✨ 完成！共成功匯入 {count} 筆戰績資料到 Firestore！")

if __name__ == "__main__":
    try:
        db = init_firestore()
        ingest_match_data(db)
    except Exception as e:
        print(f"❌ 發生錯誤: {e}")
