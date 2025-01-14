import {
  Box,
  Flex,
  Text,
  VStack,
  UseToastOptions,
  IconButton,
  useDisclosure,
} from "@chakra-ui/react";
import { PiUploadBold } from "react-icons/pi";
import { TbFileExport } from "react-icons/tb";
import { Policy } from "@/types/index";
import { PolicyRow } from "./PolicyRow";
import { ImportModal, ExportModal } from "./PolicyModals";
import { FilterMenu, SortMenu } from "./PolicyFilters";
import { useState, useEffect, useRef } from "react";
import { Socket } from "socket.io-client";

interface PolicyListProps {
  policies: Policy[];
  setPolicies: (policies: Policy[]) => void;
  socket: Socket | null;
  toast: (options: UseToastOptions) => void;
}

export const PolicyList = ({
  policies,
  setPolicies,
  socket,
  toast,
}: PolicyListProps) => {
  const [filteredPolicies, setFilteredPolicies] = useState<Policy[]>(policies);
  const [selectedUsernames, setSelectedUsernames] = useState<string[]>(["All"]);
  const [sortConfig, setSortConfig] = useState<{
    field: "none" | "name" | "username" | "status";
    direction: "asc" | "desc";
  }>({ field: "none", direction: "asc" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    isOpen: isImportOpen,
    onOpen: onImportOpen,
    onClose: onImportClose,
  } = useDisclosure();

  const {
    isOpen: isExportOpen,
    onOpen: onExportOpen,
    onClose: onExportClose,
  } = useDisclosure();

  // Get unique usernames from policies
  const uniqueUsernames = Array.from(new Set(policies.map((p) => p.username)));

  const getStatusOrder = (policy: Policy) => {
    if (!policy.authenticated) return 4;
    switch (policy.status?.toLowerCase()) {
      case "running":
        return 1;
      case "errored":
        return 0;
      case "stopped":
        return 2;
      default:
        return 3;
    }
  };

  // Update filtered policies when policies, filter, or sort changes
  useEffect(() => {
    let result = [...policies];

    // Apply username filter
    if (!selectedUsernames.includes("All")) {
      result = result.filter((p) => selectedUsernames.includes(p.username));
    }

    // Apply sort
    if (sortConfig.field !== "none") {
      result.sort((a, b) => {
        let comparison = 0;
        switch (sortConfig.field) {
          case "name":
            comparison = a.name.localeCompare(b.name);
            break;
          case "username":
            comparison = a.username.localeCompare(b.username);
            break;
          case "status":
            comparison = getStatusOrder(a) - getStatusOrder(b);
            break;
        }
        return sortConfig.direction === "asc" ? comparison : -comparison;
      });
    }

    setFilteredPolicies(result);
  }, [policies, selectedUsernames, sortConfig]);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file || !socket) return;

    const content = await file.text();
    socket.emit("upload_policies", content);

    socket.once("uploaded_policies", (policies: Policy[]) => {
      setPolicies(policies);
      toast({
        title: "Success",
        description: "Policies imported successfully",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    });

    socket.once("error_uploading_policies", ({ error }: { error: string }) => {
      toast({
        title: "Error",
        description: `Failed to import policies: ${error}`,
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    });

    onImportClose();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleExport = () => {
    if (!socket) return;

    socket.emit("download_policies");
    socket.once(
      "error_downloading_policies",
      ({ error }: { error: string }) => {
        toast({
          title: "Error",
          description: `Failed to export policies: ${error}`,
          status: "error",
          duration: 5000,
          isClosable: true,
        });
      },
    );
    socket.once("downloaded_policies", (content: string) => {
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "policies.toml";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onExportClose();
    });
  };

  return (
    <VStack spacing={2} width="100%" align="stretch">
      <Flex justify="space-between" gap={2}>
        <Flex gap={2}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".toml"
            style={{ display: "none" }}
          />

          <IconButton
            aria-label="Import policies"
            icon={<PiUploadBold />}
            onClick={onImportOpen}
            variant="ghost"
            colorScheme="gray"
          />

          <IconButton
            aria-label="Export policies"
            icon={<TbFileExport />}
            onClick={onExportOpen}
            variant="ghost"
            colorScheme="gray"
          />
        </Flex>

        <Flex gap={2}>
          <FilterMenu
            selectedUsernames={selectedUsernames}
            setSelectedUsernames={setSelectedUsernames}
            uniqueUsernames={uniqueUsernames}
          />
          <SortMenu setSortConfig={setSortConfig} />
        </Flex>
      </Flex>

      <ImportModal
        isOpen={isImportOpen}
        onClose={onImportClose}
        onImport={handleImportClick}
      />

      <ExportModal
        isOpen={isExportOpen}
        onClose={onExportClose}
        onExport={handleExport}
      />

      {filteredPolicies.length > 0 ? (
        filteredPolicies.map((policy) => (
          <PolicyRow
            key={policy.name}
            policy={policy}
            setPolicies={setPolicies}
            socket={socket}
            toast={toast}
          />
        ))
      ) : (
        <Box height="100px" display="grid" placeItems="center">
          <Text
            color="gray.500"
            textAlign="center"
            fontFamily="Inter, sans-serif"
            fontSize="14px"
          >
            Create a new policy or import from a file.
          </Text>
        </Box>
      )}
    </VStack>
  );
};
