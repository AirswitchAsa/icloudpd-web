from icloudpd_api.policy_handler import PolicyHandler
from icloudpd_api.data_models import NON_POLICY_FIELDS

import toml
import os


class SessionHandler:
    @property
    def policies(self) -> list[dict]:
        return [policy.dump() for policy in self._policies]

    def __init__(self, saved_policies_path: str):
        self._policies: list[PolicyHandler] = []
        self._saved_policies_path: str = saved_policies_path
        self._load_policies()

    def _load_policies(self):
        """
        Load the policies from the file if it exists.
        """
        if os.path.exists(self._saved_policies_path):
            with open(self._saved_policies_path, "r") as file:
                saved_policies = toml.load(file).get("policy", [])
                for policy in saved_policies:
                    assert "name" in policy, "Policy must have a name"
                    self._policies.append(PolicyHandler(**policy))

    def _save_policies(self):
        """
        Save the policies to a toml file at the given path.
        """
        with open(self._saved_policies_path, "w") as file:
            policies_to_save = {
                "policy": [policy.dump(excludes=NON_POLICY_FIELDS) for policy in self._policies]
            }
            toml.dump(policies_to_save, file)

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
        Update the parameters of the policy with the given name from the kwargs.
        Create a new policy if it does not exist.
        """
        if policy := self.get_policy(policy_name):
            policy.update(config_updates=kwargs)
        else:
            self._policies.append(PolicyHandler(name=policy_name, **kwargs))
        self._save_policies()

    def delete_policy(self, policy_name: str):
        """
        Delete the policy with the given name.
        """
        policy_names = [policy.name for policy in self._policies]
        assert policy_name in policy_names, f"Policy {policy_name} does not exist"
        self._policies = [policy for policy in self._policies if policy.name != policy_name]
        self._save_policies()

    def replace_policies(self, policies: list[dict]):
        """
        Replace the current policies with the policies defined in the list of dictionaries.
        """
        self._policies = [PolicyHandler(**policy) for policy in policies]
        self._save_policies()
