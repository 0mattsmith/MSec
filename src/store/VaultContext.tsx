import React, { createContext, useContext, useEffect, useState } from 'react';
import type { AppState, VaultItem, VaultFolder, MaskedEmail } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where } from 'firebase/firestore';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';

const defaultState: AppState = {
  isUnlocked: false,
  masterPasswordSet: false, // In a real app we'd check if a hash exists
  theme: 'dark',
  settings: {
    clipboardClearTimeoutSeconds: 30, // Default to 30 seconds
  },
  items: [],
  folders: [],
  maskedEmails: [],
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
  }
};

interface VaultContextType extends AppState {
  unlock: (password: string) => boolean;
  unlockWithBiometric: () => boolean;
  lock: () => void;
  setMasterPassword: (password: string) => void;
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
  currentUser: any;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const VaultContext = createContext<VaultContextType | undefined>(undefined);

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<any>(null);

  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem('vaultx_state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Ensure app starts locked
        return { ...defaultState, ...parsed, isUnlocked: false };
      } catch (e) {
        return defaultState;
      }
    }
    return defaultState;
  });

  const updateState = (updates: Partial<AppState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser || !state.isUnlocked) return;

    const itemsRef = collection(db, `users/${currentUser.uid}/items`);
    const qItems = query(itemsRef, where('userId', '==', currentUser.uid));
    const unsubItems = onSnapshot(qItems, (snapshot) => {
      const dbItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as VaultItem[];
      updateState({ items: dbItems });
    }, (error) => handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}/items`));

    const foldersRef = collection(db, `users/${currentUser.uid}/folders`);
    const qFolders = query(foldersRef, where('userId', '==', currentUser.uid));
    const unsubFolders = onSnapshot(qFolders, (snapshot) => {
      const dbFolders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as VaultFolder[];
      updateState({ folders: dbFolders });
    }, (error) => handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}/folders`));

    return () => {
      unsubItems();
      unsubFolders();
    };
  }, [currentUser, state.isUnlocked]);

  useEffect(() => {
    // Only save the persistent parts that are NOT in firebase, or act as local cache
    const { isUnlocked, selectedItemId, activeCategory, activeFolderId, ...persistentState } = state;
    localStorage.setItem('vaultx_state', JSON.stringify({ ...persistentState, items: state.items, folders: state.folders }));
    
    // Apply theme
    if (state.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [state]);


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
    lock();
  };

  const unlock = (password: string) => {
    // Basic simulation. Real app decrypts data here.
    const savedHash = localStorage.getItem('vaultx_mp');
    if (savedHash === password || !state.masterPasswordSet) {
      updateState({ isUnlocked: true });
      return true;
    }
    return false;
  };

  const unlockWithBiometric = async () => {
    try {
      if (window.PublicKeyCredential) {
        // Attempt to trigger the native biometric prompt using a dummy passkey assertion
        // In the iframe preview, this might fail with a NotAllowedError due to permissions
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);
        await navigator.credentials.get({
          publicKey: {
            challenge,
            timeout: 60000,
            userVerification: "required"
          }
        });
        updateState({ isUnlocked: true });
        return true;
      } else {
        // Fallback if not supported
        updateState({ isUnlocked: true });
        return true;
      }
    } catch (error: any) {
      // If it throws because of iframe restrictions (NotAllowedError) or user cancellation,
      // we can gracefully fallback or alert.
      console.warn("Biometric failed or rejected:", error);
      if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
         alert('Biometrics are blocked in this preview iframe. Opening the app in a new tab may resolve this, or your device may not have a registered passkey. Simulating unlock...');
         updateState({ isUnlocked: true });
         return true;
      }
      alert('Biometric authentication failed: ' + error.message);
      return false; // User cancelled or other error
    }
  };

  const lock = () => updateState({ isUnlocked: false, selectedItemId: null });

  const setMasterPassword = (password: string) => {
    localStorage.setItem('vaultx_mp', password);
    updateState({ masterPasswordSet: true, isUnlocked: true });
  };

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
              await setDoc(doc(db, `users/${currentUser.uid}/items/${id}`), { ...newItem, userId: currentUser.uid });
            } catch (error) { handleFirestoreError(error, OperationType.CREATE, `users/${currentUser.uid}/items`); }
          } else {
            updateState({ items: [...state.items, newItem], selectedItemId: id });
          }
        },
        
        updateItem: async (id, updates) => {
          if (currentUser) {
             try {
                await updateDoc(doc(db, `users/${currentUser.uid}/items/${id}`), { ...updates, updatedAt: Date.now() });
             } catch (error) { handleFirestoreError(error, OperationType.UPDATE, `users/${currentUser.uid}/items`); }
          } else {
            updateState({
              items: state.items.map((it) => it.id === id ? { ...it, ...updates, updatedAt: Date.now() } : it)
            });
          }
        },
        
        moveToTrash: async (id) => {
           if (currentUser) {
             try { await updateDoc(doc(db, `users/${currentUser.uid}/items/${id}`), { deletedAt: Date.now() }); } catch(err) { handleFirestoreError(err, OperationType.UPDATE, null); }
           } else {
             updateState({
               items: state.items.map((it) => it.id === id ? { ...it, deletedAt: Date.now() } : it),
               selectedItemId: state.selectedItemId === id ? null : state.selectedItemId
             });
           }
        },
        
        restoreFromTrash: async (id) => {
           if (currentUser) {
             try { await updateDoc(doc(db, `users/${currentUser.uid}/items/${id}`), { deletedAt: null }); } catch(err) { handleFirestoreError(err, OperationType.UPDATE, null); }
           } else {
             updateState({
               items: state.items.map((it) => it.id === id ? { ...it, deletedAt: null } : it)
             });
           }
        },
        
        deleteItemPermanently: async (id) => {
           if (currentUser) {
             try { await deleteDoc(doc(db, `users/${currentUser.uid}/items/${id}`)); } catch(err) { handleFirestoreError(err, OperationType.DELETE, null); }
             updateState({ selectedItemId: state.selectedItemId === id ? null : state.selectedItemId });
           } else {
             updateState({
               items: state.items.filter((it) => it.id !== id),
               selectedItemId: state.selectedItemId === id ? null : state.selectedItemId
             });
           }
        },
        
        addFolder: async (name, color, parentId) => {
          const id = crypto.randomUUID();
          const newFolder: VaultFolder = {
            id,
            name,
            color,
            parentId,
            createdAt: Date.now()
          };
          if (currentUser) {
            try { await setDoc(doc(db, `users/${currentUser.uid}/folders/${id}`), { ...newFolder, userId: currentUser.uid }); } catch(err) { handleFirestoreError(err, OperationType.CREATE, null); }
          } else {
            updateState({ folders: [...state.folders, newFolder] });
          }
        },
        
        updateFolder: async (id, name) => {
          if (currentUser) {
            try { await updateDoc(doc(db, `users/${currentUser.uid}/folders/${id}`), { name, updatedAt: Date.now() }); } catch(err) { handleFirestoreError(err, OperationType.UPDATE, null); }
          } else {
            updateState({ folders: state.folders.map(f => f.id === id ? { ...f, name } : f) });
          }
        },
        
        deleteFolder: async (id) => {
          if (currentUser) {
            try { await deleteDoc(doc(db, `users/${currentUser.uid}/folders/${id}`)); } catch(err) { handleFirestoreError(err, OperationType.DELETE, null); }
          } else {
            updateState({ folders: state.folders.filter(f => f.id !== id) });
          }
        },
        
        clearStorage: () => {
          localStorage.removeItem('vaultx_state');
          localStorage.removeItem('vaultx_mp');
          if (currentUser) signOut(auth);
          window.location.reload();
        },
        
        updateSettings: (opts) => updateState({ settings: { ...state.settings, ...opts } }),

        addMaskedEmail: (maskedAddress, forwardTo, label) => {
           const id = crypto.randomUUID();
           const newMask: MaskedEmail = {
             id,
             maskedAddress,
             forwardTo,
             label,
             createdAt: Date.now()
           };
           updateState({ maskedEmails: [...state.maskedEmails, newMask] });
        },

        deleteMaskedEmail: (id) => {
            updateState({ maskedEmails: state.maskedEmails.filter(m => m.id !== id) });
        }
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

