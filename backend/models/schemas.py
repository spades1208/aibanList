from pydantic import BaseModel
from typing import Optional

class TokenRequest(BaseModel):
    id_token: str

class UserInfo(BaseModel):
    uid: str
    email: str
    display_name: Optional[str] = None
    photo_url: Optional[str] = None
    role: str = "user"
    reputation: int = 100

class BanEntry(BaseModel):
    user_id: str
    reason: Optional[str] = None

class BanResponse(BaseModel):
    id: int
    user_id: str
    reason: Optional[str] = None
    banned_by: str
    banned_at: str
    is_active: int

class MatchRecord(BaseModel):
    id: int
    map_name: str
    ban_survivors: list[str]  # 儲存與解析為 JSON list
    hunter_name: str
    version: str
    badge_level: str
    reported_at: str
    source: str
    is_verified: int = 0

class VersionUpdateRequest(BaseModel):
    new_version: str
