import { useState } from "react";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  FormControl,
  FormErrorMessage,
  Input,
  InputGroup,
  InputRightElement,
  IconButton,
  VStack,
  Select,
  Button,
  ModalFooter,
  Switch,
  NumberInput,
  NumberInputField,
  Box,
  Text,
  Collapse,
  useDisclosure,
  HStack,
} from "@chakra-ui/react";
import { ViewIcon, ViewOffIcon, ChevronDownIcon, ChevronUpIcon } from "@chakra-ui/icons";
import type { PolicyView } from "@/types/api";
import { ApiError } from "@/api/client";
import {
  useUpsertPolicy,
  useSetPolicyPassword,
} from "@/hooks/usePolicies";
import { pushError, pushSuccess } from "@/store/toastStore";
import {
  FormPolicy,
  defaultFormPolicy,
  fromPolicyView,
  toBackendPolicy,
} from "@/lib/policyMapping";
import {
  FieldWithInfo,
  AlbumField,
  DownloadSizesField,
  IntegrationField,
  PluginsField,
  PostDownloadFiltersSection,
} from "@/components/EditModalFields";
import { PLUGINS } from "@/plugins";

function shellQuote(s: string): string {
  if (/[^a-zA-Z0-9@_./:=+,-]/.test(s)) {
    return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }
  return s;
}

function buildCommandPreview(form: FormPolicy): string {
  const policy = toBackendPolicy(form);
  const parts: string[] = ["icloudpd"];
  parts.push("--username", shellQuote(form.username || "<username>"));
  parts.push("--directory", shellQuote(form.directory || "<directory>"));
  parts.push("--cookie-directory", "<server-configured>");
  parts.push("--mfa-provider", "console");
  parts.push("--password-provider", "console");
  for (const [key, value] of Object.entries(policy.icloudpd)) {
    const flag = "--" + key.replace(/_/g, "-");
    if (typeof value === "boolean") {
      if (value) parts.push(flag);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        parts.push(flag, shellQuote(String(item)));
      }
    } else if (value !== null && value !== undefined) {
      parts.push(flag, shellQuote(String(value)));
    }
  }
  return parts.join(" \\\n  ");
}

interface EditPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  isEditing?: boolean;
  policy?: PolicyView;
}

export function EditPolicyModal({
  isOpen,
  onClose,
  isEditing = false,
  policy,
}: EditPolicyModalProps) {
  const upsert = useUpsertPolicy();
  const setPolicyPassword = useSetPolicyPassword();

  const [formData, setFormData] = useState<FormPolicy>(() =>
    policy ? fromPolicyView(policy) : defaultFormPolicy()
  );

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const cmdPreview = useDisclosure();
  const [nameError, setNameError] = useState<string | null>(null);

  const update = <K extends keyof FormPolicy>(key: K, value: FormPolicy[K]) =>
    setFormData((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setNameError(null);
    try {
      const payload = toBackendPolicy(formData);
      await upsert.mutateAsync({
        name: formData.name,
        policy: payload,
        // Creating (not editing) must never overwrite an existing policy.
        createOnly: !isEditing,
      });
      if (password) {
        try {
          await setPolicyPassword.mutateAsync({
            name: formData.name,
            password,
          });
        } catch (err) {
          if (err instanceof ApiError) pushError(err.message, err.errorId);
          else pushError("Failed to store the iCloud password — is the server reachable?");
        }
      }
      pushSuccess(
        isEditing
          ? `Policy "${formData.name}" saved`
          : `Policy "${formData.name}" created`
      );
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.field === "name") {
          setNameError(err.message);
        }
        pushError(err.message, err.errorId);
      } else {
        pushError("Failed to save policy — is the server reachable?");
      }
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      isCentered
      motionPreset="slideInBottom"
      size="xl"
      scrollBehavior="inside"
    >
      <ModalOverlay backdropFilter="blur(4px)" />
      <ModalContent
        maxW="800px"
        w="90%"
        bg="white"
        borderRadius="2xl"
        boxShadow="xl"
      >
        <ModalHeader fontFamily="Inter, sans-serif">
          {isEditing ? "Edit Policy" : "New Policy"}
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          <VStack
            spacing={4}
            align="stretch"
            divider={<Box h="1px" bg="gray.100" />}
          >
            {/* Basic Settings */}
            <Box>
              <Text fontSize="lg" fontWeight="semibold" mb={4}>
                Basic Settings
              </Text>
              <VStack spacing={4} align="stretch">
                <FormControl isRequired isInvalid={nameError !== null}>
                  <FieldWithInfo
                    label="Policy Name"
                    info="Unique identifier used as the policy's primary key in storage. Cannot be changed after creation — delete and recreate if you need a different name."
                  >
                    <Input
                      value={formData.name}
                      onChange={(e) => {
                        setNameError(null);
                        update("name", e.target.value);
                      }}
                      isDisabled={isEditing}
                      maxW="300px"
                    />
                  </FieldWithInfo>
                  {nameError && (
                    <FormErrorMessage>{nameError}</FormErrorMessage>
                  )}
                </FormControl>

                <FormControl isRequired>
                  <FieldWithInfo
                    label="iCloud Username"
                    info="Your iCloud account email address"
                  >
                    <Input
                      value={formData.username}
                      onChange={(e) => update("username", e.target.value)}
                      maxW="300px"
                    />
                  </FieldWithInfo>
                </FormControl>

                <FormControl isRequired>
                  <FieldWithInfo
                    label="Download Directory"
                    info="The local directory where photos will be downloaded. The directory will be created if it does not exist."
                  >
                    <Input
                      value={formData.directory}
                      onChange={(e) => update("directory", e.target.value)}
                      maxW="300px"
                    />
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo
                    label="iCloud Password"
                    info={
                      formData.has_password
                        ? "A password is already stored. Entering a new one will overwrite it."
                        : "Stored password for the iCloud account. Leave blank to skip."
                    }
                  >
                    <InputGroup maxW="300px">
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={
                          formData.has_password ? "(stored)" : "Enter password"
                        }
                      />
                      <InputRightElement>
                        <IconButton
                          aria-label={
                            showPassword ? "Hide password" : "Show password"
                          }
                          icon={showPassword ? <ViewOffIcon /> : <ViewIcon />}
                          variant="ghost"
                          onClick={() => setShowPassword(!showPassword)}
                          size="sm"
                        />
                      </InputRightElement>
                    </InputGroup>
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo
                    label="Enabled"
                    info="Whether the policy is enabled for scheduled runs."
                  >
                    <Switch
                      isChecked={formData.enabled}
                      onChange={(e) => update("enabled", e.target.checked)}
                    />
                  </FieldWithInfo>
                </FormControl>

                <FormControl isRequired={formData.enabled}>
                  <FieldWithInfo
                    label="Cron Schedule"
                    info={
                      formData.enabled
                        ? "Cron expression for when the policy should run (e.g. '0 * * * *' for hourly)."
                        : "Only applies when Enabled is on. Stored for when you turn scheduling back on."
                    }
                  >
                    <Input
                      value={formData.cron}
                      onChange={(e) => update("cron", e.target.value)}
                      maxW="200px"
                      placeholder="0 * * * *"
                      isDisabled={!formData.enabled}
                    />
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo
                    label="Timezone"
                    info="IANA timezone name used to interpret the cron schedule (e.g. 'America/Los_Angeles'). Leave blank to use the server's local timezone."
                  >
                    <Input
                      value={formData.timezone ?? ""}
                      onChange={(e) =>
                        update("timezone", e.target.value || null)
                      }
                      maxW="200px"
                      placeholder="server timezone"
                      isDisabled={!formData.enabled}
                    />
                  </FieldWithInfo>
                </FormControl>

                <IntegrationField
                  value={formData.upload_to_aws_s3}
                  onChange={(value) => update("upload_to_aws_s3", value)}
                />

                {formData.upload_to_aws_s3 && (
                  <Box pl={10}>
                    <VStack spacing={3} align="stretch">
                      <FormControl isRequired>
                        <FieldWithInfo
                          label="S3 Bucket"
                          info="Name of the S3 bucket to upload to."
                        >
                          <Input
                            value={formData.aws_bucket}
                            onChange={(e) =>
                              update("aws_bucket", e.target.value)
                            }
                            maxW="300px"
                          />
                        </FieldWithInfo>
                      </FormControl>
                      <FormControl>
                        <FieldWithInfo
                          label="S3 Prefix"
                          info="Optional key prefix within the bucket."
                        >
                          <Input
                            value={formData.aws_prefix}
                            onChange={(e) =>
                              update("aws_prefix", e.target.value)
                            }
                            maxW="300px"
                          />
                        </FieldWithInfo>
                      </FormControl>
                      <FormControl>
                        <FieldWithInfo
                          label="AWS Region"
                          info="Optional AWS region (e.g. 'us-east-1')."
                        >
                          <Input
                            value={formData.aws_region}
                            onChange={(e) =>
                              update("aws_region", e.target.value)
                            }
                            maxW="200px"
                          />
                        </FieldWithInfo>
                      </FormControl>
                      <FormControl>
                        <FieldWithInfo
                          label="AWS Access Key ID"
                          info="Optional — leave blank to use server default credentials."
                        >
                          <Input
                            value={formData.aws_access_key_id}
                            onChange={(e) =>
                              update("aws_access_key_id", e.target.value)
                            }
                            maxW="300px"
                          />
                        </FieldWithInfo>
                      </FormControl>
                      <FormControl>
                        <FieldWithInfo
                          label="AWS Secret Access Key"
                          info="Optional — leave blank to use server default credentials."
                        >
                          <Input
                            type="password"
                            value={formData.aws_secret_access_key}
                            onChange={(e) =>
                              update("aws_secret_access_key", e.target.value)
                            }
                            maxW="300px"
                          />
                        </FieldWithInfo>
                      </FormControl>
                    </VStack>
                  </Box>
                )}

                <FormControl>
                  <FieldWithInfo
                    label="Domain"
                    info="The iCloud service domain to use. Only change this if you are using an iCloud account from China."
                  >
                    <Select
                      value={formData.domain}
                      onChange={(e) =>
                        update("domain", e.target.value as "com" | "cn")
                      }
                      maxW="100px"
                    >
                      <option value="com">com</option>
                      <option value="cn">cn</option>
                    </Select>
                  </FieldWithInfo>
                </FormControl>
              </VStack>
            </Box>

            {/* Download Options */}
            <Box>
              <Text fontSize="lg" fontWeight="semibold" mb={4}>
                Download Options
              </Text>
              <VStack spacing={4} align="stretch">
                <AlbumField
                  value={formData.album}
                  onChange={(value) => update("album", value)}
                />
                <FormControl>
                  <FieldWithInfo
                    label="Library"
                    info="Which iCloud library to download from. Shared library resolution happens on the server — you never need to deal with the underlying identifier."
                  >
                    <Select
                      value={formData.library_kind}
                      onChange={(e) =>
                        update(
                          "library_kind",
                          e.target.value as "personal" | "shared"
                        )
                      }
                      maxW="200px"
                    >
                      <option value="personal">Personal Library</option>
                      <option value="shared">Shared Library</option>
                    </Select>
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo
                    label="Folder Structure"
                    info="Subfolder naming scheme using Python strftime format. Use 'none' for a flat directory (all files in the root). Examples: {:%Y/%m/%d}, {:%Y/%m}, {:%Y}."
                  >
                    <Input
                      value={formData.folder_structure}
                      onChange={(e) =>
                        update("folder_structure", e.target.value)
                      }
                      maxW="200px"
                      placeholder="{:%Y/%m/%d}"
                    />
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo
                    label="File Match Policy"
                    info="How icloudpd deduplicates files that already exist on disk. 'name-size-dedup-with-suffix' appends a counter suffix when a same-named file differs by size. 'name-id7' uses the last 7 chars of the iCloud asset ID as suffix — useful when you have many files with the same name."
                  >
                    <Select
                      value={formData.file_match_policy}
                      onChange={(e) =>
                        update(
                          "file_match_policy",
                          e.target.value as "name-size-dedup-with-suffix" | "name-id7"
                        )
                      }
                      maxW="260px"
                    >
                      <option value="name-size-dedup-with-suffix">name-size-dedup-with-suffix</option>
                      <option value="name-id7">name-id7</option>
                    </Select>
                  </FieldWithInfo>
                </FormControl>

                <DownloadSizesField
                  value={formData.size}
                  onChange={(value) =>
                    update(
                      "size",
                      value as (
                        | "original"
                        | "medium"
                        | "thumb"
                        | "adjusted"
                        | "alternative"
                      )[]
                    )
                  }
                />

                <FormControl>
                  <FieldWithInfo
                    label="Download Recent X"
                    info="Stop downloading after X recent photos are downloaded (leave empty for all)."
                  >
                    <NumberInput
                      value={formData.recent || ""}
                      onChange={(valueString) =>
                        update(
                          "recent",
                          valueString === "" ? null : parseInt(valueString)
                        )
                      }
                      min={0}
                      maxW="100px"
                    >
                      <NumberInputField />
                    </NumberInput>
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo
                    label="Download Until Found X"
                    info="Stop downloading after X existing photos are checked (leave empty for all)."
                  >
                    <NumberInput
                      value={formData.until_found || ""}
                      onChange={(valueString) =>
                        update(
                          "until_found",
                          valueString === "" ? null : parseInt(valueString)
                        )
                      }
                      min={0}
                      maxW="100px"
                    >
                      <NumberInputField />
                    </NumberInput>
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo
                    label="Favorite to Rating"
                    info="Set EXIF Rating on favorited iCloud photos (0–5). Leave blank to disable. The rating is also written to XMP sidecar if that option is enabled."
                  >
                    <NumberInput
                      value={formData.favorite_to_rating ?? ""}
                      onChange={(valueString) =>
                        update(
                          "favorite_to_rating",
                          valueString === "" ? null : parseInt(valueString)
                        )
                      }
                      min={0}
                      max={5}
                      maxW="100px"
                    >
                      <NumberInputField placeholder="off" />
                    </NumberInput>
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo
                    label="Process Existing Favorites"
                    info="Re-check already-downloaded files and add/update their EXIF favorite ratings. Requires 'Favorite to Rating' to be set. Use with 'Download Until Found X' or 'Download Recent X' for efficiency."
                  >
                    <Switch
                      isChecked={formData.process_existing_favorites}
                      onChange={(e) => update("process_existing_favorites", e.target.checked)}
                      isDisabled={formData.favorite_to_rating === null}
                    />
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo
                    label="Skip Videos"
                    info="Skip downloading video files when checked."
                  >
                    <Switch
                      isChecked={formData.skip_videos}
                      onChange={(e) => update("skip_videos", e.target.checked)}
                    />
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo
                    label="Skip Live Photos"
                    info="Skip downloading live photos when checked."
                  >
                    <Switch
                      isChecked={formData.skip_live_photos}
                      onChange={(e) =>
                        update("skip_live_photos", e.target.checked)
                      }
                    />
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo
                    label="Skip Photos"
                    info="Skip downloading photo files (images) when checked. Useful when you only want to download videos."
                  >
                    <Switch
                      isChecked={formData.skip_photos}
                      onChange={(e) => update("skip_photos", e.target.checked)}
                    />
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo
                    label="Skip Created Before"
                    info="Skip photos created before this date (ISO date, e.g. 2020-01-01). Leave blank to download all."
                  >
                    <Input
                      type="date"
                      value={formData.skip_created_before ?? ""}
                      onChange={(e) =>
                        update("skip_created_before", e.target.value || null)
                      }
                      maxW="160px"
                    />
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo
                    label="Skip Created After"
                    info="Skip photos created after this date (ISO date, e.g. 2024-01-01). Leave blank to download all."
                  >
                    <Input
                      type="date"
                      value={formData.skip_created_after ?? ""}
                      onChange={(e) =>
                        update("skip_created_after", e.target.value || null)
                      }
                      maxW="160px"
                    />
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo
                    label="Stop at Skip Created Before"
                    info="Stop the run as soon as an asset is skipped by 'Skip Created Before'. Avoids iterating the whole library on incremental runs. Requires Skip Created Before to be set."
                  >
                    <Switch
                      isChecked={formData.until_skip_created_before}
                      onChange={(e) =>
                        update("until_skip_created_before", e.target.checked)
                      }
                      isDisabled={!formData.skip_created_before}
                    />
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo
                    label="Set EXIF DateTime"
                    info="Write iCloud creation date into the EXIF DateTimeOriginal tag of downloaded photos."
                  >
                    <Switch
                      isChecked={formData.set_exif_datetime}
                      onChange={(e) => update("set_exif_datetime", e.target.checked)}
                    />
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo
                    label="XMP Sidecar"
                    info="Write an XMP sidecar file alongside each downloaded photo containing metadata (rating, keywords, etc.)."
                  >
                    <Switch
                      isChecked={formData.xmp_sidecar}
                      onChange={(e) => update("xmp_sidecar", e.target.checked)}
                    />
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo
                    label="Keep Unicode in Filenames"
                    info="Preserve Unicode characters in filenames rather than replacing them with ASCII equivalents."
                  >
                    <Switch
                      isChecked={formData.keep_unicode_in_filenames}
                      onChange={(e) => update("keep_unicode_in_filenames", e.target.checked)}
                    />
                  </FieldWithInfo>
                </FormControl>
              </VStack>
            </Box>

            {/* Delete Options */}
            <Box>
              <Text fontSize="lg" fontWeight="semibold" mb={4}>
                Delete Options
              </Text>
              <VStack spacing={4} align="stretch">
                <FormControl>
                  <FieldWithInfo
                    label="Auto Delete"
                    info="When enabled, any photos you delete in iCloud (moved to 'Recently Deleted') will also be removed from your local download directory."
                  >
                    <Switch
                      isChecked={formData.auto_delete}
                      onChange={(e) => update("auto_delete", e.target.checked)}
                    />
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo
                    label="Delete from iCloud after download"
                    info="After a successful download, delete photos FROM iCloud that are older than N days. Set to 0 to delete everything downloaded. Leave empty to never delete from iCloud. This is an icloudpd-side feature (--keep-icloud-recent-days), NOT log retention — for that, see Settings → Integrations → Run log retention."
                  >
                    <NumberInput
                      value={formData.keep_icloud_recent_days ?? ""}
                      onChange={(valueString) =>
                        update(
                          "keep_icloud_recent_days",
                          valueString === "" ? null : parseInt(valueString)
                        )
                      }
                      min={0}
                      maxW="100px"
                    >
                      <NumberInputField />
                    </NumberInput>
                  </FieldWithInfo>
                </FormControl>
              </VStack>
            </Box>

            {/* Post-download Filters */}
            <Box>
              <Text fontSize="lg" fontWeight="semibold" mb={4}>
                Post-download Filters
              </Text>
              <PostDownloadFiltersSection
                values={{
                  filter_file_suffixes: formData.filter_file_suffixes,
                  filter_match_patterns: formData.filter_match_patterns,
                  filter_device_makes: formData.filter_device_makes,
                  filter_device_models: formData.filter_device_models,
                  filter_exif_fallback: formData.filter_exif_fallback,
                }}
                onChange={(key, value) =>
                  // Every PostDownloadFilterValues key exists on FormPolicy
                  // with the identical type, so the cast is sound; TS just
                  // can't correlate the two generics through the callback.
                  update(key, value as FormPolicy[typeof key])
                }
                icloudDeleteConfigured={
                  formData.keep_icloud_recent_days !== null ||
                  Boolean(
                    (formData as unknown as Record<string, unknown>)[
                      "delete_after_download"
                    ]
                  )
                }
              />
            </Box>

            {/* Server Options */}
            <Box>
              <Text fontSize="lg" fontWeight="semibold" mb={4}>
                Server Options
              </Text>
              <VStack spacing={4} align="stretch">
                <FormControl>
                  <FieldWithInfo
                    label="Dry Run"
                    info="Run the download process without actually downloading or modifying any files."
                  >
                    <Switch
                      isChecked={formData.dry_run}
                      onChange={(e) => update("dry_run", e.target.checked)}
                    />
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo
                    label="Log Level"
                    info="The level of detail for the download log messages."
                  >
                    <Select
                      value={formData.log_level}
                      onChange={(e) =>
                        update(
                          "log_level",
                          e.target.value as "debug" | "info" | "error"
                        )
                      }
                      maxW="200px"
                    >
                      <option value="debug">Debug</option>
                      <option value="info">Info</option>
                      <option value="error">Error</option>
                    </Select>
                  </FieldWithInfo>
                </FormControl>
              </VStack>
            </Box>
            {/* Plugins */}
            <Box>
              <Text fontSize="lg" fontWeight="semibold" mb={4}>
                Plugins
              </Text>
              <PluginsField
                value={formData.plugin}
                onChange={(v) => update("plugin", v)}
                availablePlugins={PLUGINS}
              />
            </Box>

            {/* Command Preview */}
            <Box>
              <HStack
                spacing={2}
                cursor="pointer"
                onClick={cmdPreview.onToggle}
                _hover={{ color: "gray.600" }}
              >
                <IconButton
                  aria-label="Toggle command preview"
                  icon={cmdPreview.isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
                  size="sm"
                  variant="ghost"
                  pointerEvents="none"
                />
                <Text fontSize="lg" fontWeight="semibold">
                  Command Preview
                </Text>
              </HStack>
              <Collapse in={cmdPreview.isOpen}>
                <Text fontSize="xs" color="gray.500" mt={2} mb={1}>
                  Reconstructed icloudpd command. Password is delivered via stdin and is not shown. Cookie directory is configured server-side.
                </Text>
                <Box
                  p={3}
                  bg="gray.900"
                  color="green.300"
                  borderRadius="md"
                  fontFamily="mono"
                  fontSize="xs"
                  whiteSpace="pre"
                  overflowX="auto"
                >
                  {buildCommandPreview(formData)}
                </Box>
              </Collapse>
            </Box>

            {/* Active plugin configuration sections */}
            {PLUGINS.filter((p) => formData.plugin.includes(p.id)).map((plugin) => (
              <Box key={plugin.id}>
                <Text fontSize="lg" fontWeight="semibold" mb={4}>
                  {plugin.label} Integration
                </Text>
                <plugin.ConfigSection
                  values={formData as unknown as Record<string, unknown>}
                  onChange={(key, value) =>
                    update(key as keyof FormPolicy, value as never)
                  }
                />
              </Box>
            ))}
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button
            bg="black"
            color="white"
            _hover={{ bg: "gray.800" }}
            mr={3}
            borderRadius="xl"
            fontFamily="Inter, sans-serif"
            onClick={handleSave}
            isLoading={upsert.isPending || setPolicyPassword.isPending}
          >
            Save
          </Button>
          <Button
            onClick={onClose}
            borderRadius="xl"
            fontFamily="Inter, sans-serif"
            variant="ghost"
            _hover={{ bg: "gray.100" }}
          >
            Cancel
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
