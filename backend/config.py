from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    firebase_credentials_path: str = "./serviceAccountKey.json"
    cloudflare_account_id: str
    cloudflare_d1_database_id: str
    cloudflare_api_token: str
    frontend_url: str = "http://localhost:3000"
    host: str = "0.0.0.0"
    port: int = 8000

    class Config:
        env_file = ".env"

settings = Settings()
