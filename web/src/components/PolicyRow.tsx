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
} from "@chakra-ui/react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  EditIcon,
  DeleteIcon,
  DownloadIcon,
} from "@chakra-ui/icons";
import { FaPlay, FaPause, FaKey } from "react-icons/fa";
import type { PolicyView } from "@/types/api";
import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@/api/client";
import { useStartRun, useStopRun } from "@/hooks/useRuns";
import { useRunEvents } from "@/hooks/useRunEvents";
import { runsApi } from "@/api/runs";
import { pushError, pushSuccess } from "@/store/toastStore";
import { PolicyDialogs } from "./PolicyDialogs";

interface PolicyRowProps {
  policy: PolicyView;
}

type PolicyRowState =
  | "ready"
  | "waiting"
  | "running"
  | "errored"
  | "awaiting_mfa"
  | "done";

export const PolicyRow = ({ policy }: PolicyRowProps) => {
  const { isOpen, onToggle } = useDisclosure();
  const {
    isOpen: isInterruptOpen,
    onOpen: onInterruptOpen,
    onClose: onInterruptClose,
  } = useDisclosure();
  const {
    isOpen: isDeleteOpen,
    onOpen: onDeleteOpen,
    onClose: onDeleteClose,
  } = useDisclosure();
  const {
    isOpen: isMfaOpen,
    onOpen: onMfaOpen,
    onClose: onMfaClose,
  } = useDisclosure();
  const {
    isOpen: isEditOpen,
    onOpen: onEditOpen,
    onClose: onEditClose,
  } = useDisclosure();

  const startRun = useStartRun();
  const stopRun = useStopRun();

  const activeRunId = policy.is_running ? policy.last_run?.run_id ?? null : null;
  const runState = useRunEvents(activeRunId, policy.name);

  const [policyRowState, setPolicyRowState] = useState<PolicyRowState>("ready");

  useEffect(() => {
    if (policy.is_running) {
      if (runState?.status === "awaiting_mfa") {
        setPolicyRowState("awaiting_mfa");
      } else {
        setPolicyRowState("running");
      }
      return;
    }
    const lastStatus = policy.last_run?.status;
    if (lastStatus === "failed") setPolicyRowState("errored");
    else if (lastStatus === "success") setPolicyRowState("done");
    else if (lastStatus === "awaiting_mfa") setPolicyRowState("awaiting_mfa");
    else setPolicyRowState("ready");
  }, [policy.is_running, policy.last_run, runState?.status]);

  // Auto-open MFA modal when a run is awaiting_mfa
  useEffect(() => {
    if (policyRowState === "awaiting_mfa" && !isMfaOpen) {
      onMfaOpen();
    }
  }, [policyRowState, isMfaOpen, onMfaOpen]);

  // Derive progress either from live events or last_run snapshot
  const { progressPct, downloaded, total } = useMemo(() => {
    const down = runState?.downloaded ?? policy.last_run?.downloaded ?? 0;
    const tot = runState?.total ?? policy.last_run?.total ?? 0;
    const pct = tot > 0 ? Math.min(100, Math.round((down / tot) * 100)) : 0;
    return { progressPct: pct, downloaded: down, total: tot };
  }, [runState?.downloaded, runState?.total, policy.last_run?.downloaded, policy.last_run?.total]);

  const logText = useMemo(() => {
    if (!runState || runState.logs.length === 0) return "";
    return runState.logs.map((l) => l.line).join("\n");
  }, [runState]);

  const handleRun = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await startRun.mutateAsync(policy.name);
      pushSuccess(`Started policy "${policy.name}"`);
    } catch (err) {
      if (err instanceof ApiError) pushError(err.message, err.errorId);
    }
  };

  const handleInterruptConfirmed = async () => {
    if (!policy.last_run?.run_id) return;
    try {
      await stopRun.mutateAsync(policy.last_run.run_id);
      pushSuccess(`Stopped "${policy.name}"`);
    } catch (err) {
      if (err instanceof ApiError) pushError(err.message, err.errorId);
    }
  };

  const handleExportLogs = (e: React.MouseEvent) => {
    e.stopPropagation();
    const runId = policy.last_run?.run_id;
    if (!runId) return;
    // Download server-side log
    const a = document.createElement("a");
    a.href = runsApi.logUrl(runId);
    a.download = `${policy.name}-logs.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const renderActionButton = (state: PolicyRowState) => {
    switch (state) {
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
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onInterruptOpen();
            }}
          />
        );
      case "awaiting_mfa":
        return (
          <IconButton
            aria-label="Provide MFA code"
            icon={<FaKey />}
            colorScheme="yellow"
            variant="ghost"
            size="sm"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onMfaOpen();
            }}
          />
        );
      default:
        return (
          <IconButton
            aria-label="Run policy"
            icon={<FaPlay />}
            colorScheme="green"
            variant="ghost"
            size="sm"
            onClick={handleRun}
            isDisabled={startRun.isPending}
          />
        );
    }
  };

  const getStateText = (state: PolicyRowState) => {
    switch (state) {
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
      case "awaiting_mfa":
        return (
          <Text color="yellow.600" fontWeight="medium">
            awaiting MFA
          </Text>
        );
      default:
        return (
          <Text color="green.500" fontWeight="medium">
            ready
          </Text>
        );
    }
  };

  const getProgressColor = (state: PolicyRowState) => {
    switch (state) {
      case "running":
        return "blue";
      case "errored":
        return "red";
      case "awaiting_mfa":
        return "yellow";
      default:
        return "green";
    }
  };

  const isRunning = policy.is_running;

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
                  ? total > 0
                    ? `${downloaded}/${total} (${progressPct}%)`
                    : "…"
                  : "IDLE"}
              </Text>
              <Progress
                value={progressPct}
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
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onEditOpen();
            }}
            isDisabled={isRunning}
          />
          <IconButton
            aria-label="Delete policy"
            icon={<DeleteIcon />}
            colorScheme="red"
            variant="ghost"
            size="sm"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              onDeleteOpen();
            }}
            isDisabled={isRunning}
          />
        </Flex>
      </Flex>

      <PolicyDialogs
        policy={policy}
        onInterruptConfirmed={handleInterruptConfirmed}
        dialogs={{
          delete: { isOpen: isDeleteOpen, onClose: onDeleteClose },
          interrupt: { isOpen: isInterruptOpen, onClose: onInterruptClose },
          mfa: {
            isOpen: isMfaOpen,
            onClose: onMfaClose,
            onOpen: onMfaOpen,
          },
          edit: { isOpen: isEditOpen, onClose: onEditClose },
        }}
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
              {logText || "No logs available"}
            </Text>
          </Box>
          {policy.last_run?.run_id && policyRowState !== "running" && (
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
