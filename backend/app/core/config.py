from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", 
        env_file_encoding="utf-8", 
        extra="ignore",
        env_prefix="",  # Не добавлять префикс к переменным окружения
        case_sensitive=False,  # Игнорировать регистр при чтении переменных
    )

    app_env: str = "local"
    app_debug: bool = True

    auth_disabled: bool = True
    dev_user_email: str = "owner@local.dev"
    dev_user_id: str = "00000000-0000-0000-0000-000000000001"
    dev_workspace_id: str = "00000000-0000-0000-0000-000000000002"

    jwt_issuer: str = "personalcrm"
    jwt_audience: str = "personalcrm"
    jwt_secret: str = "change-me"
    jwt_alg: str = "HS256"

    database_url: str

    rate_limit_per_minute: int = 60
    rate_limit_window_seconds: int = 60

    # iCloud/CardDAV настройки
    icloud_mode: str = Field(default="mock", description="Режим работы: 'mock' или 'real'")
    mock_icloud_url: str = Field(default="http://mock-carddav:8080", description="URL mock CardDAV сервера")


settings = Settings()
