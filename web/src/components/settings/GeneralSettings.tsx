import { useRef, useState } from "react";
import {
  Box,
  Text,
  VStack,
  FormControl,
  FormLabel,
  Input,
  Button,
  Image,
  HStack,
  Alert,
  AlertIcon,
  useToast,
} from "@chakra-ui/react";
import { AttachmentIcon } from "@chakra-ui/icons";

function updateFavicon(dataUrl: string) {
  let favicon = document.querySelector(
    "link[rel*='icon']"
  ) as HTMLLinkElement | null;
  if (!favicon) {
    favicon = document.createElement("link");
    favicon.rel = "icon";
    document.head.appendChild(favicon);
  }
  favicon.href = dataUrl;
}

export function GeneralSettings() {
  const toast = useToast();
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
  const [isUploadingFavicon, setIsUploadingFavicon] = useState(false);
  const [faviconError, setFaviconError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setFaviconError(null);
    if (!file) {
      setFaviconFile(null);
      setFaviconPreview(null);
      return;
    }
    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/x-icon",
      "image/vnd.microsoft.icon",
    ];
    if (!allowedTypes.includes(file.type)) {
      setFaviconError("Please select a PNG, JPG, JPEG, or ICO file");
      return;
    }
    if (file.size > 1024 * 1024) {
      setFaviconError("File size must be less than 1MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setFaviconPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
    setFaviconFile(file);
  };

  const handleFaviconUpload = () => {
    if (!faviconFile || !faviconPreview) return;
    setIsUploadingFavicon(true);
    setFaviconError(null);
    try {
      localStorage.setItem("customFavicon", faviconPreview);
      updateFavicon(faviconPreview);
      setIsUploadingFavicon(false);
      setFaviconFile(null);
      setFaviconPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast({
        title: "Success",
        description: "Favicon updated and saved to your browser.",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    } catch {
      setIsUploadingFavicon(false);
      setFaviconError("Failed to save favicon to browser storage");
    }
  };

  const handleRemoveFavicon = () => {
    setFaviconFile(null);
    setFaviconPreview(null);
    setFaviconError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <Box>
      <VStack spacing={8} align="stretch">
        <Box>
          <Text fontWeight="bold" fontSize="lg" mb={4}>
            Customization
          </Text>
          <VStack spacing={3} align="stretch" maxW="400px">
            <FormControl>
              <HStack spacing={3} align="center" mb={3}>
                <FormLabel fontSize="sm" mb={0}>
                  Upload Favicon
                </FormLabel>
                <Button
                  leftIcon={<AttachmentIcon />}
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  _hover={{ bg: "gray.50" }}
                >
                  Choose File
                </Button>
              </HStack>
              <VStack spacing={3} align="stretch">
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.ico"
                  onChange={handleFileSelect}
                  display="none"
                />
                <VStack spacing={1} align="stretch">
                  <Text fontSize="xs" color="gray.500">
                    Recommended: 32x32px PNG, JPG, JPEG, or ICO format.
                  </Text>
                  <Text fontSize="xs" color="gray.500">
                    Max size 1MB. Favicon is saved locally in your browser and
                    will be reset on clearing the browser cache.
                  </Text>
                </VStack>
                {faviconFile && (
                  <VStack spacing={0} align="start">
                    <Text fontSize="xs" color="green.600" fontWeight="medium">
                      Selected: {faviconFile.name}
                    </Text>
                    <Text fontSize="xs" color="gray.500">
                      {(faviconFile.size / 1024).toFixed(1)} KB
                    </Text>
                  </VStack>
                )}
                {faviconError && (
                  <Alert status="error" size="sm">
                    <AlertIcon />
                    {faviconError}
                  </Alert>
                )}
                {faviconPreview && (
                  <Box>
                    <Text fontSize="sm" mb={2}>
                      Preview:
                    </Text>
                    <HStack spacing={3} align="center">
                      <Image
                        src={faviconPreview}
                        alt="Favicon preview"
                        boxSize="32px"
                        objectFit="contain"
                        border="1px solid"
                        borderColor="gray.200"
                        borderRadius="md"
                        bg="white"
                      />
                      <HStack spacing={2}>
                        <Button
                          size="sm"
                          bg="black"
                          color="white"
                          _hover={{ bg: "gray.800" }}
                          onClick={handleFaviconUpload}
                          isLoading={isUploadingFavicon}
                          isDisabled={!faviconFile}
                          leftIcon={<AttachmentIcon />}
                        >
                          Upload
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleRemoveFavicon}
                          isDisabled={isUploadingFavicon}
                        >
                          Cancel
                        </Button>
                      </HStack>
                    </HStack>
                  </Box>
                )}
              </VStack>
            </FormControl>
          </VStack>
        </Box>
      </VStack>
    </Box>
  );
}
