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
} from '@chakra-ui/react';
import { HamburgerIcon } from '@chakra-ui/icons';
import { BiSortAlt2 } from "react-icons/bi";

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
      <MenuList>
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
                All
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
                  {username}
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
  setSortOrder: (order: 'none' | 'asc' | 'desc') => void;
}

export const SortMenu = ({ setSortOrder }: SortMenuProps) => {
  return (
    <Menu>
      <MenuButton
        as={IconButton}
        aria-label="Sort policies"
        icon={<BiSortAlt2 />}
        variant="ghost"
        colorScheme="gray"
      />
      <MenuList>
        <MenuItem onClick={() => setSortOrder('asc')}>
          Name: A to Z
        </MenuItem>
        <MenuItem onClick={() => setSortOrder('desc')}>
          Name: Z to A
        </MenuItem>
      </MenuList>
    </Menu>
  );
}; 