import React, { useState } from 'react';
import { useVault } from '../store/VaultContext';
import { Download, Upload, Trash2, ShieldCheck, Check, Cloud } from 'lucide-react';

export function SettingsView() {
  const { items, folders, updateItem, deleteItemPermanently, clearStorage, addFolder, addItem, settings, updateSettings, currentUser, signInWithGoogle, signOutUser } = useVault();
  const [importJson, setImportJson] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleImport = () => {
    try {
      const data = JSON.parse(importJson);
      if (data.folders) {
        data.folders.forEach((f: any) => addFolder(f.name));
      }
      if (data.items) {
        data.items.forEach((i: any) => addItem(i));
      }
      setSuccessMsg('Import successful!');
      setImportJson('');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (e) {
      alert('Invalid JSON format.');
    }
  };

  const handleExport = () => {
    const data = JSON.stringify({ items, folders }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'msec_export.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-[#0F1115] p-8 custom-scrollbar">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Settings</h2>
          <p className="text-gray-500 dark:text-slate-400 text-sm">Manage your vault settings, import and export your data.</p>
        </div>

        <div className="bg-white dark:bg-[#1A1F26] rounded-xl border border-gray-200 dark:border-slate-800 p-6">
          <div className="flex flex-col space-y-4">
            <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center">
              <ShieldCheck className="h-5 w-5 mr-2 text-indigo-500" /> Security
            </h3>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Configure how long passwords and TOTP codes remain in your clipboard after copying.
            </p>
            <div className="flex flex-col space-y-2 mt-2">
              <label className="text-[10px] uppercase font-bold text-gray-500 dark:text-slate-500 tracking-wider">
                Clear Clipboard After
              </label>
              <select 
                value={settings.clipboardClearTimeoutSeconds}
                onChange={(e) => updateSettings({ clipboardClearTimeoutSeconds: parseInt(e.target.value, 10) })}
                className="bg-gray-50 dark:bg-[#121418] border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm rounded-md focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5"
              >
                <option value={0}>Disabled (Never clear)</option>
                <option value={15}>15 seconds</option>
                <option value={30}>30 seconds</option>
                <option value={45}>45 seconds</option>
                <option value={60}>1 minute</option>
                <option value={120}>2 minutes</option>
                <option value={300}>5 minutes</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#1A1F26] rounded-xl border border-gray-200 dark:border-slate-800 p-6">
          <div className="flex flex-col space-y-4">
            <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center">
              <Upload className="h-5 w-5 mr-2 text-indigo-500" /> Import Data
            </h3>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Paste your exported JSON from ProtonPass, NordPass, or MSec here. This will import items and preserve your folder structure.
            </p>
            <textarea
              className="w-full h-32 bg-gray-50 dark:bg-[#121418] text-sm py-2 px-3 rounded-md border border-gray-200 dark:border-slate-700 focus:outline-none focus:border-indigo-500 dark:text-white text-gray-900 font-mono"
              placeholder='{ "folders": [...], "items": [...] }'
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
            />
            <div className="flex items-center justify-between">
              <span className="text-sm text-green-500 font-bold">{successMsg}</span>
              <button 
                onClick={handleImport}
                disabled={!importJson.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-md text-xs font-bold uppercase transition-colors"
              >
                Import Data
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#1A1F26] rounded-xl border border-gray-200 dark:border-slate-800 p-6">
          <div className="flex flex-col space-y-4">
            <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center">
              <Download className="h-5 w-5 mr-2 text-green-500" /> Export Data
            </h3>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              Download a JSON backup of your entire vault, including folders and items.
            </p>
            <div className="flex justify-start">
              <button 
                onClick={handleExport}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-md text-xs font-bold uppercase transition-colors"
              >
                Download Export
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#1A1F26] rounded-xl border border-gray-200 dark:border-slate-800 p-6">
          <div className="flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center">
                <Cloud className="h-5 w-5 mr-2 text-blue-500" /> Firebase Cloud Sync
              </h3>
              {currentUser ? (
                <span className="text-xs font-bold px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 rounded-md uppercase">Connected</span>
              ) : (
                <span className="text-xs font-bold px-2 py-1 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300 rounded-md uppercase">Not Connected</span>
              )}
            </div>
            
            <p className="text-sm text-gray-500 dark:text-slate-400">
              {currentUser ? 
                `Signed in as ${currentUser.email}. Your vault is currently syncing with Firebase.` : 
                'Sign in with Google to securely sync your vault data across your devices using Firebase Firestore.'
              }
            </p>

            <div className="flex justify-start space-x-3">
              {!currentUser ? (
                <button 
                  onClick={signInWithGoogle}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs font-bold uppercase transition-colors"
                >
                  Sign in with Google
                </button>
              ) : (
                <button 
                  onClick={signOutUser}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-900 dark:text-white rounded-md text-xs font-bold uppercase transition-colors"
                >
                  Sign Out
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-200 dark:border-red-900/30 p-6">
          <div className="flex flex-col space-y-4">
            <h3 className="font-bold text-lg text-red-600 dark:text-red-400 flex items-center">
              <Trash2 className="h-5 w-5 mr-2" /> Danger Zone
            </h3>
            <p className="text-sm text-red-500 dark:text-red-400/80">
              Permanently delete your entire vault and all its contents. This action cannot be undone.
            </p>
            <div className="flex justify-start">
              <button 
                onClick={() => {
                  if (confirm('Are you absolutely sure you want to delete your entire vault?')) {
                    clearStorage();
                  }
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-md text-xs font-bold uppercase transition-colors"
              >
                Delete Vault
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
