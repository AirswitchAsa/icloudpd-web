import {
  Box,
  Flex,
  Heading,
  Button,
} from '@chakra-ui/react';

interface BannerProps {
  onSettingsClick: () => void;
}

export function Banner({ onSettingsClick }: BannerProps) {
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
            <Box
              as="a"
              href="https://github.com/your-username/your-repo"
              target="_blank"
              rel="noopener noreferrer"
              color="gray.600"
              _hover={{ 
                color: 'gray.800',
                cursor: 'pointer'
              }}
              fontFamily="Inter, sans-serif"
              fontSize="14px"
              fontWeight="semibold"
            >
              Github
            </Box>

            <Box
              as="span"
              color="gray.600"
              _hover={{ 
                color: 'gray.800',
                cursor: 'pointer'
              }}
              fontFamily="Inter, sans-serif"
              fontSize="14px"
              fontWeight="semibold"
              onClick={onSettingsClick}
            >
              Settings
            </Box>
          </Flex>
        </Flex>
      </Box>
    </Box>
  );
} 