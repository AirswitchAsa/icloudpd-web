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
  VStack,
  Select,
  Button,
  ModalFooter,
  useToast,
  Switch,
  NumberInput,
  NumberInputField,
  Box,
  Text,
} from "@chakra-ui/react";
import { Policy } from "@/types";
import { Socket } from "socket.io-client";
import {
  FieldWithInfo,
  AlbumField,
  SuffixField,
  PatternMatchField,
  DateRangeField,
  DownloadSizesField,
  IntegrationField,
  MakeField,
  ModelField,
} from "@/components/EditModalFields";

interface EditPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  setPolicies: (policies: Policy[]) => void;
  isEditing?: boolean;
  policy?: Policy;
  socket: Socket | null;
}

export function EditPolicyModal({
  isOpen,
  onClose,
  setPolicies,
  isEditing = false,
  policy,
  socket,
}: EditPolicyModalProps) {
  const toast = useToast();
  const [formData, setFormData] = useState<
    Omit<Policy, "status" | "progress" | "logs">
  >({
    name: policy?.name || "",
    username: policy?.username || "",
    directory: policy?.directory || "",
    download_via_browser: policy?.download_via_browser || false,
    domain: policy?.domain || "com",
    folder_structure: policy?.folder_structure || "{:%Y/%m/%d}",
    size: policy?.size || ["original"],
    live_photo_size: policy?.live_photo_size || "original",
    force_size: policy?.force_size || false,
    align_raw: policy?.align_raw || "original",
    keep_unicode_in_filenames: policy?.keep_unicode_in_filenames || false,
    set_exif_datetime: policy?.set_exif_datetime || false,
    live_photo_mov_filename_policy:
      policy?.live_photo_mov_filename_policy || "suffix",
    file_match_policy:
      policy?.file_match_policy || "name-size-dedup-with-suffix",
    xmp_sidecar: policy?.xmp_sidecar || false,
    use_os_locale: policy?.use_os_locale || false,
    album: policy?.album || "All Photos",
    library: policy?.library || "Personal Library",
    recent: policy?.recent || null,
    until_found: policy?.until_found || null,
    skip_videos: policy?.skip_videos || false,
    skip_photos: policy?.skip_photos || false,
    skip_live_photos: policy?.skip_live_photos || false,
    auto_delete: policy?.auto_delete || false,
    keep_icloud_recent_days: policy?.keep_icloud_recent_days ?? null,
    dry_run: policy?.dry_run || false,
    interval: policy?.interval || (null as string | null),
    log_level: policy?.log_level || "info",
    file_suffixes: policy?.file_suffixes || null,
    match_pattern: policy?.match_pattern || null,
    created_after: policy?.created_after || null,
    created_before: policy?.created_before || null,
    added_after: policy?.added_after || null,
    added_before: policy?.added_before || null,
    upload_to_aws_s3: policy?.upload_to_aws_s3 || false,
    scheduled: policy?.scheduled || false,
    authenticated: policy?.authenticated || false,
    waiting_mfa: policy?.waiting_mfa || false,
    device_make: policy?.device_make || null,
    device_model: policy?.device_model || null,
  });

  const handleSave = () => {
    if (!socket) return;

    // Remove any existing listeners first
    socket.off("policies_after_save");
    socket.off("policies_after_create");
    socket.off("error_saving_policy");
    socket.off("error_creating_policy");

    // Add new listeners
    socket.once("policies_after_save", (policies: Policy[]) => {
      toast({
        title: "Success",
        description: `Policy: "${formData.name}" saved successfully`,
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      setPolicies(policies);
      onClose();
    });

    socket.once("policies_after_create", (policies: Policy[]) => {
      toast({
        title: "Success",
        description: `Policy: "${formData.name}" created successfully`,
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      setPolicies(policies);
      onClose();
    });

    socket.once("error_saving_policy", (data: { error: string }) => {
      toast({
        title: "Error",
        description: `Policy: "${formData.name}" failed to save. Error: ${data.error}`,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    });

    socket.once("error_creating_policy", (data: { error: string }) => {
      toast({
        title: "Error",
        description: `Policy: "${formData.name}" failed to create. Error: ${data.error}`,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    });

    // Send the request
    if (isEditing) {
      socket.emit("save_policy", policy?.name, formData);
    } else {
      socket.emit("create_policy", formData);
    }
  };

  const handleSaveLibrary = (value: "Personal Library" | "Shared Library") => {
    if (!isEditing || !socket || !policy) return;
    const newFormData = { ...formData, library: value };
    setFormData(newFormData);

    // Remove existing listener first
    socket.off("policies_after_save");

    socket.once("policies_after_save", (policies: Policy[]) => {
      toast({
        title: "Success",
        description: `Library is set to ${value}. You may now select an album.`,
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      // set albums to the new values and update the policy
      const newAlbums = policies.find((p) => p.name === policy?.name)?.albums;
      policy.albums = newAlbums;
      setFormData({ ...newFormData, albums: newAlbums });
    });
    socket.emit("save_policy", policy?.name, newFormData);
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
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
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
                      onChange={(e) =>
                        setFormData({ ...formData, username: e.target.value })
                      }
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
                      onChange={(e) =>
                        setFormData({ ...formData, directory: e.target.value })
                      }
                      maxW="300px"
                    />
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo
                    label="Download via Browser "
                    info="Download photos via browser to local directory."
                  >
                    <Switch
                      isChecked={formData.download_via_browser}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          download_via_browser: e.target.checked,
                        })
                      }
                    />
                  </FieldWithInfo>
                </FormControl>

                <IntegrationField
                  value={formData.upload_to_aws_s3}
                  onChange={(value) =>
                    setFormData({ ...formData, upload_to_aws_s3: value })
                  }
                />

                <FormControl>
                  <FieldWithInfo
                    label="Domain"
                    info="The iCloud service domain to use. Only change this if you are using an iCloud account from China."
                  >
                    <Select
                      value={formData.domain}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          domain: e.target.value as "com" | "cn",
                        })
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
                  policy={policy}
                  value={formData.album}
                  onChange={(value) =>
                    setFormData({ ...formData, album: value })
                  }
                />
                <FormControl>
                  <FieldWithInfo
                    label="Library"
                    info="The library to download from. Personal Library will be used if you do not have a shared library. Default: Personal Library"
                  >
                    <Select
                      value={formData.library}
                      onChange={(e) =>
                        handleSaveLibrary(
                          e.target.value as
                            | "Personal Library"
                            | "Shared Library",
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
                        setFormData({
                          ...formData,
                          folder_structure: e.target.value,
                        })
                      }
                      maxW="200px"
                    />
                  </FieldWithInfo>
                </FormControl>

                <DownloadSizesField
                  value={formData.size}
                  onChange={(value) =>
                    setFormData({
                      ...formData,
                      size: value as (
                        | "original"
                        | "medium"
                        | "thumb"
                        | "adjusted"
                        | "alternative"
                      )[],
                    })
                  }
                />

                <SuffixField
                  value={formData.file_suffixes}
                  onChange={(value) =>
                    setFormData({ ...formData, file_suffixes: value })
                  }
                />

                <MakeField
                  value={formData.device_make}
                  onChange={(value) =>
                    setFormData({ ...formData, device_make: value })
                  }
                />
                <ModelField
                  value={formData.device_model}
                  onChange={(value) =>
                    setFormData({ ...formData, device_model: value })
                  }
                />

                <PatternMatchField
                  value={formData.match_pattern}
                  onChange={(value) =>
                    setFormData({ ...formData, match_pattern: value })
                  }
                />
                <DateRangeField
                  label="Created Date Range"
                  info="Filter files by creation date."
                  startDate={formData.created_after}
                  endDate={formData.created_before}
                  onChange={(start, end) =>
                    setFormData({
                      ...formData,
                      created_after: start,
                      created_before: end,
                    })
                  }
                />
                <DateRangeField
                  label="Added Date Range"
                  info="Filter files by the date they were added to iCloud."
                  startDate={formData.added_after}
                  endDate={formData.added_before}
                  onChange={(start, end) =>
                    setFormData({
                      ...formData,
                      added_after: start,
                      added_before: end,
                    })
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
                        setFormData({
                          ...formData,
                          recent:
                            valueString === "" ? null : parseInt(valueString),
                        })
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
                        setFormData({
                          ...formData,
                          until_found:
                            valueString === "" ? null : parseInt(valueString),
                        })
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
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          skip_videos: e.target.checked,
                        })
                      }
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
                        setFormData({
                          ...formData,
                          skip_live_photos: e.target.checked,
                        })
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
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          skip_photos: e.target.checked,
                        })
                      }
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
                    info="When enabled, any photos you delete in iCloud (moved to 'Recently Deleted') will also be removed from your local download directory. This mirrors your iCloud deletions locally."
                  >
                    <Switch
                      isChecked={formData.auto_delete}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          auto_delete: e.target.checked,
                        })
                      }
                    />
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo
                    label="Delete from iCloud After Download (keep N days)"
                    info="After downloading, delete photos from iCloud that are older than the specified number of days. Set to 0 to delete all downloaded photos from iCloud regardless of age. Leave empty to never delete from iCloud."
                  >
                    <NumberInput
                      value={formData.keep_icloud_recent_days ?? ""}
                      onChange={(valueString) =>
                        setFormData({
                          ...formData,
                          keep_icloud_recent_days:
                            valueString === "" ? null : parseInt(valueString),
                        })
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

            {/* UI Options */}
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
                      onChange={(e) =>
                        setFormData({ ...formData, dry_run: e.target.checked })
                      }
                    />
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo
                    label="Schedule Interval"
                    info="The schedule to run the policy as a cron job (leave empty to keep it manual)."
                  >
                    <Input
                      value={formData.interval || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, interval: e.target.value })
                      }
                      maxW="200px"
                    />
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo
                    label="Log Level"
                    info="The level of detail for the download log messages. Server logs are configured when starting."
                  >
                    <Select
                      value={formData.log_level}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          log_level: e.target.value as
                            | "debug"
                            | "info"
                            | "error",
                        })
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
