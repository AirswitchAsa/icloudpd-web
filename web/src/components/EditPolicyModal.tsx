import { useState } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  FormControl,
  FormLabel,
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
  HStack,
  IconButton,
  Collapse,
  useDisclosure,
} from '@chakra-ui/react';
import { ChevronDownIcon, ChevronUpIcon, InfoIcon } from '@chakra-ui/icons';
import { useSocket } from '@/hooks/useSocket';
import { Policy } from '@/types';

interface EditPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPolicySaved?: (policies: Policy[]) => void;
  isEditing?: boolean;
  policy?: Policy;
}

interface FieldWithInfoProps {
  label: string;
  info?: string;
  children: React.ReactNode;
}

function FieldWithInfo({ label, info, children }: FieldWithInfoProps) {
  const { isOpen, onToggle } = useDisclosure();
  
  return (
    <Box>
      <HStack spacing={2} align="center" mb={info && isOpen ? 2 : 0}>
        <IconButton
          aria-label="Toggle info"
          icon={isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
          size="sm"
          variant="ghost"
          onClick={onToggle}
        />
        <FormLabel flex="1" mb="0">{label}</FormLabel>
          {children}
      </HStack>
      {info && (
        <Collapse in={isOpen}>
          <Box pl={10} pr={4} py={2} bg="gray.50" borderRadius="md">
            <Text fontSize="sm" color="gray.600">{info}</Text>
          </Box>
        </Collapse>
      )}
    </Box>
  );
}

export function EditPolicyModal({ isOpen, onClose, onPolicySaved, isEditing = false, policy }: EditPolicyModalProps) {
  const toast = useToast();
  const socket = useSocket();
  const [formData, setFormData] = useState<Omit<Policy, 'status' | 'progress' | 'logs'>>({
    name: policy?.name || '',
    username: policy?.username || '',
    directory: policy?.directory || '',
    domain: policy?.domain || 'com',
    folder_structure: policy?.folder_structure || '{:%Y/%m/%d}',
    size: policy?.size || ['original'],
    live_photo_size: policy?.live_photo_size || 'original',
    force_size: policy?.force_size || false,
    align_raw: policy?.align_raw || 'original',
    keep_unicode_in_filenames: policy?.keep_unicode_in_filenames || false,
    set_exif_datetime: policy?.set_exif_datetime || false,
    live_photo_mov_filename_policy: policy?.live_photo_mov_filename_policy || 'suffix',
    file_match_policy: policy?.file_match_policy || 'name-size-dedup-with-suffix',
    xmp_sidecar: policy?.xmp_sidecar || false,
    use_os_locale: policy?.use_os_locale || false,
    album: policy?.album || 'All Photos',
    library: policy?.library || 'Personal Library',
    recent: policy?.recent || null,
    until_found: policy?.until_found || null,
    skip_videos: policy?.skip_videos || false,
    skip_live_photos: policy?.skip_live_photos || false,
    auto_delete: policy?.auto_delete || false,
    delete_after_download: policy?.delete_after_download || false,
    interval: policy?.interval || null as number | null,
    log_level: policy?.log_level || 'info'
  });

  const handleSave = () => {
    if (!socket) return;

    // Listen for the response before closing
    socket.once('policies_after_save', (policies: Policy[]) => {
      toast({
        title: 'Success',
        description: `Policy "${formData.name}" saved successfully`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      onClose();
      if (onPolicySaved) {
        onPolicySaved(policies);
      }
    });

    socket.once('error_saving_policy', (data: { policy_name: string; error: string }) => {
      toast({
        title: 'Error',
        description: `Failed to save policy "${data.policy_name}": ${data.error}`,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
      // If error occurs, remove the success listener
      socket.off('policies_after_save');
    });

    // Send the save request
    // Send the save request with original name if editing
    socket.emit('savePolicy', 
      isEditing ? policy?.name : formData.name,  // Original name if editing, new name if creating
      formData
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered motionPreset="slideInBottom" size="xl" scrollBehavior="inside">
      <ModalOverlay backdropFilter="blur(4px)" />
      <ModalContent maxW="800px" w="90%" bg="white" borderRadius="2xl" boxShadow="xl">
        <ModalHeader fontFamily="Inter, sans-serif">
          {isEditing ? 'Edit Policy' : 'New Policy'}
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          <VStack spacing={4} align="stretch" divider={<Box h="1px" bg="gray.100" />}>
            {/* Basic Settings */}
            <Box>
              <Text fontSize="lg" fontWeight="semibold" mb={4}>Basic Settings</Text>
              <VStack spacing={4} align="stretch">
                <FormControl isRequired>
                  <FieldWithInfo 
                    label="Policy Name"
                    info="A unique name to identify this policy"
                  >
                    <Input 
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      maxW="300px"
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
                      onChange={(e) => setFormData({ ...formData, domain: e.target.value as 'com' | 'cn' })}
                      maxW="100px"
                    >
                      <option value="com">com</option>
                      <option value="cn">cn</option>
                    </Select>
                  </FieldWithInfo>
                </FormControl>

                <FormControl isRequired>
                  <FieldWithInfo 
                    label="Download Directory"
                    info="The local directory where photos will be downloaded"
                  >
                    <Input 
                      value={formData.directory}
                      onChange={(e) => setFormData({ ...formData, directory: e.target.value })}
                      maxW="300px"
                    />
                  </FieldWithInfo>
                </FormControl>
              </VStack>
            </Box>

            {/* Download Options */}
            <Box>
              <Text fontSize="lg" fontWeight="semibold" mb={4}>Download Options</Text>
              <VStack spacing={4} align="stretch">
                <FormControl>
                  <FieldWithInfo 
                    label="Folder Structure"
                    info="The folder structure pattern using Python's strftime format"
                  >
                    <Input
                      value={formData.folder_structure}
                      onChange={(e) => setFormData({ ...formData, folder_structure: e.target.value })}
                      maxW="200px"
                    />
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo 
                    label="Live Photo Size"
                    info="The size of live photos to download"
                  >
                    <Select
                      value={formData.live_photo_size}
                      onChange={(e) => setFormData({ ...formData, live_photo_size: e.target.value as 'original' | 'medium' | 'thumb' })}
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
                    label="Force Size"
                    info="Force a specific size when downloading photos"
                  >
                    <Switch
                      checked={formData.force_size}
                      onChange={(e) => setFormData({ ...formData, force_size: e.target.checked })}
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
                      checked={formData.keep_unicode_in_filenames}
                      onChange={(e) => setFormData({ ...formData, keep_unicode_in_filenames: e.target.checked })}
                    />
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo 
                    label="Set EXIF Datetime"
                    info="Set the EXIF datetime in the downloaded photos"
                  >
                    <Switch
                      checked={formData.set_exif_datetime}
                      onChange={(e) => setFormData({ ...formData, set_exif_datetime: e.target.checked })}
                    />
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo 
                    label="XMP Sidecar"
                    info="Create XMP sidecar files for the downloaded photos"
                  >
                    <Switch
                      checked={formData.xmp_sidecar}
                      onChange={(e) => setFormData({ ...formData, xmp_sidecar: e.target.checked })}
                    />
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo 
                    label="Use OS Locale"
                    info="Use the operating system's locale settings"
                  >
                    <Switch
                      checked={formData.use_os_locale}
                      onChange={(e) => setFormData({ ...formData, use_os_locale: e.target.checked })}
                    />
                  </FieldWithInfo>
                </FormControl>
              </VStack>
            </Box>

            {/* Filter Options */}
            <Box>
              <Text fontSize="lg" fontWeight="semibold" mb={4}>Filter Options</Text>
              <VStack spacing={4} align="stretch">
                <FormControl>
                  <FieldWithInfo 
                    label="Album"
                    info="The album to download photos from"
                  >
                    <Select
                      value={formData.album}
                      onChange={(e) => setFormData({ ...formData, album: e.target.value })}
                      maxW="200px"
                    >
                      <option value="All Photos">All Photos</option>
                      <option value="Favorites">Favorites</option>
                      <option value="Recents">Recents</option>
                    </Select>
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo 
                    label="Recent Photos Count"
                    info="Number of recent photos to download (leave empty for all)"
                  >
                    <NumberInput
                      value={formData.recent || ''}
                      onChange={(valueString) => setFormData({ ...formData, recent: valueString === '' ? null : parseInt(valueString) })}
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
                      checked={formData.skip_videos}
                      onChange={(e) => setFormData({ ...formData, skip_videos: e.target.checked })}
                    />
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo 
                    label="Skip Live Photos"
                    info="Skip downloading live photos"
                  >
                    <Switch
                      checked={formData.skip_live_photos}
                      onChange={(e) => setFormData({ ...formData, skip_live_photos: e.target.checked })}
                    />
                  </FieldWithInfo>
                </FormControl>
              </VStack>
            </Box>

            {/* Delete Options */}
            <Box>
              <Text fontSize="lg" fontWeight="semibold" mb={4}>Delete Options</Text>
              <VStack spacing={4} align="stretch">
                <FormControl>
                  <FieldWithInfo 
                    label="Auto Delete"
                    info="Automatically delete photos that are no longer in iCloud"
                  >
                    <Switch
                      checked={formData.auto_delete}
                      onChange={(e) => setFormData({ ...formData, auto_delete: e.target.checked })}
                    />
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo 
                    label="Delete After Download"
                    info="Delete photos from iCloud after successful download"
                  >
                    <Switch
                      checked={formData.delete_after_download}
                      onChange={(e) => setFormData({ ...formData, delete_after_download: e.target.checked })}
                    />
                  </FieldWithInfo>
                </FormControl>
              </VStack>
            </Box>

            {/* UI Options */}
            <Box>
              <Text fontSize="lg" fontWeight="semibold" mb={4}>UI Options</Text>
              <VStack spacing={4} align="stretch">
                <FormControl>
                  <FieldWithInfo 
                    label="Sync Interval (minutes)"
                    info="How often to automatically sync photos (leave empty for manual sync)"
                  >
                    <NumberInput
                      value={formData.interval || ''}
                      onChange={(valueString) => setFormData({ ...formData, interval: valueString === '' ? null : parseInt(valueString) })}
                      min={0}
                      maxW="100px"
                    >
                      <NumberInputField />
                    </NumberInput>
                  </FieldWithInfo>
                </FormControl>

                <FormControl>
                  <FieldWithInfo 
                    label="Log Level"
                    info="The level of detail in log messages"
                  >
                    <Select
                      value={formData.log_level}
                      onChange={(e) => setFormData({ ...formData, log_level: e.target.value as 'debug' | 'info' | 'error' })}
                      maxW="150px"
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
            _hover={{ bg: 'gray.800' }}
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
            _hover={{ bg: 'gray.100' }}
          >
            Cancel
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
} 