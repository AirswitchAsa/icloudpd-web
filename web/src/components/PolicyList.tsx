import { Box, Flex, Text, VStack } from "@chakra-ui/react";
import type { PolicyView } from "@/types/api";
import { PolicyRow } from "./PolicyRow";
import { FilterMenu, SortMenu } from "./PolicyFilters";
import { useState, useEffect } from "react";

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

  return (
    <VStack spacing={2} width="100%" align="stretch">
      <Flex justify="flex-end" gap={2}>
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
            Create a new policy to get started.
          </Text>
        </Box>
      )}
    </VStack>
  );
};
