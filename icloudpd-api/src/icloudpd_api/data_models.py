from pydantic import BaseModel


class PolicyConfigs(BaseModel):
    username: str
    directory: str
