import csv
import firebase_admin
from firebase_admin import credentials, firestore
import os

CRED_PATH = os.path.join("backend", "serviceAccountKey.json")

def init_firestore():
    if not firebase_admin._apps:
        cred = credentials.Certificate(CRED_PATH)
        firebase_admin.initialize_app(cred)
    return firestore.client()

def ingest_special():
    db = init_firestore()
    file_path = "台球手版本BAN位統計 - 工作表1.csv"
    
    if not os.path.exists(file_path):
        print("❌ 找不到原始 CSV 檔案")
        return

    print(f"🚀 開始處理 {file_path}...")
    
    with open(file_path, mode="r", encoding="utf-8-sig") as f:
        # 特別處理：手動解析，因為格式不規則
        reader = csv.reader(f)
        header = next(reader) # 版本,地圖,角色,,,,徽章
        
        curr_version = "未知版本"
        curr_map = "未知地圖"
        count = 0
        batch = db.batch()
        
        for row in reader:
            # 去除空值 (Stripping)
            row = [item.strip() for item in row]
            
            # 1. 偵測版本切換 (如果第一格有值，代表這是一行標題列)
            if row[0] and row[0] != "":
                curr_version = row[0]
                if row[1]: curr_map = row[1]
                continue # 這是標題提示列，跳過
                
            # 2. 偵測地圖切換 (如果第一格空，但第二格有值，代表這是一行新的地圖啟始)
            if not row[0] and row[1]:
                curr_map = row[1]
                # 有些行可能同時是數據列，有些只是地圖標籤。
                # 檢查是否有角色數據 (Column 2,3,4,5)
                if not row[2] and not row[3] and not row[4] and not row[5]:
                    continue # 這是純地圖提示列，跳過

            # 3. 處理正式數據列 (解析角色與監管者)
            # 欄位假設：3=Ban1, 4=Ban2, 5=Ban3, 6=監管者, 7=徽章
            # 注意：這裡的 index 是從 0 開始，所以角色1 是 index 2
            ban1 = row[2] if len(row) > 2 else ""
            ban2 = row[3] if len(row) > 3 else ""
            ban3 = row[4] if len(row) > 4 else ""
            hunter = row[5] if len(row) > 5 else ""
            badge = row[6] if len(row) > 6 else ""

            # 跳過空行
            if not ban1 and not ban2 and not hunter:
                continue

            # 移除常見的空標籤例如 "(無)"
            ban_names = [b for b in [ban1, ban2, ban3] if b and b != "(無)"]
            
            record = {
                "version": curr_version,
                "map_name": curr_map,
                "ban_survivors": ban_names,
                "hunter_name": hunter,
                "badge_level": badge,
                "source": "csv_import"
            }

            doc_ref = db.collection("match_records").document()
            batch.set(doc_ref, record)
            count += 1

            if count % 500 == 0:
                batch.commit()
                batch = db.batch()
        
        batch.commit()
    print(f"✨ 匯入完成！共計 {count} 筆「{curr_version}」版本的戰績已入庫。")

if __name__ == "__main__":
    ingest_special()
