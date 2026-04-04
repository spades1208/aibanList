import firebase_admin
from firebase_admin import credentials, firestore
import os

CRED_PATH = os.path.join("backend", "serviceAccountKey.json")

def init():
    if not firebase_admin._apps:
        cred = credentials.Certificate(CRED_PATH)
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    
    # 初始化版本配置
    db.collection("configs").document("current_status").set({
        "current_version": "Season 41"
    })
    print("✅ Firestore Config Initialized: current_version = Season 41")

if __name__ == "__main__":
    init()
