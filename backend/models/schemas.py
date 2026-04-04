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

class BanEntry(BaseModel):
    user_id: str
    reason: Optional[str] = None

class BanResponse(BaseModel):
    id: int
    user_id: str
    reason: Optional[str]
    banned_by: str
    banned_at: str
    is_active: int
