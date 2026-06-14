import React, { createContext, useContext, useState, useEffect } from 'react';
import { cn } from '../lib/utils';
import { useVault } from '../store/VaultContext';

interface ContextMenuContextType {
  showMenu: (e: React.MouseEvent, type: 'item' | 'folder', id: string) => void;
  hideMenu: () => void;
}

const ContextMenuContext = createContext<ContextMenuContextType | null>(null);

export function useContextMenu() {
  const ctx = useContext(ContextMenuContext);
  if (!ctx) throw new Error('useContextMenu must be used within ContextMenuProvider');
  return ctx;
}

export function ContextMenuProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [menuType, setMenuType] = useState<'item' | 'folder' | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);

  const { updateItem, moveToTrash, restoreFromTrash, deleteItemPermanently, updateFolder, deleteFolder, setActiveFolderId, items, activeCategory } = useVault();

  useEffect(() => {
    const handleGlobalClick = () => hideMenu();
    if (isOpen) {
      document.addEventListener('click', handleGlobalClick);
      document.addEventListener('contextmenu', handleGlobalClick);
    }
    return () => {
      document.removeEventListener('click', handleGlobalClick);
      document.removeEventListener('contextmenu', handleGlobalClick);
    };
  }, [isOpen]);

  const showMenu = (e: React.MouseEvent, type: 'item' | 'folder', id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setPos({ x: e.clientX, y: e.clientY });
    setMenuType(type);
    setTargetId(id);
    setIsOpen(true);
  };

  const hideMenu = () => {
    setIsOpen(false);
    setTimeout(() => {
      setMenuType(null);
      setTargetId(null);
    }, 200);
  };

  const handleAction = (action: () => void) => {
    action();
    hideMenu();
  };

  return (
    <ContextMenuContext.Provider value={{ showMenu, hideMenu }}>
      <div 
        className="w-full h-full relative" 
        onContextMenu={(e) => e.preventDefault()}
      >
        {children}
        {isOpen && (
          <div 
            className="fixed z-50 min-w-[160px] bg-white dark:bg-[#1A1F26] rounded-lg shadow-xl shadow-black/20 border border-gray-200 dark:border-slate-700 py-1 overflow-hidden pointer-events-auto"
            style={{ 
              top: Math.min(pos.y, window.innerHeight - 200) + 'px', 
              left: Math.min(pos.x, window.innerWidth - 200) + 'px' 
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {menuType === 'item' && targetId && (
               <>
                 {items.find(i => i.id === targetId)?.deletedAt ? (
                    <>
                      <MenuItem onClick={() => handleAction(() => restoreFromTrash(targetId))} label="Restore" />
                      <div className="h-[1px] bg-gray-200 dark:bg-slate-700 my-1 font-bold text-gray-500 text-xs px-3"></div>
                      <MenuItem onClick={() => handleAction(() => deleteItemPermanently(targetId))} label="Delete Permanently" className="text-red-600 dark:text-red-400" />
                    </>
                 ) : (
                    <>
                      <MenuItem onClick={() => handleAction(() => {
                        window.dispatchEvent(new CustomEvent('ms-vault-edit-item', { detail: { id: targetId } }));
                      })} label="Edit Info" />
                      <MenuItem 
                        onClick={() => handleAction(() => {
                          const isFav = items.find(i => i.id === targetId)?.isFavorite;
                          updateItem(targetId, { isFavorite: !isFav });
                        })} 
                        label={items.find(i => i.id === targetId)?.isFavorite ? "Remove from Favorites" : "Add to Favorites"} 
                      />
                      <MenuItem 
                        onClick={() => handleAction(() => {
                          const isShared = items.find(i => i.id === targetId)?.isShared;
                          updateItem(targetId, { isShared: !isShared });
                        })} 
                        label={items.find(i => i.id === targetId)?.isShared ? "Remove from Shared" : "Mark as Shared"} 
                      />
                      <div className="h-[1px] bg-gray-200 dark:bg-slate-700 my-1"></div>
                      <MenuItem onClick={() => handleAction(() => moveToTrash(targetId))} label="Move to Trash" className="text-red-600 dark:text-red-400" />
                    </>
                 )}
               </>
            )}
            {menuType === 'folder' && targetId && (
               <>
                 <MenuItem onClick={() => handleAction(() => {
                   const f = prompt('New name:'); 
                   if (f) updateFolder(targetId, f);
                 })} label="Rename Folder" />
                 <div className="h-[1px] bg-gray-200 dark:bg-slate-700 my-1"></div>
                 <MenuItem onClick={() => handleAction(() => {
                   deleteFolder(targetId);
                   setActiveFolderId(null);
                 })} label="Delete Folder" className="text-red-600 dark:text-red-400" />
               </>
            )}
            {!menuType && <MenuItem onClick={() => hideMenu()} label="Cancel" />}
          </div>
        )}
      </div>
    </ContextMenuContext.Provider>
  );
}

function MenuItem({ onClick, label, className }: { onClick: () => void, label: string, className?: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-2 text-sm text-gray-800 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors",
        className
      )}
    >
      {label}
    </button>
  );
}
