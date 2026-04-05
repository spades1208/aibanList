from fastapi import APIRouter, Depends, Header, Request, HTTPException
from services import d1_service
from services.firebase_service import verify_id_token
from models.schemas import BanEntry, BanResponse, MatchRecord
from typing import List, Optional
import json

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
    if not rows or rows[0]["role"].lower() != "admin":
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
    # 1. 構建 SQL 查詢
    where_clauses = []
    params = []
    
    if map_name:
        where_clauses.append("map_name = ?")
        params.append(map_name)
    if hunter_name:
        where_clauses.append("hunter_name = ?")
        params.append(hunter_name)
        
    where_sql = " WHERE " + " AND ".join(where_clauses) if where_clauses else ""
    
    # 2. 取得總數
    count_rows = await d1_service.query(f"SELECT COUNT(*) as total FROM match_records{where_sql}", params, request=request)
    total_count = count_rows[0]["total"] if count_rows else 0
    
    # 3. 執行分頁查詢
    offset = (page - 1) * page_size
    query_sql = f"SELECT * FROM match_records{where_sql} ORDER BY reported_at DESC LIMIT ? OFFSET ?"
    records = await d1_service.query(query_sql, params + [page_size, offset], request=request)
    
    # 4. 解析 JSON 並格式化
    for r in records:
        try:
            r["ban_survivors"] = json.loads(r.get("ban_survivors", "[]"))
        except:
            r["ban_survivors"] = []
            
    return {
        "records": records,
        "total_count": total_count,
        "page": page,
        "page_size": page_size
    }

@router.delete("/records/{record_id}")
async def delete_record(request: Request, record_id: int, admin_uid: str = Depends(require_admin)):
    """刪除特定戰績記錄"""
    await d1_service.execute("DELETE FROM match_records WHERE id = ?", [record_id], request=request)
    return {"message": f"Record {record_id} deleted"}
