from fastapi import APIRouter, HTTPException, Header, Request
from models.schemas import TokenRequest, UserInfo
from services.firebase_service import verify_id_token
from services import d1_service

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/verify", response_model=UserInfo)
async def verify_token(request: Request, body: TokenRequest):
    """
    驗證 Firebase ID Token，並在 D1 中 upsert 使用者資料。
    前端登入後將 ID Token 送到這裡取得後端 Session。
    """
    try:
        decoded = verify_id_token(body.id_token)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

    uid = decoded["uid"]
    email = decoded.get("email", "")
    display_name = decoded.get("name", "")
    photo_url = decoded.get("picture", "")

    # Upsert user into D1
    await d1_service.execute(
        """
        INSERT INTO users (id, email, display_name, photo_url)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            email=excluded.email,
            display_name=excluded.display_name,
            photo_url=excluded.photo_url
        """,
        [uid, email, display_name, photo_url],
        request=request
    )

    # 權限提取與保護
    rows = await d1_service.query("SELECT role FROM users WHERE id = ?", [uid], request=request)
    role = (rows[0]["role"] or "user") if rows else "user"
    
    # 硬性保護：只有 waviskimo@gmail.com 被鎖定為 admin
    if email.lower() == "waviskimo@gmail.com":
        if role.lower() != "admin":
            role = "admin"
            await d1_service.execute("UPDATE users SET role = 'admin' WHERE id = ?", [uid], request=request)
            print(f"🛡️ Security: Promoted {email} to admin.")
    else:
        # 其他帳號遵循資料庫設定，確保 role 變數反映資料庫真實狀況
        role = role.lower()

    return UserInfo(
        uid=uid,
        email=email,
        display_name=display_name,
        photo_url=photo_url,
        role=role.lower(), # 確保回傳小寫
    )

@router.get("/me")
async def get_me(request: Request, authorization: str = Header(...)):
    """從 Authorization: Bearer <token> 取得目前使用者資訊"""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    id_token = authorization[7:]
    try:
        decoded = verify_id_token(id_token)
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))

    rows = await d1_service.query("SELECT * FROM users WHERE id = ?", [decoded["uid"]], request=request)
    if not rows:
        raise HTTPException(status_code=404, detail="User not found")
    return rows[0]
