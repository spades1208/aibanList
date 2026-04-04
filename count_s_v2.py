import firebase_admin
from firebase_admin import credentials, firestore
import os

def run_stats():
    key_path = 'backend/serviceAccountKey.json'
    if not os.path.exists(key_path):
        print(f"FAILED: {key_path} not found")
        return

    try:
        cred = credentials.Certificate(key_path)
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        
        docs = db.collection('match_records').get()
        data = [d.to_dict() for d in docs]
        total = len(data)
        
        if total == 0:
            print("目前沒有任何數據回報。")
            return
            
        s = len([d for d in data if d.get('badge_level') == 'S'])
        a = len([d for d in data if d.get('badge_level') == 'A'])
        b = len([d for d in data if d.get('badge_level') == 'B'])
        
        print(f"TOTAL_RECORDS: {total}")
        print(f"S_COUNT: {s} ({(s/total*100):.1f}%)")
        print(f"A_COUNT: {a} ({(a/total*100):.1f}%)")
        print(f"B_COUNT: {b} ({(b/total*100):.1f}%)")
        
    except Exception as e:
        print(f"CRASHED: {str(e)}")

if __name__ == "__main__":
    run_stats()
