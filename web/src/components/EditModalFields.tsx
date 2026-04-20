import type React from "react";
import { useState } from "react";
import {
  FormControl,
  Input,
  Collapse,
  Box,
  FormLabel,
  HStack,
  IconButton,
  useDisclosure,
  Tag,
  TagLabel,
  TagCloseButton,
  Wrap,
  WrapItem,
  Text,
  Spacer,
  Switch,
  VStack,
  Alert,
  AlertIcon,
} from "@chakra-ui/react";
import { ChevronDownIcon, ChevronUpIcon } from "@chakra-ui/icons";

interface FieldWithInfoProps {
  label: string;
  info?: string;
  children: React.ReactNode;
}

export function FieldWithInfo({ label, info, children }: FieldWithInfoProps) {
  const { isOpen, onToggle } = useDisclosure();
  return (
    <Box>
      <HStack spacing={2} align="center" mb={info && isOpen ? 2 : 0} h="40px">
        <IconButton
          aria-label="Toggle info"
          icon={isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
          size="sm"
          variant="ghost"
          onClick={onToggle}
        />
        <FormLabel flex="1" mb="0">
          {label}
        </FormLabel>
        {children}
      </HStack>
      {info && (
        <Collapse in={isOpen}>
          <Box pl={10} pr={4} py={2} bg="gray.50" borderRadius="md">
            <Text fontSize="sm" color="gray.600">
              {info}
            </Text>
          </Box>
        </Collapse>
      )}
    </Box>
  );
}

interface IntegrationFieldProps {
  value: boolean;
  onChange: (value: boolean) => void;
}

export function IntegrationField({ value, onChange }: IntegrationFieldProps) {
  return (
    <FormControl>
      <FieldWithInfo
        label="Upload to AWS S3"
        info="Enable to upload a copy to AWS S3. Configure the bucket and credentials below."
      >
        <Switch
          isChecked={value}
          onChange={(e) => onChange(e.target.checked)}
        />
      </FieldWithInfo>
    </FormControl>
  );
}

interface AlbumFieldProps {
  value: string;
  onChange: (value: string) => void;
}

export function AlbumField({ value, onChange }: AlbumFieldProps) {
  return (
    <FormControl>
      <FieldWithInfo
        label="Album"
        info="Leave blank to download the whole collection (icloudpd's default). Note that user-created albums only exist in Personal Library and trying to download them from a Shared Library will result in an error."
      >
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxW="200px"
          placeholder="All Photos (default)"
        />
      </FieldWithInfo>
    </FormControl>
  );
}

interface ChipInputFieldProps {
  label: string;
  info?: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}

export function ChipInputField({
  label,
  info,
  value,
  onChange,
  placeholder,
}: ChipInputFieldProps) {
  const [inputValue, setInputValue] = useState("");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const trimmed = inputValue.trim().replace(/,$/, "");
      if (trimmed && !value.includes(trimmed)) {
        onChange([...value, trimmed]);
      }
      setInputValue("");
    } else if (e.key === "Backspace" && inputValue === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const handleRemove = (chip: string) => {
    onChange(value.filter((v) => v !== chip));
  };

  const { isOpen, onToggle } = useDisclosure();
  return (
    <FormControl>
      <HStack spacing={2} align="center" h="32px" mb={1}>
        <IconButton
          aria-label="Toggle info"
          icon={isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
          size="sm"
          variant="ghost"
          onClick={onToggle}
          isDisabled={!info}
          visibility={info ? "visible" : "hidden"}
        />
        <FormLabel mb="0">{label}</FormLabel>
      </HStack>
      {info && (
        <Collapse in={isOpen}>
          <Box pl={10} pr={4} py={2} mb={2} bg="gray.50" borderRadius="md">
            <Text fontSize="sm" color="gray.600">
              {info}
            </Text>
          </Box>
        </Collapse>
      )}
      <Box
        borderWidth="1px"
        borderRadius="md"
        p={2}
        minH="40px"
        cursor="text"
        onClick={() => {
          const el = document.getElementById(`chip-input-${label}`);
          if (el) el.focus();
        }}
      >
        <Wrap spacing={1} align="center">
          {value.map((chip) => (
            <WrapItem key={chip}>
              <Tag size="sm" colorScheme="blue" borderRadius="full">
                <TagLabel>{chip}</TagLabel>
                <TagCloseButton onClick={() => handleRemove(chip)} />
              </Tag>
            </WrapItem>
          ))}
          <WrapItem flex="1">
            <Input
              id={`chip-input-${label}`}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              variant="unstyled"
              size="sm"
              placeholder={value.length === 0 ? placeholder : ""}
              minW="120px"
              w="100%"
            />
          </WrapItem>
        </Wrap>
      </Box>
    </FormControl>
  );
}

interface DownloadSizesFieldProps {
  value: string[];
  onChange: (value: string[]) => void;
}

const AVAILABLE_SIZES = [
  "original",
  "medium",
  "thumb",
  "adjusted",
  "alternative",
];

export function DownloadSizesField({
  value,
  onChange,
}: DownloadSizesFieldProps) {
  const { isOpen, onToggle } = useDisclosure();
  const selectedSizes = value || [];

  const handleTagRemove = (size: string) => {
    onChange(selectedSizes.filter((s) => s !== size));
  };

  const handleTagAdd = (size: string) => {
    if (!selectedSizes.includes(size)) {
      onChange([...selectedSizes, size]);
    }
  };

  return (
    <FormControl>
      <HStack align="center">
        <IconButton
          aria-label="Toggle size selection"
          icon={isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
          size="sm"
          variant="ghost"
          onClick={onToggle}
        />
        <FormLabel mt={2}>Download Sizes</FormLabel>
        <Spacer />
        <Text fontSize="sm" color="gray.600">
          Download one or more sizes for the same photos. Open the dropdown to
          select.
        </Text>
      </HStack>

      <Collapse in={isOpen}>
        <Box borderWidth="1px" borderRadius="md" p={2} bg="gray.50">
          <Wrap spacing={2} mb={2}>
            {selectedSizes.map((size) => (
              <WrapItem key={size}>
                <Tag size="md" colorScheme="blue" borderRadius="full">
                  <TagLabel>{size}</TagLabel>
                  <TagCloseButton onClick={() => handleTagRemove(size)} />
                </Tag>
              </WrapItem>
            ))}
          </Wrap>
          <Wrap spacing={2}>
            {AVAILABLE_SIZES.filter(
              (size) => !selectedSizes.includes(size),
            ).map((size) => (
              <WrapItem key={size}>
                <Tag
                  size="md"
                  colorScheme="gray"
                  borderRadius="full"
                  cursor="pointer"
                  onClick={() => handleTagAdd(size)}
                >
                  <TagLabel>{size}</TagLabel>
                </Tag>
              </WrapItem>
            ))}
          </Wrap>
        </Box>
      </Collapse>
    </FormControl>
  );
}

export interface PostDownloadFilterValues {
  filter_file_suffixes: string[];
  filter_match_patterns: string[];
  filter_device_makes: string[];
  filter_device_models: string[];
}

interface PostDownloadFiltersSectionProps {
  values: PostDownloadFilterValues;
  onChange: <K extends keyof PostDownloadFilterValues>(
    key: K,
    value: PostDownloadFilterValues[K]
  ) => void;
}

export function PostDownloadFiltersSection({
  values,
  onChange,
}: PostDownloadFiltersSectionProps) {
  return (
    <VStack spacing={4} align="stretch">
      <Alert status="warning" borderRadius="md" fontSize="sm">
        <AlertIcon />
        <Text>
          These filters run <strong>AFTER</strong> icloudpd finishes. Files are
          downloaded first, then deleted if they don&apos;t match. Bandwidth is{" "}
          <strong>NOT</strong> saved.
        </Text>
      </Alert>
      <ChipInputField
        label="File Extensions"
        info="Keep only files with these extensions (case-insensitive). E.g. .heic, .jpg — press Enter or comma to add."
        value={values.filter_file_suffixes}
        onChange={(v) => onChange("filter_file_suffixes", v)}
        placeholder=".heic, .jpg ..."
      />
      <ChipInputField
        label="Filename Patterns (regex)"
        info="Keep files whose basename matches any of these regular expressions. Press Enter or comma to add."
        value={values.filter_match_patterns}
        onChange={(v) => onChange("filter_match_patterns", v)}
        placeholder="^IMG_, \.RAW$ ..."
      />
      <ChipInputField
        label="Device Makes (EXIF)"
        info="Keep only files with this camera make in EXIF metadata (case-insensitive). E.g. Apple, Samsung. Non-image files (videos) are not filtered by make. Press Enter or comma to add."
        value={values.filter_device_makes}
        onChange={(v) => onChange("filter_device_makes", v)}
        placeholder="Apple, Samsung ..."
      />
      <ChipInputField
        label="Device Models (EXIF)"
        info="Keep only files with this camera model in EXIF metadata (case-insensitive). E.g. iPhone 15 Pro. Non-image files (videos) are not filtered by model. Press Enter or comma to add."
        value={values.filter_device_models}
        onChange={(v) => onChange("filter_device_models", v)}
        placeholder="iPhone 15 Pro ..."
      />
    </VStack>
  );
}
