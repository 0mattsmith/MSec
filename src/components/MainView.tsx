import React, { useState, useEffect } from 'react';
import { useVault } from '../store/VaultContext';
import { 
  Plus, Search, Key, FileText, CreditCard, User, 
  Trash2, Globe, Clock, Copy, Edit2, ShieldAlert, Check, ShieldCheck, Star, Eye, EyeOff, Fingerprint
} from 'lucide-react';
import { cn, generateTOTP, getTimeUntilNextTOTP, generatePassword, copyToClipboardWithTimeout } from '../lib/utils';
import type { VaultItem, ItemCategory } from '../types';
import { PasswordGeneratorTool, EmailMaskingTool, BreachScannerTool, PasswordHealthTool } from './Tools';
import { SettingsView } from './SettingsView';
import { AuthenticatorView } from './AuthenticatorView';
import { DashboardView } from './DashboardView';
import { useContextMenu } from './ContextMenu';

function ItemIcon({ type }: { type: ItemCategory }) {
  switch (type) {
    case 'login': return <Key className="h-5 w-5" />;
    case 'passkey': return <Key className="h-5 w-5" />;
    case 'note': return <FileText className="h-5 w-5" />;
    case 'card': return <CreditCard className="h-5 w-5" />;
    case 'identity': return <User className="h-5 w-5" />;
    default: return <Globe className="h-5 w-5" />;
  }
}

export function MainView() {
  const { 
    items, 
    activeCategory, 
    activeFolderId, 
    selectedItemId, 
    setSelectedItemId,
    addItem,
    updateItem,
    moveToTrash,
    restoreFromTrash,
    deleteItemPermanently,
    settings,
    folders,
    setActiveCategory
  } = useVault();

  useEffect(() => {
     const handleMoveItem = (e: any) => {
        const { itemId, folderId } = e.detail;
        updateItem(itemId, { folderId });
     };
     const handleEditItem = (e: any) => {
        const { id } = e.detail;
        setSelectedItemId(id);
        setIsEditing(true);
     };
     window.addEventListener('ms-vault-move-item', handleMoveItem);
     window.addEventListener('ms-vault-edit-item', handleEditItem);
     return () => {
       window.removeEventListener('ms-vault-move-item', handleMoveItem);
       window.removeEventListener('ms-vault-edit-item', handleEditItem);
     };
  }, [updateItem, setSelectedItemId]);

  const [search, setSearch] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isTypePickerOpen, setIsTypePickerOpen] = useState(false);

  const { showMenu } = useContextMenu();

  if (activeCategory === 'generator') return <div className="flex-1 overflow-y-auto custom-scrollbar w-full bg-white dark:bg-[#0F1115] pb-24 md:pb-0"><PasswordGeneratorTool /></div>;
  if (activeCategory === 'emails') return <div className="flex-1 overflow-y-auto custom-scrollbar w-full bg-white dark:bg-[#0F1115] pb-24 md:pb-0"><EmailMaskingTool /></div>;
  if (activeCategory === 'scanner') return <div className="flex-1 overflow-y-auto custom-scrollbar w-full bg-white dark:bg-[#0F1115] pb-24 md:pb-0"><BreachScannerTool /></div>;
  if (activeCategory === 'dashboard') return <div className="flex-1 overflow-y-auto custom-scrollbar w-full pb-24 md:pb-0"><DashboardView /></div>;
  if (activeCategory === 'settings') return <div className="flex-1 overflow-y-auto custom-scrollbar w-full bg-white dark:bg-[#0F1115] pb-24 md:pb-0"><SettingsView /></div>;
  if (activeCategory === 'authenticator') return <div className="flex-1 overflow-y-auto custom-scrollbar w-full bg-white dark:bg-[#0F1115] pb-24 md:pb-0"><AuthenticatorView /></div>;
  if (activeCategory === 'health') return <div className="flex-1 overflow-y-auto custom-scrollbar w-full bg-white dark:bg-[#0F1115] pb-24 md:pb-0"><PasswordHealthTool /></div>;

  if (activeCategory === 'tools') {
    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar w-full bg-gray-50 dark:bg-[#0F1115] p-6 pb-32">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Security Tools</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           {/* Generator */}
           <button onClick={() => { setActiveCategory('generator' as any); }} className="bg-white dark:bg-[#1A1F26] p-6 rounded-xl border border-gray-200 dark:border-slate-800 flex items-center shadow-sm hover:shadow-md transition-shadow text-left">
             <div className="w-12 h-12 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center mr-4">
               <Key className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
             </div>
             <div><h3 className="font-bold text-gray-900 dark:text-white">Password Generator</h3><p className="text-sm text-gray-500">Create strong, secure passwords</p></div>
           </button>
           {/* Emails */}
           <button onClick={() => { setActiveCategory('emails' as any); }} className="bg-white dark:bg-[#1A1F26] p-6 rounded-xl border border-gray-200 dark:border-slate-800 flex items-center shadow-sm hover:shadow-md transition-shadow text-left">
             <div className="w-12 h-12 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center mr-4">
               <Globe className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
             </div>
             <div><h3 className="font-bold text-gray-900 dark:text-white">Email Masking</h3><p className="text-sm text-gray-500">Hide your real email address</p></div>
           </button>
           {/* Scanner */}
           <button onClick={() => { setActiveCategory('scanner' as any); }} className="bg-white dark:bg-[#1A1F26] p-6 rounded-xl border border-gray-200 dark:border-slate-800 flex items-center shadow-sm hover:shadow-md transition-shadow text-left">
             <div className="w-12 h-12 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center mr-4">
               <ShieldAlert className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
             </div>
             <div><h3 className="font-bold text-gray-900 dark:text-white">Breach Scanner</h3><p className="text-sm text-gray-500">Check if your data was compromised</p></div>
           </button>
           {/* Health */}
           <button onClick={() => { setActiveCategory('health' as any); }} className="bg-white dark:bg-[#1A1F26] p-6 rounded-xl border border-gray-200 dark:border-slate-800 flex items-center shadow-sm hover:shadow-md transition-shadow text-left">
             <div className="w-12 h-12 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center mr-4">
               <ShieldCheck className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
             </div>
             <div><h3 className="font-bold text-gray-900 dark:text-white">Password Health</h3><p className="text-sm text-gray-500">Analyze your vault security</p></div>
           </button>
        </div>
      </div>
    );
  }

  // Filter logic
  const filteredItems = items.filter(item => {
    if (search && !item.title.toLowerCase().includes(search.toLowerCase())) return false;
    
    if (activeCategory === 'trash') {
      return item.deletedAt != null;
    }
    
    if (item.deletedAt != null) return false;

    if (activeCategory === 'favorites') {
      return item.isFavorite;
    }

    if (activeCategory === 'shared') {
      return !!item.isShared;
    }

    if (activeFolderId) {
      return item.folderId === activeFolderId;
    }

    if (activeCategory !== 'all' && activeCategory !== 'shared' && activeCategory !== 'emails') {
      return item.type === activeCategory;
    }

    return true;
  }).sort((a, b) => {
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;
    return a.title.localeCompare(b.title);
  });

  const selectedItem = items.find(i => i.id === selectedItemId);

  const handleCreateNew = (forceType?: ItemCategory) => {
    // Map activeCategory to ItemCategory
    if (forceType) {
       addItem({
         type: forceType,
         title: 'New ' + forceType.charAt(0).toUpperCase() + forceType.slice(1),
         isFavorite: false,
         folderId: activeFolderId
       });
       setIsEditing(true);
       setIsTypePickerOpen(false);
       return;
    }

    if (['login', 'passkey', 'note', 'card', 'identity'].includes(activeCategory as string) && !activeFolderId) {
      const type = activeCategory as ItemCategory;
      addItem({
        type: type,
        title: 'New ' + type.charAt(0).toUpperCase() + type.slice(1),
        isFavorite: false,
        folderId: null
      });
      setIsEditing(true);
    } else {
      setIsTypePickerOpen(true);
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden bg-white dark:bg-[#0F1115]">
      
      {/* List Pane */}
      <div className={cn("flex w-full md:w-80 flex-col border-r border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-transparent pb-20 md:pb-0", selectedItemId || isTypePickerOpen ? "hidden md:flex" : "flex")}>
        <div className="p-4 flex items-center space-x-4 border-b border-gray-200 dark:border-slate-800">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 dark:text-slate-500">
              <Search className="h-4 w-4" />
            </span>
            <input
              type="text"
              placeholder="Search your vault..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-[#1A1F26] dark:text-slate-200 text-gray-900"
            />
          </div>
          {activeCategory !== 'trash' && (
            <button 
              onClick={() => handleCreateNew()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-md transition-colors"
            >
              <Plus className="h-5 w-5" />
            </button>
          )}
        </div>

        {activeCategory === 'favorites' && (
          <div className="px-4 py-2 border-b border-gray-200 dark:border-slate-800 bg-gray-100/50 dark:bg-slate-800/20 text-xs font-semibold text-gray-500 dark:text-slate-400 flex items-center justify-between">
            <span>Grouped by Type</span>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
          {activeCategory === 'favorites' ? (
            ['login', 'passkey', 'note', 'card', 'identity'].map(cat => {
               const catItems = filteredItems.filter(item => item.type === cat);
               if (catItems.length === 0) return null;
               return (
                 <div key={cat} className="mb-4">
                   <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-slate-500 px-2 mb-2">
                     {cat === 'login' ? 'Passwords' : cat === 'identity' ? 'Personal Info' : cat}
                   </div>
                   <div className="space-y-1">
                     {catItems.map(item => (
                       <button
                         key={item.id}
                         draggable={true}
                         onDragStart={(e) => { e.dataTransfer.setData('text/plain', item.id); }}
                         onClick={() => { setSelectedItemId(item.id); setIsEditing(false); }}
                         onContextMenu={(e) => showMenu(e, 'item', item.id)}
                         className={cn(
                           "flex w-full items-center space-x-3 rounded-lg p-3 text-left transition-colors border",
                           selectedItemId === item.id
                             ? "bg-indigo-50 border-indigo-200 dark:bg-[#1A1F26] dark:border-indigo-500/30 dark:ring-1 dark:ring-indigo-500/10"
                             : "border-transparent hover:bg-gray-100 dark:hover:bg-[#1A1F26]"
                         )}
                       >
                         <div className={cn(
                           "flex h-10 w-10 shrink-0 items-center justify-center rounded-md font-bold text-lg",
                            selectedItemId === item.id 
                            ? "bg-white text-indigo-600 border border-indigo-100 shadow-sm"
                            : "bg-[#1A1F26] text-white"
                         )}>
                           {item.title.charAt(0).toUpperCase()}
                         </div>
                         <div className="flex-1 min-w-0">
                           <div className="flex items-center">
                              <span className={cn("text-sm font-semibold truncate", selectedItemId === item.id ? "text-indigo-900 dark:text-white" : "text-gray-900 dark:text-slate-200")}>{item.title}</span>
                              {item.isFavorite && <Star className="ml-1.5 h-3 w-3 text-yellow-500 fill-yellow-500" />}
                              {item.totpSecret && <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] bg-indigo-900 text-indigo-200 uppercase font-bold tracking-tight">TOTP</span>}
                           </div>
                           <div className="text-xs text-gray-500 dark:text-slate-500 truncate italic">
                             {item.username || item.email || item.type}
                           </div>
                         </div>
                       </button>
                     ))}
                   </div>
                 </div>
               )
            })
          ) : (
            filteredItems.map(item => (
              <button
                key={item.id}
                draggable={true}
                onDragStart={(e) => {
                   e.dataTransfer.setData('text/plain', item.id);
                }}
                onClick={() => { setSelectedItemId(item.id); setIsEditing(false); }}
                onContextMenu={(e) => showMenu(e, 'item', item.id)}
                className={cn(
                  "flex w-full items-center space-x-3 rounded-lg p-3 text-left transition-colors border",
                  selectedItemId === item.id
                    ? "bg-indigo-50 border-indigo-200 dark:bg-[#1A1F26] dark:border-indigo-500/30 dark:ring-1 dark:ring-indigo-500/10"
                    : "border-transparent hover:bg-gray-100 dark:hover:bg-[#1A1F26]"
                )}
              >
                <div className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-md font-bold text-lg",
                   selectedItemId === item.id 
                   ? "bg-white text-indigo-600 border border-indigo-100 shadow-sm"
                   : "bg-[#1A1F26] text-white"
                )}>
                  {item.title.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center">
                     <span className={cn("text-sm font-semibold truncate", selectedItemId === item.id ? "text-indigo-900 dark:text-white" : "text-gray-900 dark:text-slate-200")}>{item.title}</span>
                     {item.isFavorite && <Star className="ml-1.5 h-3 w-3 text-yellow-500 fill-yellow-500" />}
                     {item.totpSecret && <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] bg-indigo-900 text-indigo-200 uppercase font-bold tracking-tight">TOTP</span>}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-slate-500 truncate italic">
                    {item.username || item.email || item.type}
                  </div>
                </div>
              </button>
            ))
          )}
          {filteredItems.length === 0 && (
            <div className="p-8 text-center text-sm text-gray-500 dark:text-neutral-500">
              No items found.
            </div>
          )}
        </div>
      </div>

      {/* Detail Pane */}
      <div className={cn("flex-1 overflow-y-auto bg-white dark:bg-[#121418] custom-scrollbar", selectedItemId || isTypePickerOpen ? "flex flex-col" : "hidden md:flex flex-col")}>
        {isTypePickerOpen ? (
           <div className="flex h-full flex-col items-center justify-center text-gray-900 dark:text-white pb-20">
              <h2 className="text-2xl font-bold mb-8">What do you want to create?</h2>
              <div className="grid grid-cols-2 gap-4 max-w-lg w-full px-8">
                 <button onClick={() => handleCreateNew('login')} className="flex flex-col items-center justify-center bg-gray-50 dark:bg-[#1A1F26] border border-gray-200 dark:border-slate-800 p-6 rounded-xl hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition-all">
                    <Key className="w-8 h-8 text-indigo-500 mb-3" />
                    <span className="font-semibold text-sm">Login</span>
                 </button>
                 <button onClick={() => handleCreateNew('passkey')} className="flex flex-col items-center justify-center bg-gray-50 dark:bg-[#1A1F26] border border-gray-200 dark:border-slate-800 p-6 rounded-xl hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition-all">
                    <Fingerprint className="w-8 h-8 text-purple-500 mb-3" />
                    <span className="font-semibold text-sm">Passkey</span>
                 </button>
                 <button onClick={() => handleCreateNew('note')} className="flex flex-col items-center justify-center bg-gray-50 dark:bg-[#1A1F26] border border-gray-200 dark:border-slate-800 p-6 rounded-xl hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition-all">
                    <FileText className="w-8 h-8 text-blue-500 mb-3" />
                    <span className="font-semibold text-sm">Secure Note</span>
                 </button>
                 <button onClick={() => handleCreateNew('card')} className="flex flex-col items-center justify-center bg-gray-50 dark:bg-[#1A1F26] border border-gray-200 dark:border-slate-800 p-6 rounded-xl hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition-all">
                    <CreditCard className="w-8 h-8 text-emerald-500 mb-3" />
                    <span className="font-semibold text-sm">Credit Card</span>
                 </button>
                 <button onClick={() => handleCreateNew('identity')} className="flex flex-col items-center justify-center bg-gray-50 dark:bg-[#1A1F26] border border-gray-200 dark:border-slate-800 p-6 rounded-xl hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 transition-all col-span-2">
                    <User className="w-8 h-8 text-orange-500 mb-3" />
                    <span className="font-semibold text-sm">Identity</span>
                 </button>
              </div>
              <button onClick={() => setIsTypePickerOpen(false)} className="mt-8 text-gray-500 hover:text-gray-900 dark:hover:text-white px-4 py-2 font-semibold">Cancel</button>
           </div>
        ) : selectedItem ? (
           <ItemDetail 
             item={selectedItem} 
             isEditing={isEditing} 
             setIsEditing={setIsEditing} 
             updateItem={updateItem}
             folders={folders}
             moveToTrash={moveToTrash}
             restoreFromTrash={restoreFromTrash}
             deletePermanently={deleteItemPermanently}
             settings={settings}
           />
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-gray-400 dark:text-slate-600">
             <ShieldCheck className="h-16 w-16 mb-4 opacity-20" />
             <p>Select an item to view details</p>
          </div>
        )}
      </div>

    </div>
  );
}

const CopyButton = ({ value, settings }: { value?: string, settings?: any }) => {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button 
      onClick={() => { 
        copyToClipboardWithTimeout(value, settings?.clipboardClearTimeoutSeconds || 60); 
        setCopied(true); 
        setTimeout(() => setCopied(false), 2000); 
      }}
      className="text-indigo-600 dark:text-indigo-400 text-xs font-semibold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
};

// Sub-component for Details to keep it organized
function ItemDetail({ item, isEditing, setIsEditing, updateItem, moveToTrash, restoreFromTrash, deletePermanently, folders, settings }: any) {
  const { setSelectedItemId } = useVault();
  const [localItem, setLocalItem] = useState(item);
  const [totpCode, setTotpCode] = useState<string | null>(null);
  const [timer, setTimer] = useState(30);
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    setLocalItem(item);
  }, [item]);

  useEffect(() => {
    if (showCode) {
      const t = setTimeout(() => setShowCode(false), 2000);
      return () => clearTimeout(t);
    }
  }, [showCode]);

  useEffect(() => {
    if (item.totpSecret) {
      const updateTOTP = () => {
         setTotpCode(generateTOTP(item.totpSecret));
         setTimer(getTimeUntilNextTOTP());
      };
      updateTOTP();
      const interval = setInterval(updateTOTP, 1000);
      return () => clearInterval(interval);
    }
  }, [item.totpSecret]);

  const handleSave = () => {
    updateItem(item.id, localItem);
    setIsEditing(false);
  };

  const renderReadOnlyField = (label: string, value: any, type: string = "text", hideCopy: boolean = false) => {
    if (!value && !isEditing) return null;
    return (
      <div className="mb-6 group">
        <label className="text-[10px] uppercase font-bold text-gray-500 dark:text-slate-500 tracking-wider mb-2 block">{label}</label>
        <div className="flex items-center justify-between">
           {type === 'password' ? (
             <span className="text-sm font-mono dark:text-white text-gray-900 tracking-widest">{value ? '•'.repeat(String(value).length) : ''}</span>
           ) : (
             <span className="text-sm dark:text-white text-gray-900">{value}</span>
           )}
           {!hideCopy && <CopyButton value={value} settings={settings} />}
        </div>
        <div className="h-[1px] bg-gray-200 dark:bg-slate-800 mt-2"></div>
      </div>
    );
  };

  const renderEditField = (label: string, field: string, type: string = "text") => {
     return (
       <div className="mb-6">
        <label className="text-[10px] uppercase font-bold text-gray-500 dark:text-slate-500 tracking-wider mb-2 block">{label}</label>
        <div className="flex items-center space-x-2">
           {type === 'textarea' ? (
             <textarea
               value={localItem[field] || ''} 
               onChange={(e) => setLocalItem({...localItem, [field]: e.target.value})}
               className="w-full bg-[#1A1F26] text-sm py-2 px-3 rounded-md border border-slate-700 focus:outline-none focus:border-indigo-500 dark:text-white text-gray-900 min-h-[100px]" 
               placeholder={`Enter ${label.toLowerCase()}`}
             />
           ) : (
             <input 
               type={type} 
               value={localItem[field] || ''} 
               onChange={(e) => setLocalItem({...localItem, [field]: e.target.value})}
               className="w-full bg-[#1A1F26] text-sm py-2 px-3 rounded-md border border-slate-700 focus:outline-none focus:border-indigo-500 dark:text-white text-gray-900" 
               placeholder={`Enter ${label.toLowerCase()}`}
             />
           )}
           {field === 'password' && (
             <button
               onClick={() => {
                 const newPass = generatePassword({ length: 16, uppercase: true, lowercase: true, numbers: true, symbols: true });
                 setLocalItem({...localItem, password: newPass});
               }}
               className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs font-bold uppercase transition-colors whitespace-nowrap"
             >
               Generate
             </button>
           )}
        </div>
      </div>
     )
  };

  const handleAddCustomField = () => {
     const newField = { id: Date.now().toString(), label: 'New Field', value: '', isHidden: false };
     setLocalItem({...localItem, customFields: [...(localItem.customFields || []), newField]});
  };

  const updateCustomField = (id: string, updates: any) => {
     const newFields = (localItem.customFields || []).map((f: any) => f.id === id ? { ...f, ...updates } : f);
     setLocalItem({...localItem, customFields: newFields});
  };

  const removeCustomField = (id: string) => {
     const newFields = (localItem.customFields || []).filter((f: any) => f.id !== id);
     setLocalItem({...localItem, customFields: newFields});
  };

  return (
    <div className="p-8 pb-32 md:pb-8 max-w-2xl mx-auto flex flex-col h-full w-full">
      <div className="flex-1">
        <div className="mb-4 md:hidden">
          <button onClick={() => { setIsEditing(false); setSelectedItemId(null); }} className="flex items-center text-sm font-bold text-gray-500 hover:text-indigo-600">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
            Back
          </button>
        </div>
        <div className="mb-8 flex items-start justify-between">
          <div className="w-16 h-16 rounded-xl bg-white border border-gray-100 flex items-center justify-center shadow-xl dark:bg-white p-3 overflow-hidden">
             {item.url ? (
               <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(item.url)}&sz=128`} alt={item.title} className="w-full h-full object-contain" onError={(e: any) => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }} />
             ) : null}
             <div className="w-full h-full bg-slate-800 rounded-md flex items-center justify-center text-white font-bold text-2xl" style={{ display: item.url ? 'none' : 'flex' }}>
                {item.title.charAt(0).toUpperCase()}
             </div>
          </div>
          
          <div className="flex space-x-2">
            {item.deletedAt ? (
              <>
                <button onClick={() => restoreFromTrash(item.id)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-md text-gray-500 dark:text-slate-400">Restore</button>
                <button onClick={() => deletePermanently(item.id)} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md text-red-500">Delete Forever</button>
              </>
            ) : isEditing ? (
              null
            ) : (
              <>
                <button 
                  onClick={() => updateItem(item.id, { isFavorite: !item.isFavorite })} 
                  className={cn("p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-md transition-colors", item.isFavorite ? "text-yellow-500" : "text-gray-500 dark:text-slate-400")}
                >
                  <Star className={cn("h-5 w-5", item.isFavorite ? "fill-yellow-500" : "")} />
                </button>
                <button onClick={() => setIsEditing(true)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-md text-gray-500 dark:text-slate-400"><Edit2 className="h-5 w-5" /></button>
                <button onClick={() => moveToTrash(item.id)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-md text-gray-500 dark:text-slate-400"><Trash2 className="h-5 w-5" /></button>
              </>
            )}
          </div>
        </div>

        <div className="mb-8">
           {isEditing ? (
              <div className="space-y-4">
                <input 
                   value={localItem.title} 
                   onChange={e => setLocalItem({...localItem, title: e.target.value})}
                   className="bg-transparent text-2xl font-bold text-gray-900 outline-none dark:text-white w-full border-b border-indigo-500 pb-1"
                />
                <div className="w-64">
                   <select 
                      value={localItem.folderId || ''} 
                      onChange={e => setLocalItem({...localItem, folderId: e.target.value || null})}
                      className="bg-gray-100 dark:bg-slate-800 text-sm py-2 px-3 rounded-md border border-gray-200 dark:border-slate-700 outline-none focus:border-indigo-500 dark:text-white text-gray-900 w-full"
                   >
                      <option value="">No Folder</option>
                      {/* Note: In a real app we'd get folders from context, but we use window.vaultFolders hack or pass it down */}
                      {folders.map((f: any) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                   </select>
                </div>
              </div>
            ) : (
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{item.title}</h2>
            )}
        </div>

        <div className="space-y-2">
               {isEditing ? (
             <>
               {localItem.type === 'card' ? (
                 <>
                   {renderEditField("Cardholder Name", "cardholderName")}
                   {renderEditField("Card Number", "cardNumber")}
                   <div className="flex space-x-4">
                     <div className="flex-1">{renderEditField("Expiry Date (MM/YY)", "cardExpiry")}</div>
                     <div className="flex-1">{renderEditField("Start Date (MM/YY)", "cardStartDate")}</div>
                   </div>
                   <div className="flex space-x-4">
                     <div className="flex-1">{renderEditField("CVV", "cardCvv", "password")}</div>
                     <div className="flex-1">{renderEditField("PIN", "cardPin", "password")}</div>
                   </div>
                   <div className="flex space-x-4">
                     <div className="flex-1">
                       <div className="mb-6">
                         <label className="text-[10px] uppercase font-bold text-gray-500 dark:text-slate-500 tracking-wider mb-2 block">Card Network</label>
                         <select 
                           value={localItem.cardIssuer || ''}
                           onChange={(e) => setLocalItem({...localItem, cardIssuer: e.target.value})}
                           className="w-full bg-[#1A1F26] text-sm py-2 px-3 rounded-md border border-slate-700 focus:outline-none focus:border-indigo-500 dark:text-white text-gray-900"
                         >
                           <option value="">Select Network...</option>
                           <option value="Visa">Visa</option>
                           <option value="Mastercard">Mastercard</option>
                           <option value="Amex">American Express</option>
                           <option value="Maestro">Maestro</option>
                           <option value="Discover">Discover</option>
                           <option value="Other">Other</option>
                         </select>
                       </div>
                     </div>
                     <div className="flex-1">{renderEditField("Bank Name", "bankName")}</div>
                   </div>
                   <div className="flex space-x-4">
                     <div className="flex-1">{renderEditField("Account Number", "cardAccount")}</div>
                     <div className="flex-1">{renderEditField("Sort Code", "cardSortCode")}</div>
                   </div>
                 </>
               ) : (
                 <>
                   <div className="mb-6 flex space-x-4">
                     <div className="flex-1">
                       {renderEditField("Username", "username")}
                     </div>
                     <div className="flex-1">
                       {renderEditField("Email", "email", "email")}
                     </div>
                   </div>
                   {renderEditField("Password", "password", "password")}
                   {renderEditField("Website URL", "url")}
                   {renderEditField("App", "app")}
                   {renderEditField("Authenticator (TOTP Secret)", "totpSecret")}
                 </>
               )}
               {renderEditField("Notes", "notes", "textarea")}
               
               <div className="mb-6">
                 <div className="flex justify-between items-center mb-2">
                   <label className="text-[10px] uppercase font-bold text-gray-500 dark:text-slate-500 tracking-wider block">Custom Fields</label>
                   <button onClick={handleAddCustomField} className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 transition-colors uppercase flex items-center"><Plus className="w-3 h-3 mr-1" /> Add</button>
                 </div>
                 {localItem.customFields?.map((field: any) => (
                    <div key={field.id} className="flex items-center space-x-2 mb-2 bg-[#1A1F26] p-2 rounded-md border border-slate-700">
                       <input 
                         value={field.label} 
                         onChange={e => updateCustomField(field.id, { label: e.target.value })} 
                         className="w-1/3 bg-transparent text-xs outline-none text-gray-400 dark:text-slate-400 font-bold uppercase tracking-wider" 
                         placeholder="Label" 
                       />
                       <input 
                         type={field.isHidden ? 'password' : 'text'}
                         value={field.value} 
                         onChange={e => updateCustomField(field.id, { value: e.target.value })} 
                         className="flex-1 bg-transparent text-sm outline-none text-gray-900 dark:text-white border-l border-slate-700 pl-2" 
                         placeholder="Value" 
                       />
                       <button onClick={() => updateCustomField(field.id, { isHidden: !field.isHidden })} className="p-1 text-gray-500 hover:text-gray-300">
                          {field.isHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                       </button>
                       <button onClick={() => removeCustomField(field.id)} className="p-1 text-red-500 hover:text-red-400">
                          <Trash2 className="w-4 h-4" />
                       </button>
                    </div>
                 ))}
               </div>
             </>
           ) : (
             <>
               {item.type === 'card' ? (
                 <>
                   {renderReadOnlyField("Cardholder Name", item.cardholderName)}
                   {renderReadOnlyField("Card Number", item.cardNumber)}
                   <div className="flex space-x-4">
                     <div className="flex-1">{renderReadOnlyField("Expiry Date (MM/YY)", item.cardExpiry)}</div>
                     <div className="flex-1">{renderReadOnlyField("Start Date (MM/YY)", item.cardStartDate)}</div>
                   </div>
                   <div className="flex space-x-4">
                     <div className="flex-1">{renderReadOnlyField("CVV", item.cardCvv, "password")}</div>
                     <div className="flex-1">{renderReadOnlyField("PIN", item.cardPin, "password")}</div>
                   </div>
                   <div className="flex space-x-4">
                     <div className="flex-1">{renderReadOnlyField("Card Network", item.cardIssuer)}</div>
                     <div className="flex-1">{renderReadOnlyField("Bank Name", item.bankName)}</div>
                   </div>
                   <div className="flex space-x-4">
                     <div className="flex-1">{renderReadOnlyField("Account Number", item.cardAccount)}</div>
                     <div className="flex-1">{renderReadOnlyField("Sort Code", item.cardSortCode)}</div>
                   </div>
                 </>
               ) : (
                 <>
                   {renderReadOnlyField("Username", item.username)}
                   {renderReadOnlyField("Email", item.email)}
                   {renderReadOnlyField("Password", item.password, "password")}
                   {renderReadOnlyField("Website URL", item.url)}
                   {item.app && renderReadOnlyField("App", item.app)}
                   
                   {item.totpSecret && (
                     <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 mb-6 group">
                       <div className="flex justify-between items-center mb-2">
                         <label className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400 tracking-wider block">Authenticator (TOTP)</label>
                         <CopyButton value={totpCode || ''} settings={settings} />
                       </div>
                       <div className="flex items-center justify-between">
                         <span className="text-3xl font-mono tracking-[0.2em] font-bold text-gray-900 dark:text-white flex items-center space-x-3">
                            <span>{showCode ? (totpCode || '000000') : '••••••'}</span>
                            <button onClick={() => setShowCode(true)} className="p-1.5 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-md transition-colors" title="Reveal">
                               <Eye className="w-5 h-5" />
                            </button>
                         </span>
                         <div className="relative w-8 h-8">
                            <svg className="w-8 h-8 -rotate-90" viewBox="0 0 36 36">
                              <path className="stroke-indigo-100 dark:stroke-indigo-900 fill-none stroke-[3]" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                              <path className="stroke-indigo-600 dark:stroke-indigo-400 fill-none stroke-[3]" strokeDasharray={`${(timer/30)*100}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-gray-900 dark:text-white">{timer}s</span>
                         </div>
                       </div>
                     </div>
                   )}
                 </>
               )}

               <div className="mb-6">
                 <label className="text-[10px] uppercase font-bold text-gray-500 dark:text-slate-500 tracking-wider mb-2 block">Secure Notes</label>
                 <div className="text-sm dark:text-slate-300 text-gray-900 whitespace-pre-wrap">{item.notes || <span className="text-gray-400 italic">No notes added.</span>}</div>
                 <div className="h-[1px] bg-gray-200 dark:bg-slate-800 mt-4"></div>
               </div>
               
               {item.customFields && item.customFields.length > 0 && (
                 <div className="mb-6">
                   <label className="text-[10px] uppercase font-bold text-gray-500 dark:text-slate-500 tracking-wider mb-4 block">Custom Fields</label>
                   <div className="space-y-4">
                     {item.customFields.map((field: any) => (
                       <div key={field.id}>{renderReadOnlyField(field.label, field.value, field.isHidden ? 'password' : 'text')}</div>
                     ))}
                   </div>
                 </div>
               )}
             </>
           )}
        </div>
      </div>
      
      {isEditing && (
        <div className="pt-8 pb-4 border-t border-transparent dark:border-slate-800 flex justify-end space-x-3 mt-auto">
          <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-xs font-bold text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white uppercase transition-colors">Cancel</button>
          <button onClick={handleSave} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg uppercase tracking-wider transition-colors">Save Changes</button>
        </div>
      )}
    </div>
  );
}

