import React from 'react';
import { VaultProvider, useVault } from './store/VaultContext';
import { ContextMenuProvider } from './components/ContextMenu';
import { LockScreen } from './components/LockScreen';
import { Sidebar } from './components/Sidebar';
import { MainView } from './components/MainView';
import { BottomNavigation } from './components/BottomNavigation';

function VaultApp() {
  const { isUnlocked } = useVault();

  if (!isUnlocked) {
    return <LockScreen />;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white text-gray-900 transition-colors duration-200 dark:bg-[#0F1115] dark:text-slate-200 flex-col md:flex-row">
      <div className="hidden md:flex h-full">
         <Sidebar />
      </div>
      <MainView />
      <BottomNavigation className="md:hidden" />
    </div>
  );
}

export default function App() {
  return (
    <VaultProvider>
      <ContextMenuProvider>
        <VaultApp />
      </ContextMenuProvider>
    </VaultProvider>
  );
}
