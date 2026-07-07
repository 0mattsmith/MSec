export type ItemCategory = 'login' | 'passkey' | 'note' | 'card' | 'identity';

export interface VaultFolder {
  id: string;
  name: string;
  parentId?: string | null;
  color?: string;
  isPrivate?: boolean;
  createdAt: number;
}

export interface CustomField {
  id: string;
  label: string;
  value: string;
  isHidden: boolean;
}

export interface VaultItem {
  id: string;
  type: ItemCategory;
  title: string;
  folderId?: string | null;
  isFavorite: boolean;
  isShared?: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
  notes?: string;
  customFields?: CustomField[];
  
  // Login fields
  username?: string;
  email?: string;
  app?: string;
  password?: string;
  url?: string;
  totpSecret?: string;
  
  // Card fields
  cardNumber?: string;
  cardExpiry?: string;
  cardCvv?: string;
  cardPin?: string;
  cardIssuer?: string;
  bankName?: string;
  cardholderName?: string;
  cardStartDate?: string;
  cardSortCode?: string;
  cardAccount?: string;

  // Identity fields
  firstName?: string;
  lastName?: string;
  phone?: string;
  address?: string;
}

export interface MaskedEmail {
  id: string;
  maskedAddress: string;
  forwardTo: string;
  label: string;
  serviceId?: string; // Link to a VaultItem
  createdAt: number;
}

export interface DashboardWidget {
  id: string;
  type: string; // 'note' | 'icon' | 'login-list' | 'totp-list' | 'card'
  x: number;
  y: number;
  w?: number;
  h?: number;
  title: string;
  content?: string;
  color?: string;
  isDark?: boolean;
  iconName?: string;
  linkedItems?: string[]; // VaultItem IDs
  cardId?: string;
  isCollapsed?: boolean;
  children?: { id: string; title: string; iconName: string }[]; // for 'folder' widgets
  mobileOrder?: number; // grid position on the mobile homescreen layout
}

export interface Workspace {
  id: string;
  name: string;
  wallpaper: string | null;
  widgets: DashboardWidget[];
}

export interface GeneratorOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
}

export interface AppSettings {
  clipboardClearTimeoutSeconds: number; // 0 means disabled
}

export interface AppState {
  isUnlocked: boolean;
  masterPasswordSet: boolean;
  theme: 'dark' | 'light';
  settings: AppSettings;
  items: VaultItem[];
  folders: VaultFolder[];
  maskedEmails: MaskedEmail[];
  workspaces: Workspace[];
  activeCategory: 'all' | ItemCategory | 'trash' | 'shared' | 'emails' | 'favorites' | 'generator' | 'health' | 'scanner' | 'settings' | 'authenticator' | 'dashboard' | 'tools';
  activeFolderId: string | null;
  selectedItemId: string | null;
  isCustomizingColumns: boolean;
  generatorOptions: GeneratorOptions;
}
