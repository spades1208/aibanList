import firebase_admin
from firebase_admin import credentials, firestore
import os

# 使用專案中現有的 Service Account 金鑰
CRED_PATH = os.path.join("backend", "serviceAccountKey.json")

def init_firestore():
    if not firebase_admin._apps:
        if not os.path.exists(CRED_PATH):
            # 嘗試根目錄下的另一個金鑰檔
            alternate_path = "aibanlist-firebase-adminsdk-fbsvc-142f228037.json"
            if os.path.exists(alternate_path):
                cred = credentials.Certificate(alternate_path)
            else:
                raise FileNotFoundError(f"Cannot find service account key at {CRED_PATH}")
        else:
            cred = credentials.Certificate(CRED_PATH)
        firebase_admin.initialize_app(cred)
    return firestore.client()

def migrate():
    try:
        db = init_firestore()
        collection_ref = db.collection("match_records")
        
        print("Starting version migration...")
        
        # 1. 處理 "2024.12.30"
        docs_1 = list(collection_ref.where("version", "==", "2024.12.30").stream())
        print(f"Found {len(docs_1)} records with version '2024.12.30'")
        
        # 2. 處理 "unknown"
        docs_2 = list(collection_ref.where("version", "==", "unknown").stream())
        print(f"Found {len(docs_2)} records with version 'unknown'")
        
        count = 0
        for doc in docs_1:
            doc.reference.update({"version": "Season 41"})
            count += 1
            
        for doc in docs_2:
            doc.reference.update({"version": "Season 41"})
            count += 1
            
        print(f"Success! Total records updated to 'Season 41': {count}")
    except Exception as e:
        print(f"Error during migration: {e}")

if __name__ == "__main__":
    migrate()
