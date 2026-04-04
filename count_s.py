import firebase_admin
from firebase_admin import credentials, firestore
import sys

try:
    cred = credentials.Certificate('backend/serviceAccountKey.json')
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    
    docs = db.collection('match_records').stream()
    data = [d.to_dict() for d in docs]
    n = len(data)
    
    if n == 0:
        print("目前資料庫中尚無回報數據。")
        sys.exit(0)
        
    s = len([d for d in docs if d.get('badge_level')=='S'])
    a = len([d for d in docs if d.get('badge_level')=='A'])
    b = len([d for d in docs if d.get('badge_level')=='B'])
    c = len([d for d in docs if d.get('badge_level') in ['C', 'unknown', None]])
    
    print(f"📊 --- 數據庫統計報告 ---")
    print(f"總計樣本數: {n} 筆")
    print(f"------------------------")
    print(f"✨ S 牌 (權重 5.0): {s} 筆 ({(s/n*100):.1f}%)")
    print(f"🥇 A 牌 (權重 3.0): {a} 筆 ({(a/n*100):.1f}%)")
    print(f"🥈 B 牌 (權重 1.5): {b} 筆 ({(b/n*100):.1f}%)")
    print(f"🥉 C 牌 / 無 (權重 1.0): {c} 筆 ({(c/n*100):.1f}%)")
    print(f"------------------------")
    print(f"🚀 下一步：執行加權推演演算法升級。")
except Exception as e:
    print(f"統計失敗: {str(e)}")
