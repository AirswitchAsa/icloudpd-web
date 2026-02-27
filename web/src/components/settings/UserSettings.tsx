import { useState, useEffect, useRef } from "react";
import {
  Box,
  VStack,
  Text,
  FormControl,
  FormLabel,
  Input,
  InputGroup,
  InputRightElement,
  IconButton,
  Button,
  useToast,
  FormErrorMessage,
  Switch,
  Image,
  HStack,
  Alert,
  AlertIcon,
} from "@chakra-ui/react";
import { ViewIcon, ViewOffIcon, AttachmentIcon } from "@chakra-ui/icons";
import { Socket } from "socket.io-client";

interface UserSettingsProps {
  socket: Socket | null;
  isGuest: boolean;
}

interface AccessControlConfig {
  no_password: boolean;
  always_guest: boolean;
  disable_guest: boolean;
}

export function UserSettings({ socket, isGuest }: UserSettingsProps) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [accessControl, setAccessControl] = useState<AccessControlConfig>({
    no_password: false,
    always_guest: false,
    disable_guest: false,
  });
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
  const [isUploadingFavicon, setIsUploadingFavicon] = useState(false);
  const [faviconError, setFaviconError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const passwordsMatch = newPassword === confirmPassword;
  const showMismatchError = confirmPassword !== "" && !passwordsMatch;

  const updateFavicon = (dataUrl: string) => {
    // Find existing favicon link or create one
    let favicon = document.querySelector("link[rel*='icon']") as HTMLLinkElement;

    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }

    favicon.href = dataUrl;
  };

  useEffect(() => {
    if (!socket) return;

    // Get server config
    socket.emit("get_server_config");

    socket.on("server_config", (config: AccessControlConfig) => {
      setAccessControl(config);
    });

    return () => {
      socket.off("server_config");
    };
  }, [socket]);

  const handleSave = () => {
    if (!socket || !passwordsMatch) return;
    socket.off("server_secret_saved");
    socket.off("failed_saving_server_secret");
    setIsSaving(true);

    // Set up listeners before emitting
    socket.once("server_secret_saved", () => {
      setIsSaving(false);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({
        title: "Success",
        description: "Server password has been updated",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    });

    socket.once("failed_saving_server_secret", (data: { error: string }) => {
      setIsSaving(false);
      toast({
        title: "Error",
        description: data.error,
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    });

    socket.emit("save_secret", oldPassword, newPassword);
  };

  const handleConfigChange =
    (key: keyof AccessControlConfig) => (value: boolean) => {
      if (!socket) return;
      socket.off("app_config_updated");
      socket.off("error_updating_app_config");

      // Set up listeners before emitting
      socket.once("app_config_updated", () => {
        // Update local state immediately after successful update
        setAccessControl((prev) => ({
          ...prev,
          [key]: value,
        }));

        toast({
          title: "Success",
          description: "Access control settings updated",
          status: "success",
          duration: 3000,
          isClosable: true,
        });
      });

      socket.once("error_updating_app_config", (data: { error: string }) => {
        // Revert the switch back to its previous state by re-fetching config
        socket.emit("getServerConfig");

        toast({
          title: "Error",
          description: data.error,
          status: "error",
          duration: 5000,
          isClosable: true,
        });
      });

      socket.emit("update_app_config", key, value);
    };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setFaviconError(null);

    if (!file) {
      setFaviconFile(null);
      setFaviconPreview(null);
      return;
    }

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/x-icon', 'image/vnd.microsoft.icon'];
    if (!allowedTypes.includes(file.type)) {
      setFaviconError('Please select a PNG, JPG, JPEG, or ICO file');
      return;
    }

    // Validate file size (max 1MB)
    if (file.size > 1024 * 1024) {
      setFaviconError('File size must be less than 1MB');
      return;
    }

    // Create preview
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
      // Save favicon data to localStorage
      localStorage.setItem('customFavicon', faviconPreview);

      // Update favicon immediately
      updateFavicon(faviconPreview);

      // Clean up UI
      setIsUploadingFavicon(false);
      setFaviconFile(null);
      setFaviconPreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      toast({
        title: "Success",
        description: "Favicon has been updated and saved to your browser.",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    } catch {
      setIsUploadingFavicon(false);
      setFaviconError("Failed to save favicon to browser storage");
      toast({
        title: "Error",
        description: "Failed to save favicon to browser storage",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const handleRemoveFavicon = () => {
    setFaviconFile(null);
    setFaviconPreview(null);
    setFaviconError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
                <FormLabel fontSize="sm" mb={0}>Upload Favicon</FormLabel>
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
                    Max size 1MB. Favicon is saved locally in your browser and will be reset on clearing the browser cache.
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
                    <Text fontSize="sm" mb={2}>Preview:</Text>
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

        <Box>
          <Text fontWeight="bold" fontSize="lg" mb={4}>
            Access Control
          </Text>
          <VStack spacing={3} align="stretch" maxW="400px">
            <FormControl
              display="flex"
              alignItems="center"
              justifyContent="space-between"
            >
              <FormLabel fontSize="sm" mb={0}>
                No Password Required
              </FormLabel>
              <Switch
                isChecked={accessControl.no_password}
                onChange={(e) =>
                  handleConfigChange("no_password")(e.target.checked)
                }
                isDisabled={isGuest}
              />
            </FormControl>
            <FormControl
              display="flex"
              alignItems="center"
              justifyContent="space-between"
            >
              <FormLabel fontSize="sm" mb={0}>
                Always Use Guest Mode
              </FormLabel>
              <Switch
                isChecked={accessControl.always_guest}
                onChange={(e) =>
                  handleConfigChange("always_guest")(e.target.checked)
                }
                isDisabled={isGuest && !accessControl.always_guest}
              />
            </FormControl>
            <FormControl
              display="flex"
              alignItems="center"
              justifyContent="space-between"
            >
              <FormLabel fontSize="sm" mb={0}>
                Disable Guest Access
              </FormLabel>
              <Switch
                isChecked={accessControl.disable_guest}
                onChange={(e) =>
                  handleConfigChange("disable_guest")(e.target.checked)
                }
                isDisabled={isGuest}
              />
            </FormControl>
          </VStack>
        </Box>

        <Box>
          <Text fontWeight="bold" fontSize="lg" mb={4}>
            Change Password
          </Text>
          <VStack spacing={3} align="stretch" maxW="400px">
            <FormControl>
              <FormLabel fontSize="sm">Current Password</FormLabel>
              <InputGroup size="sm">
                <Input
                  type={showOldPassword ? "text" : "password"}
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                />
                <InputRightElement>
                  <IconButton
                    aria-label={
                      showOldPassword ? "Hide password" : "Show password"
                    }
                    icon={showOldPassword ? <ViewOffIcon /> : <ViewIcon />}
                    variant="ghost"
                    onClick={() => setShowOldPassword(!showOldPassword)}
                    size="sm"
                  />
                </InputRightElement>
              </InputGroup>
            </FormControl>
            <FormControl isInvalid={showMismatchError}>
              <FormLabel fontSize="sm">New Password</FormLabel>
              <InputGroup size="sm">
                <Input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <InputRightElement>
                  <IconButton
                    aria-label={
                      showNewPassword ? "Hide password" : "Show password"
                    }
                    icon={showNewPassword ? <ViewOffIcon /> : <ViewIcon />}
                    variant="ghost"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    size="sm"
                  />
                </InputRightElement>
              </InputGroup>
            </FormControl>
            <FormControl isInvalid={showMismatchError}>
              <FormLabel fontSize="sm">Confirm New Password</FormLabel>
              <InputGroup size="sm">
                <Input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <InputRightElement>
                  <IconButton
                    aria-label={
                      showConfirmPassword ? "Hide password" : "Show password"
                    }
                    icon={showConfirmPassword ? <ViewOffIcon /> : <ViewIcon />}
                    variant="ghost"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    size="sm"
                  />
                </InputRightElement>
              </InputGroup>
              {showMismatchError && (
                <FormErrorMessage>Passwords do not match</FormErrorMessage>
              )}
            </FormControl>
            <Box pt={2}>
              <Button
                bg="black"
                color="white"
                _hover={{ bg: "gray.800" }}
                onClick={handleSave}
                isDisabled={
                  !oldPassword ||
                  !newPassword ||
                  !confirmPassword ||
                  !passwordsMatch ||
                  isSaving ||
                  isGuest
                }
                isLoading={isSaving}
                size="sm"
              >
                Update Password
              </Button>
            </Box>
          </VStack>
        </Box>
      </VStack>
    </Box>
  );
}
