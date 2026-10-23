from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://pms_user:pms_password@localhost:5432/pms_db"

    # Security & Auth
    SECRET_KEY: str = "change_this_to_a_super_secret_cryptographically_secure_random_key_min_32_chars"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120
    ALGORITHM: str = "HS256"
    APP_VERSION: str = "1.0.0"

    # Frontend (CORS)
    FRONTEND_URL: str = "http://localhost:3000"

    # Attachment Storage
    ATTACHMENT_STORAGE_PATH: str = "./attachments"
    ATTACHMENT_MAX_FILE_SIZE_MB: int = 25
    ATTACHMENT_QUOTA_GB: int = 2

    # Gitea Integration
    GITEA_BASE_URL: str = "http://localhost:3001"
    GITEA_ADMIN_TOKEN: str = ""

    # Google OAuth & Cloud Generative AI
    GOOGLE_CLIENT_ID: str = "787577822859-ghj33lfvj6rlj0s151qd3kus7bc49kbr.apps.googleusercontent.com"
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-1.5-pro"

    # Bootstrap Initial Admin
    FIRST_ADMIN_EMAIL: str = "admin@example.com"
    FIRST_ADMIN_PASSWORD: str = "AdminSecurePassword123!"
    FIRST_ADMIN_USERNAME: str = "admin"

    # Email & Stale Task Notification Configuration
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_TLS: bool = True
    EMAILS_FROM_EMAIL: str = "notifications@engineering.local"
    EMAILS_FROM_NAME: str = "Engineering PMS"
    STALE_TASK_HOURS_THRESHOLD: int = 24

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )



settings = Settings()
