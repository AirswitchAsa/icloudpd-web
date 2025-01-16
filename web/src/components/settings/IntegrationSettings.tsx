import {
  Box,
  Text,
  VStack,
  Collapse,
  Button,
  FormControl,
  FormLabel,
  Input,
  useDisclosure,
  IconButton,
  HStack,
  InputGroup,
  InputRightElement,
  useToast,
  Link,
  Wrap,
  WrapItem,
  Badge,
} from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { Socket } from "socket.io-client";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ViewIcon,
  ViewOffIcon,
} from "@chakra-ui/icons";

interface IntegrationSettingsProps {
  socket: Socket | null;
}

export function IntegrationSettings({ socket }: IntegrationSettingsProps) {
  const {
    isOpen: isAwsOpen,
    onToggle: onAwsToggle,
    onOpen: onAwsOpen,
  } = useDisclosure();
  const {
    isOpen: isAppriseOpen,
    onToggle: onAppriseToggle,
    onOpen: onAppriseOpen,
  } = useDisclosure();
  useEffect(() => {
    onAwsOpen();
    onAppriseOpen();
  }, [onAwsOpen, onAppriseOpen]);

  const [awsAccessKeyId, setAwsAccessKeyId] = useState("");
  const [awsSecretAccessKey, setAwsSecretAccessKey] = useState("");
  const [awsSessionToken, setAwsSessionToken] = useState("");
  const [awsBucketName, setAwsBucketName] = useState("");
  const [showAwsSecret, setShowAwsSecret] = useState(false);
  const [showAwsSessionToken, setShowAwsSessionToken] = useState(false);
  const [isAwsClientReady, setIsAwsClientReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [appriseServices, setAppriseServices] = useState<string[]>([]);
  const [newAppriseConfig, setNewAppriseConfig] = useState("");
  const [isAddingApprise, setIsAddingApprise] = useState(false);
  const [isResettingApprise, setIsResettingApprise] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!socket) return;

    // Fetch current AWS config
    socket.emit("get_aws_config");
    socket.emit("get_apprise_config");

    socket.on(
      "aws_config",
      (config: {
        aws_access_key_id: string;
        aws_secret_access_key: string;
        aws_bucket_name: string;
        aws_session_token: string;
        aws_client_ready: boolean;
      }) => {
        setAwsAccessKeyId(config.aws_access_key_id ?? "");
        setAwsBucketName(config.aws_bucket_name ?? "");
        setIsAwsClientReady(config.aws_client_ready);
      },
    );

    socket.on("error_getting_aws_config", (data: { error: string }) => {
      toast({
        title: "Error",
        description: "Failed to get AWS S3 client: " + data.error,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    });

    socket.on("apprise_config", (services: string[]) => {
      setAppriseServices(services);
    });

    socket.on("error_getting_apprise_config", (data: { error: string }) => {
      toast({
        title: "Error",
        description: "Failed to get Apprise services: " + data.error,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    });

    return () => {
      socket.off("aws_configs");
      socket.off("apprise_config");
      socket.off("apprise_config_added");
      socket.off("apprise_config_reset");
    };
  }, [socket]);

  const handleSaveAws = () => {
    if (!socket) return;
    socket.off("aws_config_saved");
    setIsSaving(true);

    const awsConfigUpdate = {
      aws_access_key_id: awsAccessKeyId,
      aws_secret_access_key: awsSecretAccessKey,
      aws_session_token: awsSessionToken,
      aws_bucket_name: awsBucketName,
    };

    socket.once("aws_config_saved", (data) => {
      setIsSaving(false);
      if (data.success) {
        setIsAwsClientReady(true);
        setAwsSecretAccessKey("");
        setAwsSessionToken("");
        toast({
          title: "Success",
          description: "AWS S3 client is created with bucket " + awsBucketName,
          status: "success",
          duration: 3000,
          isClosable: true,
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to create AWS S3 client: " + data.error,
          status: "error",
          duration: 3000,
          isClosable: true,
        });
      }
    });
    socket.emit("save_aws_config", awsConfigUpdate);
  };

  const handleAddApprise = () => {
    if (!socket || !newAppriseConfig.trim()) return;
    setIsAddingApprise(true);
    socket.once("apprise_config_added", (data) => {
      setIsAddingApprise(false);
      if (data.success) {
        setAppriseServices(data.services);
        setNewAppriseConfig("");
      }
    });
    socket.once("error_adding_apprise_config", (data) => {
      setIsAddingApprise(false);
      toast({
        title: "Error",
        description: data.error,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    });
    socket.emit("add_apprise_config", newAppriseConfig.trim());
  };

  const handleResetApprise = () => {
    if (!socket) return;
    setIsResettingApprise(true);
    socket.once("apprise_config_reset", (data) => {
      setIsResettingApprise(false);
      if (data.success) {
        setAppriseServices([]);
        toast({
          title: "Success",
          description: "Apprise configuration reset",
          status: "success",
          duration: 3000,
          isClosable: true,
        });
      }
    });
    socket.once("error_resetting_apprise_config", (data) => {
      setIsResettingApprise(false);
      toast({
        title: "Error",
        description: data.error,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    });
    socket.emit("reset_apprise_config");
  };

  return (
    <Box>
      <VStack spacing={6} align="stretch">
        {/* Apprise Section */}
        <Box>
          <HStack>
            <IconButton
              aria-label="Toggle info"
              icon={isAppriseOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
              size="sm"
              variant="ghost"
              onClick={onAppriseToggle}
            />
            <Text fontSize="lg" fontWeight="semibold">
              Apprise Notifications
            </Text>
          </HStack>
          <Collapse in={isAppriseOpen}>
            <VStack spacing={3} align="stretch" maxW="400px" mt={4} ml={2}>
              <HStack justify="space-between">
                <Text fontSize="sm" fontWeight="semibold">
                  Added Services
                </Text>
                <Button
                  size="sm"
                  colorScheme="red"
                  variant="outline"
                  onClick={handleResetApprise}
                  isDisabled={appriseServices.length === 0}
                  isLoading={isResettingApprise}
                >
                  Reset
                </Button>
              </HStack>
              <Wrap spacing={2}>
                {appriseServices.map((service, index) => (
                  <WrapItem key={index}>
                    <Badge colorScheme="gray" p={1}>
                      {service}
                    </Badge>
                  </WrapItem>
                ))}
              </Wrap>
              <HStack>
                <Input
                  size="sm"
                  placeholder="Enter Apprise config string"
                  value={newAppriseConfig}
                  onChange={(e) => setNewAppriseConfig(e.target.value)}
                />
                <Button
                  size="sm"
                  colorScheme="teal"
                  onClick={handleAddApprise}
                  isLoading={isAddingApprise}
                  isDisabled={!newAppriseConfig.trim()}
                >
                  Add
                </Button>
              </HStack>
            </VStack>
          </Collapse>
        </Box>

        {/* AWS S3 Section */}
        <Box>
          <HStack>
            <IconButton
              aria-label="Toggle info"
              icon={isAwsOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
              size="sm"
              variant="ghost"
              onClick={onAwsToggle}
            />
            <Text fontSize="lg" fontWeight="semibold">
              AWS S3
            </Text>
            <Text
              fontSize="sm"
              fontWeight="semibold"
              color={isAwsClientReady ? "green.500" : "gray.500"}
              ml={2}
            >
              {isAwsClientReady ? "Connected" : "Not connected"}
            </Text>
          </HStack>
          <Collapse in={isAwsOpen}>
            <VStack spacing={3} align="stretch" maxW="400px" mt={4} ml={2}>
              <Text fontSize="sm" fontWeight="semibold" color="gray.500">
                Connect to your AWS S3 bucket using Access Key ID and Secret.
                {"See "}
                <Link
                  href="https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html?icmpid=docs_iam_console#Using_CreateAccessKey"
                  target="_blank"
                >
                  {"Manage access keys for IAM users"}
                </Link>
                {" for more information."}
              </Text>
              <FormControl>
                <FormLabel fontSize="sm">S3 Bucket Name</FormLabel>
                <Input
                  size="sm"
                  value={awsBucketName}
                  onChange={(e) => setAwsBucketName(e.target.value)}
                />
              </FormControl>
              <FormControl>
                <FormLabel fontSize="sm">AWS Access Key ID</FormLabel>
                <Input
                  size="sm"
                  value={awsAccessKeyId}
                  onChange={(e) => setAwsAccessKeyId(e.target.value)}
                />
              </FormControl>
              <FormControl>
                <FormLabel fontSize="sm">AWS Secret Access Key</FormLabel>
                <InputGroup size="sm">
                  <Input
                    type={showAwsSecret ? "text" : "password"}
                    value={awsSecretAccessKey}
                    onChange={(e) => setAwsSecretAccessKey(e.target.value)}
                  />
                  <InputRightElement>
                    <IconButton
                      aria-label={
                        showAwsSecret
                          ? "Hide AWS Secret Access Key"
                          : "Show AWS Secret Access Key"
                      }
                      icon={showAwsSecret ? <ViewOffIcon /> : <ViewIcon />}
                      variant="ghost"
                      onClick={() => setShowAwsSecret(!showAwsSecret)}
                      size="sm"
                    />
                  </InputRightElement>
                </InputGroup>
              </FormControl>
              <FormControl>
                <FormLabel fontSize="sm">
                  AWS Session Token (Optional)
                </FormLabel>
                <InputGroup size="sm">
                  <Input
                    type={showAwsSessionToken ? "text" : "password"}
                    value={awsSessionToken}
                    onChange={(e) => setAwsSessionToken(e.target.value)}
                  />
                  <InputRightElement>
                    <IconButton
                      aria-label={
                        showAwsSessionToken
                          ? "Hide AWS Session Token"
                          : "Show AWS Session Token"
                      }
                      icon={
                        showAwsSessionToken ? <ViewOffIcon /> : <ViewIcon />
                      }
                      variant="ghost"
                      onClick={() =>
                        setShowAwsSessionToken(!showAwsSessionToken)
                      }
                      size="sm"
                    />
                  </InputRightElement>
                </InputGroup>
              </FormControl>
            </VStack>
            <Button
              mt={4}
              colorScheme="teal"
              onClick={handleSaveAws}
              size="sm"
              ml={2}
              isDisabled={
                isSaving ||
                !awsBucketName ||
                !awsAccessKeyId ||
                !awsSecretAccessKey
              }
              isLoading={isSaving}
            >
              Save AWS Settings
            </Button>
          </Collapse>
        </Box>
      </VStack>
    </Box>
  );
}
