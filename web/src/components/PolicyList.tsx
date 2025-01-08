import {
  Box,
  Flex,
  Text,
  VStack,
  UseToastOptions,
  IconButton,
  useDisclosure,
} from '@chakra-ui/react';
import { PiUploadBold } from "react-icons/pi";
import { TbFileExport } from "react-icons/tb";
import { Policy } from '@/types/index';
import { PolicyRow } from './PolicyRow';
import { ImportModal, ExportModal } from './PolicyModals';
import { FilterMenu, SortMenu } from './PolicyFilters';
import { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';

interface PolicyListProps {
  policies: Policy[];
  setPolicies: (policies: Policy[]) => void;
  onEdit: (policy: Policy) => void;
  onDelete: (policy: Policy) => void;
  onRun: (policy: Policy) => void;
  onInterrupt: (policy: Policy) => void;
  socket: Socket | null;
  toast: (options: UseToastOptions) => void;
}

export const PolicyList = ({ 
  policies, 
  setPolicies,
  onEdit, 
  onDelete, 
  onRun, 
  onInterrupt, 
  socket, 
  toast 
}: PolicyListProps) => {
  const [filteredPolicies, setFilteredPolicies] = useState<Policy[]>(policies);
  const [selectedUsernames, setSelectedUsernames] = useState<string[]>(['All']);
  const [sortOrder, setSortOrder] = useState<'none' | 'asc' | 'desc'>('none');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const {
    isOpen: isImportOpen,
    onOpen: onImportOpen,
    onClose: onImportClose
  } = useDisclosure();
  
  const {
    isOpen: isExportOpen,
    onOpen: onExportOpen,
    onClose: onExportClose
  } = useDisclosure();

  // Get unique usernames from policies
  const uniqueUsernames = Array.from(new Set(policies.map(p => p.username)));

  // Update filtered policies when policies, filter, or sort changes
  useEffect(() => {
    let result = [...policies];
    
    // Apply username filter
    if (!selectedUsernames.includes('All')) {
      result = result.filter(p => selectedUsernames.includes(p.username));
    }
    
    // Apply sort
    if (sortOrder !== 'none') {
      result.sort((a, b) => {
        if (sortOrder === 'asc') {
          return a.name.localeCompare(b.name);
        } else {
          return b.name.localeCompare(a.name);
        }
      });
    }
    
    setFilteredPolicies(result);
  }, [policies, selectedUsernames, sortOrder]);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !socket) return;

    const content = await file.text();
    socket.emit('uploadPolicies', content);
    
    socket.once('uploaded_policies', (policies: Policy[]) => {
      setPolicies(policies);
      toast({
        title: 'Success',
        description: 'Policies imported successfully',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    });

    socket.once('error_uploading_policies', ({ error }: { error: string }) => {
      toast({
        title: 'Error',
        description: `Failed to import policies: ${error}`,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    });

    onImportClose();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleExport = () => {
    if (!socket) return;

    socket.emit('downloadPolicies');
    socket.once('error_downloading_policies', ({ error }: { error: string }) => {
      toast({
        title: 'Error',
        description: `Failed to export policies: ${error}`,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    });
    socket.once('downloaded_policies', (content: string) => {
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'policies.toml';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onExportClose();
    });
  };

  return (
    <VStack spacing={2} width="100%" align="stretch">
      <Flex justify="space-between" gap={2}>
        <Flex gap={2}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".toml"
            style={{ display: 'none' }}
          />
          
          <IconButton
            aria-label="Import policies"
            icon={<PiUploadBold />}
            onClick={onImportOpen}
            variant="ghost"
            colorScheme="gray"
          />
          
          <IconButton
            aria-label="Export policies"
            icon={<TbFileExport />}
            onClick={onExportOpen}
            variant="ghost"
            colorScheme="gray"
          />
        </Flex>

        <Flex gap={2}>
          <FilterMenu
            selectedUsernames={selectedUsernames}
            setSelectedUsernames={setSelectedUsernames}
            uniqueUsernames={uniqueUsernames}
          />
          <SortMenu setSortOrder={setSortOrder} />
        </Flex>
      </Flex>

      <ImportModal
        isOpen={isImportOpen}
        onClose={onImportClose}
        onImport={handleImportClick}
      />

      <ExportModal
        isOpen={isExportOpen}
        onClose={onExportClose}
        onExport={handleExport}
      />

      {filteredPolicies.length > 0 ? (
        filteredPolicies.map((policy) => (
          <PolicyRow
            key={policy.name}
            policy={policy}
            setPolicies={setPolicies}
            onEdit={onEdit}
            onDelete={onDelete}
            onRun={onRun}
            onInterrupt={onInterrupt}
            socket={socket}
            toast={toast}
          />
        ))
      ) : (
        <Box
          height="100px"
          display="grid"
          placeItems="center"
        >
          <Text color="gray.500" textAlign="center" fontFamily="Inter, sans-serif" fontSize="14px">
            No policies found
          </Text>
        </Box>
      )}
    </VStack>
  );
}; 