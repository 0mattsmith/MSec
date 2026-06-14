import React, { useState } from 'react';
import { useVault } from '../store/VaultContext';
import { PreviewWireframe } from './PreviewWireframe';
import { useContextMenu } from './ContextMenu';
import { 
  ShieldCheck, LayoutGrid, Key, FileText, CreditCard, User, 
  Share2, Trash2, Folder as FolderIcon, Plus, Settings, Sun, Moon,
  Mail, Activity, ShieldAlert, Fingerprint, Star, Clock, LayoutDashboard
} from 'lucide-react';
import { cn } from '../lib/utils';
import type { AppState, ItemCategory } from '../types';

export function Sidebar() {
  const { 
    activeCategory, 
    setActiveCategory, 
    theme, 
    setTheme, 
    folders, 
    activeFolderId, 
    setActiveFolderId,
    addFolder
  } = useVault();
  
  const { showMenu } = useContextMenu();

  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [hoverY, setHoverY] = useState<number>(0);
  const [isManuallyCompact, setIsManuallyCompact] = useState(false);

  const isCompact = activeCategory === 'dashboard' || isManuallyCompact;

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (newFolderName.trim()) {
      addFolder(newFolderName.trim());
    }
    setIsCreatingFolder(false);
    setNewFolderName('');
  };

  const FolderNavItem: React.FC<{ folder: any }> = ({ folder }) => {
    const isActive = activeFolderId === folder.id && activeCategory === 'all';
    const [isDragOver, setIsDragOver] = useState(false);
    return (
      <button
        onClick={() => { setActiveFolderId(folder.id); setActiveCategory('all'); }} 
        onContextMenu={(e) => showMenu(e, 'folder', folder.id)}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
           e.preventDefault();
           setIsDragOver(false);
           const itemId = e.dataTransfer.getData('text/plain');
           if (itemId) {
              window.dispatchEvent(new CustomEvent('ms-vault-move-item', { detail: { itemId, folderId: folder.id } }));
           }
        }}
        className={cn(
          "flex w-full items-center px-3 py-2 text-sm font-medium transition-colors rounded-md",
           isCompact ? "justify-center" : "space-x-3",
           isActive || isDragOver
            ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-600/10 dark:text-indigo-400" 
            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/50",
           isDragOver && "ring-2 ring-indigo-500"
        )}
        title={isCompact ? folder.name : undefined}
      >
         <FolderIcon className={cn("h-4 w-4 shrink-0", isActive || isDragOver ? "text-indigo-700 dark:text-indigo-400" : "text-gray-400 dark:text-slate-400")} />
         {!isCompact && <span className="break-words line-clamp-2">{folder.name}</span>}
      </button>
    );
  };

  const NavItem = ({ 
    icon: Icon, 
    label, 
    subLabel,
    isComingSoon,
    categoryId, 
    isActive, 
    onClick,
    onContextMenu
  }: { 
    key?: string | number,
    icon: any, 
    label: string, 
    subLabel?: string,
    isComingSoon?: boolean,
    categoryId?: string, 
    isActive: boolean, 
    onClick: () => void,
    onContextMenu?: (e: React.MouseEvent) => void
  }) => (
    <div 
      className="relative w-full"
      onMouseEnter={(e) => {
        if (!isCompact && categoryId && ['generator', 'emails', 'health', 'scanner'].includes(categoryId)) {
          const rect = e.currentTarget.getBoundingClientRect();
          setHoverY(Math.min(rect.top + rect.height / 2, window.innerHeight - 100));
          setHoveredCategory(categoryId);
        }
      }}
      onMouseLeave={() => setHoveredCategory(null)}
    >
      <button
        onClick={onClick}
        onContextMenu={onContextMenu}
        title={isCompact ? label : undefined}
        className={cn(
          "flex w-full items-center px-3 py-2 text-sm font-medium transition-colors rounded-md relative z-10",
          isCompact ? "justify-center" : "space-x-3 text-left",
          isActive 
            ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-600/10 dark:text-indigo-400" 
            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/50",
          isComingSoon && !isActive && "opacity-60 cursor-default hover:bg-transparent dark:hover:bg-transparent"
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-indigo-700 dark:text-indigo-400" : "text-gray-400 dark:text-slate-400")} />
        {!isCompact && (
          <div className="flex flex-col overflow-hidden">
            <span className="break-words line-clamp-2">{label}</span>
            {subLabel && <span className="text-[10px] leading-tight opacity-70 mt-0.5">{subLabel}</span>}
          </div>
        )}
      </button>
    </div>
  );

  return (
    <div className={cn(
      "flex h-full flex-col bg-white border-r border-gray-200 dark:bg-[#15191F] dark:border-slate-800 shrink-0 transition-all duration-300",
      isCompact ? "w-20" : "w-64"
    )}>
      <div className={cn("flex h-16 items-center border-b border-transparent dark:border-slate-800 relative group", isCompact ? "justify-center px-0 w-full" : "px-6 w-full")}>
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0">
          <ShieldCheck className="h-5 w-5 text-white" />
        </div>
        {!isCompact && <span className="ml-3 text-lg font-bold tracking-tight text-gray-900 dark:text-white whitespace-nowrap">MSec</span>}
        {!isCompact ? (
          <button 
            onClick={() => setIsManuallyCompact(true)}
            className="absolute right-4 p-1 rounded-md hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Compact Layout"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
          </button>
        ) : (
          <button 
            onClick={() => setIsManuallyCompact(false)}
            className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
            title="Expand Layout"
          />
        )}
      </div>

      <div className={cn("flex-1 overflow-y-auto py-2 custom-scrollbar", isCompact ? "px-2 space-y-4" : "px-4 space-y-6")}>
        
        <div className="space-y-1">
          {!isCompact && <div className="text-[10px] uppercase tracking-widest text-gray-500 dark:text-slate-500 font-bold mb-2 mt-4 px-1">Vault</div>}
          <NavItem icon={LayoutGrid} label="All Items" categoryId="all" isActive={activeCategory === 'all' && !activeFolderId} onClick={() => setActiveCategory('all')} />
          <NavItem icon={Star} label="Favorites" categoryId="favorites" isActive={activeCategory === 'favorites'} onClick={() => setActiveCategory('favorites')} />
          <NavItem icon={Clock} label="Authenticator" categoryId="authenticator" isActive={activeCategory === 'authenticator'} onClick={() => setActiveCategory('authenticator')} />
          <NavItem icon={Key} label="Passwords" categoryId="login" isActive={activeCategory === 'login'} onClick={() => setActiveCategory('login')} />
          <NavItem icon={Fingerprint} label="Passkeys" categoryId="passkey" isActive={activeCategory === 'passkey'} onClick={() => setActiveCategory('passkey')} />
          <NavItem icon={FileText} label="Secure Notes" categoryId="note" isActive={activeCategory === 'note'} onClick={() => setActiveCategory('note')} />
          <NavItem icon={CreditCard} label="Credit Cards" categoryId="card" isActive={activeCategory === 'card'} onClick={() => setActiveCategory('card')} />
          <NavItem icon={User} label="Personal Info" categoryId="identity" isActive={activeCategory === 'identity'} onClick={() => setActiveCategory('identity')} />
          <NavItem icon={Share2} label="Shared Items" categoryId="shared" isActive={activeCategory === 'shared'} onClick={() => setActiveCategory('shared')} />
        </div>

        <div>
          <div className={cn("flex items-center", isCompact ? "justify-center mb-1" : "justify-between px-3 mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-slate-500")}>
            {!isCompact && <span>Folders</span>}
            <button onClick={() => setIsCreatingFolder(true)} className="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400" title="New Folder">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className={cn("space-y-1", isCompact ? "border-none ml-0 pl-0" : "pl-2 border-l border-transparent dark:border-slate-800 ml-3")}>
             {folders.map(folder => (
                <FolderNavItem key={folder.id} folder={folder} />
             ))}
             {isCreatingFolder && (
               <form onSubmit={handleCreateFolder} className={cn("py-1", isCompact ? "px-0" : "px-3")}>
                 <input 
                   autoFocus
                   type="text" 
                   value={newFolderName}
                   onChange={e => setNewFolderName(e.target.value)}
                   onBlur={() => setIsCreatingFolder(false)}
                   placeholder="New Folder..."
                   className="w-full bg-white dark:bg-[#1A1F26] border border-indigo-500 rounded px-2 py-1 text-sm text-gray-900 dark:text-white focus:outline-none"
                 />
               </form>
             )}
             {!isCreatingFolder && folders.length === 0 && !isCompact && (
                <div className="px-3 py-2 text-xs text-gray-400 dark:text-neutral-600">No folders yet</div>
             )}
          </div>
        </div>

        <div className="space-y-1 pt-4">
          {!isCompact && (
            <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-slate-500">
              Advanced
            </div>
          )}
          <NavItem icon={Key} label="Password Generator" categoryId="generator" isActive={activeCategory === 'generator'} onClick={() => setActiveCategory('generator' as any)} />
          <NavItem icon={Mail} label="Email Masking" subLabel="Coming Soon" isComingSoon={true} categoryId="emails" isActive={activeCategory === 'emails'} onClick={() => {}} />
          <NavItem icon={Activity} label="Password Health" subLabel="Coming Soon" isComingSoon={true} categoryId="health" isActive={activeCategory === 'health'} onClick={() => {}} />
          <NavItem icon={ShieldAlert} label="Breach Scanner" subLabel="Coming Soon" isComingSoon={true} categoryId="scanner" isActive={activeCategory === 'scanner'} onClick={() => {}} />
          <NavItem icon={Trash2} label="Trash" categoryId="trash" isActive={activeCategory === 'trash'} onClick={() => setActiveCategory('trash')} />
        </div>
      </div>

      <div className={cn("border-t border-gray-200 dark:border-slate-800 shrink-0", isCompact ? "p-2" : "p-4")}>
         <div className={cn("grid gap-2", isCompact ? "grid-cols-2" : "grid-cols-4")}>
           <button 
             title="Toggle Theme"
             onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
             className="flex items-center justify-center rounded-md p-2 text-gray-600 border border-gray-200 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/50 transition-colors"
           >
             {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
           </button>
           <button 
             title="Favorites"
             onClick={() => setActiveCategory('favorites')}
             className="flex items-center justify-center rounded-md p-2 text-gray-600 border border-gray-200 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/50 transition-colors"
           >
              <Star className="h-4 w-4" />
           </button>
           <button 
             onClick={() => setActiveCategory('dashboard')}
             title="Dashboard"
             className="flex items-center justify-center rounded-md p-2 text-gray-600 border border-gray-200 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/50 transition-colors"
           >
              <LayoutDashboard className="h-4 w-4" />
           </button>
           <button 
             title="Settings"
             onClick={() => setActiveCategory('settings')}
             className="flex items-center justify-center rounded-md p-2 text-gray-600 border border-gray-200 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/50 transition-colors"
           >
              <Settings className="h-4 w-4" />
           </button>
         </div>
      </div>

      {/* Global Hover Preview Tooltip */}
      <div 
         className={cn(
           "fixed z-[100] w-64 h-48 bg-white dark:bg-[#15191F] shadow-xl rounded-xl border border-gray-200 dark:border-slate-800 transition-all pointer-events-none overflow-hidden duration-200 delay-100",
           hoveredCategory && !isCompact ? "opacity-100 visible" : "opacity-0 invisible"
         )}
         style={{ 
            left: isCompact ? '5.5rem' : '265px',
            top: hoverY, 
            transform: hoveredCategory && !isCompact ? 'translateY(-50%) scale(1)' : 'translateY(-50%) scale(0.95)'
         }}
      >
         <div className="w-full h-full">
            <PreviewWireframe category={hoveredCategory || 'items'} isDark={theme === 'dark'} />
         </div>
      </div>
    </div>
  );
}
