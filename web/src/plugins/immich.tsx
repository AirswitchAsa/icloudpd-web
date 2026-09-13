import { useEffect, useRef, useState } from "react";
import {
  Box,
  FormControl,
  Input,
  NumberInput,
  NumberInputField,
  Switch,
  Tag,
  TagLabel,
  VStack,
  Wrap,
  WrapItem,
} from "@chakra-ui/react";
import type { PluginDefinition, PluginSectionProps } from "./types";
import { ChipInputField, FieldWithInfo } from "@/components/EditModalFields";

interface FloatInputProps {
  value: number | null;
  onChangeValue: (v: number | null) => void;
  min?: number;
  step?: number;
  maxW?: string;
}

function FloatInput({ value, onChangeValue, min, step, maxW }: FloatInputProps) {
  const [text, setText] = useState(() => (value != null ? String(value) : ""));
  const textRef = useRef(text);
  textRef.current = text;

  useEffect(() => {
    const parsed = textRef.current === "" ? null : parseFloat(textRef.current);
    if (parsed !== value) {
      setText(value != null ? String(value) : "");
    }
    // Only sync when the parent value changes from outside, not on every text keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Input
      value={text}
      inputMode="decimal"
      onChange={(e) => {
        const raw = e.target.value;
        // Allow empty, digits, optional leading minus, one decimal point.
        if (raw === "" || /^-?\d*\.?\d*$/.test(raw)) {
          setText(raw);
          if (raw === "") {
            onChangeValue(null);
          } else if (!raw.endsWith(".")) {
            const f = parseFloat(raw);
            if (!isNaN(f)) onChangeValue(f);
          }
        }
      }}
      onBlur={() => {
        let normalized = value != null ? String(value) : "";
        if (min !== undefined && value != null && value < min) {
          onChangeValue(min);
          normalized = String(min);
        }
        setText(normalized);
      }}
      maxW={maxW}
      placeholder={step != null ? String(step) : undefined}
    />
  );
}

export interface ImmichSectionValues {
  immich_server_url: string;
  immich_api_key: string;
  immich_library_id: string;
  immich_stack_media_enabled: boolean;
  immich_stack_media: string[];
  immich_favorite_enabled: boolean;
  immich_favorite: string[];
  immich_album: string[];
  associate_live_enabled: boolean;
  associate_live_with_extra_sizes: string[];
  immich_process_existing: boolean;
  immich_batch_process: number | null;
  immich_batch_log_file: string;
  immich_scan_timeout: number | null;
  immich_poll_interval: number | null;
}

interface ImmichSizeSelectorProps {
  label: string;
  info: string;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  selectedSizes: string[];
  onSizesChange: (sizes: string[]) => void;
  availableSizes: string[];
  isDisabled?: boolean;
}

function ImmichSizeSelector({
  label,
  info,
  enabled,
  onEnabledChange,
  selectedSizes,
  onSizesChange,
  availableSizes,
  isDisabled,
}: ImmichSizeSelectorProps) {
  const isAll = selectedSizes.length === 0;

  const handleToggleSize = (size: string) => {
    if (selectedSizes.includes(size)) {
      onSizesChange(selectedSizes.filter((s) => s !== size));
    } else {
      onSizesChange([...selectedSizes, size]);
    }
  };

  return (
    <FormControl>
      <FieldWithInfo label={label} info={info}>
        <Switch
          isChecked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
          isDisabled={isDisabled}
        />
      </FieldWithInfo>
      {enabled && (
        <Box pl={10} mt={2}>
          <Wrap spacing={2}>
            <WrapItem>
              <Tag
                size="md"
                colorScheme={isAll ? "blue" : "gray"}
                borderRadius="full"
                cursor="pointer"
                onClick={() => onSizesChange([])}
              >
                <TagLabel>all</TagLabel>
              </Tag>
            </WrapItem>
            {availableSizes.map((size) => (
              <WrapItem key={size}>
                <Tag
                  size="md"
                  colorScheme={selectedSizes.includes(size) ? "blue" : "gray"}
                  borderRadius="full"
                  cursor="pointer"
                  onClick={() => handleToggleSize(size)}
                >
                  <TagLabel>{size}</TagLabel>
                </Tag>
              </WrapItem>
            ))}
          </Wrap>
        </Box>
      )}
    </FormControl>
  );
}

function ImmichConfigSection({ values, onChange }: PluginSectionProps) {
  const v = values as ImmichSectionValues;
  const downloadSizes = (values.size as string[]) ?? ["original"];

  return (
    <VStack spacing={4} align="stretch">
      <FormControl>
        <FieldWithInfo
          label="Server URL"
          info="URL of your Immich server, e.g. http://localhost:2283"
        >
          <Input
            value={v.immich_server_url}
            onChange={(e) => onChange("immich_server_url", e.target.value)}
            maxW="300px"
            placeholder="http://localhost:2283"
          />
        </FieldWithInfo>
      </FormControl>

      <FormControl>
        <FieldWithInfo
          label="API Key"
          info="Immich API key — generate in Immich under Account Settings → API Keys."
        >
          <Input
            value={v.immich_api_key}
            onChange={(e) => onChange("immich_api_key", e.target.value)}
            maxW="300px"
          />
        </FieldWithInfo>
      </FormControl>

      <FormControl>
        <FieldWithInfo
          label="Library ID"
          info="External library ID. Find it via: curl -H 'x-api-key: KEY' http://immich/api/libraries"
        >
          <Input
            value={v.immich_library_id}
            onChange={(e) => onChange("immich_library_id", e.target.value)}
            maxW="300px"
          />
        </FieldWithInfo>
      </FormControl>

      <ImmichSizeSelector
        label="Stack Media"
        info="Stack size variants together in Immich. 'all' stacks every downloaded size. Select specific sizes to control which are stacked and their order (first = primary on top)."
        enabled={v.immich_stack_media_enabled}
        onEnabledChange={(val) => onChange("immich_stack_media_enabled", val)}
        selectedSizes={v.immich_stack_media}
        onSizesChange={(sizes) => onChange("immich_stack_media", sizes)}
        availableSizes={downloadSizes}
      />

      <ImmichSizeSelector
        label="Mark Favorites"
        info="Sync iCloud favorites to Immich. 'all' marks every downloaded size. Select specific sizes to mark only those as favorites in Immich."
        enabled={v.immich_favorite_enabled}
        onEnabledChange={(val) => onChange("immich_favorite_enabled", val)}
        selectedSizes={v.immich_favorite}
        onSizesChange={(sizes) => onChange("immich_favorite", sizes)}
        availableSizes={downloadSizes}
      />

      <ChipInputField
        label="Albums"
        info="Album rules — press Enter to add each. Each entry becomes a separate --immich-album flag. Syntax: 'Album Name', '[size]:Album', '[size]:Album/{:%Y/%m}'. E.g. '[adjusted]:iCloud', '[medium]:iCloud JPG', '[original]:iCloud Raw'."
        value={v.immich_album}
        onChange={(val) => onChange("immich_album", val)}
        placeholder="[adjusted]:iCloud/{:%Y/%m}"
      />

      <ImmichSizeSelector
        label="Associate Live Photos with Extra Sizes"
        info="(--associate-live-with-extra-sizes) Link live photo videos with downloaded size variants in Immich. 'all' = every downloaded size. Select specific sizes to target only those."
        enabled={v.associate_live_enabled}
        onEnabledChange={(val) => onChange("associate_live_enabled", val)}
        selectedSizes={v.associate_live_with_extra_sizes}
        onSizesChange={(sizes) => onChange("associate_live_with_extra_sizes", sizes)}
        availableSizes={downloadSizes}
      />

      <FormControl>
        <FieldWithInfo
          label="Process Existing Files"
          info="(--immich-process-existing) Also process files already on disk — not just newly downloaded. Triggers full re-processing: stacking, favorites, albums. Useful for initial Immich setup or rebuilding albums."
        >
          <Switch
            isChecked={v.immich_process_existing}
            onChange={(e) => onChange("immich_process_existing", e.target.checked)}
          />
        </FieldWithInfo>
      </FormControl>

      <FormControl>
        <FieldWithInfo
          label="Batch Size (images)"
          info="Trigger Immich library scan after every N downloaded images rather than after each one, reducing server load. Leave blank to scan after every image."
        >
          <NumberInput
            value={v.immich_batch_process ?? ""}
            onChange={(valueString) =>
              onChange("immich_batch_process", valueString === "" ? null : parseInt(valueString))
            }
            min={1}
            maxW="100px"
          >
            <NumberInputField />
          </NumberInput>
        </FieldWithInfo>
      </FormControl>

      <FormControl>
        <FieldWithInfo
          label="Batch Log File"
          info="Custom path for the batch recovery log file. Leave blank to use the default (<cookie-directory>/immich_pending_files.json). Set an explicit path when running multiple policies with different Apple IDs to avoid log file conflicts."
        >
          <Input
            value={v.immich_batch_log_file}
            onChange={(e) => onChange("immich_batch_log_file", e.target.value)}
            maxW="300px"
            placeholder="default"
          />
        </FieldWithInfo>
      </FormControl>

      <FormControl>
        <FieldWithInfo
          label="Scan Timeout (s)"
          info="Seconds to wait for Immich to scan and register newly downloaded files. Default: 5s. Use 0 for no timeout."
        >
          <FloatInput
            value={v.immich_scan_timeout}
            onChangeValue={(val) => onChange("immich_scan_timeout", val)}
            min={0}
            step={0.5}
            maxW="100px"
          />
        </FieldWithInfo>
      </FormControl>

      <FormControl>
        <FieldWithInfo
          label="Poll Interval (s)"
          info="How frequently to check whether assets are registered in Immich during the scan wait. Default: 1s."
        >
          <FloatInput
            value={v.immich_poll_interval}
            onChangeValue={(val) => onChange("immich_poll_interval", val)}
            min={0.1}
            step={0.1}
            maxW="100px"
          />
        </FieldWithInfo>
      </FormControl>
    </VStack>
  );
}

export const immichPlugin: PluginDefinition = {
  id: "immich",
  label: "Immich",
  ConfigSection: ImmichConfigSection,
};
