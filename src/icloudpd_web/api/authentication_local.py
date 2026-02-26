import bcrypt
import os

from icloudpd_web.api.error import ServerConfigError


def authenticate_secret(password: str, path: str) -> bool:
    if not os.path.exists(path):
        if password == "":
            return True
        else:
            raise ServerConfigError("Secret file missing, please try resetting the server.")
    with open(path, "rb") as f:
        secret_hash = f.read()
    return bcrypt.checkpw(password.encode(), secret_hash)


def save_secret_hash(password: str, path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(bcrypt.hashpw(password.encode(), bcrypt.gensalt()))
    # Set file permissions to read/write for owner only (600)
    os.chmod(path, 0o600)
