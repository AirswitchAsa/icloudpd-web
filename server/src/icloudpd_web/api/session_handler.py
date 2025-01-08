from icloudpd_web.api.icloud_utils import ICloudManager
from icloudpd_web.api.policy_handler import PolicyHandler, PolicyStatus
from icloudpd_web.api.data_models import NON_POLICY_FIELDS

import toml
import os


class SessionHandler:
    @property
    def policies(self) -> list[dict]:
        return [policy.dump() for policy in self._policies]

    @property
    def policy_names(self) -> list[str]:
        return [policy.name for policy in self._policies]

    def __init__(self, saved_policies_path: str):
        self._policies: list[PolicyHandler] = []
        self._saved_policies_path: str = saved_policies_path
        self._icloud_manager = ICloudManager()
        self._load_policies()

    def _load_policies_from_toml(self, saved_policies: list[dict]) -> list[dict]:
        for policy in saved_policies:
            assert "name" in policy, "Policy must have a name"
            assert "username" in policy, "Policy must have a username"
            assert "directory" in policy, "Policy must have a directory"
            assert policy["name"] not in self.policy_names, "Policy name must be unique"
            self._policies.append(PolicyHandler(icloud_manager=self._icloud_manager, **policy))

    def _load_policies(self):
        """
        Load the policies from the file if it exists.
        """
        if os.path.exists(self._saved_policies_path):
            with open(self._saved_policies_path, "r") as file:
                saved_policies = toml.load(file).get("policy", [])
                self._load_policies_from_toml(saved_policies)

    def _save_policies(self):
        """
        Save the policies to a toml file at the given path.
        """
        with open(self._saved_policies_path, "w") as file:
            policies_to_save = {
                "policy": [policy.dump(excludes=NON_POLICY_FIELDS) for policy in self._policies]
            }
            toml.dump(policies_to_save, file)

    def dump_policies_as_toml(self) -> str:
        """
        Dump the policies as a TOML string.
        """
        return toml.dumps(
            {"policy": [policy.dump(excludes=NON_POLICY_FIELDS) for policy in self._policies]}
        )

    def get_policy(self, name: str) -> PolicyHandler | None:
        """
        Return the policy with the given name.
        """
        for policy in self._policies:
            if policy.name == name:
                return policy
        return None

    def save_policy(self, policy_name: str, **kwargs):
        """
        Update the parameters of an existing policy.
        If policy with new name exists, update that policy.
        """
        assert policy_name in [policy.name for policy in self._policies], "Policy does not exist"
        form_name = kwargs.get("name", "")
        if form_name == policy_name:  # name is not changed
            self.get_policy(policy_name).update(config_updates=kwargs)
        else:  # name is changed
            assert (
                form_name not in self.policy_names
            ), f"Policy with name {form_name} already exists"
            policy = self.get_policy(policy_name)
            policy.name = form_name
            policy.update(config_updates=kwargs)

        self._save_policies()

    def create_policy(self, **kwargs):
        """
        Create a new policy with the given parameters.
        """
        policy_name = kwargs.get("name")
        assert policy_name, "Policy name must be provided"
        assert (
            policy_name not in self.policy_names
        ), f"Policy with name {policy_name} already exists"
        self._policies.append(PolicyHandler(icloud_manager=self._icloud_manager, **kwargs))
        self._save_policies()

    def delete_policy(self, policy_name: str):
        """
        Delete the policy with the given name.
        """
        assert policy_name in self.policy_names, f"Policy {policy_name} does not exist"
        self._policies = [policy for policy in self._policies if policy.name != policy_name]
        self._save_policies()

    def replace_policies(self, toml_content: str):
        """
        Replace the current policies with the policies defined in the list of dictionaries.
        """
        self._policies = []
        self._icloud_manager = ICloudManager()
        read_policies = toml.loads(toml_content).get("policy", [])
        self._load_policies_from_toml(read_policies)
        self._save_policies()

    def icloud_instance_occupied_by(self, username: str) -> str | None:
        """
        Check if another policy using the same username is running.
        """
        for policy in self._policies:
            if policy.username == username and policy.status == PolicyStatus.RUNNING:
                return policy.name
        return None
