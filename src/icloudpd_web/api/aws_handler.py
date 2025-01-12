import logging

import boto3
from botocore.exceptions import ClientError

from icloudpd_web.api.error import AWSS3Error


class AWSHandler:
    @property
    def client_ready(self: "AWSHandler") -> bool:
        return self.s3_client is not None

    def __init__(self: "AWSHandler") -> None:
        self.access_key_id = None
        self.secret_access_key = None
        self.session_token = None
        self.s3_client = None
        self.bucket_name = None

    def authenticate(
        self: "AWSHandler",
        access_key_id: str,
        secret_access_key: str,
        session_token: str,
        bucket_name: str,
    ) -> bool:
        """
        Authenticate with AWS and create a new S3 client from the session.
        If the specified bucket does not exist, create it.
        """
        self.access_key_id = access_key_id
        self.secret_access_key = secret_access_key
        self.session_token = session_token
        self.bucket_name = bucket_name
        try:
            session: boto3.Session = boto3.Session(
                aws_access_key_id=access_key_id,
                aws_secret_access_key=secret_access_key,
                aws_session_token=session_token,
            )
            self.s3_client = session.client("s3")
            buckets = self.s3_client.list_buckets()["Buckets"]
            if bucket_name not in [bucket["Name"] for bucket in buckets]:
                self.s3_client.create_bucket(Bucket=bucket_name)
                return True
            return False
        except ClientError as e:
            raise AWSS3Error(f"Failed to set up AWS S3 client: {repr(e)}") from None

    def upload_file(
        self: "AWSHandler", logger: logging.Logger, file_path: str, file_object_path: str
    ) -> bool:
        """
        Attempt to upload a file to AWS S3 bucket from a local file path.
        """
        if self.s3_client is None:
            raise AWSS3Error("AWS S3 client not initialized")
        try:
            self.s3_client.upload_file(file_path, self.bucket_name, file_object_path)
            logger.info(f"Uploaded file {file_path} to AWS bucket {self.bucket_name}")
            return True
        except ClientError as e:
            logger.info(f"Failed to upload file {file_path} to AWS: {repr(e)}")
            return False
