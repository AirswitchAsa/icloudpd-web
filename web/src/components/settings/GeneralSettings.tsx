import { useState, useEffect } from "react";
import {
  Box,
  Text,
  VStack,
  FormControl,
  Select,
  Switch,
  useToast,
} from "@chakra-ui/react";
import { FieldWithInfo } from "@/components/EditModalFields";
import { Socket } from "socket.io-client";

interface GeneralSettings {
  file_match_policy: "name-size-dedup-with-suffix" | "name-id7";
  live_photo_size: "original" | "medium" | "thumb";
  live_photo_mov_filename_policy: "original" | "suffix";
  align_raw: "original" | "alternative" | "as-is";
  force_size: boolean;
  keep_unicode_in_filenames: boolean;
  set_exif_datetime: boolean;
  xmp_sidecar: boolean;
  use_os_locale: boolean;
}

interface GeneralSettingsProps {
  socket: Socket | null;
}

export function GeneralSettings({ socket }: GeneralSettingsProps) {
  const toast = useToast();
  const [settings, setSettings] = useState<GeneralSettings>({
    file_match_policy: "name-size-dedup-with-suffix",
    live_photo_size: "original",
    live_photo_mov_filename_policy: "suffix",
    align_raw: "original",
    force_size: false,
    keep_unicode_in_filenames: false,
    set_exif_datetime: false,
    xmp_sidecar: false,
    use_os_locale: false,
  });

  useEffect(() => {
    if (!socket) return;

    socket.emit("get_policies");

    socket.on("policies", (policies: any[]) => {
      if (policies.length > 0) {
        const firstPolicy = policies[0];
        setSettings({
          file_match_policy: firstPolicy.file_match_policy,
          live_photo_size: firstPolicy.live_photo_size,
          live_photo_mov_filename_policy:
            firstPolicy.live_photo_mov_filename_policy,
          align_raw: firstPolicy.align_raw,
          force_size: firstPolicy.force_size,
          keep_unicode_in_filenames: firstPolicy.keep_unicode_in_filenames,
          set_exif_datetime: firstPolicy.set_exif_datetime,
          xmp_sidecar: firstPolicy.xmp_sidecar,
          use_os_locale: firstPolicy.use_os_locale,
        });
      }
    });

    return () => {
      socket.off("policies");
    };
  }, [socket]);

  const handleSettingChange = (key: keyof GeneralSettings, value: any) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);

    socket?.once("saved_global_settings", (data) => {
      if (data.success) {
        toast({
          title: "Success",
          description: "Saved settings for all policies",
          status: "success",
          duration: 3000,
          isClosable: true,
        });
      } else {
        toast({
          title: "Error",
          description: `Failed to save global settings: ${data.error}`,
          status: "error",
          duration: 3000,
          isClosable: true,
        });
      }
    });

    // Send update to server
    socket?.emit("save_global_settings", newSettings);
  };

  return (
    <Box>
      <VStack spacing={6} align="stretch">
        <Text fontSize="lg" fontWeight="semibold" mb={4}>
          Global Download Settings
        </Text>
        <Text color="gray.600" fontSize="sm" mb={4}>
          These settings will be applied to all policies when changed.
        </Text>

        <FormControl>
          <FieldWithInfo
            label="File Match Policy"
            info="The policy for matching files when downloading"
          >
            <Select
              value={settings.file_match_policy}
              onChange={(e) =>
                handleSettingChange("file_match_policy", e.target.value)
              }
              maxW="200px"
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
              value={settings.live_photo_size}
              onChange={(e) =>
                handleSettingChange("live_photo_size", e.target.value)
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
              value={settings.live_photo_mov_filename_policy}
              onChange={(e) =>
                handleSettingChange(
                  "live_photo_mov_filename_policy",
                  e.target.value,
                )
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
            info="Specify the size used for raw files. See RAW Assets of the icloudpd documentation for more details."
          >
            <Select
              value={settings.align_raw}
              onChange={(e) => handleSettingChange("align_raw", e.target.value)}
              maxW="150px"
            >
              <option value="original">Original</option>
              <option value="alternative">Alternative</option>
              <option value="as-is">As-Is</option>
            </Select>
          </FieldWithInfo>
        </FormControl>

        <FormControl>
          <FieldWithInfo
            label="Force Sizes"
            info="Force the use of the selected sizes during download"
          >
            <Switch
              isChecked={settings.force_size}
              onChange={(e) =>
                handleSettingChange("force_size", e.target.checked)
              }
            />
          </FieldWithInfo>
        </FormControl>

        <FormControl>
          <FieldWithInfo
            label="Keep Unicode in Filenames"
            info="Preserve Unicode characters in filenames instead of converting them"
          >
            <Switch
              isChecked={settings.keep_unicode_in_filenames}
              onChange={(e) =>
                handleSettingChange(
                  "keep_unicode_in_filenames",
                  e.target.checked,
                )
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
              isChecked={settings.set_exif_datetime}
              onChange={(e) =>
                handleSettingChange("set_exif_datetime", e.target.checked)
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
              isChecked={settings.xmp_sidecar}
              onChange={(e) =>
                handleSettingChange("xmp_sidecar", e.target.checked)
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
              isChecked={settings.use_os_locale}
              onChange={(e) =>
                handleSettingChange("use_os_locale", e.target.checked)
              }
            />
          </FieldWithInfo>
        </FormControl>
      </VStack>
    </Box>
  );
}
