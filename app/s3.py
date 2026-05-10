from functools import lru_cache
from typing import BinaryIO

import boto3
from botocore.client import Config

from .config import settings


@lru_cache(maxsize=1)
def client():
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url or None,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region or "us-east-1",
        config=Config(
            signature_version="s3v4",
            connect_timeout=5,
            read_timeout=30,
            s3={"addressing_style": "path" if settings.s3_use_path_style else "virtual"},
        ),
    )


def put(key: str, fileobj: BinaryIO, content_type: str | None = None) -> None:
    extra: dict = {}
    if content_type:
        extra["ContentType"] = content_type
    client().upload_fileobj(fileobj, settings.s3_bucket, key, ExtraArgs=extra)


def delete(key: str) -> None:
    client().delete_object(Bucket=settings.s3_bucket, Key=key)


def get_object(key: str) -> dict:
    """Return the raw boto3 GetObject response for streaming through the app."""
    return client().get_object(Bucket=settings.s3_bucket, Key=key)


def presigned_get_url(key: str, filename: str | None = None, expires_in: int = 300) -> str:
    params: dict = {"Bucket": settings.s3_bucket, "Key": key}
    if filename:
        params["ResponseContentDisposition"] = f'attachment; filename="{filename}"'
    return client().generate_presigned_url(
        "get_object",
        Params=params,
        ExpiresIn=expires_in,
    )
