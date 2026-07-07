import React, { useState, useRef, useEffect } from 'react';
import { useVault } from '../store/VaultContext';
import type { DashboardWidget as Widget, Workspace } from '../types';
import { generateTOTP, getTimeUntilNextTOTP, copyToClipboardWithTimeout } from '../lib/utils';
import { ChevronUp, ChevronDown, Link2, Clock, Mail, ShieldAlert, FileText, Key, Plus, Image as ImageIcon, Briefcase, PlusCircle, Trash2, X, Eye, Copy, MoreVertical, CreditCard, ChevronRight, Palette, Edit, EyeOff, Check } from 'lucide-react';

const BUILT_IN_WALLPAPERS = [
  { id: 'default', name: 'Default Gradient', value: null },
  { id: 'dark-mesh', name: 'Dark Mesh', value: 'bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-700 via-gray-900 to-black' },
  { id: 'blue-waves', name: 'Blue Waves', value: 'bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-blue-400 via-indigo-600 to-blue-800' },
  { id: 'forest', name: 'Forest Aura', value: 'bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-green-300 via-emerald-600 to-teal-900' },
  { id: 'sunset', name: 'Sunset Glow', value: 'bg-gradient-to-tr from-pink-500 via-red-500 to-yellow-500' },
];

const DEFAULT_WIDGETS: Widget[] = [
  { id: '1', type: 'note', x: 20, y: 100, title: 'Network Setup', content: 'Router: 192.168.1.1\nVPN config updated.', color: 'bg-yellow-200 text-yellow-900', isDark: false },
  { id: '2', type: 'icon', x: 300, y: 120, title: 'Work Email', iconName: 'Mail' },
  { id: '3', type: 'icon', x: 400, y: 120, title: 'Banking', iconName: 'Key' },
  { id: '4', type: 'note', x: 300, y: 220, title: 'To Do', content: '- Rotate API keys\n- Check breach scanner\n- Setup cloud sync', color: 'bg-indigo-100 text-indigo-900', isDark: false }
];

const ICONS: Record<string, React.FC<any>> = {
  Mail, Key, ShieldAlert, FileText, Clock, Link2, Briefcase
};

/** Below Tailwind's md breakpoint the dashboard becomes a homescreen. */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

export function DashboardView() {
  const { theme, items, settings, setActiveCategory, setSelectedItemId, workspaces: vaultWorkspaces, updateWorkspaces } = useVault();
  const isMobile = useIsMobile();

  // Local state for smooth dragging; synced back into the encrypted vault
  // (debounced) below. Workspaces are part of the vault payload now — they
  // are never written to disk in plaintext.
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() =>
    vaultWorkspaces.length > 0
      ? vaultWorkspaces
      : [{ id: '1', name: 'My Workspace', wallpaper: null, widgets: DEFAULT_WIDGETS }]
  );
  
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(workspaces[0]?.id || '1');
  const [isRenaming, setIsRenaming] = useState(false);
  const [editName, setEditName] = useState('');
  
  const [showWallpaperMenu, setShowWallpaperMenu] = useState(false);
  const [showAddWidgetMenu, setShowAddWidgetMenu] = useState(false);
  
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'dashboard' | 'widget', widgetId?: string } | null>(null);
  
  const [deletedWorkspace, setDeletedWorkspace] = useState<Workspace | null>(null);
  const [workspaceToDelete, setWorkspaceToDelete] = useState<Workspace | null>(null);
  
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const dragMovedRef = useRef(false);

  // Mobile jiggle edit mode (iOS-style): long-press to enter, drag to
  // rearrange or merge, Done to exit.
  const [editMode, setEditMode] = useState(false);
  const [mobileDragId, setMobileDragId] = useState<string | null>(null);
  const [mobileDragPos, setMobileDragPos] = useState({ x: 0, y: 0 });
  const [mobileDropTarget, setMobileDropTarget] = useState<{ id: string; mode: 'merge' | 'before' | 'after' } | null>(null);
  const tileRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const mobilePressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mobilePressStartRef = useRef({ x: 0, y: 0 });
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const t = setTimeout(() => updateWorkspaces(workspaces), 400);
    return () => clearTimeout(t);
  }, [workspaces]);

  // Re-render every second so TOTP codes and countdowns stay current.
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const hasTotp = workspaces.some(ws => ws.widgets.some(w => w.type === 'totp-list'));
    if (!hasTotp) return;
    const interval = setInterval(() => setNowTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [workspaces]);

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0];

  const updateWorkspace = (updates: Partial<Workspace>) => {
    setWorkspaces(prev => prev.map(w => w.id === activeWorkspaceId ? { ...w, ...updates } : w));
  };
  
  const handleNameEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editName.trim()) {
      updateWorkspace({ name: editName.trim() });
    }
    setIsRenaming(false);
  };

  // --- iOS-style icon folders ---------------------------------------------
  // Icon widgets are w-28 (112px) wide, roughly 90px tall.
  const iconCenter = (w: Widget) => ({ cx: w.x + 56, cy: w.y + 45 });

  /** While dragging an icon, another icon or folder within range is a drop target. */
  const findDropTarget = (widgets: Widget[], dragged: Widget): string | null => {
    if (dragged.type !== 'icon') return null;
    const { cx, cy } = iconCenter(dragged);
    for (const w of widgets) {
      if (w.id === dragged.id) continue;
      if (w.type !== 'icon' && w.type !== 'folder') continue;
      const c = iconCenter(w);
      if (Math.hypot(c.cx - cx, c.cy - cy) < 48) return w.id;
    }
    return null;
  };

  /** Merge the dragged icon into the drop target (icon -> new folder, folder -> append). */
  const mergeIntoTarget = (draggedId: string, targetId: string) => {
    const dragged = activeWorkspace.widgets.find(w => w.id === draggedId);
    const target = activeWorkspace.widgets.find(w => w.id === targetId);
    if (!dragged || !target || dragged.type !== 'icon') return;
    const draggedChild = { id: dragged.id, title: dragged.title, iconName: dragged.iconName || 'Briefcase' };
    let newWidgets: Widget[];
    if (target.type === 'folder') {
      newWidgets = activeWorkspace.widgets
        .filter(w => w.id !== dragged.id)
        .map(w => w.id === target.id ? { ...w, children: [...(w.children || []), draggedChild] } : w);
    } else {
      const folder: Widget = {
        id: crypto.randomUUID(),
        type: 'folder',
        x: target.x,
        y: target.y,
        title: 'Folder',
        children: [
          { id: target.id, title: target.title, iconName: target.iconName || 'Briefcase' },
          draggedChild,
        ],
      };
      newWidgets = activeWorkspace.widgets.filter(w => w.id !== dragged.id && w.id !== target.id).concat(folder);
    }
    updateWorkspace({ widgets: newWidgets });
  };

  /** Pop a single icon back out of a folder; dissolve the folder when one child remains. */
  const popOutChild = (folderId: string, childId: string) => {
    const folder = activeWorkspace.widgets.find(w => w.id === folderId);
    if (!folder) return;
    const child = (folder.children || []).find(c => c.id === childId);
    if (!child) return;
    const remaining = (folder.children || []).filter(c => c.id !== childId);
    const popped: Widget = { id: child.id, type: 'icon', x: folder.x + 120, y: folder.y + 10, title: child.title, iconName: child.iconName };
    let newWidgets = activeWorkspace.widgets
      .map(w => w.id === folderId ? { ...w, children: remaining } : w)
      .concat(popped);
    if (remaining.length === 1) {
      const last = remaining[0];
      newWidgets = newWidgets
        .filter(w => w.id !== folderId)
        .concat({ id: last.id, type: 'icon', x: folder.x, y: folder.y, title: last.title, iconName: last.iconName });
      setOpenFolderId(null);
    }
    updateWorkspace({ widgets: newWidgets });
  };

  /** Dissolve a folder entirely: all children return to the canvas as icons. */
  const dissolveFolder = (folderId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const folder = activeWorkspace.widgets.find(w => w.id === folderId);
    if (!folder) return;
    const popped: Widget[] = (folder.children || []).map((c, i) => ({
      id: c.id,
      type: 'icon',
      x: folder.x + (i % 3) * 110,
      y: folder.y + Math.floor(i / 3) * 100,
      title: c.title,
      iconName: c.iconName,
    }));
    updateWorkspace({ widgets: activeWorkspace.widgets.filter(w => w.id !== folderId).concat(popped) });
    if (openFolderId === folderId) setOpenFolderId(null);
  };
  /** Grid order on mobile: explicit mobileOrder first, else desktop (y, x). */
  const getMobileGrid = () =>
    activeWorkspace.widgets
      .filter(w => w.type === 'icon' || w.type === 'folder')
      .sort((a, b) => (a.mobileOrder ?? a.y * 10000 + a.x) - (b.mobileOrder ?? b.y * 10000 + b.x));

  const reorderMobile = (draggedId: string, targetId: string, place: 'before' | 'after') => {
    const dragged = activeWorkspace.widgets.find(w => w.id === draggedId);
    if (!dragged) return;
    const grid = getMobileGrid().filter(w => w.id !== draggedId);
    let idx = grid.findIndex(w => w.id === targetId);
    if (idx === -1) return;
    if (place === 'after') idx += 1;
    grid.splice(idx, 0, dragged);
    const orderMap = new Map(grid.map((w, i) => [w.id, i]));
    updateWorkspace({
      widgets: activeWorkspace.widgets.map(w =>
        orderMap.has(w.id) ? { ...w, mobileOrder: orderMap.get(w.id) } : w),
    });
  };

  const mobileTileDown = (e: React.PointerEvent, id: string) => {
    mobilePressStartRef.current = { x: e.clientX, y: e.clientY };
    if (editMode) {
      e.preventDefault();
      setMobileDragId(id);
      setMobileDragPos({ x: e.clientX, y: e.clientY });
    } else {
      mobilePressTimerRef.current = setTimeout(() => {
        mobilePressTimerRef.current = null;
        setEditMode(true);
        if (navigator.vibrate) navigator.vibrate(15);
      }, 450);
    }
  };

  const mobileGridMove = (e: React.PointerEvent) => {
    if (mobilePressTimerRef.current) {
      const moved = Math.hypot(e.clientX - mobilePressStartRef.current.x, e.clientY - mobilePressStartRef.current.y);
      if (moved > 10) {
        clearTimeout(mobilePressTimerRef.current);
        mobilePressTimerRef.current = null;
      }
    }
    if (!mobileDragId) return;
    e.preventDefault();
    setMobileDragPos({ x: e.clientX, y: e.clientY });
    let found: { id: string; mode: 'merge' | 'before' | 'after' } | null = null;
    const draggedW = activeWorkspace.widgets.find(w => w.id === mobileDragId);
    for (const [id, el] of Object.entries(tileRefs.current)) {
      if (!el || id === mobileDragId) continue;
      const r = el.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        const relX = (e.clientX - r.left) / r.width;
        const canMerge = draggedW?.type === 'icon';
        if (canMerge && relX > 0.3 && relX < 0.7) {
          found = { id, mode: 'merge' };
        } else {
          found = { id, mode: relX <= 0.5 ? 'before' : 'after' };
        }
        break;
      }
    }
    setMobileDropTarget(found);
  };

  const mobileGridUp = () => {
    if (mobilePressTimerRef.current) {
      clearTimeout(mobilePressTimerRef.current);
      mobilePressTimerRef.current = null;
    }
    if (mobileDragId && mobileDropTarget) {
      if (mobileDropTarget.mode === 'merge') {
        mergeIntoTarget(mobileDragId, mobileDropTarget.id);
      } else {
        reorderMobile(mobileDragId, mobileDropTarget.id, mobileDropTarget.mode);
      }
    }
    setMobileDragId(null);
    setMobileDropTarget(null);
  };
  // -------------------------------------------------------------------------

  const handlePointerDown = (e: React.PointerEvent, id: string, isResize: boolean = false) => {
    if (!isResize && (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLButtonElement)) return;
    e.preventDefault();
    e.stopPropagation();
    dragMovedRef.current = false;

    if (e.pointerType === 'touch' && !isResize) {
      const clientX = e.clientX;
      const clientY = e.clientY;
      longPressTimerRef.current = setTimeout(() => {
        setContextMenu({ x: clientX, y: clientY, type: 'widget', widgetId: id });
        setDraggingId(null);
      }, 500);
    }

    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const container = el.parentElement!.getBoundingClientRect();
    
    if (isResize) {
      setResizingId(id);
      setDragOffset({
        x: e.clientX,
        y: e.clientY
      });
    } else {
      setDraggingId(id);
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };
  
  const handlePointerMove = (e: React.PointerEvent) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (draggingId || resizingId) dragMovedRef.current = true;

    if (resizingId) {
      const newWidgets = activeWorkspace.widgets.map(w => {
        if (w.id === resizingId) {
          const dx = e.clientX - dragOffset.x;
          const dy = e.clientY - dragOffset.y;
          return {
            ...w,
            w: Math.max(200, (w.w || 320) + dx),
            h: Math.max(120, (w.h || 200) + dy)
          };
        }
        return w;
      });
      setDragOffset({ x: e.clientX, y: e.clientY });
      updateWorkspace({ widgets: newWidgets });
      return;
    }
    
    if (!draggingId) return;
    const container = e.currentTarget.getBoundingClientRect();
    
    const newWidgets = activeWorkspace.widgets.map(w => {
      if (w.id === draggingId) {
        return {
          ...w,
          x: Math.max(0, Math.min(container.width - 50, e.clientX - container.left - dragOffset.x)),
          y: Math.max(0, Math.min(container.height - 50, e.clientY - container.top - dragOffset.y))
        };
      }
      return w;
    });
    updateWorkspace({ widgets: newWidgets });

    const draggedW = newWidgets.find(w => w.id === draggingId);
    setDropTargetId(draggedW ? findDropTarget(newWidgets, draggedW) : null);
  };
  
  const handlePointerUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (draggingId && dropTargetId) {
      mergeIntoTarget(draggingId, dropTargetId);
    }
    setDropTargetId(null);
    if (draggingId) setDraggingId(null);
    if (resizingId) setResizingId(null);
  };

  const handleContextMenu = (e: React.MouseEvent, type: 'dashboard' | 'widget', widgetId?: string) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLButtonElement) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, type, widgetId });
  };

  const addWidget = (type: string, x?: number, y?: number) => {
    setShowAddWidgetMenu(false);
    setContextMenu(null);
    let title = 'New Widget';
    if (type === 'note') title = 'New Note';
    if (type === 'icon') title = 'New Icon';
    if (type === 'login-list') title = 'Login Links';
    if (type === 'totp-list') title = 'Authenticator Keys';
    if (type === 'card') title = 'Debit Card';

    const newWidget: Widget = {
      id: crypto.randomUUID(),
      type,
      x: x !== undefined ? x : Math.floor(Math.random() * 100) + 50,
      y: y !== undefined ? y : Math.floor(Math.random() * 100) + 120,
      title,
      content: type === 'note' ? 'Write something...' : undefined,
      color: 'bg-indigo-100 text-indigo-900',
      isDark: false,
      iconName: type === 'icon' ? 'Briefcase' : undefined,
      linkedItems: (type === 'login-list' || type === 'totp-list') ? [] : undefined,
      cardId: type === 'card' ? undefined : undefined,
    };
    updateWorkspace({ widgets: [...activeWorkspace.widgets, newWidget] });
  };

  const removeWidget = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    updateWorkspace({ widgets: activeWorkspace.widgets.filter(w => w.id !== id) });
  };

  const handleWallpaperUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          updateWorkspace({ wallpaper: event.target.result as string });
          setShowWallpaperMenu(false);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const createWorkspace = () => {
    const newWs: Workspace = {
      id: crypto.randomUUID(),
      name: 'New Workspace',
      wallpaper: null,
      widgets: []
    };
    setWorkspaces([...workspaces, newWs]);
    setActiveWorkspaceId(newWs.id);
  };

  const deleteWorkspace = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    const wsToDel = workspaces.find(w => w.id === id);
    if (!wsToDel) return;

    if (wsToDel.widgets.length === 0) {
      executeDelete(wsToDel);
    } else {
      setWorkspaceToDelete(wsToDel);
    }
  };

  const executeDelete = (wsToDel: Workspace) => {
    setDeletedWorkspace(wsToDel);
    setWorkspaceToDelete(null);
    
    if (workspaces.length <= 1) {
      const newWs: Workspace = { id: crypto.randomUUID(), name: 'My Workspace', wallpaper: null, widgets: [] };
      setWorkspaces([newWs]);
      setActiveWorkspaceId(newWs.id);
    } else {
      const newWorkspaces = workspaces.filter(w => w.id !== wsToDel.id);
      setWorkspaces(newWorkspaces);
      if (activeWorkspaceId === wsToDel.id) {
        setActiveWorkspaceId(newWorkspaces[newWorkspaces.length - 1].id);
      }
    }
    
    setTimeout(() => {
      setDeletedWorkspace(current => current?.id === wsToDel.id ? null : current);
    }, 5000);
  };

  const restoreWorkspace = () => {
    if (deletedWorkspace) {
      setWorkspaces(prev => [...prev, deletedWorkspace]);
      setActiveWorkspaceId(deletedWorkspace.id);
      setDeletedWorkspace(null);
    }
  };

  const isCustomWallpaper = activeWorkspace.wallpaper && activeWorkspace.wallpaper.startsWith('data:image');

  const folderOverlay = (() => {
        const openFolder = openFolderId ? activeWorkspace.widgets.find(w => w.id === openFolderId && w.type === 'folder') : null;
        if (!openFolder) return null;
        const children = openFolder.children || [];
        return (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm pointer-events-auto"
            onClick={(e) => { e.stopPropagation(); setOpenFolderId(null); }}
          >
            <div 
              className="bg-white/95 dark:bg-[#1A1F26]/95 rounded-3xl shadow-2xl p-6 w-80 border border-gray-200 dark:border-slate-800 animate-in zoom-in-95"
              onClick={(e) => e.stopPropagation()}
            >
              <input 
                type="text"
                value={openFolder.title}
                onChange={(e) => {
                  const v = e.target.value;
                  updateWorkspace({ widgets: activeWorkspace.widgets.map(w => w.id === openFolder.id ? { ...w, title: v } : w) });
                }}
                className="w-full text-center text-lg font-bold bg-transparent outline-none text-gray-900 dark:text-white border-b border-transparent focus:border-indigo-500 pb-1 mb-4 transition-colors"
              />
              <div className="grid grid-cols-3 gap-4">
                {children.map(c => {
                  const CIcon = ICONS[c.iconName] || Briefcase;
                  return (
                    <div key={c.id} className="relative flex flex-col items-center group/child">
                      <button 
                        onClick={() => popOutChild(openFolder.id, c.id)}
                        title="Move out of folder"
                        className="absolute -top-1.5 -right-0.5 z-10 p-0.5 opacity-0 group-hover/child:opacity-100 text-gray-500 hover:text-red-500 bg-white dark:bg-slate-800 rounded-full shadow border border-gray-200 dark:border-slate-700 transition-all"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <div className="w-12 h-12 bg-white dark:bg-slate-800 rounded-xl shadow border border-gray-200 dark:border-slate-700 flex items-center justify-center mb-1">
                        <CIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <span className="text-[10px] font-medium text-gray-700 dark:text-slate-300 truncate w-full text-center">{c.title}</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-gray-400 dark:text-slate-500 text-center mt-4">
                Drag an icon onto this folder to add it. Hover an icon and press × to move it out.
              </p>
            </div>
          </div>
        );
  })();

  
  // ---- Mobile: iOS-homescreen-style experience ---------------------------
  if (isMobile) {
    const sorted = [...activeWorkspace.widgets].sort((a, b) => (a.y - b.y) || (a.x - b.x));
    const gridWidgets = getMobileGrid();
    const stackWidgets = sorted.filter(w => w.type !== 'icon' && w.type !== 'folder');

    return (
      <div className="relative h-full w-full overflow-y-auto custom-scrollbar" onClick={() => { setShowAddWidgetMenu(false); setShowWallpaperMenu(false); }}>
        {isCustomWallpaper ? (
          <div className="fixed inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${activeWorkspace.wallpaper})` }} />
        ) : (
          <div className={`fixed inset-0 ${activeWorkspace.wallpaper || 'bg-gradient-to-br from-indigo-50 to-pink-50 dark:from-[#0F1115] dark:to-[#18122B]'}`} />
        )}

        <div className="relative z-10 p-4 pb-28">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-extrabold text-gray-900 dark:text-white bg-white/20 dark:bg-black/20 px-2 py-1 rounded backdrop-blur-sm truncate mr-3">{activeWorkspace.name}</h1>
            {editMode ? (
              <button 
                onClick={() => { setEditMode(false); setMobileDragId(null); setMobileDropTarget(null); }} 
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg shadow-lg font-bold text-sm active:scale-95 transition-transform shrink-0"
              >
                Done
              </button>
            ) : (
            <div className="relative shrink-0">
              <button 
                onClick={(e) => { e.stopPropagation(); setShowAddWidgetMenu(!showAddWidgetMenu); }} 
                className="p-2 bg-indigo-600 text-white rounded-lg shadow-lg active:scale-95 transition-transform"
              >
                <Plus className="h-5 w-5" />
              </button>
              {showAddWidgetMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-[#1A1F26] rounded-xl shadow-2xl border border-gray-200 dark:border-slate-800 overflow-hidden py-1 z-50">
                  <button onClick={() => addWidget('note')} className="w-full flex items-center px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300"><FileText className="h-4 w-4 mr-2 opacity-70" /> Sticky Note</button>
                  <button onClick={() => addWidget('icon')} className="w-full flex items-center px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300"><Briefcase className="h-4 w-4 mr-2 opacity-70" /> Shortcut Icon</button>
                  <button onClick={() => addWidget('login-list')} className="w-full flex items-center px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300"><Key className="h-4 w-4 mr-2 opacity-70" /> Login Links</button>
                  <button onClick={() => addWidget('totp-list')} className="w-full flex items-center px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300"><Clock className="h-4 w-4 mr-2 opacity-70" /> TOTP Codes</button>
                  <button onClick={() => addWidget('card')} className="w-full flex items-center px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300"><CreditCard className="h-4 w-4 mr-2 opacity-70" /> Debit Card</button>
                </div>
              )}
            </div>
            )}
          </div>

          {/* Workspace pills */}
          <div className="flex space-x-2 overflow-x-auto pb-3 custom-scrollbar">
            {workspaces.map(ws => (
              <button
                key={ws.id}
                onClick={() => setActiveWorkspaceId(ws.id)}
                className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold transition-colors shadow-sm backdrop-blur-md ${
                  activeWorkspaceId === ws.id 
                    ? 'bg-indigo-600 text-white border border-indigo-500' 
                    : 'bg-white/50 dark:bg-black/50 text-gray-700 dark:text-gray-300 border border-white/20 dark:border-white/10'
                }`}
              >
                {ws.name}
              </button>
            ))}
            <button onClick={createWorkspace} className="shrink-0 p-1 rounded-full bg-white/50 dark:bg-black/50 text-gray-700 dark:text-gray-300 border border-white/20 dark:border-white/10 shadow-sm backdrop-blur-md">
              <PlusCircle className="h-4 w-4" />
            </button>
          </div>

          {/* Homescreen icon grid */}
          {gridWidgets.length > 0 && (
            <div 
              className={`grid grid-cols-4 gap-3 mb-5 ${editMode ? 'touch-none select-none' : ''}`}
              onPointerMove={mobileGridMove}
              onPointerUp={mobileGridUp}
              onPointerLeave={mobileGridUp}
              onPointerCancel={mobileGridUp}
            >
              {gridWidgets.map(widget => {
                const isDragged = mobileDragId === widget.id;
                const isMergeTarget = mobileDropTarget?.id === widget.id && mobileDropTarget.mode === 'merge';
                const reorderEdge = mobileDropTarget?.id === widget.id && mobileDropTarget.mode !== 'merge' ? mobileDropTarget.mode : null;
                const tileClass = `relative flex flex-col items-center ${editMode ? 'msec-jiggle' : ''} ${isDragged ? 'opacity-30' : ''} ${
                  reorderEdge === 'before' ? 'shadow-[inset_3px_0_0_0_rgb(99,102,241)] rounded-l' : reorderEdge === 'after' ? 'shadow-[inset_-3px_0_0_0_rgb(99,102,241)] rounded-r' : ''
                }`;
                const removeBadge = editMode && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); if (widget.type === 'folder') { dissolveFolder(widget.id, e); } else { removeWidget(widget.id, e); } }}
                    onPointerDown={(e) => e.stopPropagation()}
                    title={widget.type === 'folder' ? 'Dissolve folder' : 'Remove icon'}
                    className="absolute -top-1.5 -left-1.5 z-20 w-5 h-5 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200 rounded-full shadow border border-gray-300 dark:border-slate-600 flex items-center justify-center leading-none text-sm font-bold"
                  >
                    –
                  </button>
                );

                if (widget.type === 'folder') {
                  const children = widget.children || [];
                  return (
                    <div 
                      key={widget.id} 
                      ref={(el) => { tileRefs.current[widget.id] = el; }}
                      onPointerDown={(e) => mobileTileDown(e, widget.id)}
                      onClick={(e) => { e.stopPropagation(); if (!editMode) setOpenFolderId(widget.id); }}
                      className={`${tileClass} ${!editMode ? 'active:scale-95 transition-transform cursor-pointer' : ''}`}
                    >
                      {removeBadge}
                      <div className={`relative w-14 h-14 bg-white/60 dark:bg-slate-800/60 rounded-2xl shadow-lg border border-gray-200 dark:border-slate-700 flex items-center justify-center mb-1 backdrop-blur-md transition-all ${isMergeTarget ? 'ring-4 ring-indigo-400 scale-110 bg-indigo-50 dark:bg-indigo-900/60' : ''}`}>
                        <div className="grid grid-cols-2 gap-1">
                          {children.slice(0, 4).map(c => {
                            const CIcon = ICONS[c.iconName] || Briefcase;
                            return <div key={c.id} className="w-5 h-5 rounded-md bg-white dark:bg-slate-700 flex items-center justify-center shadow-sm"><CIcon className="h-3 w-3 text-indigo-600 dark:text-indigo-400" /></div>;
                          })}
                        </div>
                        {children.length > 4 && <div className="absolute -bottom-1.5 -right-1.5 bg-indigo-600 text-white text-[9px] font-bold rounded-full min-w-[18px] min-h-[18px] flex items-center justify-center shadow">{children.length}</div>}
                      </div>
                      <span className="text-[10px] font-semibold text-gray-800 dark:text-indigo-50 bg-white/70 dark:bg-black/50 px-1.5 py-0.5 rounded-full backdrop-blur-md truncate max-w-full">{widget.title}</span>
                    </div>
                  );
                }
                const IconComponent = ICONS[widget.iconName || 'Briefcase'] || Briefcase;
                return (
                  <div 
                    key={widget.id} 
                    ref={(el) => { tileRefs.current[widget.id] = el; }}
                    onPointerDown={(e) => mobileTileDown(e, widget.id)}
                    className={tileClass}
                  >
                    {removeBadge}
                    <div className={`w-14 h-14 bg-white/90 dark:bg-slate-800/90 rounded-2xl shadow-lg border border-gray-200 dark:border-slate-700 flex items-center justify-center mb-1 backdrop-blur-md transition-all ${isMergeTarget ? 'ring-4 ring-indigo-400 scale-110 bg-indigo-50 dark:bg-indigo-900/60' : ''}`}>
                      <IconComponent className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <span className="text-[10px] font-semibold text-gray-800 dark:text-indigo-50 bg-white/70 dark:bg-black/50 px-1.5 py-0.5 rounded-full backdrop-blur-md truncate max-w-full">{widget.title}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Stacked widgets */}
          <div className="space-y-3">
            {stackWidgets.map(widget => {
              const removeBtn = (
                <button onClick={(e) => removeWidget(widget.id, e)} className="p-1 text-gray-400 hover:text-red-500 shrink-0">
                  <Trash2 className="h-4 w-4" />
                </button>
              );

              if (widget.type === 'note') {
                return (
                  <div key={widget.id} className={`rounded-xl shadow-lg border border-black/5 p-4 ${widget.color} ${theme === 'dark' && !widget.isDark ? 'mix-blend-luminosity opacity-90' : ''}`}>
                    <div className="flex items-center justify-between mb-2 pb-1 border-b border-black/10">
                      <div className="flex items-center space-x-2 flex-1 min-w-0">
                        <FileText className="h-3 w-3 opacity-60 shrink-0" />
                        <input type="text" value={widget.title} onChange={(e) => { const v = e.target.value; updateWorkspace({ widgets: activeWorkspace.widgets.map(w => w.id === widget.id ? { ...w, title: v } : w) }); }} className="bg-transparent border-none outline-none font-bold text-sm w-full" />
                      </div>
                      {removeBtn}
                    </div>
                    <textarea value={widget.content || ''} onChange={(e) => { const v = e.target.value; updateWorkspace({ widgets: activeWorkspace.widgets.map(w => w.id === widget.id ? { ...w, content: v } : w) }); }} className="bg-transparent border-none outline-none text-sm w-full resize-none min-h-[4rem] opacity-80" placeholder="Write here..." />
                  </div>
                );
              }

              if (widget.type === 'login-list' || widget.type === 'totp-list') {
                const isTotp = widget.type === 'totp-list';
                const linked = items.filter(i => widget.linkedItems?.includes(i.id) && (!isTotp || i.totpSecret));
                const available = isTotp
                  ? items.filter(i => i.totpSecret && !widget.linkedItems?.includes(i.id))
                  : items.filter(i => ['login', 'passkey'].includes(i.type) && !widget.linkedItems?.includes(i.id));
                const HeaderIcon = isTotp ? Clock : Key;
                return (
                  <div key={widget.id} className="rounded-xl shadow-lg border border-black/10 bg-white/90 dark:bg-[#1A1F26]/90 backdrop-blur-md overflow-hidden">
                    <div className="bg-indigo-600 px-3 py-2 text-white flex items-center justify-between">
                      <div className="flex items-center space-x-2 flex-1 min-w-0">
                        <HeaderIcon className="h-4 w-4 opacity-80 shrink-0" />
                        <input type="text" value={widget.title} onChange={(e) => updateWorkspace({ widgets: activeWorkspace.widgets.map(w => w.id === widget.id ? { ...w, title: e.target.value } : w) })} className="bg-transparent border-none outline-none font-bold text-sm w-full" />
                      </div>
                      <button onClick={(e) => removeWidget(widget.id, e)} className="p-1 text-white/70 hover:text-white shrink-0"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <div className="p-2 space-y-2">
                      {linked.map(item => (
                        <div key={item.id} className="text-sm bg-gray-50 dark:bg-slate-800 p-2 rounded-lg border border-gray-100 dark:border-slate-700 flex items-center justify-between">
                          <div className="min-w-0 pr-2 flex-1">
                            <div className="font-bold text-gray-900 dark:text-gray-100 truncate">{item.title}</div>
                            {isTotp ? (
                              <div className="text-xs font-mono text-indigo-600 dark:text-indigo-400 font-bold flex items-center space-x-2">
                                <span className="tracking-widest">{widget.content === item.id ? (generateTOTP(item.totpSecret!) || 'invalid') : '••••••'}</span>
                                {widget.content === item.id && <span className="text-[9px] text-gray-400 tabular-nums">{getTimeUntilNextTOTP()}s</span>}
                                <button onClick={() => updateWorkspace({ widgets: activeWorkspace.widgets.map(w => w.id === widget.id ? { ...w, content: w.content === item.id ? '' : item.id } : w) })} className="text-gray-400">
                                  {widget.content === item.id ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                </button>
                              </div>
                            ) : (
                              <div className="text-xs text-gray-500 truncate">{item.username || item.email}</div>
                            )}
                          </div>
                          <div className="flex items-center space-x-1 shrink-0">
                            <button 
                              onClick={() => {
                                if (isTotp) {
                                  const code = item.totpSecret ? generateTOTP(item.totpSecret) : null;
                                  if (code) copyToClipboardWithTimeout(code, settings.clipboardClearTimeoutSeconds);
                                } else {
                                  copyToClipboardWithTimeout(item.password || '', settings.clipboardClearTimeoutSeconds);
                                }
                              }}
                              className="p-1.5 text-gray-500 bg-gray-100 dark:bg-slate-700 rounded active:scale-95"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => updateWorkspace({ widgets: activeWorkspace.widgets.map(w => w.id === widget.id ? { ...w, linkedItems: w.linkedItems?.filter(id => id !== item.id) } : w) })} className="p-1.5 text-red-400 rounded active:scale-95">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {available.length > 0 && (
                        <select
                          className="text-xs w-full p-2 rounded bg-gray-100 dark:bg-slate-800 outline-none text-gray-700 dark:text-gray-300"
                          value=""
                          onChange={(e) => { if (e.target.value) updateWorkspace({ widgets: activeWorkspace.widgets.map(w => w.id === widget.id ? { ...w, linkedItems: [...(w.linkedItems || []), e.target.value] } : w) }); }}
                        >
                          <option value="" disabled>{isTotp ? '+ Add TOTP Code...' : '+ Add Item...'}</option>
                          {available.map(i => <option key={i.id} value={i.id}>{i.title}</option>)}
                        </select>
                      )}
                    </div>
                  </div>
                );
              }

              if (widget.type === 'card') {
                const linkedCard = items.find(i => i.id === widget.cardId);
                return (
                  <div key={widget.id} className={`rounded-xl shadow-lg p-5 text-white relative overflow-hidden ${widget.color || 'bg-gradient-to-tr from-rose-500 to-pink-600'}`}>
                    <div className="opacity-20 absolute -right-10 -top-10 w-32 h-32 rounded-full border-4 border-white"></div>
                    <div className="flex justify-between items-start relative z-10">
                      <div className="font-bold">{linkedCard ? (linkedCard.bankName || linkedCard.cardIssuer || 'Bank Card') : 'Select a card on desktop'}</div>
                      <button onClick={(e) => removeWidget(widget.id, e)} className="p-1 text-white/60 hover:text-white"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    {linkedCard && (
                      <div className="relative z-10 mt-5">
                        <div className="text-lg font-mono tracking-[0.2em] flex items-center space-x-2">
                          {widget.isDark ? (
                            <span>{linkedCard.cardNumber?.replace(/(.{4})/g, '$1 ').trim() || 'XXXX XXXX XXXX XXXX'}</span>
                          ) : (
                            <>
                              <span>•••• •••• •••• {linkedCard.cardNumber?.slice(-4) || 'XXXX'}</span>
                              <button onClick={() => updateWorkspace({ widgets: activeWorkspace.widgets.map(w => w.id === widget.id ? { ...w, isDark: true } : w) })} className="text-white/50"><Eye className="h-4 w-4" /></button>
                            </>
                          )}
                        </div>
                        <div className="flex justify-between mt-3 text-xs uppercase opacity-80 font-mono">
                          <span className="truncate max-w-[150px]">{linkedCard.cardholderName || 'Cardholder'}</span>
                          <span>{linkedCard.cardExpiry || 'MM/YY'}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }
              return null;
            })}
          </div>
        </div>
        {/* Floating clone of the tile being dragged */}
        {mobileDragId && (() => {
          const w = activeWorkspace.widgets.find(x => x.id === mobileDragId);
          if (!w) return null;
          const CIcon = ICONS[w.iconName || 'Briefcase'] || Briefcase;
          return (
            <div className="fixed z-[70] pointer-events-none -translate-x-1/2 -translate-y-1/2" style={{ left: mobileDragPos.x, top: mobileDragPos.y }}>
              <div className="w-14 h-14 bg-white/95 dark:bg-slate-800/95 rounded-2xl shadow-2xl border border-indigo-300 dark:border-indigo-700 flex items-center justify-center scale-110">
                {w.type === 'folder' ? (
                  <div className="grid grid-cols-2 gap-1">
                    {(w.children || []).slice(0, 4).map(c => {
                      const FIcon = ICONS[c.iconName] || Briefcase;
                      return <div key={c.id} className="w-5 h-5 rounded-md bg-white dark:bg-slate-700 flex items-center justify-center shadow-sm"><FIcon className="h-3 w-3 text-indigo-600 dark:text-indigo-400" /></div>;
                    })}
                  </div>
                ) : (
                  <CIcon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                )}
              </div>
            </div>
          );
        })()}
        {folderOverlay}
      </div>
    );
  }

  return (
    <div 
       className="relative h-full w-full overflow-hidden select-none touch-none transition-colors"
       onPointerDown={(e) => {
         if (e.pointerType === 'touch') {
           const clientX = e.clientX;
           const clientY = e.clientY;
           if ((e.target as HTMLElement).closest('.pointer-events-auto')) return;
           longPressTimerRef.current = setTimeout(() => {
             setContextMenu({ x: clientX, y: clientY, type: 'dashboard' });
           }, 500);
         }
       }}
       onPointerMove={handlePointerMove}
       onPointerUp={handlePointerUp}
       onPointerLeave={handlePointerUp}
       onPointerCancel={handlePointerUp}
       onContextMenu={(e) => handleContextMenu(e, 'dashboard')}
       onClick={() => {
         setShowWallpaperMenu(false);
         setShowAddWidgetMenu(false);
         setContextMenu(null);
       }}
    >
      {/* Background layer */}
      {isCustomWallpaper ? (
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${activeWorkspace.wallpaper})` }} />
      ) : (
        <div className={`absolute inset-0 ${activeWorkspace.wallpaper || 'bg-gradient-to-br from-indigo-50 to-pink-50 dark:from-[#0F1115] dark:to-[#18122B]'}`} />
      )}
      
      {!isCustomWallpaper && (
        <div className="absolute inset-0 bg-grid-slate-200/50 dark:bg-grid-slate-900/50 [mask-image:linear-gradient(0deg,transparent,black)] pointer-events-none"></div>
      )}

      {/* Header Info */}
      <div className="absolute top-6 left-8 z-20 flex flex-col space-y-3">
        <div className="flex items-center space-x-4 pointer-events-auto">
          {isRenaming ? (
            <form onSubmit={handleNameEditSubmit} className="flex">
              <input
                autoFocus
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleNameEditSubmit}
                className="text-3xl font-extrabold bg-white/20 dark:bg-black/20 text-gray-900 dark:text-white px-2 py-1 rounded outline-none border border-indigo-500/50"
              />
            </form>
          ) : (
            <h1 
              onClick={() => { setEditName(activeWorkspace.name); setIsRenaming(true); }}
              className="text-3xl font-extrabold text-gray-900 dark:text-white flex items-center shadow-sm cursor-pointer hover:opacity-80 transition-opacity bg-white/20 dark:bg-black/20 px-2 py-1 rounded backdrop-blur-sm"
              title="Click to rename"
            >
              {activeWorkspace.name}
            </h1>
          )}
        </div>
        
        {/* Workspace selector tabs */}
        <div className="flex space-x-2 pointer-events-auto overflow-x-auto pb-2 custom-scrollbar">
          {workspaces.map(ws => (
            <div
              key={ws.id}
              onClick={() => setActiveWorkspaceId(ws.id)}
              className={`flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-bold transition-colors shadow-sm backdrop-blur-md cursor-pointer ${
                activeWorkspaceId === ws.id 
                  ? 'bg-indigo-600 text-white border border-indigo-500' 
                  : 'bg-white/50 dark:bg-black/50 text-gray-700 dark:text-gray-300 border border-white/20 dark:border-white/10 hover:bg-white/70 dark:hover:bg-black/70'
              }`}
            >
              <span>{ws.name}</span>
              {activeWorkspaceId === ws.id && workspaces.length > 1 && (
                <button 
                  onClick={(e) => deleteWorkspace(ws.id, e)}
                  title="Delete Workspace"
                  className="p-0.5 rounded-full hover:bg-indigo-700 transition-colors opacity-70 hover:opacity-100 flex items-center justify-center -mr-1"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          <button 
            onClick={createWorkspace}
            className="p-1 rounded-full bg-white/50 dark:bg-black/50 text-gray-700 dark:text-gray-300 border border-white/20 dark:border-white/10 hover:bg-white/70 dark:hover:bg-black/70 transition-colors shadow-sm backdrop-blur-md"
            title="New Workspace"
          >
            <PlusCircle className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="absolute top-6 right-8 z-20 flex space-x-3 pointer-events-auto">
         {/* Wallpaper Toggle */}
         <div className="relative">
           <button 
             onClick={(e) => { e.stopPropagation(); setShowWallpaperMenu(!showWallpaperMenu); setShowAddWidgetMenu(false); }}
             className="flex items-center justify-center p-2 bg-white/50 dark:bg-black/50 backdrop-blur-md rounded-lg shadow-sm border border-white/20 dark:border-white/10 text-gray-700 dark:text-white hover:bg-white/80 dark:hover:bg-black/70 transition-all active:scale-95"
             title="Change Wallpaper"
           >
             <ImageIcon className="h-5 w-5" />
           </button>
           
           {showWallpaperMenu && (
             <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-[#1A1F26] rounded-xl shadow-2xl border border-gray-200 dark:border-slate-800 overflow-hidden py-1 z-50">
               <div className="px-3 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-slate-800">
                 Wallpapers
               </div>
               {BUILT_IN_WALLPAPERS.map(wp => (
                 <button 
                   key={wp.id}
                   onClick={() => { updateWorkspace({ wallpaper: wp.value }); setShowWallpaperMenu(false); }}
                   className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                 >
                   {wp.name}
                 </button>
               ))}
               <div className="border-t border-gray-100 dark:border-slate-800 mt-1 pt-1">
                 <button 
                   onClick={() => fileInputRef.current?.click()}
                   className="w-full text-left px-4 py-2 text-sm text-indigo-600 dark:text-indigo-400 font-medium hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                 >
                   Upload Image...
                 </button>
                 <input type="file" ref={fileInputRef} onChange={handleWallpaperUpload} accept="image/*" className="hidden" />
               </div>
             </div>
           )}
         </div>

         {/* Add Widget Toggle */}
         <div className="relative">
           <button 
              onClick={(e) => { e.stopPropagation(); setShowAddWidgetMenu(!showAddWidgetMenu); setShowWallpaperMenu(false); }}
              className="flex items-center space-x-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow-lg font-medium transition-all active:scale-95 border border-indigo-500"
           >
              <Plus className="h-4 w-4" />
              <span>Add Widget</span>
           </button>

           {showAddWidgetMenu && (
             <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-[#1A1F26] rounded-xl shadow-2xl border border-gray-200 dark:border-slate-800 overflow-hidden py-1 z-50">
               <button onClick={() => addWidget('note')} className="w-full flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors">
                  <FileText className="h-4 w-4 mr-2 opacity-70" /> Sticky Note
               </button>
               <button onClick={() => addWidget('icon')} className="w-full flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors">
                  <Briefcase className="h-4 w-4 mr-2 opacity-70" /> Shortcut Icon
               </button>
               <button onClick={() => addWidget('login-list')} className="w-full flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors">
                  <Key className="h-4 w-4 mr-2 opacity-70" /> Login Links
               </button>
               <button onClick={() => addWidget('totp-list')} className="w-full flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors">
                  <Clock className="h-4 w-4 mr-2 opacity-70" /> TOTP Codes
               </button>
               <button onClick={() => addWidget('card')} className="w-full flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors">
                  <CreditCard className="h-4 w-4 mr-2 opacity-70" /> Debit Card
               </button>
             </div>
           )}
         </div>
      </div>

      {/* Sandbox Area */}
      <div className="absolute inset-0 w-full h-full pointer-events-none">
        {activeWorkspace.widgets.map((widget) => {
          if (widget.type === 'note') {
            return (
              <div 
                key={widget.id}
                onPointerDown={(e) => handlePointerDown(e, widget.id)}
                onContextMenu={(e) => handleContextMenu(e, 'widget', widget.id)}
                className={`absolute p-4 rounded-lg shadow-xl border border-black/5 flex flex-col pointer-events-auto group
                  w-56 transform transition-transform ${draggingId === widget.id ? 'scale-105 z-50 cursor-grabbing shadow-2xl' : 'hover:scale-105 cursor-grab z-10'} 
                  backdrop-blur-sm ${widget.color} ${theme === 'dark' && !widget.isDark ? 'mix-blend-luminosity opacity-90' : ''}`}
                style={{ top: widget.y, left: widget.x }}
              >
                <div className="flex items-center justify-between mb-2 pb-1 border-b border-black/10">
                  <div className="font-bold flex items-center space-x-2 w-full pr-6">
                     <FileText className="h-3 w-3 opacity-60 flex-shrink-0" />
                     <input 
                       type="text" 
                       value={widget.title}
                       onChange={(e) => {
                         const v = e.target.value;
                         updateWorkspace({ widgets: activeWorkspace.widgets.map(w => w.id === widget.id ? { ...w, title: v } : w) });
                       }}
                       className="bg-transparent border-none outline-none font-bold text-sm w-full"
                     />
                  </div>
                  <div className="flex space-x-1 absolute top-3 right-3 items-center">
                    <button onClick={(e) => { e.stopPropagation(); updateWorkspace({ widgets: activeWorkspace.widgets.map(w => w.id === widget.id ? { ...w, isCollapsed: !w.isCollapsed } : w) }); }} className="opacity-40 hover:opacity-100 p-1 transition-opacity pointer-events-auto">
                       {widget.isCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                    </button>
                    <button onClick={(e) => removeWidget(widget.id, e)} className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-black/50 hover:text-black transition-opacity">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                {!widget.isCollapsed && (
                  <div className="opacity-80 flex-1">
                    <textarea 
                      value={widget.content || ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateWorkspace({ widgets: activeWorkspace.widgets.map(w => w.id === widget.id ? { ...w, content: v } : w) });
                      }}
                      className="bg-transparent border-none outline-none text-sm w-full h-full resize-none min-h-[4rem]"
                      placeholder="Write here..."
                    />
                  </div>
                )}
              </div>
            );
          }
          
          if (widget.type === 'login-list') {
            const linkedItemsData = items.filter(i => widget.linkedItems?.includes(i.id));
            const availableItems = items.filter(i => ['login', 'passkey'].includes(i.type) && !widget.linkedItems?.includes(i.id));
            return (
              <div 
                key={widget.id}
                onContextMenu={(e) => handleContextMenu(e, 'widget', widget.id)}
                className={`absolute p-0 rounded-xl shadow-xl border border-black/10 flex flex-col pointer-events-auto bg-white/90 dark:bg-[#1A1F26]/90 backdrop-blur-md overflow-hidden
                  w-64 transform transition-transform ${draggingId === widget.id ? 'z-50 cursor-grabbing shadow-2xl scale-[1.02]' : 'z-10'}`}
                style={{ top: widget.y, left: widget.x }}
              >
                <div 
                  onPointerDown={(e) => handlePointerDown(e, widget.id)}
                  className="bg-indigo-600 px-3 py-2 text-white flex items-center justify-between cursor-grab active:cursor-grabbing"
                >
                  <div className="flex items-center space-x-2 w-full pr-2">
                     <Key className="h-4 w-4 opacity-80" />
                     <input 
                       type="text" value={widget.title}
                       onChange={(e) => updateWorkspace({ widgets: activeWorkspace.widgets.map(w => w.id === widget.id ? { ...w, title: e.target.value } : w) })}
                       className="bg-transparent border-none outline-none font-bold text-sm w-full outline-indigo-400 rounded transition-colors px-1 -ml-1"
                     />
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); updateWorkspace({ widgets: activeWorkspace.widgets.map(w => w.id === widget.id ? { ...w, isCollapsed: !w.isCollapsed } : w) }); }} className="opacity-70 hover:opacity-100 p-1 transition-opacity pointer-events-auto hover:bg-white/10 rounded">
                     {widget.isCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                  </button>
                </div>
                {!widget.isCollapsed && (
                  <div className="p-2 max-h-48 overflow-y-auto custom-scrollbar flex flex-col space-y-2">
                    {linkedItemsData.map(item => (
                    <div key={item.id} className="text-sm bg-gray-50 dark:bg-slate-800 p-2 rounded-lg border border-gray-100 dark:border-slate-700 relative group">
                      <div className="font-bold text-gray-900 dark:text-gray-100 truncate pr-5">{item.title}</div>
                      <div className="text-xs text-gray-500 truncate" title={item.username || item.email}>{item.username || item.email}</div>
                      <div className="flex space-x-1 mt-1">
                        <button onClick={() => { copyToClipboardWithTimeout(item.password || '', settings.clipboardClearTimeoutSeconds); }} className="px-2 py-0.5 bg-gray-200 dark:bg-slate-700 rounded text-[10px] hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors">Copy Pwd</button>
                        {item.totpSecret && <button onClick={() => { 
                          /* Copy TOTP somehow, wait we need TOTP logic, let's just make it a mock for now or use the go to functionality */
                          setActiveCategory('all'); setSelectedItemId(item.id);
                        }} className="px-2 py-0.5 bg-gray-200 dark:bg-slate-700 rounded text-[10px] hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors">GoTo</button>}
                        <button onClick={() => updateWorkspace({ widgets: activeWorkspace.widgets.map(w => w.id === widget.id ? { ...w, linkedItems: w.linkedItems?.filter(id => id !== item.id) } : w) })} className="px-2 py-0.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-[10px] ml-auto">Remove</button>
                      </div>
                    </div>
                  ))}
                  {availableItems.length > 0 && (
                    <select
                      className="text-xs w-full p-2 rounded bg-gray-100 dark:bg-slate-800 outline-none text-gray-700 dark:text-gray-300 cursor-pointer"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) {
                          const newLinked = [...(widget.linkedItems || []), e.target.value];
                          updateWorkspace({ widgets: activeWorkspace.widgets.map(w => w.id === widget.id ? { ...w, linkedItems: newLinked } : w) });
                        }
                      }}
                    >
                      <option value="" disabled>+ Add Item...</option>
                      {availableItems.map(i => <option key={i.id} value={i.id}>{i.title}</option>)}
                    </select>
                  )}
                </div>
                )}
              </div>
            );
          }

          if (widget.type === 'card') {
            const linkedCard = items.find(i => i.id === widget.cardId);
            const isFlipped = widget.content === 'flipped' && !widget.isCollapsed;
            
            return (
              <div 
                key={widget.id}
                onContextMenu={(e) => handleContextMenu(e, 'widget', widget.id)}
                className={`absolute pointer-events-auto transform transition-transform ${draggingId === widget.id ? 'z-50 scale-[1.02] shadow-2xl' : 'z-10'}`}
                style={{ top: widget.y, left: widget.x, width: widget.w || 320, height: widget.isCollapsed ? 64 : (widget.h || 200), perspective: '1000px' }}
              >
                 {!linkedCard ? (
                   <div 
                     onPointerDown={(e) => handlePointerDown(e, widget.id)}
                     className="w-full h-full bg-slate-800 rounded-xl shadow-xl p-4 flex flex-col border border-slate-700 cursor-grab active:cursor-grabbing text-white"
                   >
                     <div className="font-bold flex items-center mb-4 text-slate-300"><CreditCard className="mr-2 h-5 w-5" /> Select Card</div>
                     <div className="overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                       {items.filter(i => i.type === 'card').map(i => (
                         <button 
                           key={i.id}
                           onPointerDown={(e) => e.stopPropagation()}
                           onClick={() => updateWorkspace({ widgets: activeWorkspace.widgets.map(w => w.id === widget.id ? { ...w, cardId: i.id } : w) })}
                           className="w-full p-2 bg-slate-900 hover:bg-slate-700 rounded-lg flex flex-col items-start transition-colors border border-slate-700 pointer-events-auto"
                         >
                           <div className="font-bold text-[13px] truncate flex items-center w-full">
                             <CreditCard className="mr-2 w-3.5 h-3.5 opacity-60 flex-shrink-0" />
                             [{i.cardIssuer || 'Card'}] {i.title}
                           </div>
                           {i.bankName && <div className="text-[10px] text-white/50 ml-5.5 uppercase tracking-wider">{i.bankName}</div>}
                         </button>
                       ))}
                       {items.filter(i => i.type === 'card').length === 0 && (
                         <div className="text-xs text-slate-400 text-center mt-4">No cards found.</div>
                       )}
                     </div>
                   </div>
                 ) : (
                   <div 
                     className={`w-full h-full relative transition-all duration-500 transform-style-preserve-3d ${isFlipped ? 'rotate-y-180' : ''}`}
                     onPointerDown={(e) => handlePointerDown(e, widget.id)}
                   >
                     {/* FRONT OF CARD */}
                     <div 
                       className={`absolute w-full h-full rounded-xl shadow-xl ${widget.isCollapsed ? 'p-4' : 'p-6'} flex flex-col justify-between backface-hidden cursor-grab active:cursor-grabbing ${widget.color || 'bg-gradient-to-tr from-rose-500 to-pink-600'} text-white overflow-hidden transition-all duration-300`}
                     >
                       <div className="opacity-20 absolute -right-10 -top-10 w-32 h-32 rounded-full border-4 border-white"></div>
                       <div className="flex justify-between items-start z-10 w-full">
                         <div className="font-bold text-lg flex items-center space-x-2">
                            <span>{linkedCard.bankName || linkedCard.cardIssuer || 'Bank Card'}</span>
                            {widget.isCollapsed && <span className="opacity-50 text-sm ml-2 font-mono">••{linkedCard.cardNumber?.slice(-4) || 'XXXX'}</span>}
                         </div>
                         <div className="flex space-x-1">
                           <button onClick={(e) => { e.stopPropagation(); updateWorkspace({ widgets: activeWorkspace.widgets.map(w => w.id === widget.id ? { ...w, isCollapsed: !w.isCollapsed } : w) }); }} className="p-1 hover:bg-black/10 rounded cursor-pointer pointer-events-auto">
                              {widget.isCollapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
                           </button>
                           {!widget.isCollapsed && <button onClick={(e) => { e.stopPropagation(); updateWorkspace({ widgets: activeWorkspace.widgets.map(w => w.id === widget.id ? { ...w, content: 'flipped', isDark: false } : w) }) }} className="p-1 hover:bg-black/10 rounded cursor-pointer pointer-events-auto"><CreditCard className="h-5 w-5" /></button>}
                         </div>
                       </div>
                       {!widget.isCollapsed && (
                       <div className="z-10 w-full flex-1 flex flex-col justify-end mt-4">
                         {widget.isDark ? (
                           <div className="text-xl font-mono tracking-[0.2em] mb-2">{linkedCard.cardNumber?.replace(/(.{4})/g, '$1 ').trim() || 'XXXX XXXX XXXX XXXX'}</div>
                         ) : (
                           <div className="text-xl font-mono tracking-[0.2em] mb-2 select-none flex items-center space-x-2">
                             <span>••••</span><span>••••</span><span>••••</span>
                             <span>{linkedCard.cardNumber?.slice(-4) || 'XXXX'}</span>
                             <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); updateWorkspace({ widgets: activeWorkspace.widgets.map(w => w.id === widget.id ? { ...w, isDark: true } : w) }) }} className="ml-2 text-white/50 hover:text-white cursor-pointer pointer-events-auto"><Eye className="h-4 w-4" /></button>
                           </div>
                         )}
                         <div className="flex justify-between items-end mt-2 text-xs uppercase opacity-80 font-mono tracking-wider">
                           <div className="flex flex-col">
                             <span className="text-[8px] opacity-60 mb-0.5">Cardholder</span>
                             <span className="truncate max-w-[120px]">{linkedCard.cardholderName || 'Cardholder'}</span>
                           </div>
                           <div className="flex space-x-4">
                              {linkedCard.cardStartDate && (
                                <div className="flex flex-col items-center">
                                  <span className="text-[8px] opacity-60 mb-0.5">Valid From</span>
                                  <span>{linkedCard.cardStartDate}</span>
                                </div>
                              )}
                              <div className="flex flex-col items-center">
                                <span className="text-[8px] opacity-60 mb-0.5">Expires</span>
                                <span>{linkedCard.cardExpiry || 'MM/YY'}</span>
                              </div>
                           </div>
                         </div>
                       </div>
                       )}
                     </div>
                     
                     {/* BACK OF CARD */}
                     <div 
                       className={`absolute w-full h-full rounded-xl shadow-xl flex flex-col backface-hidden rotate-y-180 cursor-grab active:cursor-grabbing ${widget.color || 'bg-gradient-to-tr from-rose-500 to-pink-600'} text-white`}
                     >
                       <div className="w-full h-10 bg-black mt-4 opacity-30"></div>
                       <div className="px-4 py-2 flex-1 flex flex-col justify-center">
                         <div className="bg-white/90 text-black p-2 rounded flex justify-end items-center font-mono space-x-4 mb-2">
                           <span className="opacity-50 text-[10px] italic flex-1 pl-1">Authorized Signature</span>
                           {widget.isDark ? (
                             <span className="font-bold tracking-widest">{linkedCard.cardCvv || 'XXX'}</span>
                           ) : (
                             <span className="font-bold select-none flex items-center space-x-2">
                               <span>•••</span>
                               <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); updateWorkspace({ widgets: activeWorkspace.widgets.map(w => w.id === widget.id ? { ...w, isDark: true } : w) }) }} className="text-black/50 hover:text-black cursor-pointer pointer-events-auto"><Eye className="h-4 w-4" /></button>
                             </span>
                           )}
                         </div>
                         {(linkedCard.cardAccount || linkedCard.cardSortCode) && (
                           <div className="flex justify-between items-center px-1 mb-2 text-[10px] font-mono opacity-80">
                             {linkedCard.cardSortCode && <div>SC: {linkedCard.cardSortCode}</div>}
                             {linkedCard.cardAccount && <div>ACC: {linkedCard.cardAccount}</div>}
                           </div>
                         )}
                         <button onClick={(e) => { e.stopPropagation(); updateWorkspace({ widgets: activeWorkspace.widgets.map(w => w.id === widget.id ? { ...w, content: 'front', isDark: false } : w) }) }} className="text-xs bg-black/20 hover:bg-black/30 w-fit px-3 py-1 rounded mx-auto cursor-pointer pointer-events-auto">Flip to Front</button>
                       </div>
                     </div>
                   </div>
                 )}
                 <div className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 rounded-tl-xl rounded-br-xl z-20 flex flex-col justify-end items-end p-1 transition-colors" onPointerDown={(e) => {
                   handlePointerDown(e, widget.id, true);
                 }}>
                   <div className="w-2.5 h-[1px] bg-white/50 mb-[2px]"></div>
                   <div className="w-1.5 h-[1px] bg-white/50 mb-[2px]"></div>
                 </div>
              </div>
            );
          }
          if (widget.type === 'totp-list') {
            const linkedItemsData = items.filter(i => widget.linkedItems?.includes(i.id) && i.totpSecret);
            const availableItems = items.filter(i => i.totpSecret && !widget.linkedItems?.includes(i.id));
            const totpTimer = getTimeUntilNextTOTP();
            return (
              <div 
                key={widget.id}
                onContextMenu={(e) => handleContextMenu(e, 'widget', widget.id)}
                className={`absolute p-0 rounded-xl shadow-xl border border-black/10 flex flex-col pointer-events-auto bg-white/90 dark:bg-[#1A1F26]/90 backdrop-blur-md overflow-hidden
                  w-64 transform transition-transform ${draggingId === widget.id ? 'z-50 cursor-grabbing shadow-2xl scale-[1.02]' : 'z-10'}`}
                style={{ top: widget.y, left: widget.x }}
              >
                <div 
                  onPointerDown={(e) => handlePointerDown(e, widget.id)}
                  className="bg-indigo-600 px-3 py-2 text-white flex items-center justify-between cursor-grab active:cursor-grabbing"
                >
                  <div className="flex items-center space-x-2 w-full pr-2">
                     <Clock className="h-4 w-4 opacity-80" />
                     <input 
                       type="text" value={widget.title}
                       onChange={(e) => updateWorkspace({ widgets: activeWorkspace.widgets.map(w => w.id === widget.id ? { ...w, title: e.target.value } : w) })}
                       className="bg-transparent border-none outline-none font-bold text-sm w-full outline-indigo-400 rounded transition-colors px-1 -ml-1"
                     />
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); updateWorkspace({ widgets: activeWorkspace.widgets.map(w => w.id === widget.id ? { ...w, isCollapsed: !w.isCollapsed } : w) }); }} className="opacity-70 hover:opacity-100 p-1 transition-opacity pointer-events-auto hover:bg-white/10 rounded">
                     {widget.isCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                  </button>
                </div>
                {!widget.isCollapsed && (
                <div className="p-2 max-h-48 overflow-y-auto custom-scrollbar flex flex-col space-y-2">
                  {linkedItemsData.map(item => (
                    <div key={item.id} className="text-sm bg-gray-50 dark:bg-slate-800 p-2 rounded-lg border border-gray-100 dark:border-slate-700 relative flex justify-between items-center group">
                      <div className="min-w-0 pr-2">
                         <div className="font-bold text-gray-900 dark:text-gray-100 truncate">{item.title}</div>
                         <div className="text-xs font-mono text-indigo-600 dark:text-indigo-400 font-bold truncate flex items-center space-x-2">
                           <span className="tracking-widest">{widget.content === item.id ? (generateTOTP(item.totpSecret!) || 'invalid') : '••••••'}</span>
                           {widget.content === item.id && <span className="text-[9px] text-gray-400 tabular-nums">{totpTimer}s</span>}
                           <button onClick={() => updateWorkspace({ widgets: activeWorkspace.widgets.map(w => w.id === widget.id ? { ...w, content: w.content === item.id ? '' : item.id } : w) })} className="text-gray-400 hover:text-indigo-600">
                             {widget.content === item.id ? <EyeOff className="h-3 w-3 inline" /> : <Eye className="h-3 w-3 inline" />}
                           </button>
                         </div>
                      </div>
                      <div className="flex space-x-1">
                        <button onClick={() => { const code = item.totpSecret ? generateTOTP(item.totpSecret) : null; if (code) copyToClipboardWithTimeout(code, settings.clipboardClearTimeoutSeconds); }} className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:bg-gray-200 dark:hover:bg-slate-600 rounded transition-opacity" title="Copy code">
                           <Copy className="h-3 w-3" />
                        </button>
                        <button onClick={() => updateWorkspace({ widgets: activeWorkspace.widgets.map(w => w.id === widget.id ? { ...w, linkedItems: w.linkedItems?.filter(id => id !== item.id) } : w) })} className="opacity-0 group-hover:opacity-100 p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-opacity" title="Remove">
                           <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {availableItems.length > 0 && (
                    <select
                      className="text-xs w-full p-2 rounded bg-gray-100 dark:bg-slate-800 outline-none text-gray-700 dark:text-gray-300 cursor-pointer"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) {
                          const newLinked = [...(widget.linkedItems || []), e.target.value];
                          updateWorkspace({ widgets: activeWorkspace.widgets.map(w => w.id === widget.id ? { ...w, linkedItems: newLinked } : w) });
                        }
                      }}
                    >
                      <option value="" disabled>+ Add TOTP Code...</option>
                      {availableItems.map(i => <option key={i.id} value={i.id}>{i.title}</option>)}
                    </select>
                  )}
                </div>
                )}
              </div>
            );
          }

          if (widget.type === 'folder') {
            const isTarget = dropTargetId === widget.id;
            const children = widget.children || [];
            return (
              <div 
                key={widget.id}
                onPointerDown={(e) => handlePointerDown(e, widget.id)}
                onContextMenu={(e) => handleContextMenu(e, 'widget', widget.id)}
                onClick={(e) => { e.stopPropagation(); if (!dragMovedRef.current) setOpenFolderId(widget.id); }}
                className={`absolute flex flex-col items-center justify-center p-3 rounded-2xl transition-colors pointer-events-auto
                  cursor-grab active:cursor-grabbing w-28 text-center group ${draggingId === widget.id ? 'z-50' : 'z-10 hover:bg-white/40 dark:hover:bg-black/40'}`}
                style={{ top: widget.y, left: widget.x }}
              >
                <button onClick={(e) => dissolveFolder(widget.id, e)} title="Dissolve folder (icons return to the canvas)" className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 flex items-center justify-center text-red-500 bg-white dark:bg-slate-800 rounded-full shadow-sm z-20 hover:scale-110 transition-all">
                  <X className="h-3 w-3" />
                </button>
                <div className={`relative w-14 h-14 bg-white/60 dark:bg-slate-800/60 rounded-2xl shadow-lg border border-gray-200 dark:border-slate-700 flex items-center justify-center mb-2 group-hover:shadow-xl transition-all group-hover:-translate-y-1 backdrop-blur-md ${isTarget ? 'ring-4 ring-indigo-400 scale-110 bg-indigo-50 dark:bg-indigo-900/60' : ''}`}>
                  <div className="grid grid-cols-2 gap-1">
                    {children.slice(0, 4).map(c => {
                      const CIcon = ICONS[c.iconName] || Briefcase;
                      return (
                        <div key={c.id} className="w-5 h-5 rounded-md bg-white dark:bg-slate-700 flex items-center justify-center shadow-sm">
                          <CIcon className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                        </div>
                      );
                    })}
                  </div>
                  {children.length > 4 && (
                    <div className="absolute -bottom-1.5 -right-1.5 bg-indigo-600 text-white text-[9px] font-bold rounded-full w-4.5 h-4.5 min-w-[18px] min-h-[18px] flex items-center justify-center shadow">
                      {children.length}
                    </div>
                  )}
                </div>
                <input 
                  type="text"
                  value={widget.title}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateWorkspace({ widgets: activeWorkspace.widgets.map(w => w.id === widget.id ? { ...w, title: v } : w) });
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs font-semibold text-gray-800 dark:text-indigo-50 bg-white/80 dark:bg-black/60 px-2 py-0.5 rounded-full backdrop-blur-md border border-white/20 truncate w-full outline-none text-center outline-indigo-500 transition-colors"
                />
              </div>
            );
          }

          if (widget.type === 'icon') {
            const IconComponent = ICONS[widget.iconName || 'Briefcase'] || Briefcase;
            return (
              <div 
                key={widget.id}
                onPointerDown={(e) => handlePointerDown(e, widget.id)}
                onContextMenu={(e) => handleContextMenu(e, 'widget', widget.id)}
                className={`absolute flex flex-col items-center justify-center p-3 rounded-2xl transition-colors pointer-events-auto
                  cursor-grab active:cursor-grabbing w-28 text-center group ${draggingId === widget.id ? 'z-50' : 'z-10 hover:bg-white/40 dark:hover:bg-black/40'}`}
                style={{ top: widget.y, left: widget.x }}
              >
                <button onClick={(e) => removeWidget(widget.id, e)} className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 flex items-center justify-center text-red-500 bg-white dark:bg-slate-800 rounded-full shadow-sm z-20 hover:scale-110 transition-all">
                  <Trash2 className="h-3 w-3" />
                </button>
                <div className={`w-14 h-14 bg-white/90 dark:bg-slate-800/90 rounded-2xl shadow-lg border border-gray-200 dark:border-slate-700 flex items-center justify-center mb-2 group-hover:shadow-xl transition-all group-hover:-translate-y-1 backdrop-blur-md ${dropTargetId === widget.id ? 'ring-4 ring-indigo-400 scale-110 bg-indigo-50 dark:bg-indigo-900/60' : ''}`}>
                   <IconComponent className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <input 
                  type="text"
                  value={widget.title}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateWorkspace({ widgets: activeWorkspace.widgets.map(w => w.id === widget.id ? { ...w, title: v } : w) });
                  }}
                  className="text-xs font-semibold text-gray-800 dark:text-indigo-50 bg-white/80 dark:bg-black/60 px-2 py-0.5 rounded-full backdrop-blur-md border border-white/20 truncate w-full outline-none text-center outline-indigo-500 transition-colors"
                />
              </div>
            );
          }
          return null;
        })}
      </div>

      {folderOverlay}

      {/* Toast Notification */}
      {deletedWorkspace && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center space-x-3 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-2xl animate-in slide-in-from-bottom-5 pointer-events-auto">
           <Trash2 className="h-5 w-5 text-gray-400" />
           <div className="text-sm">
             <span className="font-semibold text-gray-300">Workspace deleted:</span> {deletedWorkspace.name}
           </div>
           <button 
             onClick={restoreWorkspace}
             className="ml-4 px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-xs font-bold transition-colors"
           >
             Undo
           </button>
           <button onClick={() => setDeletedWorkspace(null)} className="p-1 hover:bg-white/10 rounded ml-2">
             <X className="h-4 w-4" />
           </button>
        </div>
      )}

      {/* Confirmation Modal */}
      {workspaceToDelete && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm pointer-events-auto">
          <div className="bg-white dark:bg-[#1A1F26] rounded-2xl shadow-2xl max-w-md w-full p-6 border border-gray-200 dark:border-slate-800 animate-in zoom-in-95">
             <div className="flex items-center space-x-3 text-red-500 mb-4">
               <ShieldAlert className="h-8 w-8" />
               <h2 className="text-xl font-bold text-gray-900 dark:text-white">Delete Workspace?</h2>
             </div>
             <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
               This workspace contains <strong>{workspaceToDelete.widgets.length} widgets</strong>. Are you sure you want to permanently delete it?
             </p>
             <div className="flex flex-col space-y-3">
               <button 
                 onClick={() => executeDelete(workspaceToDelete)}
                 className="w-full py-3 bg-red-500 hover:bg-red-600 focus:bg-red-700 text-white font-bold rounded-xl transition-colors shadow-sm"
               >
                 YES - I KNOW WHAT I AM DOING
               </button>
               <button 
                 onClick={() => setWorkspaceToDelete(null)}
                 className="w-full py-3 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-900 dark:text-white font-bold rounded-xl transition-colors"
               >
                 NO
               </button>
             </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="fixed z-[100] w-56 bg-white dark:bg-[#1A1F26] rounded-xl shadow-2xl border border-gray-200 dark:border-slate-800 py-1 overflow-hidden pointer-events-auto text-left"
          style={{ 
            top: Math.min(contextMenu.y, window.innerHeight - (contextMenu.type === 'dashboard' ? 220 : 180)), 
             left: Math.min(contextMenu.x, window.innerWidth - 224) 
          }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {contextMenu.type === 'dashboard' ? (
            <>
               <div className="px-3 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-slate-800 mb-1">Add Widget</div>
               <button onClick={() => addWidget('note', contextMenu.x, contextMenu.y - 64)} className="w-full flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-left">
                  <FileText className="h-4 w-4 mr-3 opacity-70" /> Sticky Note
               </button>
               <button onClick={() => addWidget('icon', contextMenu.x, contextMenu.y - 64)} className="w-full flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-left">
                  <Briefcase className="h-4 w-4 mr-3 opacity-70" /> Shortcut Icon
               </button>
               <button onClick={() => addWidget('login-list', contextMenu.x, contextMenu.y - 64)} className="w-full flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-left">
                  <Key className="h-4 w-4 mr-3 opacity-70" /> Login Links
               </button>
               <button onClick={() => addWidget('totp-list', contextMenu.x, contextMenu.y - 64)} className="w-full flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-left">
                  <Clock className="h-4 w-4 mr-3 opacity-70" /> TOTP Codes
               </button>
               <button onClick={() => addWidget('card', contextMenu.x, contextMenu.y - 64)} className="w-full flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-left">
                  <CreditCard className="h-4 w-4 mr-3 opacity-70" /> Debit Card
               </button>
            </>
          ) : (
            <>
               <div className="px-3 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-slate-800 mb-1">Widget Options</div>
               {/* Color selector */}
               <div className="px-4 py-2 flex items-center space-x-2 border-b border-gray-100 dark:border-slate-800">
                  <Palette className="h-4 w-4 opacity-70 text-gray-500" />
                  <div className="flex space-x-1 ml-2">
                    {(activeWorkspace.widgets.find(w => w.id === contextMenu.widgetId)?.type === 'card' 
                      ? [
                          'bg-gradient-to-tr from-rose-500 to-pink-600 text-white', 
                          'bg-gradient-to-tr from-blue-600 to-cyan-500 text-white', 
                          'bg-gradient-to-tr from-indigo-600 to-purple-600 text-white', 
                          'bg-gradient-to-tr from-emerald-500 to-teal-500 text-white', 
                          'bg-gradient-to-tr from-amber-500 to-orange-600 text-white', 
                          'bg-slate-900 text-white'] 
                      : ['bg-yellow-200 text-yellow-900', 'bg-blue-200 text-blue-900', 'bg-green-200 text-green-900', 'bg-pink-200 text-pink-900', 'bg-indigo-200 text-indigo-900', 'bg-slate-800 text-white']
                    ).map((color) => (
                       <button 
                         key={color}
                         className={`w-5 h-5 rounded-full border border-black/10 ${color.replace(/text-[^\s]+/g, '')} ${color.includes('slate') ? 'is-dark' : ''}`}
                         onClick={() => {
                           updateWorkspace({ widgets: activeWorkspace.widgets.map(w => w.id === contextMenu.widgetId ? { ...w, color, isDark: w.type === 'card' ? w.isDark : color.includes('slate') } : w) });
                           setContextMenu(null);
                         }}
                       />
                    ))}
                  </div>
               </div>
               
               <button 
                 onClick={(e) => { removeWidget(contextMenu.widgetId!, e as any); setContextMenu(null); }}
                 className="w-full flex items-center px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-left"
               >
                  <Trash2 className="h-4 w-4 mr-3 opacity-70" /> Delete Widget
               </button>
            </>
          )}
        </div>
      )}

    </div>
  );
}

