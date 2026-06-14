import React from 'react';
import { useVault } from '../store/VaultContext';
import { LayoutGrid, LayoutDashboard, Wrench, User, Menu } from 'lucide-react';
import { cn } from '../lib/utils';

export function BottomNavigation({ className }: { className?: string }) {
  const { activeCategory, setActiveCategory } = useVault();

  // "activeCategory" may be 'all', 'dashboard', 'settings' or a tool ('generator', etc)
  const isTools = ['generator', 'emails', 'health', 'scanner'].includes(activeCategory || '');

  return (
    <div className={cn("fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-[#1A1F26] border-t border-gray-200 dark:border-slate-800 pb-2 shadow-xl", className)}>
       <div className="flex justify-around items-center h-16 w-full max-w-md mx-auto px-2">
         <button 
           onClick={() => setActiveCategory('all')} 
           className={cn("flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors", activeCategory === 'all' ? "text-indigo-600 dark:text-indigo-400" : "text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white")}
         >
           <LayoutGrid className="h-5 w-5" />
           <span className="text-[10px] font-medium">Vault</span>
         </button>
         
         <button 
           onClick={() => setActiveCategory('dashboard')} 
           className={cn("flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors", activeCategory === 'dashboard' ? "text-indigo-600 dark:text-indigo-400" : "text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white")}
         >
           <LayoutDashboard className="h-5 w-5" />
           <span className="text-[10px] font-medium">Dashboard</span>
         </button>

         <button 
           onClick={() => setActiveCategory('tools' as any)} 
           className={cn("flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors", isTools || activeCategory === 'tools' ? "text-indigo-600 dark:text-indigo-400" : "text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white")}
         >
           <Wrench className="h-5 w-5" />
           <span className="text-[10px] font-medium">Tools</span>
         </button>
         
         <button 
           onClick={() => setActiveCategory('settings')} 
           className={cn("flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors", activeCategory === 'settings' ? "text-indigo-600 dark:text-indigo-400" : "text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white")}
         >
           <User className="h-5 w-5" />
           <span className="text-[10px] font-medium">Profile</span>
         </button>
       </div>
    </div>
  );
}
