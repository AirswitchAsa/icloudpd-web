import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Socket } from "socket.io-client";
import { UseToastOptions } from "@chakra-ui/react";
import { Policy } from "@/types";

interface UseSocketEventsProps {
  socket: Socket | null;
  toast: (options: UseToastOptions) => void;
  setPolicies: Dispatch<SetStateAction<Policy[]>>;
}

export function useSocketEvents({
  socket,
  toast,
  setPolicies,
}: UseSocketEventsProps) {
  useEffect(() => {
    if (!socket) return;

    // Request initial policies
    socket.emit("get_policies");

    // Policy list update events (only successful operations)
    const policyUpdateEvents = [
      "policies", // Initial load
      "policies_after_save", // After successful save
      "policies_after_delete", // After successful delete
    ];

    policyUpdateEvents.forEach((event) => {
      socket.on(event, (policies: Policy[]) => {
        setPolicies(policies);
        // Show success notification for specific events
        if (event !== "policies") {
          // Don't show for initial load
          const messages = {
            policies_after_save: "Policy saved successfully",
            policies_after_delete: "Policy deleted successfully",
          };
          toast({
            title: "Success",
            description: messages[event as keyof typeof messages],
            status: "success",
            duration: 3000,
            isClosable: true,
          });
        }
      });
    });

    // Error events
    const errorEvents = {
      connect_error: "Failed to connect to server",
      error_saving_policy: "Failed to save policy",
      error_deleting_policy: "Failed to delete policy",
      error_interrupting_download: "Failed to interrupt download",
      authentication_failed: "Authentication failed",
    };

    Object.entries(errorEvents).forEach(([event, defaultMessage]) => {
      socket.on(event, (data: any) => {
        const errorMessage = data?.error || data?.message || "";
        const policyName = data?.policy_name ? ` "${data.policy_name}"` : "";

        toast({
          title: "Error",
          description: `${defaultMessage}${policyName}${
            errorMessage ? ": " + errorMessage : ""
          }`,
          status: "error",
          duration: 5000,
          isClosable: true,
        });
      });
    });

    // Handle download failures separately since we need to update policy state
    socket.on(
      "download_failed",
      ({
        policy,
        error,
        logs,
      }: {
        policy: Policy;
        error: string;
        logs: string;
      }) => {
        updatePolicy(policy);
        if (logs) {
          updateLogs(policy.name, logs);
        }

        toast({
          title: "Error",
          description: `Error downloading photos for policy "${policy.name}": ${error}`,
          status: "error",
          duration: 5000,
          isClosable: true,
        });
      },
    );

    // Authentication success
    socket.on(
      "authenticated",
      ({ msg, policies }: { msg: string; policies: Policy[] }) => {
        toast({
          title: "Authentication Successful",
          description: msg,
          status: "success",
          duration: 3000,
          isClosable: true,
        });
        setPolicies(policies);
      },
    );

    // MFA required
    socket.on("mfa_required", (msg: string) => {
      toast({
        title: "MFA Required",
        description: msg,
        status: "info",
        duration: 3000,
        isClosable: true,
      });
    });

    // iCloud busy notification
    socket.on("icloud_is_busy", (msg: string) => {
      toast({
        title: "iCloud Account Busy",
        description: msg,
        status: "info",
        duration: 5000,
        isClosable: true,
      });
    });

    // Helper function to update a single policy
    const updatePolicy = (policyUpdate: Partial<Policy> & { name: string }) => {
      setPolicies((prev) =>
        prev.map((p) =>
          p.name === policyUpdate.name ? { ...p, ...policyUpdate } : p,
        ),
      );
    };

    // Helper function to append logs to a policy
    const updateLogs = (policyName: string, newLogs: string) => {
      setPolicies((prev) =>
        prev.map((p) =>
          p.name === policyName ? { ...p, logs: (p.logs || "") + newLogs } : p,
        ),
      );
    };

    // Download progress
    socket.on(
      "download_progress",
      ({ policy, logs }: { policy: Policy; logs: string }) => {
        updatePolicy(policy);
        if (logs) {
          updateLogs(policy.name, logs);
        }
      },
    );

    socket.on(
      "download_finished",
      ({
        policy_name,
        progress,
        logs,
      }: {
        policy_name: string;
        progress: number;
        logs: string;
      }) => {
        updatePolicy({
          name: policy_name,
          progress: progress,
          status: "stopped",
        });
        if (logs) {
          updateLogs(policy_name, logs);
        }

        toast({
          title: "Download Complete",
          description: `Successfully downloaded photos for policy "${policy_name}"`,
          status: "success",
          duration: 5000,
          isClosable: true,
        });
      },
    );

    // Cleanup
    return () => {
      policyUpdateEvents.forEach((event) => socket.off(event));
      Object.keys(errorEvents).forEach((event) => socket.off(event));
      socket.off("authenticated");
      socket.off("mfa_required");
      socket.off("download_progress");
      socket.off("download_finished");
      socket.off("download_failed");
      socket.off("icloud_is_busy");
    };
  }, [socket, toast, setPolicies]);
}
