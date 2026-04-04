import firebase_admin
from firebase_admin import credentials, auth, firestore
from config import settings

_app = None

def get_firebase_app():
    global _app
    if _app is None:
        cred = credentials.Certificate(settings.firebase_credentials_path)
        _app = firebase_admin.initialize_app(cred)
    return _app

def verify_id_token(id_token: str) -> dict:
    """驗證 Firebase ID Token，回傳解碼後的使用者資訊"""
    get_firebase_app()
    decoded = auth.verify_id_token(id_token)
    return decoded

def get_firestore():
    """取得 Firestore 客戶端"""
    get_firebase_app()
    return firestore.client()
