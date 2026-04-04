from fastapi import APIRouter, HTTPException, Header, Depends, Request
from services.firebase_service import verify_id_token
from services import d1_service, firebase_service
from models.schemas import BanEntry, BanResponse
from typing import List, Optional

router = APIRouter(prefix="/admin", tags=["admin"])

async def require_admin(request: Request, authorization: str = Header(...)):
    """依賴注入：驗證 Token 且必須是 admin 角色"""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    id_token = authorization[7:]
    try:
        decoded = verify_id_token(id_token)
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))

    uid = decoded["uid"]
    rows = await d1_service.query("SELECT role FROM users WHERE id = ?", [uid], request=request)
    if not rows or rows[0]["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return uid

# ── 使用者管理 ─────────────────────────────────────────────

@router.get("/users")
async def list_users(request: Request, admin_uid: str = Depends(require_admin)):
    """列出所有使用者"""
    return await d1_service.query("SELECT * FROM users ORDER BY created_at DESC", request=request)

@router.patch("/users/{uid}/role")
async def set_user_role(request: Request, uid: str, role: str, admin_uid: str = Depends(require_admin)):
    """設定使用者角色 (user / admin)"""
    if role not in ("user", "admin"):
        raise HTTPException(status_code=400, detail="role must be 'user' or 'admin'")
    await d1_service.execute("UPDATE users SET role = ? WHERE id = ?", [role, uid], request=request)
    return {"message": f"User {uid} role updated to {role}"}

# ── 封鎖名單 CRUD ──────────────────────────────────────────

@router.get("/banlist", response_model=List[BanResponse])
async def list_banlist(request: Request, admin_uid: str = Depends(require_admin)):
    """取得所有封鎖記錄"""
    return await d1_service.query(
        "SELECT * FROM banlist ORDER BY banned_at DESC", request=request
    )

@router.post("/banlist", response_model=dict)
async def ban_user(request: Request, entry: BanEntry, admin_uid: str = Depends(require_admin)):
    """新增封鎖記錄"""
    meta = await d1_service.execute(
        "INSERT INTO banlist (user_id, reason, banned_by) VALUES (?, ?, ?)",
        [entry.user_id, entry.reason, admin_uid], request=request
    )
    return {"message": "User banned", "id": meta.get("last_row_id")}

@router.delete("/banlist/{ban_id}")
async def unban_user(request: Request, ban_id: int, admin_uid: str = Depends(require_admin)):
    """解除封鎖（軟刪除）"""
    await d1_service.execute(
        "UPDATE banlist SET is_active = 0 WHERE id = ?", [ban_id], request=request
    )
    return {"message": f"Ban #{ban_id} lifted"}

# ── 戰績數據管理 ──────────────────────────────────────────

@router.get("/records")
async def list_records(
    request: Request,
    page: int = 1,
    page_size: int = 10,
    map_name: Optional[str] = None,
    hunter_name: Optional[str] = None,
    admin_uid: str = Depends(require_admin)
):
    """分頁列出所有戰績，並支援地圖與監管者篩選"""
    db = firebase_service.get_firestore()
    query = db.collection("match_records")

    # 1. 條件篩選 (Firestore 複合查詢需要建立索引，這裡我們先採順序過濾或簡單過濾)
    if map_name:
        query = query.where("map_name", "==", map_name)
    if hunter_name:
        query = query.where("hunter_name", "==", hunter_name)

    # 2. 分頁處理 (注意：大型數據建議使用 start_after 游標)
    offset = (page - 1) * page_size
    
    # 取得總數
    # 注意：Firestore 取得總數在大規模數據下需使用 aggregation query
    # 這裡我們先採簡易方式
    all_docs = query.get()
    total_count = len(all_docs)

    # 執行分頁查詢
    # 注意：在 Firestore 中，如果使用 order_by 某個欄位，則該欄位不存在的文檔會被自動排除。
    # 由於 CSV 匯入的資料沒有 reported_at，所以我們先移除排序以確保資料能顯示。
    docs = query.limit(page_size).offset(offset).get()
    
    results = []
    for doc in docs:
        d = doc.to_dict()
        d["id"] = doc.id
        # 轉換 Timestamp 為字串
        if "reported_at" in d and d["reported_at"]:
            d["reported_at"] = d["reported_at"].isoformat()
        results.append(d)

    return {
        "records": results,
        "total_count": total_count,
        "page": page,
        "page_size": page_size
    }

@router.delete("/records/{record_id}")
async def delete_record(request: Request, record_id: str, admin_uid: str = Depends(require_admin)):
    """刪除特定戰績記錄"""
    db = firebase_service.get_firestore()
    db.collection("match_records").document(record_id).delete()
    return {"message": f"Record {record_id} deleted"}
