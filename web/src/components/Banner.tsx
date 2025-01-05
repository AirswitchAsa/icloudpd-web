import {
  Box,
  Flex,
  Heading,
  Button,
} from '@chakra-ui/react';

export function Banner() {
  return (
    <Box bg="white" borderBottom="1px" borderColor="gray.200" py={4} position="sticky" top={0} zIndex={1}>
      <Box mx="auto" width="100%">
        <Flex 
          maxW="container.xl" 
          mx="auto" 
          width="100%"
          justify="space-between" 
          align="center"
        >
          <Heading
            fontSize="24px"
            fontWeight="bold"
            fontFamily="Inter, sans-serif"
            color="black"
          >
            iCloud Photos Downloader
          </Heading>
          <Button
            bg="black"
            color="white"
            _hover={{ bg: 'gray.800' }}
            borderRadius="xl"
            fontFamily="Inter, sans-serif"
            fontSize="14px"
          >
            Settings
          </Button>
        </Flex>
      </Box>
    </Box>
  );
} 