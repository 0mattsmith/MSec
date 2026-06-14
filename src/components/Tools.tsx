import React, { useState, useEffect } from 'react';
import { useVault } from '../store/VaultContext';
import { Search, ShieldAlert, CheckCircle, AlertTriangle, Shield, Mail, RefreshCw, Plus, X, Trash2 } from 'lucide-react';
import { generatePassword, checkPasswordStrength } from '../lib/utils';
import { zxcvbn } from 'zxcvbn'; // Just to make sure it's not complaining. wait, utils imports it.

export function PasswordHealthTool() {
   const { items } = useVault();
   const passwords = items.filter(i => i.type === 'login' && i.password && !i.deletedAt);
   
   const analyzed = passwords.map(item => {
      const strength = checkPasswordStrength(item.password || '');
      return { ...item, strength };
   });

   const weak = analyzed.filter(i => i.strength.score < 3);
   const reusedMap = new Map<string, typeof analyzed>();
   analyzed.forEach(item => {
      if(!item.password) return;
      const existing = reusedMap.get(item.password) || [];
      existing.push(item);
      reusedMap.set(item.password, existing);
   });
   
   const reused: typeof analyzed = [];
   reusedMap.forEach(group => {
      if (group.length > 1) {
         reused.push(...group);
      }
   });

   // Deduplicate for display
   const issuesDisplay = Array.from(new Set([...weak, ...reused]));

   return (
     <div className="mx-auto max-w-2xl w-full p-8">
       <div className="mb-8 flex items-center space-x-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400">
               <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
               <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Password Health <span className="text-sm font-medium ml-2 px-2 py-1 rounded-md bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300">Coming Soon</span></h1>
               <p className="text-sm mt-1 text-gray-500 dark:text-neutral-400">Check for weak or reused passwords across your vault. Below is a preview of how this will look.</p>
            </div>
       </div>

       <div className="grid gap-4 md:grid-cols-2 mb-8">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
             <h3 className="text-sm font-semibold text-gray-500 uppercase">Weak Passwords</h3>
             <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{weak.length}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
             <h3 className="text-sm font-semibold text-gray-500 uppercase">Reused Passwords</h3>
             <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{reusedMap.size > 0 ? Array.from(reusedMap.values()).filter(g => g.length > 1).length : 0}</p>
             <p className="text-xs text-gray-500 mt-1">groups of identical passwords</p>
          </div>
       </div>

       <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 space-y-4">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Items requiring attention ({issuesDisplay.length})</h3>
          
          {issuesDisplay.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-12 text-green-600 dark:text-green-500">
                <CheckCircle className="h-12 w-12 mb-4" />
                <p className="font-medium">All clear! No weak or reused passwords found.</p>
             </div>
          ) : (
             <div className="space-y-2">
                {issuesDisplay.map(item => {
                   const isWeak = weak.find(w => w.id === item.id);
                   const isReused = reused.find(r => r.id === item.id);
                   return (
                      <div key={item.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-neutral-800 dark:bg-neutral-800/50">
                         <div>
                            <h4 className="font-medium text-gray-900 dark:text-white">{item.title}</h4>
                            <div className="flex items-center space-x-2 mt-1">
                               {isWeak && <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-500/20 dark:text-red-400">Weak</span>}
                               {isReused && <span className="inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800 dark:bg-orange-500/20 dark:text-orange-400">Reused</span>}
                            </div>
                         </div>
                         {item.url && (
                            <a href={item.url.startsWith('http') ? item.url : `https://${item.url}`} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400">Update &rarr;</a>
                         )}
                      </div>
                   )
                })}
             </div>
          )}
       </div>
     </div>
   );
}

export function PasswordGeneratorTool() {
  const { generatorOptions, updateGeneratorOptions } = useVault();
  const [password, setPassword] = useState('');
  
  const generate = () => {
    setPassword(generatePassword(generatorOptions));
  };

  useEffect(() => {
    generate();
  }, [generatorOptions]);

  const strength = checkPasswordStrength(password);

  const Checkbox = ({ label, checked, onChange }: any) => (
    <label className="flex items-center space-x-3 cursor-pointer">
       <input 
          type="checkbox" 
          checked={checked} 
          onChange={onChange}
          className="form-checkbox h-5 w-5 text-indigo-600 rounded bg-gray-100 border-gray-300 dark:bg-neutral-800 dark:border-neutral-700" 
       />
       <span className="text-sm font-medium text-gray-700 dark:text-neutral-300">{label}</span>
    </label>
  );

  return (
    <div className="mx-auto max-w-2xl w-full p-8">
      <div className="mb-8 flex items-center space-x-3">
         <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
            <Shield className="h-6 w-6" />
         </div>
         <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Password Generator</h1>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 space-y-8">
        
        <div className="relative">
           <input 
             type="text" 
             readOnly 
             value={password}
             className="w-full rounded-xl bg-gray-50 px-6 py-4 text-center font-mono text-2xl tracking-widest text-gray-900 dark:bg-neutral-800 dark:text-white"
           />
           <button onClick={generate} className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400">
              <RefreshCw className="h-5 w-5" />
           </button>
        </div>

        <div>
           <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-neutral-300">Strength: <span className={strength.label !== 'Very Weak' ? 'text-green-500' : 'text-red-500'}>{strength.label}</span></span>
           </div>
           <div className="flex h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-neutral-800">
              <div className={`h-full transition-all duration-300 ${strength.color}`} style={{ width: `${(strength.score + 1) * 20}%` }} />
           </div>
        </div>

        <div className="space-y-6 pt-4 border-t border-gray-100 dark:border-neutral-800">
           <div>
              <div className="flex items-center justify-between mb-4">
                 <label className="text-sm font-medium text-gray-700 dark:text-neutral-300">Length: {generatorOptions.length}</label>
                 <input 
                   type="number" 
                   value={generatorOptions.length}
                   onChange={e => updateGeneratorOptions({ length: parseInt(e.target.value) || 16 })}
                   className="w-16 rounded-md border border-gray-200 px-2 py-1 text-center text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                 />
              </div>
              <input 
                type="range" 
                min="8" 
                max="100" 
                value={generatorOptions.length}
                onChange={e => updateGeneratorOptions({ length: parseInt(e.target.value) })}
                className="w-full accent-indigo-600"
              />
           </div>

           <div className="grid grid-cols-2 gap-4">
              <Checkbox label="Uppercase (A-Z)" checked={generatorOptions.uppercase} onChange={(e: any) => updateGeneratorOptions({ uppercase: e.target.checked })} />
              <Checkbox label="Lowercase (a-z)" checked={generatorOptions.lowercase} onChange={(e: any) => updateGeneratorOptions({ lowercase: e.target.checked })} />
              <Checkbox label="Numbers (0-9)" checked={generatorOptions.numbers} onChange={(e: any) => updateGeneratorOptions({ numbers: e.target.checked })} />
              <Checkbox label="Symbols (!@#)" checked={generatorOptions.symbols} onChange={(e: any) => updateGeneratorOptions({ symbols: e.target.checked })} />
           </div>
        </div>
      </div>
    </div>
  );
}

export function EmailMaskingTool() {
   const { maskedEmails, addMaskedEmail, deleteMaskedEmail } = useVault();
   const [isCreating, setIsCreating] = useState(false);
   const [newLabel, setNewLabel] = useState('');
   const [forwardTo, setForwardTo] = useState('');

   const handleCreate = () => {
      if (!forwardTo) return;
      const mask = `mask_${Math.random().toString(36).substring(2, 8)}@vaultx.email`;
      addMaskedEmail(mask, forwardTo, newLabel || 'General Use');
      setIsCreating(false);
      setNewLabel('');
      setForwardTo('');
   };

   return (
     <div className="mx-auto max-w-2xl w-full p-8">
       <div className="mb-8 flex items-center justify-between">
         <div className="flex items-center space-x-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
               <Mail className="h-6 w-6" />
            </div>
            <div>
               <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Email Masking <span className="text-sm font-medium ml-2 px-2 py-1 rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">Coming Soon</span></h1>
               <p className="text-sm mt-1 text-gray-500 dark:text-neutral-400">Protect your real identity with disposable emails. You can try simulating mask creation below.</p>
            </div>
         </div>
         <button onClick={() => setIsCreating(true)} className="flex items-center space-x-2 rounded-xl bg-indigo-600 px-4 py-2 font-medium text-white shadow-sm hover:bg-indigo-700">
            <Plus className="h-5 w-5" />
            <span>Create Mask</span>
         </button>
       </div>

       {isCreating && (
          <div className="mb-8 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-6 dark:border-indigo-500/20 dark:bg-indigo-500/5">
             <h3 className="mb-4 text-sm font-semibold text-indigo-900 dark:text-indigo-200">New Email Mask</h3>
             <div className="grid gap-4 md:grid-cols-2 mb-4">
                <div>
                   <label className="text-xs uppercase text-gray-500 dark:text-neutral-500">Label (e.g. Netflix, Shopping)</label>
                   <input type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-white" />
                </div>
                <div>
                   <label className="text-xs uppercase text-gray-500 dark:text-neutral-500">Forward To</label>
                   <input type="email" value={forwardTo} onChange={e => setForwardTo(e.target.value)} placeholder="your@email.com" className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-white" />
                </div>
             </div>
             <div className="flex justify-end space-x-3">
                <button onClick={() => setIsCreating(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 dark:text-neutral-300 dark:hover:bg-neutral-800">Cancel</button>
                <button onClick={handleCreate} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Generate Mask</button>
             </div>
          </div>
       )}

       <div className="space-y-3">
          {maskedEmails.map(mask => (
            <div key={mask.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
               <div>
                  <h4 className="font-medium text-gray-900 dark:text-white">{mask.label}</h4>
                  <p className="mt-1 font-mono text-sm tracking-tight text-indigo-600 dark:text-indigo-400">{mask.maskedAddress}</p>
                  <p className="text-xs text-gray-500 dark:text-neutral-500">Forwards to: {mask.forwardTo}</p>
               </div>
               <button onClick={() => deleteMaskedEmail(mask.id)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400">
                  <Trash2 className="h-5 w-5" />
               </button>
            </div>
          ))}
          {maskedEmails.length === 0 && !isCreating && (
             <div className="p-8 text-center text-sm text-gray-500">No email masks generated yet.</div>
          )}
       </div>
     </div>
   );
}

export function BreachScannerTool() {
   const { items } = useVault();
   const [isScanning, setIsScanning] = useState(false);
   const [scanResults, setScanResults] = useState<{ id: string, title: string, count: number }[] | null>(null);

   const handleScan = async () => {
      setIsScanning(true);
      const results: { id: string, title: string, count: number }[] = [];
      const passwords = items.filter(i => i.type === 'login' && i.password && !i.deletedAt);
      
      for (const item of passwords) {
         if (!item.password) continue;
         
         const encoder = new TextEncoder();
         const data = encoder.encode(item.password);
         const hashBuffer = await crypto.subtle.digest('SHA-1', data);
         const hashArray = Array.from(new Uint8Array(hashBuffer));
         const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
         
         const prefix = hashHex.substring(0, 5);
         const suffix = hashHex.substring(5);
         
         try {
            const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
            if (response.ok) {
               const text = await response.text();
               const lines = text.split('\n');
               for (const line of lines) {
                  const [hashSuffix, countStr] = line.split(':');
                  if (hashSuffix.trim() === suffix) {
                     results.push({ id: item.id, title: item.title, count: parseInt(countStr) });
                     break;
                  }
               }
            }
         } catch (e) {
            console.error("Failed to check password", e);
         }
      }
      
      setScanResults(results);
      setIsScanning(false);
   };

   return (
     <div className="mx-auto max-w-2xl w-full p-8">
       <div className="mb-8 flex items-center space-x-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
               <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
               <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Vault Password Breach Scanner <span className="text-sm font-medium ml-2 px-2 py-1 rounded-md bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300">Coming Soon</span></h1>
               <p className="text-sm mt-1 text-gray-500 dark:text-neutral-400">Securely checks your vault passwords against the HaveIBeenPwned database using k-Anonymity (only the first 5 characters of your password's hash are sent). Feel free to test the working preview below.</p>
            </div>
       </div>

       <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center space-x-4 mb-8">
             <button onClick={handleScan} disabled={isScanning} className="w-full flex items-center justify-center space-x-2 rounded-xl bg-gray-900 px-6 py-4 font-medium text-white shadow-sm hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 transition-all text-lg tracking-wide">
                {isScanning ? <RefreshCw className="h-6 w-6 animate-spin" /> : <Search className="h-6 w-6" />}
                <span>{isScanning ? 'Checking network databases...' : 'Scan All Vault Passwords'}</span>
             </button>
          </div>

          {scanResults && !isScanning && (
             <div className="mt-8">
                {scanResults.length === 0 ? (
                    <div className="rounded-xl border border-green-200 bg-green-50 p-6 dark:border-green-500/20 dark:bg-green-500/5">
                        <div className="flex items-center space-x-3 text-green-700 dark:text-green-400 mb-2">
                           <CheckCircle className="h-6 w-6" />
                           <h3 className="font-bold">Good News!</h3>
                        </div>
                        <p className="text-green-600 dark:text-green-500 text-sm">None of your vault passwords were found in any known data breaches.</p>
                    </div>
                ) : (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-500/20 dark:bg-red-500/5">
                        <div className="flex items-center space-x-3 text-red-700 dark:text-red-400 mb-4">
                           <AlertTriangle className="h-6 w-6" />
                           <h3 className="font-bold">Breaches Detected</h3>
                        </div>
                        <p className="text-red-600 dark:text-red-400 text-sm mb-6">The following passwords have appeared in data breaches and should be changed immediately:</p>
                        
                        <div className="space-y-3">
                           {scanResults.map(res => (
                              <div key={res.id} className="flex items-center justify-between rounded-lg bg-white p-4 shadow-sm dark:bg-neutral-900 border border-red-100 dark:border-red-900/30">
                                 <h4 className="font-semibold text-gray-900 dark:text-white">{res.title}</h4>
                                 <span className="text-sm font-medium text-red-600 dark:text-red-400">Seen {res.count.toLocaleString()} times</span>
                              </div>
                           ))}
                        </div>
                    </div>
                )}
             </div>
          )}
       </div>
     </div>
   );
}
