import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { AppState, VaultItem, VaultFolder, MaskedEmail, Workspace } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, where } from 'firebase/firestore';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import {
  createKdfConfig,
  unlockVaultKey,
  encryptJson,
  decryptJson,
  type KdfConfig,
} from '../lib/crypto';

// localStorage keys
const LS_KDF = 'msec_kdf'; // KDF config + verifier (no secrets)
const LS_VAULT = 'msec_vault'; // AES-GCM encrypted {items, folders, maskedEmails}
const LS_PREFS = 'msec_prefs'; // non-sensitive prefs (theme, generator, settings)
// legacy plaintext keys (pre-encryption versions of the app)
const LS_LEGACY_STATE = 'vaultx_state';
const LS_LEGACY_MP = 'vaultx_mp';
const LS_LEGACY_WORKSPACES = 'vaultx_workspaces';

interface VaultPayload {
  items: VaultItem[];
  folders: VaultFolder[];
  maskedEmails: MaskedEmail[];
  workspaces?: Workspace[];
}

const defaultState: AppState = {
  isUnlocked: false,
  masterPasswordSet: false,
  theme: 'dark',
  settings: {
    clipboardClearTimeoutSeconds: 30,
  },
  items: [],
  folders: [],
  maskedEmails: [],
  workspaces: [],
  activeCategory: 'all',
  activeFolderId: null,
  selectedItemId: null,
  isCustomizingColumns: false,
  generatorOptions: {
    length: 16,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
  },
};

function loadInitialState(): AppState {
  const state = { ...defaultState };
  state.masterPasswordSet = !!localStorage.getItem(LS_KDF) || !!localStorage.getItem(LS_LEGACY_MP);
  try {
    const prefs = localStorage.getItem(LS_PREFS);
    if (prefs) {
      const parsed = JSON.parse(prefs);
      if (parsed.theme) state.theme = parsed.theme;
      if (parsed.settings) state.settings = { ...state.settings, ...parsed.settings };
      if (parsed.generatorOptions) state.generatorOptions = { ...state.generatorOptions, ...parsed.generatorOptions };
    }
  } catch {
    /* corrupt prefs — fall back to defaults */
  }
  return state;
}

function readKdfConfig(): KdfConfig | null {
  try {
    const raw = localStorage.getItem(LS_KDF);
    return raw ? (JSON.parse(raw) as KdfConfig) : null;
  } catch {
    return null;
  }
}

function readLegacyWorkspaces(): Workspace[] {
  try {
    const raw = localStorage.getItem(LS_LEGACY_WORKSPACES);
    return raw ? (JSON.parse(raw) as Workspace[]) : [];
  } catch {
    return [];
  }
}

function readLegacyPayload(): VaultPayload {
  const workspaces = readLegacyWorkspaces();
  try {
    const raw = localStorage.getItem(LS_LEGACY_STATE);
    if (!raw) return { items: [], folders: [], maskedEmails: [], workspaces };
    const parsed = JSON.parse(raw);
    return {
      items: parsed.items ?? [],
      folders: parsed.folders ?? [],
      maskedEmails: parsed.maskedEmails ?? [],
      workspaces,
    };
  } catch {
    return { items: [], folders: [], maskedEmails: [], workspaces };
  }
}

interface VaultContextType extends AppState {
  unlock: (password: string) => Promise<boolean>;
  unlockWithBiometric: () => Promise<boolean>;
  lock: () => void;
  setMasterPassword: (password: string) => Promise<void>;
  setTheme: (theme: 'dark' | 'light') => void;
  setActiveCategory: (category: AppState['activeCategory']) => void;
  setActiveFolderId: (folderId: string | null) => void;
  setSelectedItemId: (itemId: string | null) => void;
  addItem: (item: Omit<VaultItem, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateItem: (id: string, updates: Partial<VaultItem>) => void;
  moveToTrash: (id: string) => void;
  restoreFromTrash: (id: string) => void;
  deleteItemPermanently: (id: string) => void;
  addFolder: (name: string, color?: string, parentId?: string) => void;
  updateFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  clearStorage: () => void;
  updateGeneratorOptions: (options: Partial<AppState['generatorOptions']>) => void;
  updateSettings: (options: Partial<AppState['settings']>) => void;
  addMaskedEmail: (masked: string, forwardTo: string, label: string) => void;
  deleteMaskedEmail: (id: string) => void;
  updateWorkspaces: (workspaces: Workspace[]) => void;
  currentUser: any;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const VaultContext = createContext<VaultContextType | undefined>(undefined);

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [state, setState] = useState<AppState>(loadInitialState);

  // The vault key lives ONLY here, in memory. Never persisted.
  // Kept across soft-lock so biometric quick-unlock can work; purged on
  // sign-out / clear. A page reload always requires the master password.
  const keyRef = useRef<CryptoKey | null>(null);

  const updateState = (updates: Partial<AppState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  // ---------- Firestore sync (encrypted blobs only) ----------

  const decryptDoc = async <T,>(docId: string, data: any): Promise<T | null> => {
    // New format: encrypted blob. Legacy format: plaintext fields.
    if (data.blob) {
      if (!keyRef.current) return null;
      try {
        return await decryptJson<T>(keyRef.current, data.blob);
      } catch (e) {
        console.error(`Failed to decrypt doc ${docId} — wrong key or corrupt data`, e);
        return null;
      }
    }
    // Legacy plaintext doc — still readable so users don't lose data.
    const { userId, blob, ...rest } = data;
    return { id: docId, ...rest } as T;
  };

  useEffect(() => {
    if (!currentUser || !state.isUnlocked || !keyRef.current) return;

    const itemsRef = collection(db, `users/${currentUser.uid}/items`);
    const qItems = query(itemsRef, where('userId', '==', currentUser.uid));
    const unsubItems = onSnapshot(qItems, async (snapshot) => {
      const decrypted = await Promise.all(
        snapshot.docs.map((d) => decryptDoc<VaultItem>(d.id, d.data())),
      );
      updateState({ items: decrypted.filter((it): it is VaultItem => it !== null) });
    }, (error) => handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}/items`));

    const foldersRef = collection(db, `users/${currentUser.uid}/folders`);
    const qFolders = query(foldersRef, where('userId', '==', currentUser.uid));
    const unsubFolders = onSnapshot(qFolders, async (snapshot) => {
      const decrypted = await Promise.all(
        snapshot.docs.map((d) => decryptDoc<VaultFolder>(d.id, d.data())),
      );
      updateState({ folders: decrypted.filter((f): f is VaultFolder => f !== null) });
    }, (error) => handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}/folders`));

    return () => {
      unsubItems();
      unsubFolders();
    };
  }, [currentUser, state.isUnlocked]);

  /** Write an item to Firestore as an encrypted blob. */
  const putItemDoc = async (item: VaultItem) => {
    if (!currentUser || !keyRef.current) return;
    const blob = await encryptJson(keyRef.current, item);
    await setDoc(doc(db, `users/${currentUser.uid}/items/${item.id}`), {
      blob,
      userId: currentUser.uid,
      updatedAt: item.updatedAt,
    });
  };

  const putFolderDoc = async (folder: VaultFolder) => {
    if (!currentUser || !keyRef.current) return;
    const blob = await encryptJson(keyRef.current, folder);
    await setDoc(doc(db, `users/${currentUser.uid}/folders/${folder.id}`), {
      blob,
      userId: currentUser.uid,
    });
  };

  // ---------- Local persistence (encrypted) ----------

  const persistSeq = useRef(0);
  useEffect(() => {
    // Non-sensitive prefs: plaintext is fine.
    localStorage.setItem(LS_PREFS, JSON.stringify({
      theme: state.theme,
      settings: state.settings,
      generatorOptions: state.generatorOptions,
    }));

    // Vault data: only ever written encrypted, and only while unlocked
    // (so we never clobber the stored vault with an empty locked state).
    if (state.isUnlocked && keyRef.current) {
      const seq = ++persistSeq.current;
      const payload: VaultPayload = {
        items: state.items,
        folders: state.folders,
        maskedEmails: state.maskedEmails,
        workspaces: state.workspaces,
      };
      encryptJson(keyRef.current, payload).then((blob) => {
        if (seq === persistSeq.current) localStorage.setItem(LS_VAULT, blob);
      }).catch((e) => console.error('Vault encryption failed', e));
    }

    // Apply theme
    if (state.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [state]);

  const loadVaultIntoState = async (key: CryptoKey) => {
    const blob = localStorage.getItem(LS_VAULT);
    if (!blob) return;
    try {
      const payload = await decryptJson<VaultPayload>(key, blob);
      // One-time adoption of dashboard workspaces that older builds kept in
      // plaintext localStorage; once inside the encrypted vault, the
      // plaintext copy is deleted.
      const legacyWs = readLegacyWorkspaces();
      const workspaces = (payload.workspaces && payload.workspaces.length > 0)
        ? payload.workspaces
        : legacyWs;
      localStorage.removeItem(LS_LEGACY_WORKSPACES);
      updateState({
        items: payload.items ?? [],
        folders: payload.folders ?? [],
        maskedEmails: payload.maskedEmails ?? [],
        workspaces,
      });
    } catch (e) {
      console.error('Failed to decrypt local vault', e);
    }
  };

  // ---------- Auth ----------

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error(error);
    }
  };

  const signOutUser = async () => {
    await signOut(auth);
    keyRef.current = null; // hard lock: purge key from memory
    updateState({ isUnlocked: false, selectedItemId: null, items: [], folders: [] });
  };

  // ---------- Lock / unlock ----------

  const unlock = async (password: string): Promise<boolean> => {
    const kdf = readKdfConfig();

    if (kdf) {
      const key = await unlockVaultKey(password, kdf);
      if (!key) return false;
      keyRef.current = key;
      await loadVaultIntoState(key);
      updateState({ isUnlocked: true });
      return true;
    }

    // Legacy migration: plaintext master password from the pre-encryption app.
    const legacyMp = localStorage.getItem(LS_LEGACY_MP);
    if (legacyMp !== null) {
      if (legacyMp !== password) return false;
      await migrateToEncrypted(password);
      return true;
    }

    return false;
  };

  /** One-time migration: encrypt legacy plaintext vault, delete plaintext. */
  const migrateToEncrypted = async (password: string) => {
    const { config, key } = await createKdfConfig(password);
    keyRef.current = key;
    const legacy = readLegacyPayload();
    const blob = await encryptJson(key, legacy);
    localStorage.setItem(LS_KDF, JSON.stringify(config));
    localStorage.setItem(LS_VAULT, blob);
    localStorage.removeItem(LS_LEGACY_MP);
    localStorage.removeItem(LS_LEGACY_STATE);
    localStorage.removeItem(LS_LEGACY_WORKSPACES);
    updateState({
      isUnlocked: true,
      masterPasswordSet: true,
      items: legacy.items,
      folders: legacy.folders,
      maskedEmails: legacy.maskedEmails,
      workspaces: legacy.workspaces ?? [],
    });
  };

  const setMasterPassword = async (password: string) => {
    // Also covers first-run migration if legacy data exists but no legacy mp.
    await migrateToEncrypted(password);
  };

  /**
   * Biometric quick-unlock. Only possible while the vault key is still in
   * memory (i.e. after a soft lock in this session). After a reload or
   * sign-out the master password is required — we cannot decrypt without it.
   */
  const unlockWithBiometric = async (): Promise<boolean> => {
    if (!keyRef.current) {
      alert('Biometric unlock is only available after unlocking with your master password this session.');
      return false;
    }
    try {
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);
      await navigator.credentials.get({
        publicKey: {
          challenge,
          timeout: 60000,
          userVerification: 'required',
        },
      });
      updateState({ isUnlocked: true });
      return true;
    } catch (error: any) {
      console.warn('Biometric failed or rejected:', error);
      alert('Biometric authentication failed. Please use your master password.');
      return false;
    }
  };

  const lock = () => updateState({ isUnlocked: false, selectedItemId: null });

  return (
    <VaultContext.Provider
      value={{
        ...state,
        currentUser,
        signInWithGoogle,
        signOutUser,
        unlock,
        unlockWithBiometric,
        lock,
        setMasterPassword,
        setTheme: (theme) => updateState({ theme }),
        setActiveCategory: (activeCategory) => updateState({ activeCategory, activeFolderId: null, selectedItemId: null }),
        setActiveFolderId: (activeFolderId) => updateState({ activeFolderId, activeCategory: 'all', selectedItemId: null }),
        setSelectedItemId: (selectedItemId) => updateState({ selectedItemId }),
        updateGeneratorOptions: (opts) => updateState({ generatorOptions: { ...state.generatorOptions, ...opts } }),

        addItem: async (item) => {
          const id = crypto.randomUUID();
          const newItem: VaultItem = {
            ...item,
            id,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          if (currentUser) {
            try {
              await putItemDoc(newItem);
              updateState({ selectedItemId: id });
            } catch (error) { handleFirestoreError(error, OperationType.CREATE, `users/${currentUser.uid}/items`); }
          } else {
            updateState({ items: [...state.items, newItem], selectedItemId: id });
          }
        },

        updateItem: async (id, updates) => {
          const existing = state.items.find((it) => it.id === id);
          if (!existing) return;
          const merged: VaultItem = { ...existing, ...updates, updatedAt: Date.now() };
          if (currentUser) {
            try {
              await putItemDoc(merged);
            } catch (error) { handleFirestoreError(error, OperationType.UPDATE, `users/${currentUser.uid}/items`); }
          } else {
            updateState({ items: state.items.map((it) => it.id === id ? merged : it) });
          }
        },

        moveToTrash: async (id) => {
          const existing = state.items.find((it) => it.id === id);
          if (!existing) return;
          const merged: VaultItem = { ...existing, deletedAt: Date.now() };
          if (currentUser) {
            try { await putItemDoc(merged); } catch (err) { handleFirestoreError(err, OperationType.UPDATE, null); }
            updateState({ selectedItemId: state.selectedItemId === id ? null : state.selectedItemId });
          } else {
            updateState({
              items: state.items.map((it) => it.id === id ? merged : it),
              selectedItemId: state.selectedItemId === id ? null : state.selectedItemId,
            });
          }
        },

        restoreFromTrash: async (id) => {
          const existing = state.items.find((it) => it.id === id);
          if (!existing) return;
          const merged: VaultItem = { ...existing, deletedAt: null };
          if (currentUser) {
            try { await putItemDoc(merged); } catch (err) { handleFirestoreError(err, OperationType.UPDATE, null); }
          } else {
            updateState({ items: state.items.map((it) => it.id === id ? merged : it) });
          }
        },

        deleteItemPermanently: async (id) => {
          if (currentUser) {
            try { await deleteDoc(doc(db, `users/${currentUser.uid}/items/${id}`)); } catch (err) { handleFirestoreError(err, OperationType.DELETE, null); }
            updateState({ selectedItemId: state.selectedItemId === id ? null : state.selectedItemId });
          } else {
            updateState({
              items: state.items.filter((it) => it.id !== id),
              selectedItemId: state.selectedItemId === id ? null : state.selectedItemId,
            });
          }
        },

        addFolder: async (name, color, parentId) => {
          const id = crypto.randomUUID();
          const newFolder: VaultFolder = { id, name, color, parentId, createdAt: Date.now() };
          if (currentUser) {
            try { await putFolderDoc(newFolder); } catch (err) { handleFirestoreError(err, OperationType.CREATE, null); }
          } else {
            updateState({ folders: [...state.folders, newFolder] });
          }
        },

        updateFolder: async (id, name) => {
          const existing = state.folders.find((f) => f.id === id);
          if (!existing) return;
          const merged: VaultFolder = { ...existing, name };
          if (currentUser) {
            try { await putFolderDoc(merged); } catch (err) { handleFirestoreError(err, OperationType.UPDATE, null); }
          } else {
            updateState({ folders: state.folders.map((f) => f.id === id ? merged : f) });
          }
        },

        deleteFolder: async (id) => {
          if (currentUser) {
            try { await deleteDoc(doc(db, `users/${currentUser.uid}/folders/${id}`)); } catch (err) { handleFirestoreError(err, OperationType.DELETE, null); }
          } else {
            updateState({ folders: state.folders.filter((f) => f.id !== id) });
          }
        },

        clearStorage: () => {
          localStorage.removeItem(LS_VAULT);
          localStorage.removeItem(LS_KDF);
          localStorage.removeItem(LS_PREFS);
          localStorage.removeItem(LS_LEGACY_STATE);
          localStorage.removeItem(LS_LEGACY_MP);
          localStorage.removeItem(LS_LEGACY_WORKSPACES);
          keyRef.current = null;
          if (currentUser) signOut(auth);
          window.location.reload();
        },

        updateSettings: (opts) => updateState({ settings: { ...state.settings, ...opts } }),

        addMaskedEmail: (maskedAddress, forwardTo, label) => {
          const id = crypto.randomUUID();
          const newMask: MaskedEmail = { id, maskedAddress, forwardTo, label, createdAt: Date.now() };
          updateState({ maskedEmails: [...state.maskedEmails, newMask] });
        },

        deleteMaskedEmail: (id) => {
          updateState({ maskedEmails: state.maskedEmails.filter((m) => m.id !== id) });
        },

        updateWorkspaces: (workspaces) => updateState({ workspaces }),
      }}
    >
      {children}
    </VaultContext.Provider>
  );
}

export function useVault() {
  const context = useContext(VaultContext);
  if (context === undefined) {
    throw new Error('useVault must be used within a VaultProvider');
  }
  return context;
}
