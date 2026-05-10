from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(case_sensitive=False, extra="ignore")

    database_url: str
    session_secret: str

    google_client_id: str
    google_client_secret: str
    allowed_emails: str = ""

    session_https_only: bool = True
    session_max_age_seconds: int = 8 * 3600

    # Comma-separated origins allowed via CORS (with credentials). Empty in
    # production where the SPA is path-routed on the same origin; populate
    # in dev to point at the Vite dev server (e.g., http://localhost:5173).
    cors_allow_origins: str = ""

    s3_endpoint_url: str = ""
    s3_region: str = "us-east-1"
    s3_bucket: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_use_path_style: bool = True

    upload_max_bytes: int = 25 * 1024 * 1024

    @property
    def allowed_email_set(self) -> set[str]:
        return {e.strip().lower() for e in self.allowed_emails.split(",") if e.strip()}

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_allow_origins.split(",") if o.strip()]


settings = Settings()
