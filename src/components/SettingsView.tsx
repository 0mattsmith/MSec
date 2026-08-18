import React, { useEffect, useState } from 'react';
import { useVault } from '../store/VaultContext';
import { Download, Upload, Trash2, ShieldCheck, Check, Cloud, Fingerprint, ArrowUpCircle, RefreshCw } from 'lucide-react';
import {
  APP_VERSION, checkForUpdate, applyUpdate, detectPlatform,
  updateActionLabel, type UpdateInfo,
} from '../lib/updater';

export function SettingsView() {
  const { items, folders, updateItem, deleteItemPermanently, clearStorage, addFolder, addItem, settings, updateSettings, currentUser, signInWithGoogle, signOutUser,
    biometricReady, biometricSupported, enableBiometric, turnOffBiometric } = useVault();
  const [importJson, setImportJson] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // --- Biometric enrolment ---
  const [bioPassword, setBioPassword] = useState('');
  const [bioPrompt, setBioPrompt] = useState(false);
  const [bioError, setBioError] = useState('');
  const [bioBusy, setBioBusy] = useState(false);

  const handleEnableBiometric = async () => {
    setBioError('');
    setBioBusy(true);
    const res = await enableBiometric(bioPassword);
    setBioBusy(false);
    setBioPassword('');
    if (res.ok) {
      setBioPrompt(false);
      setSuccessMsg('Biometric unlock enabled on this device.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } else {
      setBioError(res.error || 'Could not enable biometric unlock.');
    }
  };

  // --- Updates ---
  const platform = detectPlatform();
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkedMsg, setCheckedMsg] = useState('');

  useEffect(() => { checkForUpdate().then(setUpdate); }, []);

  const handleCheck = async () => {
    setChecking(true);
    setCheckedMsg('');
    const res = await checkForUpdate({ force: true });
    setUpdate(res);
    setChecking(false);
    if (!res) setCheckedMsg(`You're on the latest version (${APP_VERSION}).`);
  };

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

        {/* Biometric unlock */}
        <div className="bg-white dark:bg-[#1A1F26] rounded-xl border border-gray-200 dark:border-slate-800 p-6">
          <div className="flex flex-col space-y-4">
            <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center">
              <Fingerprint className="h-5 w-5 mr-2 text-indigo-500" /> Biometric unlock
            </h3>

            {!biometricSupported ? (
              <p className="text-sm text-gray-500 dark:text-slate-400">
                No fingerprint, face or Windows Hello sensor was detected on this device.
              </p>
            ) : biometricReady ? (
              <>
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  Enabled. Your vault key is encrypted with a secret only this device's
                  sensor can produce — MSec never stores your master password.
                </p>
                <button
                  onClick={() => { turnOffBiometric(); setSuccessMsg('Biometric unlock turned off.'); setTimeout(() => setSuccessMsg(''), 4000); }}
                  className="self-start rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Turn off on this device
                </button>
              </>
            ) : !bioPrompt ? (
              <>
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  Unlock with your fingerprint, face or Windows Hello instead of typing your
                  master password. Set up per device.
                </p>
                <button
                  onClick={() => setBioPrompt(true)}
                  className="self-start rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500"
                >
                  Enable biometric unlock
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  Confirm your master password, then approve the biometric prompt.
                </p>
                <input
                  type="password"
                  value={bioPassword}
                  onChange={(e) => setBioPassword(e.target.value)}
                  placeholder="Master password"
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-slate-700 dark:bg-[#121418] dark:text-white"
                />
                {bioError && <p className="text-xs font-medium text-red-500">{bioError}</p>}
                <div className="flex space-x-2">
                  <button
                    onClick={handleEnableBiometric}
                    disabled={bioBusy || !bioPassword}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {bioBusy ? 'Setting up…' : 'Confirm'}
                  </button>
                  <button
                    onClick={() => { setBioPrompt(false); setBioPassword(''); setBioError(''); }}
                    className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 dark:border-slate-700 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Updates */}
        <div className="bg-white dark:bg-[#1A1F26] rounded-xl border border-gray-200 dark:border-slate-800 p-6">
          <div className="flex flex-col space-y-4">
            <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center">
              <ArrowUpCircle className="h-5 w-5 mr-2 text-indigo-500" /> Updates
            </h3>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              You're running <span className="font-semibold text-gray-700 dark:text-slate-200">MSec {APP_VERSION}</span>.
            </p>

            {update ? (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-500/30 dark:bg-indigo-500/10">
                <p className="text-sm font-bold text-indigo-900 dark:text-indigo-200">
                  Version {update.version} is available
                </p>
                {update.notes && (
                  <p className="mt-1 line-clamp-3 text-xs text-indigo-800/80 dark:text-indigo-300/80">{update.notes}</p>
                )}
                <button
                  onClick={() => applyUpdate(update, platform)}
                  className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500"
                >
                  {updateActionLabel(platform)}
                </button>
              </div>
            ) : (
              checkedMsg && <p className="text-sm text-emerald-600 dark:text-emerald-400">{checkedMsg}</p>
            )}

            <button
              onClick={handleCheck}
              disabled={checking}
              className="flex items-center self-start rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
              {checking ? 'Checking…' : 'Check for updates'}
            </button>
          </div>
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
