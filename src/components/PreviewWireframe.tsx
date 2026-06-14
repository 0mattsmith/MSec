import React from 'react';
import { Key, ShieldAlert, Activity, Mail, Clock, FileText, CreditCard, User, Share2, Trash2, LayoutGrid, Star, Fingerprint } from 'lucide-react';
import { cn } from '../lib/utils';

export function PreviewWireframe({ category, isDark }: { category: string, isDark: boolean }) {
  const bgMain = isDark ? "bg-[#0F1115]" : "bg-gray-50";
  const bgCard = isDark ? "bg-[#1A1F26]" : "bg-white";
  const borderCard = isDark ? "border-slate-800" : "border-gray-200";
  const textMuted = isDark ? "bg-slate-700" : "bg-gray-200";
  const textPrimary = isDark ? "bg-slate-500" : "bg-gray-400";
  const accent = "bg-indigo-500";

  if (category === 'generator') {
    return (
      <div className={cn("w-full h-full flex flex-col p-4", bgMain)}>
        <div className="flex items-center space-x-2 mb-4">
          <div className={cn("h-6 w-6 rounded-md flex items-center justify-center", bgCard)}>
            <Key className="h-3 w-3 text-indigo-500" />
          </div>
          <div className={cn("h-3 w-24 rounded", textPrimary)}></div>
        </div>
        <div className={cn("w-full h-12 rounded-lg mb-4 flex items-center justify-center border", bgCard, borderCard)}>
          <div className="flex space-x-1">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <div key={i} className={cn("h-4 w-3 rounded-sm", textPrimary)}></div>)}
          </div>
        </div>
        <div className={cn("flex-1 rounded-lg border p-3 flex flex-col space-y-3", bgCard, borderCard)}>
          <div className={cn("h-2 w-16 rounded", textMuted)}></div>
          <div className={cn("w-full h-1 rounded-full", textMuted)}>
             <div className={cn("h-full w-2/3 rounded-full", accent)}></div>
          </div>
          <div className="space-y-2 mt-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex justify-between items-center">
                 <div className={cn("h-2 w-20 rounded", textMuted)}></div>
                 <div className={cn("h-3 w-6 rounded-full", accent)}></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (category === 'emails') {
    return (
      <div className={cn("w-full h-full flex flex-col p-4", bgMain)}>
        <div className="flex justify-between items-center mb-4">
           <div className="flex items-center space-x-2">
             <div className={cn("h-6 w-6 rounded-md flex items-center justify-center", bgCard)}>
               <Mail className="h-3 w-3 text-indigo-500" />
             </div>
             <div className={cn("h-3 w-20 rounded", textPrimary)}></div>
           </div>
           <div className={cn("h-4 w-12 rounded bg-indigo-500")}></div>
        </div>
        <div className="space-y-2">
           {[1, 2, 3].map(i => (
             <div key={i} className={cn("w-full h-10 rounded-lg border p-2 flex justify-between items-center", bgCard, borderCard)}>
                <div className="space-y-1 block">
                   <div className={cn("h-2 w-16 rounded", textPrimary)}></div>
                   <div className={cn("h-1.5 w-24 rounded", textMuted)}></div>
                </div>
                <div className={cn("h-3 w-6 rounded-full", accent)}></div>
             </div>
           ))}
        </div>
      </div>
    );
  }

  if (category === 'health') {
    return (
      <div className={cn("w-full h-full flex flex-col p-4", bgMain)}>
        <div className="flex items-center space-x-2 mb-4">
          <div className={cn("h-6 w-6 rounded-md flex items-center justify-center", bgCard)}>
            <Activity className="h-3 w-3 text-orange-500" />
          </div>
          <div className={cn("h-3 w-24 rounded", textPrimary)}></div>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {[1, 2].map(i => (
            <div key={i} className={cn("h-16 rounded-lg border p-2 flex flex-col justify-center items-center space-y-2", bgCard, borderCard)}>
               <div className={cn("h-4 w-6 rounded", textPrimary)}></div>
               <div className={cn("h-2 w-12 rounded", textMuted)}></div>
            </div>
          ))}
        </div>
        <div className={cn("flex-1 rounded-lg border p-3", bgCard, borderCard)}>
           <div className={cn("h-2 w-16 rounded mb-2", textMuted)}></div>
           <div className="space-y-2">
              {[1, 2].map(i => (
                <div key={i} className="flex items-center space-x-2">
                   <div className={cn("h-4 w-4 rounded-full", textMuted)}></div>
                   <div className={cn("h-2 w-24 rounded", textMuted)}></div>
                </div>
              ))}
           </div>
        </div>
      </div>
    );
  }

  if (category === 'scanner') {
    return (
      <div className={cn("w-full h-full flex flex-col p-4", bgMain)}>
        <div className="flex items-center space-x-2 mb-4">
          <div className={cn("h-6 w-6 rounded-md flex items-center justify-center", bgCard)}>
            <ShieldAlert className="h-3 w-3 text-red-500" />
          </div>
          <div className={cn("h-3 w-32 rounded", textPrimary)}></div>
        </div>
        <div className={cn("w-full h-10 rounded-lg mb-4 flex items-center justify-center", "bg-gray-900 dark:bg-white")}>
           <div className={cn("h-2 w-16 rounded", "bg-white dark:bg-gray-900")}></div>
        </div>
        <div className={cn("flex-1 rounded-lg p-3 border", "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800")}>
           <div className="flex items-center space-x-2 mb-2">
              <div className="h-4 w-4 rounded-full bg-green-500"></div>
              <div className="h-3 w-20 rounded bg-green-600 dark:bg-green-400"></div>
           </div>
           <div className="h-2 w-full rounded bg-green-200 dark:bg-green-800 mb-1"></div>
           <div className="h-2 w-2/3 rounded bg-green-200 dark:bg-green-800"></div>
        </div>
      </div>
    );
  }

  // Vault Items List Wireframe
  return (
    <div className={cn("w-full h-full flex p-2", bgMain)}>
       {/* List Sidebar */}
       <div className={cn("w-1/3 h-full border-r flex flex-col space-y-2 pr-2", borderCard)}>
          <div className={cn("h-4 w-full rounded mb-2", bgCard, borderCard, "border")}></div>
          {[1,2,3,4].map(i => (
             <div key={i} className={cn("w-full h-8 rounded border flex flex-col p-1.5 space-y-1", bgCard, borderCard)}>
                <div className={cn("h-1.5 w-16 rounded", textPrimary)}></div>
                <div className={cn("h-1 w-10 rounded", textMuted)}></div>
             </div>
          ))}
       </div>
       {/* Detail Pane */}
       <div className="flex-1 pl-3 pt-2">
          <div className="flex items-center space-x-2 mb-4">
             <div className={cn("h-8 w-8 rounded-lg", bgCard, borderCard, "border")}></div>
             <div className="space-y-1.5">
                <div className={cn("h-3 w-20 rounded", textPrimary)}></div>
                <div className={cn("h-2 w-12 rounded", textMuted)}></div>
             </div>
          </div>
          <div className="space-y-3">
             {[1,2,3].map(i => (
               <div key={i} className={cn("w-full h-10 rounded-lg border p-2", bgCard, borderCard)}>
                  <div className={cn("h-1 w-10 rounded mb-1.5", textMuted)}></div>
                  <div className="flex justify-between items-center">
                     <div className={cn("h-2 w-24 rounded", textPrimary)}></div>
                     <div className={cn("h-3 w-3 rounded", textMuted)}></div>
                  </div>
               </div>
             ))}
          </div>
       </div>
    </div>
  );
}
