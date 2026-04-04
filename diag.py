import firebase_admin
from firebase_admin import credentials, firestore
import os

CRED_PATH = os.path.join("backend", "serviceAccountKey.json")

def check():
    if not firebase_admin._apps:
        cred = credentials.Certificate(CRED_PATH)
        firebase_admin.initialize_app(cred)
    db = firestore.client()

    print("--- 1. 檢查戰績紀錄 ---")
    recs = db.collection("match_records").limit(1).get()
    if not recs:
        print("❌ Firestore 中沒有任何戰績紀錄！")
    else:
        for r in recs:
            d = r.to_dict()
            print(f"地圖: {d.get('map_name')}")
            print(f"Ban 位: {d.get('ban_survivors')}")
            print(f"監管者: {d.get('hunter_name')}")

    print("\n--- 2. 檢查地圖名單 ---")
    maps = db.collection("maps").limit(3).get()
    for m in maps:
        print(f"選項名稱: {m.to_dict().get('name')}")

if __name__ == "__main__":
    check()
