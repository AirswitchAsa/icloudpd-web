import {
  Box,
  Flex,
  Heading,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Portal,
  useDisclosure,
} from '@chakra-ui/react';
import { useEffect } from 'react';
import { IoExitOutline, IoSettingsOutline } from "react-icons/io5";

interface BannerProps {
  onSettingsClick: () => void;
  onLogoutClick: () => void;
}

export function Banner({ onSettingsClick, onLogoutClick }: BannerProps) {
  const { isOpen: isUserOpen, onOpen: onUserOpen, onClose: onUserClose } = useDisclosure();
  const { isOpen: isGithubOpen, onOpen: onGithubOpen, onClose: onGithubClose } = useDisclosure();

  let userTimeoutId: NodeJS.Timeout;
  let githubTimeoutId: NodeJS.Timeout;

  const handleUserMouseEnter = () => {
    clearTimeout(userTimeoutId);
    onUserOpen();
  };

  const handleUserMouseLeave = () => {
    userTimeoutId = setTimeout(onUserClose, 100);
  };

  const handleGithubMouseEnter = () => {
    clearTimeout(githubTimeoutId);
    onGithubOpen();
  };

  const handleGithubMouseLeave = () => {
    githubTimeoutId = setTimeout(onGithubClose, 100);
  };

  useEffect(() => {
    return () => {
      clearTimeout(userTimeoutId);
      clearTimeout(githubTimeoutId);
    };
  }, []);

  return (
    <Box bg="white" borderBottom="1px" borderColor="gray.200" py={4} position="sticky" top={0} zIndex={1}>
      <Box mx="auto" width="100%">
        <Flex 
          maxW="container.xl" 
          mx="auto" 
          width="100%"
          justify="space-between" 
          align="center"
          pr={6}
        >
          <Heading
            fontSize="24px"
            fontWeight="bold"
            fontFamily="Inter, sans-serif"
            color="black"
          >
            iCloud Photos Downloader
          </Heading>

          <Flex gap={4} align="center">
            <Box onMouseEnter={handleGithubMouseEnter} onMouseLeave={handleGithubMouseLeave}>
              <Menu isOpen={isGithubOpen} isLazy gutter={1}>
                <MenuButton
                  as={Box}
                  color={isGithubOpen ? "gray.800" : "gray.600"}
                  _hover={{ 
                    color: 'gray.800',
                    cursor: 'pointer'
                  }}
                  fontFamily="Inter, sans-serif"
                  fontSize="14px"
                  fontWeight="semibold"
                >
                  Github
                </MenuButton>
                <Portal>
                  <MenuList 
                    onMouseEnter={handleGithubMouseEnter} 
                    onMouseLeave={handleGithubMouseLeave}
                    fontSize="13px"
                    color="gray.600"
                    minW="auto"
                  >
                    <MenuItem 
                      as="a" 
                      href="https://github.com/AirswitchAsa/icloudpd-web"
                      target="_blank"
                      rel="noopener noreferrer"
                      _hover={{ color: 'gray.800' }}
                    >
                      Project icloudpd-web
                    </MenuItem>
                    <MenuItem 
                      as="a" 
                      href="https://icloud-photos-downloader.github.io/icloud_photos_downloader/"
                      target="_blank"
                      rel="noopener noreferrer"
                      _hover={{ color: 'gray.800' }}
                    >
                      Documentation (icloudpd)
                    </MenuItem>
                  </MenuList>
                </Portal>
              </Menu>
            </Box>

            <Box onMouseEnter={handleUserMouseEnter} onMouseLeave={handleUserMouseLeave}>
              <Menu isOpen={isUserOpen} isLazy gutter={1}>
                <MenuButton
                  as={Box}
                  color={isUserOpen ? "gray.800" : "gray.600"}
                  _hover={{ 
                    color: 'gray.800',
                    cursor: 'pointer'
                  }}
                  fontFamily="Inter, sans-serif"
                  fontSize="14px"
                  fontWeight="semibold"
                >
                  My App
                </MenuButton>
                <Portal>
                  <MenuList 
                    onMouseEnter={handleUserMouseEnter} 
                    onMouseLeave={handleUserMouseLeave}
                    fontSize="13px"
                    color="gray.600"
                    minW="auto"
                  >
                    <MenuItem 
                      onClick={onSettingsClick}
                      _hover={{ color: 'gray.800' }}
                    >
                      <IoSettingsOutline style={{ marginRight: '8px' }} />
                      Settings
                    </MenuItem>
                    <MenuItem 
                      onClick={onLogoutClick}
                      _hover={{ color: 'gray.800' }}
                    >
                      <IoExitOutline style={{ marginRight: '8px' }} />
                      Log out
                    </MenuItem>
                  </MenuList>
                </Portal>
              </Menu>
            </Box>
          </Flex>
        </Flex>
      </Box>
    </Box>
  );
} 