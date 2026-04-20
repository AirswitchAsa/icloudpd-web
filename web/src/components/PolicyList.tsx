import { Box, Flex, IconButton, Text, VStack } from "@chakra-ui/react";
import { DownloadIcon } from "@chakra-ui/icons";
import type { PolicyView } from "@/types/api";
import { PolicyRow } from "./PolicyRow";
import { FilterMenu, SortMenu } from "./PolicyFilters";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { policiesApi } from "@/api/policies";
import { pushError, pushSuccess } from "@/store/toastStore";

function UploadIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

interface PolicyListProps {
  policies: PolicyView[];
}

export const PolicyList = ({ policies }: PolicyListProps) => {
  const [filteredPolicies, setFilteredPolicies] =
    useState<PolicyView[]>(policies);
  const [selectedUsernames, setSelectedUsernames] = useState<string[]>(["All"]);
  const [sortConfig, setSortConfig] = useState<{
    field: "none" | "name" | "username" | "status";
    direction: "asc" | "desc";
  }>({ field: "none", direction: "asc" });

  const uniqueUsernames = Array.from(new Set(policies.map((p) => p.username)));

  const getStatusOrder = (policy: PolicyView) => {
    if (policy.is_running) return 1;
    const status = policy.last_run?.status;
    if (status === "failed") return 0;
    if (status === "awaiting_mfa") return 1;
    if (status === "stopped") return 2;
    if (status === "success") return 3;
    return 4;
  };

  useEffect(() => {
    let result = [...policies];

    if (!selectedUsernames.includes("All")) {
      result = result.filter((p) => selectedUsernames.includes(p.username));
    }

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

  const qc = useQueryClient();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const handleImportChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const result = await policiesApi.importToml(text);
      if (result.created.length) {
        pushSuccess(`Imported: ${result.created.join(", ")}`);
      }
      for (const err of result.errors) {
        pushError(`Import skipped ${err.name ?? "(unnamed)"}: ${err.error}`);
      }
      qc.invalidateQueries({ queryKey: ["policies"] });
    } catch (err) {
      pushError(err instanceof Error ? err.message : "Import failed");
    }
  };

  return (
    <VStack spacing={2} width="100%" align="stretch">
      <input
        ref={importInputRef}
        type="file"
        accept=".toml,application/toml,text/plain"
        hidden
        onChange={handleImportChange}
      />
      <Flex justify="space-between" gap={2}>
        <Flex gap={1}>
          <IconButton
            aria-label="Import policies from .toml"
            title="Import policies from .toml"
            icon={<UploadIcon />}
            variant="ghost"
            size="sm"
            onClick={() => importInputRef.current?.click()}
          />
          <IconButton
            aria-label="Export all policies as .toml"
            title="Export all policies as .toml"
            icon={<DownloadIcon />}
            variant="ghost"
            size="sm"
            as="a"
            href={policiesApi.exportUrl()}
            download="icloudpd-web-policies.toml"
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

      {filteredPolicies.length > 0 ? (
        filteredPolicies.map((policy) => (
          <PolicyRow key={policy.name} policy={policy} />
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
