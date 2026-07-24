import os
from pydantic_settings import BaseSettings, SettingsConfigDict

import json
import boto3
from botocore.exceptions import ClientError

class AWSSecretsManager:
    @staticmethod
    def get_secret(secret_name: str, region_name: str = "us-east-1") -> str:
        # Fallback to env var if running locally without AWS credentials
        env_val = os.getenv(secret_name)
        if env_val:
            return env_val
            
        try:
            session = boto3.session.Session()
            client = session.client(service_name='secretsmanager', region_name=region_name)
            get_secret_value_response = client.get_secret_value(SecretId=secret_name)
            if 'SecretString' in get_secret_value_response:
                secret = get_secret_value_response['SecretString']
                # Try to parse as JSON if the secret is a key-value pair map
                try:
                    secret_dict = json.loads(secret)
                    return secret_dict.get(secret_name, secret)
                except json.JSONDecodeError:
                    return secret
        except Exception as e:
            print(f"[SecretsManager] Could not retrieve {secret_name}: {e}")
        return ""

class Settings(BaseSettings):
    PROJECT_NAME: str = "CAST Platform"
    API_V1_STR: str = "/api/v1"
    
    # Postgres
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_USER: str = "cast_user"
    POSTGRES_PASSWORD: str = "cast_password"
    POSTGRES_DB: str = "cast_db"
    
    # JWT
    SECRET_KEY: str = "change_this_to_a_secure_random_string_for_production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8 # 8 days
    
    # Storage (MinIO)
    MINIO_URL: str = "http://localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin123"

    # Triton Inference Server
    TRITON_SERVER_URL: str = "http://localhost:8000"

    # The repository-level .env is shared by the API, Docker Compose and Vite.
    # Ignore variables owned by the other processes instead of failing API
    # startup when those variables are present.
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}/{self.POSTGRES_DB}"

settings = Settings()
# Apply secrets from real manager if configured/available
secret_val = AWSSecretsManager.get_secret("SECRET_KEY")
if secret_val:
    settings.SECRET_KEY = secret_val
