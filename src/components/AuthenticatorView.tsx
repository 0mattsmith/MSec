import React, { useState, useEffect } from 'react';
import { useVault } from '../store/VaultContext';
import { Clock, Search, Copy, Eye, EyeOff } from 'lucide-react';
import { generateTOTP, getTimeUntilNextTOTP, copyToClipboardWithTimeout } from '../lib/utils';
import { cn } from '../lib/utils';

export function AuthenticatorView() {
  const { items, settings } = useVault();
  const [search, setSearch] = useState('');
  const [currentTime, setCurrentTime] = useState(Date.now());
  
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const totpItems = items.filter(i => i.totpSecret && !i.deletedAt && i.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex-1 flex flex-col bg-gray-50 dark:bg-[#0F1115] overflow-hidden">
      <div className="h-16 flex items-center justify-between px-6 bg-white dark:bg-[#1A1F26] border-b border-gray-200 dark:border-slate-800 shrink-0">
        <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center">
          <Clock className="w-6 h-6 mr-3 text-indigo-500" />
          Authenticator
        </h1>
        <div className="flex items-center space-x-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input 
              type="text"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm bg-gray-50 dark:bg-[#121418] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 w-64 transition-all"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="max-w-4xl mx-auto">
          {totpItems.length === 0 ? (
            <div className="text-center py-20 text-gray-500 dark:text-slate-500">
              <Clock className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No TOTP Codes</h2>
              <p>Add an authenticator secret to a login item to see it here.</p>
            </div>
          ) : (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
               {totpItems.map(item => (
                 <AuthenticatorCard key={item.id} item={item} timeoutSeconds={settings.clipboardClearTimeoutSeconds} />
               ))}
             </div>
          )}
        </div>
      </div>
    </div>
  );
}

const AuthenticatorCard: React.FC<{ item: any, timeoutSeconds: number }> = ({ item, timeoutSeconds }) => {
  const [totpCode, setTotpCode] = useState<string | null>(null);
  const [timer, setTimer] = useState(30);
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  
  useEffect(() => {
    if (!item.totpSecret) return;
    
    setTotpCode(generateTOTP(item.totpSecret));
    setTimer(getTimeUntilNextTOTP());

    const interval = setInterval(() => {
      setTimer(getTimeUntilNextTOTP());
      setTotpCode(generateTOTP(item.totpSecret));
    }, 1000);

    return () => clearInterval(interval);
  }, [item.totpSecret]);

  useEffect(() => {
    if (showCode) {
      const t = setTimeout(() => setShowCode(false), 2000);
      return () => clearTimeout(t);
    }
  }, [showCode]);

  return (
    <div className="bg-white dark:bg-[#1A1F26] rounded-xl border border-gray-200 dark:border-slate-800 p-5 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 transition-colors group">
      <div className="flex items-center justify-between mb-4">
        <div className="font-bold text-gray-900 dark:text-white truncate flex-1">
          {item.title}
        </div>
        <div className="relative w-6 h-6 flex-shrink-0 ml-4">
          <svg className="w-6 h-6 -rotate-90" viewBox="0 0 36 36">
             <path className="stroke-indigo-100 dark:stroke-indigo-900/50 fill-none stroke-[4]" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
             <path className="stroke-indigo-600 dark:stroke-indigo-400 fill-none stroke-[4]" strokeDasharray={`${(timer/30)*100}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-indigo-600 dark:text-indigo-400">
             {timer}
          </div>
        </div>
      </div>
      
      <div className="flex items-center justify-between">
         <div className="text-2xl font-mono tracking-widest font-bold text-gray-900 dark:text-white">
           {showCode ? (totpCode || '000000') : '••••••'}
         </div>
         <div className="flex items-center space-x-2">
            <button
               onClick={() => setShowCode(true)}
               className="p-1.5 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-md transition-colors"
               title="Reveal"
            >
               <Eye className="w-4 h-4" />
            </button>
            <button
               onClick={() => {
                 if (totpCode) {
                   copyToClipboardWithTimeout(totpCode, timeoutSeconds);
                   setCopied(true);
                   setTimeout(() => setCopied(false), 2000);
                 }
               }}
               className={cn(
                 "p-1.5 rounded-md transition-colors relative",
                 copied 
                   ? "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/10" 
                   : "text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
               )}
               title="Copy"
            >
               <Copy className="w-4 h-4" />
            </button>
         </div>
      </div>
    </div>
  );
}
