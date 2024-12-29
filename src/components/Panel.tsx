import { Box, Text, BoxProps, Flex } from '@chakra-ui/react';

interface PanelProps extends BoxProps {
  title: string;
  children?: React.ReactNode;
  headerRight?: React.ReactNode;
}

export function Panel({ title, children, headerRight, ...props }: PanelProps) {
  return (
    <Box width="100%" {...props}>
      <Flex justify="space-between" align="center">
        <Text
          fontSize="20px"
          fontWeight="medium"
          fontFamily="Inter, sans-serif"
          color="black"
          mb={2}
          py={20}
        >
          {title}
        </Text>
        {headerRight}
      </Flex>
      <Box
        bg="white"
        borderRadius="2xl"
        py={8}
        px={12}
        boxShadow="sm"
        border="1px"
        borderColor="gray.200"
        minH="300px"
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        {children || (
          <Text
            color="gray.500"
            textAlign="center"
            fontFamily="Inter, sans-serif"
            fontSize="14px"
          >
            Empty
          </Text>
        )}
      </Box>
    </Box>
  );
} 