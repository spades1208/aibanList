from fastapi import APIRouter, Depends, Header, Request, HTTPException
from services import d1_service
from services.firebase_service import verify_id_token
from models.schemas import BanEntry, BanResponse, MatchRecord, VersionUpdateRequest
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
        print(f"❌ Auth Error (Token): {str(e)}")
        raise HTTPException(status_code=401, detail=str(e))

    uid = decoded["uid"]
    rows = await d1_service.query("SELECT role FROM users WHERE id = ?", [uid], request=request)
    if not rows:
        print(f"❌ Auth Error: User {uid} not found in database.")
        raise HTTPException(status_code=403, detail="User instance not found")
    
    role = rows[0]["role"] or "user"
    if role.lower() != "admin":
        print(f"❌ Auth Error: User {uid} has role '{role}', not admin.")
        raise HTTPException(status_code=403, detail="Admin access required")
    return uid

# ── 使用者管理 ─────────────────────────────────────────────

@router.get("/users")
async def list_users(
    request: Request, 
    page: int = 1, 
    page_size: int = 20, 
    is_blacklisted: Optional[int] = None,
    admin_uid: str = Depends(require_admin)
):
    """分頁列出使用者，支援黑名單篩選"""
    where_clauses = []
    params = []
    
    if is_blacklisted is not None:
        where_clauses.append("is_blacklisted = ?")
        params.append(is_blacklisted)
        
    where_sql = " WHERE " + " AND ".join(where_clauses) if where_clauses else ""
    
    # 1. 取得總數
    count_rows = await d1_service.query(f"SELECT COUNT(*) as total FROM users{where_sql}", params, request=request)
    total_count = count_rows[0]["total"] if count_rows else 0
    
    # 2. 執行分頁查詢
    offset = (page - 1) * page_size
    query_sql = f"SELECT id, email, display_name, photo_url, role, is_blacklisted, reputation, created_at FROM users{where_sql} ORDER BY created_at DESC LIMIT ? OFFSET ?"
    users = await d1_service.query(query_sql, params + [page_size, offset], request=request)
    
    return {
        "users": users,
        "total_count": total_count,
        "page": page,
        "page_size": page_size
    }

@router.patch("/users")
async def set_user_role(request: Request, uid: str, role: str, admin_uid: str = Depends(require_admin)):
    """設定使用者角色 (user / admin) - 支援查詢參數"""
    if role not in ("user", "admin"):
        raise HTTPException(status_code=400, detail="role must be 'user' or 'admin'")
    await d1_service.execute("UPDATE users SET role = ? WHERE id = ?", [role, uid], request=request)
    return {"message": f"User {uid} role updated to {role}"}

@router.patch("/users/blacklist") # 修復路徑相容性
async def set_user_blacklist_compat(request: Request, uid: str, is_blacklisted: bool, admin_uid: str = Depends(require_admin)):
    """切換使用者黑名單狀態 - 支援查詢參數"""
    val = 1 if is_blacklisted else 0
    await d1_service.execute("UPDATE users SET is_blacklisted = ? WHERE id = ?", [val, uid], request=request)
    return {"message": f"User {uid} blacklist status updated to {is_blacklisted}"}

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
    
    # 3. 執行分頁查詢 (Join users 表以獲取黑名單狀態與信譽)
    offset = (page - 1) * page_size
    query_sql = f"""
        SELECT r.*, u.is_blacklisted, u.reputation
        FROM match_records r
        LEFT JOIN users u ON r.added_by_uid = u.id
        {where_sql} 
        ORDER BY r.reported_at DESC 
        LIMIT ? OFFSET ?
    """
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
    """管理員刪除特定戰績記錄 (不扣分，用於清理數據)"""
    await d1_service.execute("DELETE FROM match_records WHERE id = ?", [record_id], request=request)
    return {"message": f"Record {record_id} deleted"}

@router.post("/records/batch_verify")
async def batch_verify(request: Request, body: dict, admin_uid: str = Depends(require_admin)):
    """批量驗證多筆戰績"""
    record_ids = body.get("record_ids", [])
    if not record_ids:
        raise HTTPException(status_code=400, detail="No IDs provided")
    
    placeholders = ",".join(["?"] * len(record_ids))
    sql = f"UPDATE match_records SET is_verified = 1 WHERE id IN ({placeholders})"
    await d1_service.execute(sql, record_ids, request=request)
    
    return {"status": "success", "message": f"Successfully verified {len(record_ids)} records"}

@router.post("/update_version")
async def update_version(body: VersionUpdateRequest, request: Request, admin_uid: str = Depends(require_admin)):
    """更新當前版本號碼 (Admin 專屬)"""
    await d1_service.execute(
        "UPDATE configs SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'current_version'",
        [body.new_version],
        request=request
    )
    return {"status": "success", "new_version": body.new_version}

@router.post("/fix_records")
async def fix_records(request: Request, admin_uid: str = Depends(require_admin)):
    """將所有舊數據版本修復為當前最新版本 (Admin 專屬)"""
    # 1. 抓取當前版本
    rows = await d1_service.query("SELECT value FROM configs WHERE key = 'current_version'", request=request)
    if not rows:
        raise HTTPException(status_code=500, detail="Current version config not found")
    
    current_version = rows[0]["value"]
    
    # 2. 更新所有版本不一致的數據
    meta = await d1_service.execute(
        "UPDATE match_records SET version = ? WHERE version != ?",
        [current_version, current_version],
        request=request
    )
    
    updated_count = meta.get("rows_affected", 0)
    return {
        "status": "success", 
        "message": f"數據修復完成，共更新 {updated_count} 筆記錄至版本 {current_version}",
        "updated_count": updated_count
    }

# ── 驗證與信譽管理系統 ──────────────────────────────────────

@router.patch("/records/{record_id}/verify")
async def verify_record(request: Request, record_id: int, admin_uid: str = Depends(require_admin)):
    """切換戰績驗證狀態 (is_verified)"""
    # 先獲取當前狀態
    rows = await d1_service.query("SELECT is_verified FROM match_records WHERE id = ?", [record_id], request=request)
    if not rows:
        raise HTTPException(status_code=404, detail="Record not found")
    
    new_val = 1 if rows[0]["is_verified"] == 0 else 0
    await d1_service.execute("UPDATE match_records SET is_verified = ? WHERE id = ?", [new_val, record_id], request=request)
    return {"message": f"Record {record_id} verification set to {new_val}"}

@router.post("/records/{record_id}/flag")
async def flag_record(request: Request, record_id: int, admin_uid: str = Depends(require_admin)):
    """標記為惡意數據：刪除記錄並扣除提交者信譽分 (20)"""
    # 1. 獲取提交者資訊
    rows = await d1_service.query("SELECT added_by_uid FROM match_records WHERE id = ?", [record_id], request=request)
    if not rows:
        raise HTTPException(status_code=404, detail="Record not found")
    
    uid = rows[0]["added_by_uid"]
    
    # 2. 扣除信譽分 (最低降至 0)
    if uid:
        await d1_service.execute(
            "UPDATE users SET reputation = MAX(0, reputation - 20) WHERE id = ?",
            [uid], request=request
        )
    
    # 3. 刪除記錄
    await d1_service.execute("DELETE FROM match_records WHERE id = ?", [record_id], request=request)
    
    return {"message": f"Record {record_id} flagged and deleted. Submitter {uid} reputation deducted."}

@router.post("/users/{uid}/restore_reputation")
async def restore_reputation(request: Request, uid: str, admin_uid: str = Depends(require_admin)):
    """人工審核：恢復用戶信譽分至 100"""
    await d1_service.execute("UPDATE users SET reputation = 100 WHERE id = ?", [uid], request=request)
    return {"message": f"User {uid} reputation restored to 100"}
