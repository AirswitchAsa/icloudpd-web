import { Box, Text, BoxProps, Flex, Spacer } from '@chakra-ui/react';

interface PanelProps extends BoxProps {
  title: string;
  children?: React.ReactNode;
  headerRight?: React.ReactNode;
}

export function Panel({ title, children, headerRight, ...props }: PanelProps) {
  return (
    <Box width="100%" {...props}>
      <Box 
        bg="white" 
        borderRadius="2xl" 
        boxShadow="sm" 
        border="1px" 
        borderColor="gray.200"
        display="flex"
        flexDirection="column"
      >
        <Flex 
          px={12}
          borderBottom="1px" 
          borderColor="gray.100" 
          height="56px"
          alignItems="center"
        >
          <Text
            fontSize="14px"
            fontWeight="semibold"
            color="gray.600"
            letterSpacing="0.05em"
            pl={2}
          >
            {title.toUpperCase()}
          </Text>
          <Spacer />
          {headerRight}
        </Flex>
        <Box
          pt={2}
          pb={10}
          px={12}
          flex="1"
          minH="200px"
          display="flex"
          alignItems="flex-start"
          width="100%"
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
} 