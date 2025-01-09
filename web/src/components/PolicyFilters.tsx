import {
  IconButton,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Box,
  Checkbox,
  CheckboxGroup,
  Stack,
  Text,
  HStack,
} from '@chakra-ui/react';
import { HamburgerIcon } from '@chakra-ui/icons';
import { BiSortAlt2, BiSortUp, BiSortDown } from "react-icons/bi";
import { useState } from 'react';

interface FilterMenuProps {
  selectedUsernames: string[];
  setSelectedUsernames: (usernames: string[]) => void;
  uniqueUsernames: string[];
}

export const FilterMenu = ({ selectedUsernames, setSelectedUsernames, uniqueUsernames }: FilterMenuProps) => {
  return (
    <Menu>
      <MenuButton
        as={IconButton}
        aria-label="Filter policies"
        icon={<HamburgerIcon />}
        variant="ghost"
        colorScheme="gray"
      />
      <MenuList color="gray.600" minW="auto">
        <Box px={4} py={2}>
          <CheckboxGroup
            value={selectedUsernames}
            onChange={(values) => setSelectedUsernames(values as string[])}
          >
            <Stack>
              <Checkbox 
                value="All"
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedUsernames(['All']);  // Only select 'All'
                  } else {
                    setSelectedUsernames([]);  // Clear all selections
                  }
                }}
              >
              <Text fontSize="14px">All</Text>
              </Checkbox>
              {uniqueUsernames.map(username => (
                <Checkbox
                  key={username}
                  value={username}
                  isChecked={selectedUsernames.includes(username)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      if (selectedUsernames.includes('All')) {
                        setSelectedUsernames([username]);
                      } else {
                        setSelectedUsernames([...selectedUsernames, username]);
                      }
                    } else {
                      setSelectedUsernames(selectedUsernames.filter(u => u !== username));
                    }
                  }}
                >
                  <Text fontSize="14px">{username}</Text>
                </Checkbox>
              ))}
            </Stack>
          </CheckboxGroup>
        </Box>
      </MenuList>
    </Menu>
  );
};

interface SortMenuProps {
  setSortConfig: (config: { field: 'none' | 'name' | 'username' | 'status', direction: 'asc' | 'desc' }) => void;
}

export const SortMenu = ({ setSortConfig }: SortMenuProps) => {
  const [currentField, setCurrentField] = useState<'none' | 'name' | 'username' | 'status'>('none');
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc');

  const handleSortClick = (field: 'name' | 'username' | 'status') => {
    let newDirection: 'asc' | 'desc';
    if (currentField === field) {
      newDirection = direction === 'asc' ? 'desc' : 'asc';
      setDirection(newDirection);
    } else {
      newDirection = 'asc';
      setDirection(newDirection);
    }
    setCurrentField(field);
    setSortConfig({ field, direction: newDirection });
  };

  return (
    <Menu closeOnSelect={false}>
      <MenuButton
        as={IconButton}
        aria-label="Sort policies"
        icon={<BiSortAlt2 />}
        variant="ghost"
        colorScheme="gray"
        _hover={{ bg: 'transparent' }}
      />
      <MenuList fontSize="13px" color="gray.600" minW="150px">
        <MenuItem 
          onClick={() => {
            setCurrentField('none');
            setSortConfig({ field: 'none', direction: 'asc' });
          }}
          _hover={{ bg: 'transparent' }}
        >
          <HStack spacing={2} width="100%" justify="space-between">
            <Text>Manual</Text>
          </HStack>
        </MenuItem>
        <MenuItem onClick={() => handleSortClick('name')} _hover={{ bg: 'transparent' }}>
          <HStack spacing={2} width="100%" justify="space-between">
            <Text>Policy Name</Text>
            {currentField === 'name' && (direction === 'asc' ? <BiSortUp /> : <BiSortDown />)}
          </HStack>
        </MenuItem>
        <MenuItem onClick={() => handleSortClick('username')} _hover={{ bg: 'transparent' }}>
          <HStack spacing={2} width="100%" justify="space-between">
            <Text>Username</Text>
            {currentField === 'username' && (direction === 'asc' ? <BiSortUp /> : <BiSortDown />)}
          </HStack>
        </MenuItem>
        <MenuItem onClick={() => handleSortClick('status')} _hover={{ bg: 'transparent' }}>
          <HStack spacing={2} width="100%" justify="space-between">
            <Text>Status</Text>
            {currentField === 'status' && (direction === 'asc' ? <BiSortUp /> : <BiSortDown />)}
          </HStack>
        </MenuItem>
      </MenuList>
    </Menu>
  );
};
