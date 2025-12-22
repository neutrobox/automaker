import { useEffect, useRef } from 'react';

interface UseSidebarAutoCollapseProps {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
}

export function useSidebarAutoCollapse({
  sidebarOpen,
  toggleSidebar,
}: UseSidebarAutoCollapseProps) {
  const isMountedRef = useRef(false);

  // Auto-collapse sidebar on small screens
  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1024px)'); // lg breakpoint

    const handleResize = () => {
      if (mediaQuery.matches && sidebarOpen) {
        // Auto-collapse on small screens
        toggleSidebar();
      }
    };

    // Check on mount only
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      handleResize();
    }

    // Listen for changes
    mediaQuery.addEventListener('change', handleResize);
    return () => mediaQuery.removeEventListener('change', handleResize);
  }, [sidebarOpen, toggleSidebar]);

  // Update Electron window minWidth when sidebar state changes
  // This ensures the window can't be resized smaller than what the kanban board needs
  useEffect(() => {
    const electronAPI = (
      window as unknown as {
        electronAPI?: { updateMinWidth?: (expanded: boolean) => Promise<void> };
      }
    ).electronAPI;
    if (electronAPI?.updateMinWidth) {
      electronAPI.updateMinWidth(sidebarOpen);
    }
  }, [sidebarOpen]);
}
