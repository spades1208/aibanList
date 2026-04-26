import json
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from config import settings
from routers import auth, admin
from services import d1_service
from services.firebase_service import verify_id_token
from pydantic import BaseModel
from typing import List, Optional
import time

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 啟動時初始化 D1 資料表
    await d1_service.init_tables()
    print("✅ D1 tables initialized")
    yield

app = FastAPI(
    title="aiBanlist API",
    description="Firebase Auth + Cloudflare D1 後端 API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_url, 
        "http://127.0.0.1:5500", 
        "http://localhost:5500",
        "http://127.0.0.1:8000",
        "http://localhost:8000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(admin.router)

@app.get("/")
async def root():
    return {"status": "ok", "message": "aiBanlist API is running 🚀"}

# --- 數據預測：加權推演系統 2.0 ---
class PredictRequest(BaseModel):
    map_name: str
    ban_survivors: List[str]

# 地圖基礎強勢分 (博弈常識)
MAP_BASE_SCORES = {
    "里奧的回憶": {"隱士": 10.0, "歌劇演員": 10.0, "『使徒』": 5.0},
    "永眠鎮": {"隱士": 10.0, "宿傘之魂": 8.0, "守夜人": 8.0},
    "紅教堂": {"紅蝶": 10.0, "守夜人": 10.0, "漁女": 5.0},
    "聖心醫院": {"時空之影": 10.0, "雕刻家": 10.0, "夢之女巫": 5.0},
    "軍工廠": {"歌劇演員": 10.0, "漁女": 10.0, "廠長": 5.0},
    "月亮河公園": {"『傑克』": 8.0, "蜘蛛": 8.0, "宿傘之魂": 5.0},
    "湖景村": {"漁女": 12.0, "黃衣之主": 8.0, "『使徒』": 5.0},
}

@app.post("/predict")
async def predict_hunter(body: PredictRequest, request: Request):
    """
    加權推演系統 3.0：指紋鎖定 + 動態冷門校驗 + 時間衰減 + 信譽過濾
    """
    # 1. 抓取所有合規數據 (非黑名單且信譽分 >= 60)
    sql = """
        SELECT r.*, u.reputation, u.is_blacklisted, u.created_at,
               (SELECT COUNT(*) FROM match_records m2 WHERE m2.added_by_uid = u.id) as total_submissions,
               (SELECT COUNT(*) FROM match_records m3 WHERE m3.added_by_uid = u.id AND m3.is_verified = 1) as verified_submissions
        FROM match_records r
        LEFT JOIN users u ON r.added_by_uid = u.id
        WHERE r.map_name = ? 
        AND (u.is_blacklisted IS NULL OR u.is_blacklisted = 0)
        AND (u.reputation IS NULL OR u.reputation >= 60)
    """
    records = await d1_service.query(sql, [body.map_name], request=request)
    
    # 2. 動態冷門角色判定 (全局出現頻率後段 2/3)
    all_surv_sql = "SELECT ban_survivors FROM match_records"
    all_matches = await d1_service.query(all_surv_sql, request=request)
    surv_freq = {}
    for am in all_matches:
        try:
            for s in json.loads(am.get("ban_survivors", "[]")):
                surv_freq[s] = surv_freq.get(s, 0) + 1
        except: continue
    
    sorted_surv = sorted(surv_freq.items(), key=lambda x: x[1])
    cold_threshold_idx = int(len(sorted_surv) * (2/3))
    cold_characters = set([s[0] for s in sorted_surv[:cold_threshold_idx]])

    # 3. 載入地圖基礎分
    counts = {}
    base_data = MAP_BASE_SCORES.get(body.map_name, {})
    for h, score in base_data.items():
        counts[h] = float(score)
    total_score = sum(counts.values())

    # 4. 指紋識別預處理
    input_bans = set(body.ban_survivors)
    fingerprint_count = 0
    if len(input_bans) == 3:
        for r in records:
            try:
                rb = set(json.loads(r.get("ban_survivors", "[]")))
                if input_bans == rb: fingerprint_count += 1
            except: continue

    # 5. 常數設定
    BADGE_WEIGHTS = {"S": 8.0, "A": 4.0, "B": 1.5, "C": 1.0, "unknown": 1.0}
    MATCH_WEIGHTS = {3: 1.0, 2: 0.6, 1: 0.3}
    NOW = time.time()
    max_matches_found = 0

    # 6. 核心加權循環
    from datetime import datetime
    for data in records:
        try:
            record_bans = set(json.loads(data.get("ban_survivors", "[]")))
        except: record_bans = set()
            
        intersection = input_bans.intersection(record_bans)
        match_count = len(intersection)
        
        if match_count > 0 or not input_bans:
            if match_count > max_matches_found:
                max_matches_found = match_count

            # A. 基礎匹配與指紋加權
            weight_tier = MATCH_WEIGHTS.get(match_count, 1.0) if input_bans else 1.0
            if len(input_bans) == 3 and match_count == 3 and fingerprint_count >= 3:
                weight_tier = 10.0
            
            # B. 時間衰減 (30 - 77 天)
            reported_at = data.get("reported_at", "")
            try:
                ts = datetime.fromisoformat(reported_at.replace(" ", "T")).timestamp()
                days_old = (NOW - ts) / 86400
            except: days_old = 0
            
            time_factor = 1.0
            if days_old > 30:
                time_factor = max(0.5, 1.0 - (days_old - 30) / (77 - 30) * 0.5)

            # C. 身份與驗證過濾 (加上冷卻期防禦)
            badge = data.get("badge_level", "unknown")
            is_verified = data.get("is_verified", 0)
            
            # --- 新用戶冷卻期過濾 ---
            if not is_verified:
                created_at = data.get("created_at")
                reputation = data.get("reputation", 100)
                total_submissions = data.get("total_submissions", 0)
                verified_submissions = data.get("verified_submissions", 0)
                
                is_safe = False
                try:
                    # 帳號大於三天且滿分
                    ts_created = datetime.fromisoformat(created_at.replace(" ", "T")).timestamp()
                    days_member = (NOW - ts_created) / 86400
                    if days_member >= 3 and reputation >= 100: is_safe = True
                except: pass
                
                # 或者曾經有過任何一筆被驗證通過的數據
                if verified_submissions > 0: is_safe = True
                
                if not is_safe:
                    # 處於冷卻期：徹底忽略權重
                    contribution = 0.0
                    hunter = data.get("hunter_name", "未知監管者")
                    counts[hunter] = counts.get(hunter, 0.0) + contribution
                    continue

            if badge in ["S", "A"] and not is_verified:
                effective_badge_weight = 1.0
            else:
                effective_badge_weight = BADGE_WEIGHTS.get(badge, 1.0)

            # D. 冷門角色校驗
            cold_boost = 1.0
            contains_cold = any(s in cold_characters for s in record_bans)
            if contains_cold:
                if badge in ["S", "A"] and is_verified:
                    cold_boost = 2.0
                elif badge in ["unknown", "C"]:
                    cold_boost = 0.1

            # E. 最終得分計算
            contribution = weight_tier * time_factor * effective_badge_weight * cold_boost
            
            hunter = data.get("hunter_name", "未知監管者")
            counts[hunter] = counts.get(hunter, 0.0) + contribution
            total_score += contribution
    
    if total_score <= 0:
        return {"predictions": [], "total_score": 0.0, "precision_label": "數據稀缺"}

    # 7. 排序並計算加權百分比
    sorted_hunters = sorted(counts.items(), key=lambda x: x[1], reverse=True)
    results = [
        {"hunter_name": h, "weight": round(c, 1), "percentage": f"{(c / total_score * 100):.1f}%"}
        for h, c in sorted_hunters if c > 0
    ]
    
    precision_label = "數據精準 (Tier 1)"
    if max_matches_found == 2: precision_label = "廣孩參考 (Tier 2)"
    if max_matches_found == 1: precision_label = "趨勢預估 (Tier 3)"
    if not input_bans: precision_label = "地圖原生排名"
    if len(input_bans) == 3 and fingerprint_count >= 3:
        precision_label = "🔥 指紋鎖定成功"

    return {
        "predictions": results[:10],
        "total_score": round(total_score, 1),
        "precision_label": precision_label
    }

# ── 數據回饋系統 ──
class MatchSubmitRequest(BaseModel):
    map_name: str
    ban_survivors: List[str]
    hunter_name: str
    badge_level: str = "C"

@app.post("/submit-match")
async def submit_match(request: Request, body: MatchSubmitRequest):
    """
    透過『預測回饋』提交戰績，自動帶入版本與用戶資訊
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    
    try:
        decoded = verify_id_token(auth_header[7:])
        uid = decoded["uid"]
        name = decoded.get("name", "Unknown User")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    # 抓取當前版本
    rows = await d1_service.query("SELECT value FROM configs WHERE key = 'current_version'", request=request)
    current_version = rows[0]["value"] if rows else "unknown"

    await d1_service.execute(
        "INSERT INTO match_records (map_name, ban_survivors, hunter_name, version, badge_level, source, added_by_uid, added_by_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [body.map_name, json.dumps(body.ban_survivors), body.hunter_name, current_version, body.badge_level, "feedback", uid, name],
        request=request
    )

    return {"status": "success", "message": "感謝您的數據貢獻！"}

# ── 數據回報與版本管理 ──
class ReportRequest(BaseModel):
    map_name: str
    ban_survivors: List[str]
    hunter_name: str
    badge_level: str = "C"

# 簡單的 IP 速率限制 (記憶體存放)
import time
last_report_times = {}

@app.post("/report")
async def report_match(request: Request, body: ReportRequest):
    """提交戰績回報，強制驗證 Token 並提取用戶資訊"""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Login required to report matches")
    
    try:
        decoded = verify_id_token(auth_header[7:])
        uid = decoded["uid"]
        name = decoded.get("name", "Unknown User")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid session")

    client_ip = request.client.host
    now = time.time()
    if client_ip in last_report_times and (now - last_report_times[client_ip]) < 60:
        raise HTTPException(status_code=429, detail="回報過於頻繁，請稍後再試")

    # 自動抓取當前版本
    rows = await d1_service.query("SELECT value FROM configs WHERE key = 'current_version'", request=request)
    current_version = rows[0]["value"] if rows else "unknown"

    await d1_service.execute(
        "INSERT INTO match_records (map_name, ban_survivors, hunter_name, version, badge_level, source, added_by_uid, added_by_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [body.map_name, json.dumps(body.ban_survivors), body.hunter_name, current_version, body.badge_level, "user_report", uid, name],
        request=request
    )

    last_report_times[client_ip] = now
    return {"status": "success", "message": f"感謝 {name} 的貢獻！資料已納入 {current_version} 數據池。"}

@app.get("/options")
async def get_options(request: Request, map_name: str = None):
    """
    回傳選單，並根據當前選擇的『地圖』動態計算『🔥 熱門強勢』角色。
    邏輯：本地圖數據優先 -> 全局數據遞補 -> 初始資料庫排序
    """
    # 1. 讀取基礎清單
    map_rows = await d1_service.query("SELECT name FROM maps ORDER BY name ASC", request=request)
    surv_rows = await d1_service.query("SELECT name FROM survivors ORDER BY name ASC", request=request)
    hunt_rows = await d1_service.query("SELECT name FROM hunters ORDER BY name ASC", request=request)
    
    maps = [r["name"] for r in map_rows]
    survivors_dict = {r["name"]: {"name": r["name"], "is_hot": False, "is_map_specific": False} for r in surv_rows}
    hunters_dict = {r["name"]: {"name": r["name"], "is_hot": False, "is_map_specific": False} for r in hunt_rows}
    
    # 2. 讀取實戰數據進行熱門度統計 (過濾黑名單)
    sql_records = """
        SELECT r.map_name, r.hunter_name, r.ban_survivors 
        FROM match_records r
        LEFT JOIN users u ON r.added_by_uid = u.id
        WHERE (u.is_blacklisted IS NULL OR u.is_blacklisted = 0)
    """
    records = await d1_service.query(sql_records, request=request)
    
    map_counts = {"surv": {}, "hunt": {}}
    global_counts = {"surv": {}, "hunt": {}}
    
    for row in records:
        m_name = row.get("map_name")
        h_name = row.get("hunter_name")
        try:
            bans = json.loads(row.get("ban_survivors", "[]"))
        except:
            bans = []
        
        # 全局累積
        if h_name: global_counts["hunt"][h_name] = global_counts["hunt"].get(h_name, 0) + 1
        for b in bans: global_counts["surv"][b] = global_counts["surv"].get(b, 0) + 1
        
        # 本地圖累積
        if map_name and m_name == map_name:
            if h_name: map_counts["hunt"][h_name] = map_counts["hunt"].get(h_name, 0) + 1
            for b in bans: map_counts["surv"][b] = map_counts["surv"].get(b, 0) + 1

    # 決定熱門角色 (Top 5) 並進行排序
    def process_and_sort(target_dict, m_count, g_count):
        # 1. 決定「熱門」標籤邏輯 (維持原樣)
        hot_list = sorted(m_count.items(), key=lambda x: x[1], reverse=True)[:5]
        is_map = True
        if sum(m_count.values()) < 3: 
            hot_list = sorted(g_count.items(), key=lambda x: x[1], reverse=True)[:5]
            is_map = False
            
        for name, _ in hot_list:
            if name in target_dict:
                target_dict[name]["is_hot"] = True
                target_dict[name]["is_map_specific"] = is_map

        # 2. 執行排序邏輯：本地圖次數 (DESC) > 全局次數 (DESC) > 名稱 (ASC)
        # 由於 Python 的 sorted 是穩定的 (stable)，我們從最不重要的權重開始排
        # 先按名稱排序 (ASC)
        temp_list = sorted(target_dict.values(), key=lambda x: x["name"])
        # 再按出現次數排序 (DESC)
        final_list = sorted(
            temp_list, 
            key=lambda x: (m_count.get(x["name"], 0), g_count.get(x["name"], 0)), 
            reverse=True
        )
        return final_list

    final_survivors = process_and_sort(survivors_dict, map_counts["surv"], global_counts["surv"])
    final_hunters = process_and_sort(hunters_dict, map_counts["hunt"], global_counts["hunt"])

    return {
        "maps": maps,
        "survivors": final_survivors,
        "hunters": final_hunters
    }
