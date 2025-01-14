import {
  Box,
  Button,
  Flex,
  Text,
  Progress,
  IconButton,
  Collapse,
  useDisclosure,
  Spinner,
  UseToastOptions,
} from "@chakra-ui/react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  EditIcon,
  DeleteIcon,
  CopyIcon,
  DownloadIcon,
  MinusIcon,
} from "@chakra-ui/icons";
import { FaPlay, FaPause } from "react-icons/fa";
import { Policy } from "@/types/index";
import { InterruptConfirmationDialog } from "./InterruptConfirmationDialog";
import { CancelConfirmationDialog } from "./CancelConfirmationDialog";
import { useState, useEffect } from "react";
import { Socket } from "socket.io-client";

interface PolicyRowProps {
  policy: Policy;
  setPolicies: (policies: Policy[]) => void;
  onEdit: (policy: Policy) => void;
  onDelete: (policy: Policy) => void;
  onRun: (policy: Policy) => void;
  onInterrupt: (policy: Policy) => void;
  onCancel: (policy: Policy) => void;
  socket: Socket | null;
  toast: (options: UseToastOptions) => void;
}

type PolicyRowState =
  | "ready"
  | "waiting"
  | "running"
  | "errored"
  | "scheduled"
  | "done"
  | "unauthenticated";

export const PolicyRow = ({
  policy,
  setPolicies,
  onEdit,
  onDelete,
  onRun,
  onInterrupt,
  onCancel,
  socket,
  toast,
}: PolicyRowProps) => {
  const { isOpen, onToggle } = useDisclosure();
  const {
    isOpen: isInterruptOpen,
    onOpen: onInterruptOpen,
    onClose: onInterruptClose,
  } = useDisclosure();
  const {
    isOpen: isCancelOpen,
    onOpen: onCancelOpen,
    onClose: onCancelClose,
  } = useDisclosure();
  const [policyRowState, setPolicyRowState] =
    useState<PolicyRowState>("unauthenticated");

  useEffect(() => {
    // only relying on this for changes caused by updating policy
    if (policy.authenticated) {
      if (policy.status === "running") {
        setPolicyRowState("running");
      } else if (policy.status === "errored") {
        setPolicyRowState("errored");
      } else if (policy.scheduled) {
        setPolicyRowState("scheduled");
      } else {
        setPolicyRowState("ready");
      }
    } else {
      setPolicyRowState("unauthenticated");
    }
  }, [policy]);

  const handleInterrupt = (e: React.MouseEvent) => {
    e.stopPropagation();
    onInterruptOpen();
  };

  const handleCancelSchedule = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCancelOpen();
  };

  const confirmInterrupt = () => {
    onInterrupt(policy);
    onInterruptClose();
  };

  const confirmCancel = () => {
    if (socket) {
      socket.once("cancelled_scheduled_run", () => {
        setPolicyRowState("ready");
      });
    }
    onCancel(policy);
    onCancelClose();
  };

  const handleRun = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (socket && policy.authenticated) {
      setPolicyRowState("waiting");

      socket.once("download_finished", () => {
        console.log("download_finished");
        console.log(policy);
        if (policy.scheduled) {
          setPolicyRowState("scheduled");
        } else {
          setPolicyRowState("ready");
        }
      });

      socket.once("download_failed", () => {
        setPolicyRowState("errored");
      });

      socket.once("download_interrupted", () => {
        setPolicyRowState("ready");
      });

      socket.once("download_progress", () => {
        setPolicyRowState("running");
      });

      // Only import and use streamSaver on the client side
      if (typeof window !== "undefined" && policy.download_via_browser) {
        const streamSaver = (await import("streamsaver")).default;
        const fileStream = streamSaver.createWriteStream(`${policy.name}.zip`);
        const writer = fileStream.getWriter();

        socket.on("zip_chunk", (data) => {
          setPolicyRowState("running");
          if (data.chunk && policy.download_via_browser) {
            try {
              if (!data.chunk) return;
              const binaryStr = atob(data.chunk);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
              }
              console.log("Writing chunk of size:", bytes.length, "bytes");
              writer.write(bytes);
            } catch (error) {
              console.error("Error processing zip chunks:", error);
            }
          }
          if (data.finished) {
            writer.close();
            setPolicyRowState("ready");
          }
        });

        socket.once("download_failed", () => {
          writer.abort();
          setPolicyRowState("errored");
        });

        socket.once("download_interrupted", () => {
          writer.close();
          setPolicyRowState("ready");
        });
      }
    }
    onRun(policy);
  };

  // Update renderActionButton to handle all states
  const renderActionButton = (policyRowState: PolicyRowState) => {
    switch (policyRowState) {
      case "waiting":
        return (
          <IconButton
            aria-label="Loading"
            icon={<Spinner size="sm" />}
            colorScheme="blue"
            variant="ghost"
            size="sm"
          />
        );
      case "running":
        return (
          <IconButton
            aria-label="Interrupt download"
            icon={<FaPause />}
            colorScheme="blue"
            variant="ghost"
            size="sm"
            onClick={handleInterrupt}
          />
        );
      case "scheduled":
        return (
          <IconButton
            aria-label="Cancel scheduled run"
            icon={<MinusIcon />}
            colorScheme="red"
            variant="ghost"
            size="sm"
            onClick={handleCancelSchedule}
          />
        );
      case "done":
        return (
          <IconButton
            aria-label="Run policy again"
            icon={<FaPlay />}
            colorScheme="green"
            variant="ghost"
            size="sm"
            onClick={handleRun}
          />
        );
      case "unauthenticated":
        return (
          <IconButton
            aria-label="Handle authentication"
            icon={<FaPlay />}
            colorScheme="green"
            variant="ghost"
            size="sm"
            onClick={handleRun}
          />
        );
      default: // ready or error
        return (
          <IconButton
            aria-label="Run policy"
            icon={<FaPlay />}
            colorScheme="green"
            variant="ghost"
            size="sm"
            onClick={handleRun}
          />
        );
    }
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!socket) return;

    const duplicatedPolicy = {
      ...policy,
      name: `${policy.name} COPY`,
      authenticated: false, // Reset authentication state for the new policy
    };

    socket.once("policies_after_create", (policies: Policy[]) => {
      setPolicies(policies);
    });

    socket.once(
      "error_creating_policy",
      ({ policy_name, error }: { policy_name: string; error: string }) => {
        toast({
          title: "Error",
          description: `Failed to create policy "${policy_name}": ${error}`,
          status: "error",
          duration: 5000,
          isClosable: true,
        });
      },
    );

    socket.emit("create_policy", duplicatedPolicy);
  };

  const handleExportLogs = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!policy.logs) return;

    const blob = new Blob([policy.logs], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${policy.name}-logs.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getStateText = (policyRowState: PolicyRowState) => {
    switch (policyRowState) {
      case "scheduled":
        return (
          <Text color="purple.500" fontWeight="medium">
            scheduled
          </Text>
        );
      case "running":
        return (
          <Text color="blue.500" fontWeight="medium">
            running
          </Text>
        );
      case "errored":
        return (
          <Text color="red.500" fontWeight="medium">
            error
          </Text>
        );
      case "waiting":
        return (
          <Text color="green.500" fontWeight="medium">
            starting
          </Text>
        );
      case "done":
        return (
          <Text color="green.500" fontWeight="medium">
            done
          </Text>
        );
      case "unauthenticated":
        return (
          <Text color="gray.500" fontWeight="medium">
            unauthenticated
          </Text>
        );
      default: // ready
        return (
          <Text color="green.500" fontWeight="medium">
            ready
          </Text>
        );
    }
  };

  const getProgressColor = (policyRowState: PolicyRowState) => {
    switch (policyRowState) {
      case "running":
        return "blue";
      case "errored":
        return "red";
      case "scheduled":
        return "gray";
      default:
        return "green";
    }
  };

  return (
    <Box width="100%" borderWidth="1px" borderRadius="lg" overflow="hidden">
      <Flex
        p={4}
        justify="space-between"
        align="center"
        bg={isOpen ? "gray.50" : "white"}
        onClick={onToggle}
        cursor="pointer"
        _hover={{ bg: "gray.50" }}
      >
        <Flex flex={1} gap={4}>
          <IconButton
            aria-label="Expand row"
            icon={isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
            variant="ghost"
            size="sm"
          />
          <Box flex={1}>
            <Text fontSize="16px" fontWeight="medium">
              {policy.name}
            </Text>
            <Flex gap={2} color="gray.500" fontSize="14px">
              {getStateText(policyRowState)}
              <Text>•</Text>
              <Text>{policy.username}</Text>
              <Text>•</Text>
              <Text>{policy.directory}</Text>
            </Flex>
          </Box>
          <Box width="150px" display="flex">
            <Box flex="1" mt={1}>
              <Text fontSize="12px" color="gray.600" fontWeight="medium">
                {policyRowState === "running"
                  ? `${policy.progress || 0}%`
                  : "IDLE"}
              </Text>
              <Progress
                value={policy.progress || 0}
                size="sm"
                colorScheme={getProgressColor(policyRowState)}
                borderRadius="full"
              />
            </Box>
          </Box>
        </Flex>
        <Flex gap={2} ml={4}>
          {renderActionButton(policyRowState)}
          <IconButton
            aria-label="Edit policy"
            icon={<EditIcon />}
            colorScheme="blue"
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(policy);
            }}
            isDisabled={policyRowState === "running"}
          />
          <IconButton
            aria-label="Duplicate policy"
            icon={<CopyIcon />}
            colorScheme="blue"
            variant="ghost"
            size="sm"
            onClick={handleDuplicate}
            isDisabled={policyRowState === "running"}
          />
          <IconButton
            aria-label="Delete policy"
            icon={<DeleteIcon />}
            colorScheme="red"
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(policy);
            }}
            isDisabled={policyRowState === "running"}
          />
        </Flex>
      </Flex>

      <CancelConfirmationDialog
        isOpen={isCancelOpen}
        onClose={onCancelClose}
        onConfirm={confirmCancel}
        policyName={policy.name}
      />

      <InterruptConfirmationDialog
        isOpen={isInterruptOpen}
        onClose={onInterruptClose}
        onConfirm={confirmInterrupt}
        policyName={policy.name}
      />

      <Collapse in={isOpen}>
        <Box p={4} bg="gray.50">
          <Box
            ml={12}
            maxH="300px"
            overflowY="auto"
            sx={{
              "&::-webkit-scrollbar": {
                width: "8px",
                borderRadius: "8px",
                backgroundColor: "rgba(0, 0, 0, 0.05)",
              },
              "&::-webkit-scrollbar-thumb": {
                backgroundColor: "rgba(0, 0, 0, 0.1)",
                borderRadius: "8px",
                "&:hover": {
                  backgroundColor: "rgba(0, 0, 0, 0.15)",
                },
              },
            }}
          >
            <Text
              fontSize="14px"
              fontFamily="monospace"
              whiteSpace="pre-wrap"
              sx={{
                wordBreak: "break-word",
              }}
            >
              {policy.logs || "No logs available"}
            </Text>
          </Box>
          {policy.logs && policyRowState !== "running" && (
            <Flex justify="flex-start" mt={4} ml={12}>
              <Button
                leftIcon={<DownloadIcon />}
                size="sm"
                variant="outline"
                colorScheme="blue"
                onClick={handleExportLogs}
              >
                Export Logs
              </Button>
            </Flex>
          )}
        </Box>
      </Collapse>
    </Box>
  );
};
