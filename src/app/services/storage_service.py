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
        # Separate client used only to sign URLs handed to the browser: it
        # must sign against the host-reachable endpoint (e.g. localhost),
        # which can differ from the in-network endpoint used above.
        self.s3_public = boto3.client(
            's3',
            endpoint_url=settings.MINIO_PUBLIC_URL_RESOLVED,
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
            response = self.s3_public.generate_presigned_url(
                'put_object',
                Params={'Bucket': self.bucket_name, 'Key': object_name},
                ExpiresIn=expiration
            )
            return response
        except Exception as e:
            print(f"Error generating presigned url: {e}")
            return ""

    def create_multipart_upload(
        self, object_name: str, content_type: str = "application/octet-stream"
    ) -> str:
        response = self.s3.create_multipart_upload(
            Bucket=self.bucket_name,
            Key=object_name,
            ContentType=content_type,
        )
        return response["UploadId"]

    def generate_presigned_part_url(
        self,
        object_name: str,
        upload_id: str,
        part_number: int,
        expiration: int = 3600,
    ) -> str:
        return self.s3_public.generate_presigned_url(
            "upload_part",
            Params={
                "Bucket": self.bucket_name,
                "Key": object_name,
                "UploadId": upload_id,
                "PartNumber": part_number,
            },
            ExpiresIn=expiration,
        )

    def complete_multipart_upload(
        self, object_name: str, upload_id: str, parts: list[dict]
    ) -> dict:
        return self.s3.complete_multipart_upload(
            Bucket=self.bucket_name,
            Key=object_name,
            UploadId=upload_id,
            MultipartUpload={"Parts": parts},
        )

    def abort_multipart_upload(self, object_name: str, upload_id: str) -> None:
        self.s3.abort_multipart_upload(
            Bucket=self.bucket_name,
            Key=object_name,
            UploadId=upload_id,
        )

    def generate_presigned_download_url(self, object_name: str, expiration=3600) -> str:
        try:
            response = self.s3_public.generate_presigned_url(
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

    def download_to_file(self, object_name: str, destination: str) -> None:
        self.s3.download_file(self.bucket_name, object_name, destination)

    def upload_file(
        self,
        object_name: str,
        source: str,
        content_type: str = "application/octet-stream",
    ) -> None:
        self.s3.upload_file(
            source,
            self.bucket_name,
            object_name,
            ExtraArgs={"ContentType": content_type},
        )

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
