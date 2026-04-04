import firebase_admin
from firebase_admin import credentials, firestore
import os

def check_db():
    cred_path = os.path.join("backend", "serviceAccountKey.json")
    if not firebase_admin._apps:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    
    match_records = db.collection("match_records").stream()
    count = sum(1 for _ in match_records)
    print(f"Total records in Firestore 'match_records': {count}")
    
    csv_imports = db.collection("match_records").where("source", "==", "csv_import").stream()
    csv_count = sum(1 for _ in csv_imports)
    print(f"Records imported from CSV (source=csv_import): {csv_count}")

if __name__ == "__main__":
    check_db()
