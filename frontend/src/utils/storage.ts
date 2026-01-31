/**
 * localStorage utilities for managing persistent data
 */

export interface StoredBankConnection {
  itemId: string;
  accessToken: string;
  institutionName: string;
  institutionLogo?: string;
  connectedAt: string;
  accounts: any[];
}

const STORAGE_KEYS = {
  BANK_CONNECTIONS: 'plaid_bank_connections',
  SELECTED_ACCOUNT: 'plaid_selected_account',
} as const;

/**
 * Get all stored bank connections
 */
export const getBankConnections = (): StoredBankConnection[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.BANK_CONNECTIONS);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error reading bank connections from localStorage:', error);
    return [];
  }
};

/**
 * Save a new bank connection
 */
export const saveBankConnection = (connection: StoredBankConnection): void => {
  try {
    const existing = getBankConnections();
    const updated = [...existing, connection];
    localStorage.setItem(STORAGE_KEYS.BANK_CONNECTIONS, JSON.stringify(updated));
  } catch (error) {
    console.error('Error saving bank connection to localStorage:', error);
  }
};

/**
 * Remove a bank connection by itemId
 */
export const removeBankConnection = (itemId: string): void => {
  try {
    const existing = getBankConnections();
    const updated = existing.filter((conn) => conn.itemId !== itemId);
    localStorage.setItem(STORAGE_KEYS.BANK_CONNECTIONS, JSON.stringify(updated));
  } catch (error) {
    console.error('Error removing bank connection from localStorage:', error);
  }
};

/**
 * Clear all stored bank connections
 */
export const clearBankConnections = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEYS.BANK_CONNECTIONS);
    localStorage.removeItem(STORAGE_KEYS.SELECTED_ACCOUNT);
  } catch (error) {
    console.error('Error clearing bank connections from localStorage:', error);
  }
};

/**
 * Get the selected account ID
 */
export const getSelectedAccount = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEYS.SELECTED_ACCOUNT);
  } catch (error) {
    console.error('Error reading selected account from localStorage:', error);
    return null;
  }
};

/**
 * Save the selected account ID
 */
export const setSelectedAccount = (accountId: string | null): void => {
  try {
    if (accountId) {
      localStorage.setItem(STORAGE_KEYS.SELECTED_ACCOUNT, accountId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.SELECTED_ACCOUNT);
    }
  } catch (error) {
    console.error('Error saving selected account to localStorage:', error);
  }
};
