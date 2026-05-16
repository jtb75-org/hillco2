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

    # When False (default), FastAPI's /docs, /redoc, and /openapi.json are
    # disabled. The SPA's openapi codegen reads from the committed
    # spa/openapi.json snapshot rather than the live host, so production
    # doesn't need to expose the spec. Flip to True in dev (or use
    # `npm run update-openapi` against a port-forwarded backend).
    expose_docs: bool = False

    # Test-only auth bypass for browser E2E. Disabled by default; when
    # enabled, requests with the matching header token mint a normal app
    # session for the configured fixed user.
    e2e_auth_bypass_enabled: bool = False
    e2e_auth_bypass_token: str = ""
    e2e_auth_bypass_header: str = "x-hillco2-e2e-auth"
    e2e_auth_email: str = "e2e@example.com"
    e2e_auth_name: str = "E2E Test"
    e2e_auth_role: str = "admin"

    def model_post_init(self, __context: object) -> None:
        if self.e2e_auth_bypass_enabled and not self.expose_docs:
            raise ValueError("E2E auth bypass requires EXPOSE_DOCS=true")

    @property
    def allowed_email_set(self) -> set[str]:
        return {e.strip().lower() for e in self.allowed_emails.split(",") if e.strip()}

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_allow_origins.split(",") if o.strip()]


settings = Settings()
