import React, { useState, useEffect } from "react";
import {
  FormControl,
  Select,
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
} from "@chakra-ui/react";
import { ChevronDownIcon, ChevronUpIcon, CloseIcon } from "@chakra-ui/icons";

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
        info="Enable to upload a copy to AWS S3 Bucket specified in My App - Settings - Integration."
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
  policy: any;
  value: string;
  onChange: (value: string) => void;
}

export function AlbumField({ policy, value, onChange }: AlbumFieldProps) {
  const [availableAlbums, setAvailableAlbums] = useState<string[]>([]);
  const isInvalid =
    value === "__invalid__" ||
    (availableAlbums.length > 0 && !availableAlbums.includes(value));

  useEffect(() => {
    if (policy?.authenticated && policy.albums) {
      setAvailableAlbums(policy.albums);
    }
  }, [policy?.authenticated, policy?.albums]);

  return (
    <FormControl isInvalid={isInvalid}>
      <FieldWithInfo
        label="Album"
        info="The album to download from. Choose from a list of albums when the policy is authenticated. Note that user-created albums only exist in Personal Library and trying to download them from a Shared Library will result in an error. Default: All Photos"
      >
        {policy?.authenticated && availableAlbums.length > 0 ? (
          <Select
            value={availableAlbums.includes(value) ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            maxW="200px"
            placeholder="Select an album"
            borderColor={isInvalid ? "red.300" : undefined}
            _hover={{ borderColor: isInvalid ? "red.400" : undefined }}
          >
            {availableAlbums.map((album) => (
              <option key={album} value={album}>
                {album}
              </option>
            ))}
          </Select>
        ) : (
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            maxW="200px"
            placeholder="Enter album name"
            borderColor={isInvalid ? "red.300" : undefined}
            _hover={{ borderColor: isInvalid ? "red.400" : undefined }}
          />
        )}
      </FieldWithInfo>
    </FormControl>
  );
}

// Suffix field component
interface SuffixFieldProps {
  value: string[] | null;
  onChange: (value: string[] | null) => void;
}

const AVAILABLE_SUFFIXES = [
  "HEIC",
  "JPEG",
  "PNG",
  "GIF",
  "TIFF",
  "DNG",
  "CR2",
  "CR3",
  "CRW",
  "ARW",
  "RAF",
  "RW2",
  "NRF",
  "NEF",
  "PEF",
  "ORF",
  "MOV",
];

export function SuffixField({ value, onChange }: SuffixFieldProps) {
  const { isOpen, onToggle } = useDisclosure();
  const selectedSuffixes = value || [];

  const handleTagRemove = (suffix: string) => {
    onChange(selectedSuffixes.filter((s) => s !== suffix));
  };

  const handleTagAdd = (suffix: string) => {
    if (!selectedSuffixes.includes(suffix)) {
      onChange([...selectedSuffixes, suffix]);
    }
  };

  return (
    <FormControl>
      <HStack align="center">
        <IconButton
          aria-label="Toggle suffix selection"
          icon={isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
          size="sm"
          variant="ghost"
          onClick={onToggle}
        />
        <FormLabel mt={2}>File Suffixes</FormLabel>
        <Spacer />
        <Text fontSize="sm" color="gray.600">
          Filter files by their extensions. Open the dropdown to select.
        </Text>
      </HStack>

      <Collapse in={isOpen}>
        <Box borderWidth="1px" borderRadius="md" p={2} bg="gray.50">
          <Wrap spacing={2} mb={2}>
            {selectedSuffixes.map((suffix) => (
              <WrapItem key={suffix}>
                <Tag size="md" colorScheme="blue" borderRadius="full">
                  <TagLabel>{suffix}</TagLabel>
                  <TagCloseButton onClick={() => handleTagRemove(suffix)} />
                </Tag>
              </WrapItem>
            ))}
          </Wrap>
          <Wrap spacing={2}>
            {AVAILABLE_SUFFIXES.filter(
              (suffix) => !selectedSuffixes.includes(suffix),
            ).map((suffix) => (
              <WrapItem key={suffix}>
                <Tag
                  size="md"
                  colorScheme="gray"
                  borderRadius="full"
                  cursor="pointer"
                  onClick={() => handleTagAdd(suffix)}
                >
                  <TagLabel>{suffix}</TagLabel>
                </Tag>
              </WrapItem>
            ))}
          </Wrap>
        </Box>
      </Collapse>
    </FormControl>
  );
}

// Date range field component
interface DateRangeFieldProps {
  label: string;
  info: string;
  startDate: string | null;
  endDate: string | null;
  onChange: (start: string | null, end: string | null) => void;
}

export function DateRangeField({
  label,
  info,
  startDate,
  endDate,
  onChange,
}: DateRangeFieldProps) {
  return (
    <FormControl>
      <FieldWithInfo label={label} info={info}>
        <HStack spacing={2} align="flex-start">
          <Input
            type="date"
            value={startDate || ""}
            onChange={(e) => onChange(e.target.value || null, endDate)}
            size="sm"
            maxW="150px"
          />
          <Box pt={1}>to</Box>
          <Input
            type="date"
            value={endDate || ""}
            onChange={(e) => onChange(startDate, e.target.value || null)}
            size="sm"
            maxW="150px"
          />
        </HStack>
      </FieldWithInfo>
    </FormControl>
  );
}

// Pattern match field component
export function PatternMatchField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <FormControl>
      <FieldWithInfo
        label="Match Pattern"
        info="Filter files by matching pattern (supports glob patterns separated by commas)"
      >
        <Input
          value={value || ""}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder="e.g., IMG_*.HEIC"
          maxW="300px"
        />
      </FieldWithInfo>
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
          Download one or more sizes for photos. Open the dropdown to select.
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
