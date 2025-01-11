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
import { useSocket, SocketConfig } from "@/hooks/useSocket";
import { Policy } from "@/types";
import {
  FieldWithInfo,
  AlbumField,
  SuffixField,
  PatternMatchField,
  DateRangeField,
  DownloadSizesField,
} from "@/components/EditModalFields";

interface EditPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPolicySaved?: (policies: Policy[]) => void;
  isEditing?: boolean;
  policy?: Policy;
  socketConfig: SocketConfig;
}

export function EditPolicyModal({
  isOpen,
  onClose,
  onPolicySaved,
  isEditing = false,
  policy,
  socketConfig,
}: EditPolicyModalProps) {
  const toast = useToast();
  const socket = useSocket(socketConfig);
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
    skip_live_photos: policy?.skip_live_photos || false,
    auto_delete: policy?.auto_delete || false,
    delete_after_download: policy?.delete_after_download || false,
    dry_run: policy?.dry_run || false,
    interval: policy?.interval || (null as string | null),
    log_level: policy?.log_level || "info",
    file_suffixes: policy?.file_suffixes || null,
    match_pattern: policy?.match_pattern || null,
    created_after: policy?.created_after || null,
    created_before: policy?.created_before || null,
    added_after: policy?.added_after || null,
    added_before: policy?.added_before || null,
  });

  const handleSave = () => {
    if (!socket) return;

    // Listen for the response before closing
    const successEvent = isEditing
      ? "policies_after_save"
      : "policies_after_create";
    const errorEvent = isEditing
      ? "error_saving_policy"
      : "error_creating_policy";

    socket.once(successEvent, (policies: Policy[]) => {
      toast({
        title: "Success",
        description: `Policy "${formData.name}" ${
          isEditing ? "saved" : "created"
        } successfully`,
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      onClose();
      if (onPolicySaved) {
        onPolicySaved(policies);
      }
    });

    socket.once(
      errorEvent,
      ({ policy_name, error }: { policy_name: string; error: string }) => {
        const errorMessage = `Failed to ${
          isEditing ? "save" : "create"
        } policy "${policy_name}": ${error}`;
        toast({
          title: "Error",
          description: errorMessage,
          status: "error",
          duration: 5000,
          isClosable: true,
        });
        // If error occurs, remove the success listener
        socket.off(successEvent);
      },
    );

    // Send the request
    if (isEditing) {
      socket.emit("save_policy", policy?.name, formData);
    } else {
      socket.emit("create_policy", formData);
    }
  };

  console.log(formData);
  console.log(
    "value of formData.download_via_browser",
    formData.download_via_browser,
  );
  const handleSaveLibrary = (value: "Personal Library" | "Shared Library") => {
    if (!isEditing || !socket || !policy) return;
    const newFormData = { ...formData, library: value };
    setFormData(newFormData);

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
                    info="The local directory where photos will be downloaded"
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
                    info="Download photos via browser to local directory"
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

                <FormControl>
                  <FieldWithInfo
                    label="Domain"
                    info="The iCloud service domain to use"
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
                <FormControl>
                  <FieldWithInfo
                    label="Folder Structure"
                    info="The folder structure pattern using Python's strftime format"
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

                <FormControl>
                  <FieldWithInfo
                    label="File Match Policy"
                    info="The policy for matching files when downloading"
                  >
                    <Select
                      value={formData.file_match_policy}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          file_match_policy: e.target.value as
                            | "name-size-dedup-with-suffix"
                            | "name-id7",
                        })
                      }
                      maxW="150px"
                    >
                      <option value="name-size-dedup-with-suffix">
                        Name-Size-Dedup-With-Suffix
                      </option>
                      <option value="name-id7">Name-Id7</option>
                    </Select>
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo
                    label="Live Photo Size"
                    info="The size of live photos to download"
                  >
                    <Select
                      value={formData.live_photo_size}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          live_photo_size: e.target.value as
                            | "original"
                            | "medium"
                            | "thumb",
                        })
                      }
                      maxW="150px"
                    >
                      <option value="original">Original</option>
                      <option value="medium">Medium</option>
                      <option value="thumb">Thumb</option>
                    </Select>
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo
                    label="Live Photo Video Filename Policy"
                    info="The policy for naming live photo videos"
                  >
                    <Select
                      value={formData.live_photo_mov_filename_policy}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          live_photo_mov_filename_policy: e.target.value as
                            | "original"
                            | "suffix",
                        })
                      }
                      maxW="150px"
                    >
                      <option value="original">Original</option>
                      <option value="suffix">Suffix</option>
                    </Select>
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo
                    label="Raw File Size"
                    info="The size of raw files to download"
                  >
                    <Select
                      value={formData.align_raw}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          align_raw: e.target.value as
                            | "original"
                            | "alternative"
                            | "as-is",
                        })
                      }
                      maxW="150px"
                    >
                      <option value="original">Original</option>
                      <option value="alternative">Alternative</option>
                      <option value="as-is">As-Is</option>
                    </Select>
                  </FieldWithInfo>
                </FormControl>

                <DownloadSizesField
                  value={formData.size}
                  onChange={(value: string[]) =>
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

                <FormControl>
                  <FieldWithInfo
                    label="Force Sizes"
                    info="Force the use of the selected sizes during download"
                  >
                    <Switch
                      isChecked={formData.force_size}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          force_size: e.target.checked,
                        })
                      }
                    />
                  </FieldWithInfo>
                </FormControl>

                {/* Add similar pattern for other fields */}
                <FormControl>
                  <FieldWithInfo
                    label="Keep Unicode in Filenames"
                    info="Preserve Unicode characters in filenames instead of converting them"
                  >
                    <Switch
                      isChecked={formData.keep_unicode_in_filenames}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          keep_unicode_in_filenames: e.target.checked,
                        })
                      }
                    />
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo
                    label="Set EXIF Datetime"
                    info="Set the EXIF datetime in the downloaded photos"
                  >
                    <Switch
                      isChecked={formData.set_exif_datetime}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          set_exif_datetime: e.target.checked,
                        })
                      }
                    />
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo
                    label="XMP Sidecar"
                    info="Create XMP sidecar files for the downloaded photos"
                  >
                    <Switch
                      isChecked={formData.xmp_sidecar}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          xmp_sidecar: e.target.checked,
                        })
                      }
                    />
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo
                    label="Use OS Locale"
                    info="Use the operating system's locale settings"
                  >
                    <Switch
                      isChecked={formData.use_os_locale}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          use_os_locale: e.target.checked,
                        })
                      }
                    />
                  </FieldWithInfo>
                </FormControl>
              </VStack>
            </Box>

            {/* Filter Options */}
            <Box>
              <Text fontSize="lg" fontWeight="semibold" mb={4}>
                Filter Options
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
                <SuffixField
                  value={formData.file_suffixes}
                  onChange={(value) =>
                    setFormData({ ...formData, file_suffixes: value })
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
                  info="Filter files by creation date"
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
                  info="Filter files by the date they were added to iCloud"
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
                    info="Stop downloading after X recent photos are downloaded (leave empty for all)"
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
                    info="Stop downloading after X existing photos are checked (leave empty for all)"
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
                    info="Skip downloading video files"
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
                    info="Skip downloading live photos"
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
                    info="Automatically delete photos that are no longer in iCloud"
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
                    label="Delete After Download"
                    info="Delete photos from iCloud after successful download"
                  >
                    <Switch
                      isChecked={formData.delete_after_download}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          delete_after_download: e.target.checked,
                        })
                      }
                    />
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
                    info="Simulate the download process without actually downloading or modifying any files"
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
                    info="The schedule to run the policy as a cron job (leave empty to keep it manual)"
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
                    info="The level of detail in log messages"
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
