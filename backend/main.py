from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from config import settings
from routers import auth, admin
from services import d1_service, firebase_service
from pydantic import BaseModel
from typing import List
from firebase_admin import firestore

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
    allow_origins=[settings.frontend_url, "http://127.0.0.1:5500"],
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
async def predict_hunter(body: PredictRequest):
    """
    加權推演系統：地圖基礎分 + 分層 Ban 位匹配 + 徽章權重
    """
    db = firebase_service.get_firestore()
    docs = db.collection("match_records").where("map_name", "==", body.map_name).stream()
    
    # 1. 載入地圖基礎分 (底層邏輯)
    counts = {}
    base_data = MAP_BASE_SCORES.get(body.map_name, {})
    for h, score in base_data.items():
        counts[h] = float(score)
        
    total_score = sum(counts.values())

    # 2. 權重常數設定
    BADGE_WEIGHTS = {"S": 5.0, "A": 3.0, "B": 1.5, "C": 1.0, "unknown": 1.0}
    MATCH_WEIGHTS = {3: 1.0, 2: 0.6, 1: 0.3} # 指定匹配權重

    input_bans = set(body.ban_survivors)
    max_matches_found = 0

    # 3. 疊加實戰數據分
    for doc in docs:
        data = doc.to_dict()
        record_bans = set(data.get("ban_survivors", []))
        
        intersection = input_bans.intersection(record_bans)
        match_count = len(intersection)
        
        # 廣泛匹配邏輯
        if match_count > 0 or not input_bans:
            weight_tier = MATCH_WEIGHTS.get(match_count, 1.0) if input_bans else 1.0
            
            if match_count > max_matches_found:
                max_matches_found = match_count
            
            hunter = data.get("hunter_name", "未知監管者")
            badge = data.get("badge_level", "unknown")
            
            # 推演公式：匹配信心 * 徽章強度
            data_contribution = weight_tier * BADGE_WEIGHTS.get(badge, 1.0)
            
            counts[hunter] = counts.get(hunter, 0.0) + data_contribution
            total_score += data_contribution
    
    if total_score == 0:
        return {"predictions": [], "message": "目前尚無任何符合或相關聯的數據。"}

    # 4. 排序並計算加權百分比
    sorted_hunters = sorted(counts.items(), key=lambda x: x[1], reverse=True)
    results = [
        {"hunter_name": h, "score": round(c, 1), "percentage": f"{(c / total_score * 100):.1f}%"}
        for h, c in sorted_hunters if c > 0
    ]
    
    # 5. 匹配標籤標註
    precision_label = "數據精準 (Tier 1)"
    if max_matches_found == 2: precision_label = "廣泛參考 (Tier 2)"
    if max_matches_found == 1: precision_label = "趨勢預估 (Tier 3)"
    if not input_bans: precision_label = "地圖原生排名"
    
    return {
        "predictions": results[:10], # 僅回傳前 10 名
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
    透過『預測回饋』提交戰績，自動帶入版本
    """
    db = firebase_service.get_firestore()
    client_ip = request.client.host
    
    # 抓取當前版本
    config = db.collection("configs").document("current_status").get()
    current_version = config.to_dict().get("current_version", "unknown") if config.exists else "unknown"

    db.collection("match_records").add({
        "map_name": body.map_name,
        "ban_survivors": body.ban_survivors,
        "hunter_name": body.hunter_name,
        "version": current_version,
        "badge_level": body.badge_level,
        "reported_at": firestore.SERVER_TIMESTAMP,
        "reported_by_ip": client_ip,
        "source": "feedback"
    })

    return {"status": "success", "message": "感謝您的數據貢獻！"}

# ── 數據回報與版本管理 ──
class ReportRequest(BaseModel):
    map_name: str
    ban_survivors: List[str]
    hunter_name: str
    badge_level: str = "C"

class VersionUpdateRequest(BaseModel):
    new_version: str

# 簡單的 IP 速率限制 (記憶體存放)
import time
last_report_times = {}

@app.post("/report")
async def report_match(request: Request, body: ReportRequest):
    """提交戰績回報，自動標註當前版本"""
    client_ip = request.client.host
    now = time.time()
    if client_ip in last_report_times and (now - last_report_times[client_ip]) < 120:
        raise HTTPException(status_code=429, detail="回報過於頻繁，請稍後再試")

    db = firebase_service.get_firestore()
    
    # 自動抓取當前版本
    config = db.collection("configs").document("current_status").get()
    current_version = config.to_dict().get("current_version", "unknown") if config.exists else "unknown"

    db.collection("match_records").add({
        "map_name": body.map_name,
        "ban_survivors": body.ban_survivors,
        "hunter_name": body.hunter_name,
        "version": current_version,
        "badge_level": body.badge_level,
        "reported_at": firestore.SERVER_TIMESTAMP,
        "reported_by_ip": client_ip
    })

    last_report_times[client_ip] = now
    return {"status": "success", "message": f"感謝與您的貢獻！已加入 {current_version} 數據池。"}

@app.post("/admin/update_version")
async def update_version(body: VersionUpdateRequest):
    """更新當前版本號碼 (Admin 專屬)"""
    db = firebase_service.get_firestore()
    db.collection("configs").document("current_status").update({
        "current_version": body.new_version
    })
    return {"status": "success", "new_version": body.new_version}

@app.get("/options")
async def get_options(map_name: str = None):
    """
    回傳選單，並根據當前選擇的『地圖』動態計算『🔥 熱門強勢』角色。
    邏輯：本地圖數據優先 -> 全局數據遞補 -> 初始 CSV 排序
    """
    db = firebase_service.get_firestore()
    
    # 讀取基礎清單
    maps = sorted([doc.to_dict().get("name") for doc in db.collection("maps").stream() if doc.to_dict().get("name")])
    survivors_dict = {s.to_dict().get("name"): {"name": s.to_dict().get("name"), "is_hot": False, "is_map_specific": False} 
                      for s in db.collection("survivors").stream() if s.to_dict().get("name")}
    hunters_dict = {h.to_dict().get("name"): {"name": h.to_dict().get("name"), "is_hot": False, "is_map_specific": False} 
                    for h in db.collection("hunters").stream() if h.to_dict().get("name")}
    
    # 讀取全數據計數
    records = list(db.collection("match_records").stream())
    
    # 分類計數
    map_counts = {"surv": {}, "hunt": {}}
    global_counts = {"surv": {}, "hunt": {}}
    
    for doc in records:
        data = doc.to_dict()
        m_name = data.get("map_name")
        h_name = data.get("hunter_name")
        bans = data.get("ban_survivors", [])
        
        # 全局累積
        if h_name: global_counts["hunt"][h_name] = global_counts["hunt"].get(h_name, 0) + 1
        for b in bans: global_counts["surv"][b] = global_counts["surv"].get(b, 0) + 1
        
        # 本地圖累積
        if map_name and m_name == map_name:
            if h_name: map_counts["hunt"][h_name] = map_counts["hunt"].get(h_name, 0) + 1
            for b in bans: map_counts["surv"][b] = map_counts["surv"].get(b, 0) + 1

    # 決定熱門角色 (Top 5)
    def mark_hot(target_dict, m_count, g_count):
        # 優先地圖數據 (至少要有 3 筆才算地圖強勢)
        hot_list = sorted(m_count.items(), key=lambda x: x[1], reverse=True)[:5]
        if sum(m_count.values()) < 3: # 回退全局
            hot_list = sorted(g_count.items(), key=lambda x: x[1], reverse=True)[:5]
            is_map = False
        else:
            is_map = True
            
        for name, _ in hot_list:
            if name in target_dict:
                target_dict[name]["is_hot"] = True
                target_dict[name]["is_map_specific"] = is_map

    mark_hot(survivors_dict, map_counts["surv"], global_counts["surv"])
    mark_hot(hunters_dict, map_counts["hunt"], global_counts["hunt"])

    return {
        "maps": maps,
        "survivors": list(survivors_dict.values()),
        "hunters": list(hunters_dict.values())
    }
