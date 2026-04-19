import { useState } from "react";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  FormControl,
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
} from "@chakra-ui/react";
import { ViewIcon, ViewOffIcon } from "@chakra-ui/icons";
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
  PostDownloadFiltersSection,
} from "@/components/EditModalFields";

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

  const update = <K extends keyof FormPolicy>(key: K, value: FormPolicy[K]) =>
    setFormData((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    try {
      const payload = toBackendPolicy(formData);
      await upsert.mutateAsync({ name: formData.name, policy: payload });
      if (password) {
        try {
          await setPolicyPassword.mutateAsync({
            name: formData.name,
            password,
          });
        } catch (err) {
          if (err instanceof ApiError) pushError(err.message, err.errorId);
        }
      }
      pushSuccess(
        isEditing
          ? `Policy "${formData.name}" saved`
          : `Policy "${formData.name}" created`
      );
      onClose();
    } catch (err) {
      if (err instanceof ApiError) pushError(err.message, err.errorId);
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
                <FormControl isRequired>
                  <FieldWithInfo
                    label="Policy Name"
                    info="A unique name to identify this policy"
                  >
                    <Input
                      value={formData.name}
                      onChange={(e) => update("name", e.target.value)}
                      isDisabled={isEditing}
                      maxW="300px"
                    />
                  </FieldWithInfo>
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

                <FormControl isRequired>
                  <FieldWithInfo
                    label="Cron Schedule"
                    info="Cron expression for when the policy should run (e.g. '0 * * * *' for hourly)."
                  >
                    <Input
                      value={formData.cron}
                      onChange={(e) => update("cron", e.target.value)}
                      maxW="200px"
                      placeholder="0 * * * *"
                    />
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo
                    label="Timezone"
                    info="IANA timezone name used to interpret the cron schedule (e.g. 'America/Los_Angeles'). Leave blank for server default."
                  >
                    <Input
                      value={formData.timezone ?? ""}
                      onChange={(e) =>
                        update("timezone", e.target.value || null)
                      }
                      maxW="200px"
                      placeholder="UTC"
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

            {/* Notifications */}
            <Box>
              <Text fontSize="lg" fontWeight="semibold" mb={4}>
                Notifications
              </Text>
              <VStack spacing={4} align="stretch">
                <FormControl>
                  <FieldWithInfo
                    label="Notify on Start"
                    info="Send a notification when a run starts."
                  >
                    <Switch
                      isChecked={formData.on_start_notify}
                      onChange={(e) =>
                        update("on_start_notify", e.target.checked)
                      }
                    />
                  </FieldWithInfo>
                </FormControl>
                <FormControl>
                  <FieldWithInfo
                    label="Notify on Success"
                    info="Send a notification when a run succeeds."
                  >
                    <Switch
                      isChecked={formData.on_success_notify}
                      onChange={(e) =>
                        update("on_success_notify", e.target.checked)
                      }
                    />
                  </FieldWithInfo>
                </FormControl>
                <FormControl>
                  <FieldWithInfo
                    label="Notify on Failure"
                    info="Send a notification when a run fails."
                  >
                    <Switch
                      isChecked={formData.on_failure_notify}
                      onChange={(e) =>
                        update("on_failure_notify", e.target.checked)
                      }
                    />
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
                    info="The library to download from. Personal Library will be used if you do not have a shared library. Default: Personal Library"
                  >
                    <Select
                      value={formData.library}
                      onChange={(e) =>
                        update(
                          "library",
                          e.target.value as
                            | "Personal Library"
                            | "Shared Library"
                        )
                      }
                      maxW="200px"
                    >
                      <option value="Personal Library">Personal Library</option>
                      <option value="Shared Library">Shared Library</option>
                    </Select>
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo
                    label="Folder Structure"
                    info="The folder structure pattern using Python's strftime format."
                  >
                    <Input
                      value={formData.folder_structure}
                      onChange={(e) =>
                        update("folder_structure", e.target.value)
                      }
                      maxW="200px"
                    />
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
                    label="Threads"
                    info="Number of download threads. Leave blank for default."
                  >
                    <NumberInput
                      value={formData.threads_num ?? ""}
                      onChange={(valueString) =>
                        update(
                          "threads_num",
                          valueString === "" ? null : parseInt(valueString)
                        )
                      }
                      min={1}
                      maxW="100px"
                    >
                      <NumberInputField />
                    </NumberInput>
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
                    label="Delete from iCloud After Download (keep N days)"
                    info="After downloading, delete photos from iCloud that are older than the specified number of days. Set to 0 to delete all. Leave empty to never delete from iCloud."
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
                }}
                onChange={(key, value) => update(key, value)}
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
