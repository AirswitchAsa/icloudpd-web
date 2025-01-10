import os

import toml

from icloudpd_web.api.data_models import NON_POLICY_FIELDS
from icloudpd_web.api.icloud_utils import ICloudManager
from icloudpd_web.api.policy_handler import PolicyHandler, PolicyStatus


class ClientHandler:
    @property
    def policies(self: "ClientHandler") -> list[dict]:
        return [policy.dump() for policy in self._policies]

    @property
    def policy_names(self: "ClientHandler") -> list[str]:
        return [policy.name for policy in self._policies]

    def __init__(self: "ClientHandler", saved_policies_path: str) -> None:
        self._policies: list[PolicyHandler] = []
        self._saved_policies_path: str = saved_policies_path
        self._icloud_manager = ICloudManager()
        self._load_policies()

    def _load_policies_from_toml(self: "ClientHandler", saved_policies: list[dict]) -> None:
        for policy in saved_policies:
            assert "name" in policy, "Policy must have a name"
            assert "username" in policy, "Policy must have a username"
            assert "directory" in policy, "Policy must have a directory"
            assert policy["name"] not in self.policy_names, "Policy name must be unique"
            self._policies.append(PolicyHandler(icloud_manager=self._icloud_manager, **policy))

    def _load_policies(self: "ClientHandler") -> None:
        """
        Load the policies from the file if it exists.
        """
        if os.path.exists(self._saved_policies_path):
            with open(self._saved_policies_path) as file:
                saved_policies = toml.load(file).get("policy", [])
                self._load_policies_from_toml(saved_policies)

    def _save_policies(self: "ClientHandler") -> None:
        """
        Save the policies to a toml file at the given path.
        """
        with open(self._saved_policies_path, "w") as file:
            policies_to_save = {
                "policy": [policy.dump(excludes=NON_POLICY_FIELDS) for policy in self._policies]
            }
            toml.dump(policies_to_save, file)

    def dump_policies_as_toml(self: "ClientHandler") -> str:
        """
        Dump the policies as a TOML string.
        """
        return toml.dumps(
            {"policy": [policy.dump(excludes=NON_POLICY_FIELDS) for policy in self._policies]}
        )

    def get_policy(self: "ClientHandler", name: str) -> PolicyHandler | None:
        """
        Return the policy with the given name.
        """
        for policy in self._policies:
            if policy.name == name:
                return policy
        return None

    def save_policy(self: "ClientHandler", policy_name: str, **kwargs) -> None:
        """
        Update the parameters of an existing policy.
        If policy with new name exists, update that policy.
        """
        if policy_name not in self.policy_names:
            raise ValueError(f"Policy with name {policy_name} does not exist")
        form_name = kwargs.get("name", "")
        if form_name == policy_name:  # name is not changed
            self.get_policy(policy_name).update(config_updates=kwargs)  # type: ignore
        else:  # name is changed
            if form_name in self.policy_names:
                raise ValueError(f"Policy with name {form_name} already exists")
            policy = self.get_policy(policy_name)
            policy.name = form_name  # type: ignore
            policy.update(config_updates=kwargs)  # type: ignore

        self._save_policies()

    def create_policy(self: "ClientHandler", **kwargs) -> None:
        """
        Create a new policy with the given parameters.
        """
        policy_name = kwargs.get("name")
        assert policy_name, "Policy name must be provided"
        if policy_name in self.policy_names:
            raise ValueError(f"Policy with name {policy_name} already exists")
        self._policies.append(PolicyHandler(icloud_manager=self._icloud_manager, **kwargs))
        self._save_policies()

    def delete_policy(self: "ClientHandler", policy_name: str) -> None:
        """
        Delete the policy with the given name.
        """
        assert policy_name in self.policy_names, f"Policy {policy_name} does not exist"
        self._policies = [policy for policy in self._policies if policy.name != policy_name]
        self._save_policies()

    def replace_policies(self: "ClientHandler", toml_content: str) -> None:
        """
        Replace the current policies with the policies defined in the list of dictionaries.
        """
        self._policies = []
        self._icloud_manager = ICloudManager()
        read_policies = toml.loads(toml_content).get("policy", [])
        self._load_policies_from_toml(read_policies)
        self._save_policies()

    def icloud_instance_occupied_by(self: "ClientHandler", username: str) -> str | None:
        """
        Check if another policy using the same username is running.
        """
        for policy in self._policies:
            if policy.username == username and policy.status == PolicyStatus.RUNNING:
                return policy.name
        return None
