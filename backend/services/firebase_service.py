import firebase_admin
from firebase_admin import credentials, auth
from config import settings

_app = None

def get_firebase_app():
    global _app
    if _app is None:
        cred = credentials.Certificate(settings.firebase_credentials_path)
        _app = firebase_admin.initialize_app(cred)
    return _app

import time

def verify_id_token(id_token: str) -> dict:
    """驗證 Firebase ID Token，加入時鐘誤差容錯 (Clock Skew Leeway)"""
    get_firebase_app()
    try:
        return auth.verify_id_token(id_token)
    except Exception as e:
        # 如果報錯訊息包含 "used too early"，代表時鐘差了 1-2 秒，自動等待後重試
        if "too early" in str(e).lower():
            print(f"⏰ Clock skew detected, retrying in 1.5s...")
            time.sleep(1.5)
            return auth.verify_id_token(id_token)
        raise e
