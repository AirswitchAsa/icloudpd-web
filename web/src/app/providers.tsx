"use client";

import { useEffect } from "react";
import { ChakraProvider } from "@chakra-ui/react";

export function Providers({ children }: { children: React.ReactNode }) {
  // Load custom favicon from localStorage on app start
  useEffect(() => {
    try {
      const savedFavicon = localStorage.getItem('customFavicon');
      if (savedFavicon) {
        // Find existing favicon link or create one
        let favicon = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
        
        if (!favicon) {
          favicon = document.createElement('link');
          favicon.rel = 'icon';
          document.head.appendChild(favicon);
        }
        
        favicon.href = savedFavicon;
      }
    } catch (error) {
      console.warn('Failed to load custom favicon from localStorage:', error);
    }
  }, []);

  return <ChakraProvider>{children}</ChakraProvider>;
}
