import type React from "react";
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
        info="The album to download from. Leave blank for All Photos. Note that user-created albums only exist in Personal Library and trying to download them from a Shared Library will result in an error."
      >
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxW="200px"
          placeholder="Enter album name"
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
