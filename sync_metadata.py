import csv
import firebase_admin
from firebase_admin import credentials, firestore
import os

CRED_PATH = os.path.join("backend", "serviceAccountKey.json")

def init_db():
    if not firebase_admin._apps:
        cred = credentials.Certificate(CRED_PATH)
        firebase_admin.initialize_app(cred)
    return firestore.client()

def sync(db, file, col, id_key, name_key):
    if not os.path.exists(file):
        print(f"⚠️ 跳過 {file}")
        return
    with open(file, mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            db.collection(col).document(row[id_key]).set({
                "id": row[id_key],
                "name": row[name_key]
            })
    print(f"✅ {col} 同步完成！")

if __name__ == "__main__":
    db = init_db()
    sync(db, "map.csv", "maps", "map_id", "map_name")
    sync(db, "suv.csv", "survivors", "survivor_id", "survivor_name")
    sync(db, "h.csv", "hunters", "hunter_id", "hunter_name")
