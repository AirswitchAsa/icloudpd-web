import { useEffect, useState } from "react";
import {
  Box,
  Text,
  VStack,
  Button,
  FormControl,
  FormLabel,
  Input,
  HStack,
  Wrap,
  WrapItem,
  Badge,
  Link,
  Switch,
  NumberInput,
  NumberInputField,
  useToast,
} from "@chakra-ui/react";
import { ApiError } from "@/api/client";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import type { AppSettings } from "@/types/api";

export function IntegrationSettings() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const toast = useToast();

  const [local, setLocal] = useState<AppSettings | null>(null);
  const [newUrl, setNewUrl] = useState("");

  useEffect(() => {
    if (settings) setLocal(settings);
  }, [settings]);

  if (!local) {
    return (
      <Box>
        <Text color="gray.500">Loading…</Text>
      </Box>
    );
  }

  const commit = async (next: AppSettings) => {
    setLocal(next);
    try {
      await updateSettings.mutateAsync(next);
      toast({
        title: "Saved",
        description: "Settings updated",
        status: "success",
        duration: 2000,
        isClosable: true,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        toast({
          title: "Error",
          description: err.message,
          status: "error",
          duration: 5000,
          isClosable: true,
        });
      }
    }
  };

  const handleAddUrl = () => {
    const url = newUrl.trim();
    if (!url) return;
    if (local.apprise.urls.includes(url)) {
      setNewUrl("");
      return;
    }
    commit({
      ...local,
      apprise: { ...local.apprise, urls: [...local.apprise.urls, url] },
    });
    setNewUrl("");
  };

  const handleRemoveUrl = (url: string) => {
    commit({
      ...local,
      apprise: {
        ...local.apprise,
        urls: local.apprise.urls.filter((u) => u !== url),
      },
    });
  };

  return (
    <Box>
      <VStack spacing={6} align="stretch">
        <Box>
          <Text fontSize="lg" fontWeight="semibold" mb={2}>
            Apprise Notifications
          </Text>
          <VStack spacing={3} align="stretch" maxW="500px" mt={2}>
            <Text fontSize="sm" color="gray.500">
              Configure icloudpd-web to send notifications via Apprise. See{" "}
              <Link href="https://github.com/caronc/apprise" target="_blank">
                Apprise on Github
              </Link>{" "}
              for more information.
            </Text>

            <HStack justify="space-between">
              <Text fontSize="sm" fontWeight="semibold">
                Configured URLs
              </Text>
            </HStack>
            <Wrap spacing={2}>
              {local.apprise.urls.length === 0 ? (
                <Text fontSize="sm" color="gray.500">
                  None configured
                </Text>
              ) : (
                local.apprise.urls.map((url) => (
                  <WrapItem key={url}>
                    <Badge
                      colorScheme="gray"
                      p={1}
                      cursor="pointer"
                      onClick={() => handleRemoveUrl(url)}
                      title="Click to remove"
                    >
                      {url} ✕
                    </Badge>
                  </WrapItem>
                ))
              )}
            </Wrap>
            <HStack>
              <Input
                size="sm"
                placeholder="Enter Apprise URL (e.g. mailto://...)"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddUrl();
                }}
              />
              <Button
                size="sm"
                colorScheme="teal"
                onClick={handleAddUrl}
                isDisabled={!newUrl.trim()}
              >
                Add
              </Button>
            </HStack>

            <FormControl display="flex" alignItems="center" mt={4}>
              <FormLabel fontSize="sm" mb={0} flex={1}>
                Notify on Start (global default)
              </FormLabel>
              <Switch
                isChecked={local.apprise.on_start}
                onChange={(e) =>
                  commit({
                    ...local,
                    apprise: { ...local.apprise, on_start: e.target.checked },
                  })
                }
              />
            </FormControl>
            <FormControl display="flex" alignItems="center">
              <FormLabel fontSize="sm" mb={0} flex={1}>
                Notify on Success (global default)
              </FormLabel>
              <Switch
                isChecked={local.apprise.on_success}
                onChange={(e) =>
                  commit({
                    ...local,
                    apprise: { ...local.apprise, on_success: e.target.checked },
                  })
                }
              />
            </FormControl>
            <FormControl display="flex" alignItems="center">
              <FormLabel fontSize="sm" mb={0} flex={1}>
                Notify on Failure (global default)
              </FormLabel>
              <Switch
                isChecked={local.apprise.on_failure}
                onChange={(e) =>
                  commit({
                    ...local,
                    apprise: { ...local.apprise, on_failure: e.target.checked },
                  })
                }
              />
            </FormControl>
          </VStack>
        </Box>

        <Box>
          <Text fontSize="lg" fontWeight="semibold" mb={2}>
            Run History
          </Text>
          <VStack spacing={3} align="stretch" maxW="400px">
            <FormControl>
              <FormLabel fontSize="sm">Runs to retain per policy</FormLabel>
              <NumberInput
                size="sm"
                min={1}
                max={10000}
                value={local.retention_runs}
                onChange={(valueString) => {
                  const n = parseInt(valueString, 10);
                  if (Number.isFinite(n) && n > 0) {
                    setLocal({ ...local, retention_runs: n });
                  }
                }}
              >
                <NumberInputField />
              </NumberInput>
              <Button
                size="sm"
                mt={2}
                onClick={() => commit(local)}
                isDisabled={
                  !settings || settings.retention_runs === local.retention_runs
                }
              >
                Save
              </Button>
            </FormControl>
          </VStack>
        </Box>
      </VStack>
    </Box>
  );
}
