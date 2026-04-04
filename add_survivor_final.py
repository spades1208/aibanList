import firebase_admin
from firebase_admin import credentials, firestore
import os
import sys

def add_survivor(name):
    key_path = os.path.join('backend', 'serviceAccountKey.json')
    if not os.path.exists(key_path):
        print(f"Error: Credentials not found at {key_path}")
        return False

    try:
        if not firebase_admin._apps:
            cred = credentials.Certificate(key_path)
            firebase_admin.initialize_app(cred)
        
        db = firestore.client()
        # 避免重複新增
        existing = db.collection('survivors').where('name', '==', name).get()
        if len(existing) > 0:
            print(f"'{name}' already exists in Firestore.")
        else:
            db.collection('survivors').add({'name': name})
            print(f"Successfully added '{name}' to Firestore survivors.")
        return True
    except Exception as e:
        print(f"Failed to add survivor: {e}")
        return False

if __name__ == "__main__":
    target_name = "鬥牛士"
    if add_survivor(target_name):
        # 同步本地 CSV
        try:
            csv_path = "suv.csv"
            # 找到最大的 ID
            max_id = 0
            if os.path.exists(csv_path):
                with open(csv_path, 'r', encoding='utf-8-sig') as f:
                    lines = f.readlines()
                    for line in lines[1:]:
                        if ',' in line:
                            try:
                                curr_id = int(line.split(',')[0])
                                if curr_id > max_id: max_id = curr_id
                            except: pass
            
            new_id = max_id + 1
            with open(csv_path, 'a', encoding='utf-8-sig') as f:
                f.write(f"\n{new_id},{target_name}")
            print(f"Successfully appended '{target_name}' to {csv_path} with ID {new_id}.")
        except Exception as e:
            print(f"Failed to update CSV: {e}")
    else:
        sys.exit(1)
