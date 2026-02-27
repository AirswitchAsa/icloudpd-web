import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { Policy } from "@/types";

// Generate a random guest ID
function generateGuestId() {
  return "guest-" + Math.random().toString(36).substring(2, 8);
}

// Define types for the different event payloads
interface ErrorWithPoliciesPayload {
  policy_name: string;
  error: string;
  current_policies: Policy[];
}

interface ErrorPayload {
  error: string;
  policy_name?: string;
  message?: string;
}

interface DownloadProgressPayload {
  policy_name: string;
  progress: number;
  logs: string;
}

interface DownloadFinishedPayload {
  policy_name: string;
  logs: string;
}

interface ZipChunkPayload {
  chunk: string;
}

interface AWSConfigPayload {
  aws_access_key_id: string;
  aws_secret_access_key: string;
  aws_session_token: string;
  aws_bucket_name: string;
}

interface AWSConfigSavedPayload {
  success: boolean;
  error?: string;
  created_bucket?: boolean;
}

export interface SocketConfig {
  clientId: string;
  isGuest: boolean;
}

export function useSocket(config: SocketConfig) {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    console.log("Attempting to connect to WebSocket server...");
    const newSocket = io(process.env.NEXT_PUBLIC_API_URL, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      auth: {
        clientId: config.clientId,
      },
    });

    // Basic connection events
    newSocket.on("connect", () => {
      console.log("Connected to Python server");
    });

    newSocket.on("connect_error", (error: Error) => {
      console.error("Socket connection error:", error.message);
    });

    newSocket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
    });

    // Policy update events
    const policyUpdateEvents = [
      "policies",
      "uploaded_policies",
      "policies_after_save",
      "policies_after_delete",
    ];

    policyUpdateEvents.forEach((event) => {
      newSocket.on(event, (payload: Policy[]) => {
        console.log(`${event}:`, payload);
      });
    });

    // Error events with policies
    const errorEventsWithPolicies = [
      "error_saving_policy",
      "error_deleting_policy",
      "error_interrupting_download",
    ];

    errorEventsWithPolicies.forEach((event) => {
      newSocket.on(event, (payload: ErrorWithPoliciesPayload) => {
        console.error(`${event}:`, payload);
      });
    });

    // Authentication events
    newSocket.on("authenticated", (msg: string) => {
      console.log("Authentication successful:", msg);
    });

    newSocket.on("authentication_failed", (payload: ErrorPayload) => {
      console.error("Authentication failed:", payload.error);
    });

    newSocket.on("mfa_required", (payload: ErrorPayload) => {
      console.log("MFA required:", payload.policy_name);
    });

    // Download events
    newSocket.on("download_progress", (payload: DownloadProgressPayload) => {
      console.log("Download progress:", payload);
    });

    newSocket.on("download_finished", (payload: DownloadFinishedPayload) => {
      console.log("Download finished:", payload);
    });

    newSocket.on("download_failed", (payload: ErrorPayload) => {
      console.error("Download failed:", payload);
    });

    newSocket.on("zip_chunk", (payload: ZipChunkPayload) => {
      console.log("Zip chunk:", payload);
    });

    newSocket.on("aws_config", (payload: AWSConfigPayload) => {
      console.log("AWS config:", payload);
    });

    newSocket.on("aws_config_saved", (payload: AWSConfigSavedPayload) => {
      console.log("AWS config saved:", payload);
    });

    newSocket.on("error_getting_aws_config", (payload: ErrorPayload) => {
      console.error("Error getting AWS config:", payload);
    });

    newSocket.on("cancelled_scheduled_run", (policy_name: string) => {
      console.log("Scheduled run cancelled:", policy_name);
    });

    newSocket.on(
      "error_cancelling_scheduled_run",
      (policy_name: string, error: string) => {
        console.error("Error cancelling scheduled run:", policy_name, error);
      },
    );

    setSocket(newSocket);

    return () => {
      console.log("Cleaning up socket connection");
      newSocket.close();
    };
  }, [config.clientId]);

  return socket;
}

export { generateGuestId };
