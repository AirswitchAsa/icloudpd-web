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
    ];

    socket.on("policies", (policies: Policy[]) => {
      setPolicies(policies);
    });

    // Error events
    const errorEvents = {
      connect_error: "Failed to connect to server",
    };

    socket.on("connect_error", (data: any) => {
      toast({
        title: "Error",
        description: `Failed to connect to server: ${
          data?.error || data?.message || ""
        }`,
        status: "error",
        duration: 5000,
        isClosable: true,
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
        scheduled,
      }: {
        policy_name: string;
        progress: number;
        logs: string;
        scheduled: boolean;
      }) => {
        updatePolicy({
          name: policy_name,
          progress: progress,
          status: "stopped",
          scheduled: scheduled,
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
      socket.off("download_progress");
      socket.off("download_finished");
      socket.off("download_failed");
    };
  }, [socket, toast, setPolicies]);
}
