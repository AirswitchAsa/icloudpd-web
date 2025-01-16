import os
from datetime import datetime
from queue import PriorityQueue  # Priority queue

import toml
from zoneinfo import ZoneInfo

from icloudpd_web.api.apprise_handler import AppriseHandler
from icloudpd_web.api.aws_handler import AWSHandler
from icloudpd_web.api.data_models import IGNORED_FIELDS, NON_POLICY_FIELDS
from icloudpd_web.api.error import PolicyError
from icloudpd_web.api.icloud_utils import ICloudManager
from icloudpd_web.api.policy_handler import PolicyHandler, PolicyStatus


class ClientHandler:
    @property
    def policies(self: "ClientHandler") -> list[dict]:
        return [policy.dump() for policy in self._policies]

    @property
    def policy_names(self: "ClientHandler") -> list[str]:
        return [policy.name for policy in self._policies]

    @property
    def apprise_services(self: "ClientHandler") -> list[str]:
        return self._apprise_handler.servers

    def __init__(
        self: "ClientHandler",
        saved_policies_path: str,
        cookie_directory: str | None,
        apprise_config_path: str | None,
    ) -> None:
        self._policies: list[PolicyHandler] = []
        self._saved_policies_path: str = saved_policies_path
        self._cookie_directory: str | None = cookie_directory
        self._aws_handler = AWSHandler()
        self._icloud_manager = ICloudManager(cookie_directory)
        self._apprise_handler = AppriseHandler(apprise_config_path)
        self._load_policies()
        self._scheduled_runs: dict[str, PriorityQueue[tuple[float, str]]] = {}

    def _load_policies_from_toml(self: "ClientHandler", saved_policies: list[dict]) -> None:
        for policy in saved_policies:
            if not ("name" in policy and "username" in policy and "directory" in policy):
                raise PolicyError("Policy must have a name, username, and directory")

            if policy["name"] in self.policy_names:
                raise PolicyError("Policy name must be unique")
            policy = {
                k: v for k, v in policy.items() if k not in IGNORED_FIELDS
            }  # ignore the fields managed by global settings
            self._policies.append(
                PolicyHandler(
                    icloud_manager=self._icloud_manager,
                    aws_handler=self._aws_handler,
                    **policy,
                )
            )

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

    def save_apprise_config(self: "ClientHandler", apprise_config: str) -> None:
        """
        Save the apprise config.
        """
        self._apprise_handler.add_config(apprise_config)

    def reset_apprise_config(self: "ClientHandler") -> None:
        """
        Reset the apprise config.
        """
        self._apprise_handler.reset_config()

    def send_notification(self: "ClientHandler", title: str, message: str, level: str) -> None:
        """
        Send a notification with the given title, message, and level.
        """
        match level:
            case "info":
                self._apprise_handler.info(title, message)
            case "warning":
                self._apprise_handler.warning(title, message)
            case "failure":
                self._apprise_handler.failure(title, message)

    def get_aws_config(self: "ClientHandler") -> dict:
        """
        Return the AWS config.
        """
        return self._aws_handler.dump()

    def save_aws_config(self: "ClientHandler", aws_config: dict) -> bool:
        """
        Save the AWS config.
        """
        return self._aws_handler.authenticate(**aws_config)

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
        if not policy_name:
            raise PolicyError("Policy name must be provided")
        if policy_name in self.policy_names:
            raise PolicyError(f"Policy with name {policy_name} already exists")
        self._policies.append(
            PolicyHandler(
                icloud_manager=self._icloud_manager,
                aws_handler=self._aws_handler,
                **kwargs,
            )
        )
        self._save_policies()

    def delete_policy(self: "ClientHandler", policy_name: str) -> None:
        """
        Delete the policy with the given name.
        """
        if policy_name not in self.policy_names:
            raise PolicyError(f"Policy {policy_name} does not exist")
        self._policies = [policy for policy in self._policies if policy.name != policy_name]
        self._save_policies()

    def replace_policies(self: "ClientHandler", toml_content: str) -> None:
        """
        Replace the current policies with the policies defined in the list of dictionaries.
        """
        self._policies = []
        self._icloud_manager = ICloudManager(cookie_directory=self._cookie_directory)
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

    def _cron(self: "ClientHandler") -> None:
        """
        Check each policy's next run time and push to queue with timestamp as priority.
        """
        current_time = datetime.now(ZoneInfo("UTC"))

        # Check each policy
        for policy in self._policies:
            # Skip policies that are already running or don't have an interval
            if policy.status == PolicyStatus.RUNNING or not policy._configs.interval:
                continue

            # Push to queue if it's time to run or past time to run
            if (
                policy.next_run_time
                and policy.next_run_time.timestamp() <= current_time.timestamp()
            ):
                self._push_policy_to_queue(policy.name, policy.next_run_time.timestamp())

    def _push_policy_to_queue(self: "ClientHandler", policy_name: str, priority: float) -> None:
        """
        Push the policy to the priority queue.
        """
        if policy := self.get_policy(policy_name):
            if policy_queue := self._scheduled_runs.get(policy.username):
                policy_queue.put((priority, policy_name))
            else:
                self._scheduled_runs[policy.username] = PriorityQueue()
                self._scheduled_runs[policy.username].put((priority, policy_name))

    def user_starts_policy(self: "ClientHandler", policy_name: str) -> None:
        """
        Push the policy to the queue with the highest priority.
        """
        if (policy := self.get_policy(policy_name)) and policy.status != PolicyStatus.RUNNING:
            self._push_policy_to_queue(policy_name, 0)

    def policies_to_run(self: "ClientHandler") -> list[PolicyHandler]:
        """
        Check the priority queue and return the policy to run.
        """
        self._cron()  # update the queue
        policies_to_run = []
        for username, policy_queue in self._scheduled_runs.items():
            if not policy_queue.empty() and self.icloud_instance_occupied_by(username) is None:
                _, policy_name = policy_queue.get()
                policies_to_run.append(self.get_policy(policy_name))
        return policies_to_run
