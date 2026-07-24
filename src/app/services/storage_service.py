import boto3
from botocore.client import Config
from app.core.config import settings

class StorageService:
    def __init__(self):
        self.s3 = boto3.client(
            's3',
            endpoint_url=settings.MINIO_URL,
            aws_access_key_id=settings.MINIO_ACCESS_KEY,
            aws_secret_access_key=settings.MINIO_SECRET_KEY,
            config=Config(signature_version='s3v4'),
            region_name='us-east-1'
        )
        self.bucket_name = "cast-videos"
        self._ensure_bucket_exists()

    def _ensure_bucket_exists(self):
        try:
            self.s3.head_bucket(Bucket=self.bucket_name)
        except Exception:
            try:
                self.s3.create_bucket(Bucket=self.bucket_name)
            except Exception as e:
                print(f"Bucket creation failed: {e}")

    def generate_presigned_upload_url(self, object_name: str, expiration=3600) -> str:
        try:
            response = self.s3.generate_presigned_url(
                'put_object',
                Params={'Bucket': self.bucket_name, 'Key': object_name},
                ExpiresIn=expiration
            )
            return response
        except Exception as e:
            print(f"Error generating presigned url: {e}")
            return ""

    def generate_presigned_download_url(self, object_name: str, expiration=3600) -> str:
        try:
            response = self.s3.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.bucket_name, 'Key': object_name},
                ExpiresIn=expiration
            )
            return response
        except Exception as e:
            print(f"Error generating presigned url: {e}")
            return ""

    def upload_bytes(self, object_name: str, data: bytes, content_type: str = 'application/octet-stream') -> bool:
        try:
            self.s3.put_object(
                Bucket=self.bucket_name,
                Key=object_name,
                Body=data,
                ContentType=content_type
            )
            return True
        except Exception as e:
            print(f"Error uploading bytes: {e}")
            return False

    def download_bytes(self, object_name: str) -> bytes:
        """Reads an object's bytes. Raises on failure so callers can 404/500."""
        response = self.s3.get_object(Bucket=self.bucket_name, Key=object_name)
        return response['Body'].read()

    def key_from_uri(self, storage_uri: str) -> str:
        """Strips the s3://<bucket>/ prefix, returning the object key."""
        if not storage_uri:
            return ""
        return storage_uri.replace(f"s3://{self.bucket_name}/", "")

    def delete_object(self, object_name: str) -> bool:
        try:
            self.s3.delete_object(Bucket=self.bucket_name, Key=object_name)
            return True
        except Exception as e:
            print(f"Error deleting object: {e}")
            return False

storage_service = StorageService()
