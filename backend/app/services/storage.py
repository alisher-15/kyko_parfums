"""Where uploaded pictures are kept.

With R2_* settings (Cloudflare R2, or any S3-compatible storage) files go to the bucket and are
served from R2_PUBLIC_URL, so they survive redeploys. Without them files go to media_dir, which
is fine locally and in docker compose (a volume), but on Render free the disk is wiped on every
deploy.
"""

from functools import lru_cache

from app.config import get_settings


def use_bucket() -> bool:
    s = get_settings()
    return bool(
        s.r2_endpoint
        and s.r2_access_key_id
        and s.r2_secret_access_key
        and s.r2_bucket
        and s.r2_public_url
    )


@lru_cache
def _client():
    import boto3
    from botocore.config import Config

    s = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=s.r2_endpoint,
        aws_access_key_id=s.r2_access_key_id,
        aws_secret_access_key=s.r2_secret_access_key,
        region_name="auto",
        config=Config(retries={"max_attempts": 3, "mode": "standard"}),
    )


def save(key: str, data: bytes, content_type: str) -> str:
    """Store the file under key (e.g. "products/<name>.jpg") and return its public URL."""
    s = get_settings()
    if use_bucket():
        _client().put_object(
            Bucket=s.r2_bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
            # Names are unique (uuid), so the file never changes: browsers may keep it.
            CacheControl="public, max-age=31536000, immutable",
        )
        return f"{s.r2_public_url.rstrip('/')}/{key}"
    path = s.media_dir / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return f"{s.media_url_prefix}/{key}"
