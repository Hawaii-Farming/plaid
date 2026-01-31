/**
 * Download helper utilities for exporting data
 */

import Papa from 'papaparse';

/**
 * Download data as CSV file
 */
export const downloadCSV = (data: any[], filename: string = 'data'): void => {
  try {
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error downloading CSV:', error);
    throw new Error('Failed to download CSV file');
  }
};

/**
 * Download data as JSON file
 */
export const downloadJSON = (data: any, filename: string = 'data'): void => {
  try {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error downloading JSON:', error);
    throw new Error('Failed to download JSON file');
  }
};

/**
 * Download from blob response (for XLSX from backend)
 */
export const downloadBlob = (blob: Blob, filename: string): void => {
  try {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error downloading blob:', error);
    throw new Error('Failed to download file');
  }
};

/**
 * Prepare transactions data for export
 */
export const prepareTransactionsForExport = (transactions: any[]): any[] => {
  return transactions.map((tx) => ({
    Date: tx.date,
    Name: tx.name,
    Amount: tx.amount,
    Category: tx.category?.join(' / ') || '',
    Merchant: tx.merchant_name || '',
    Pending: tx.pending ? 'Yes' : 'No',
    Currency: tx.iso_currency_code || '',
    'Transaction ID': tx.transaction_id,
    'Account ID': tx.account_id,
  }));
};

/**
 * Prepare accounts data for export
 */
export const prepareAccountsForExport = (accounts: any[]): any[] => {
  return accounts.map((acc) => ({
    Name: acc.name,
    Mask: acc.mask || '',
    Type: acc.type || '',
    Subtype: acc.subtype || '',
    'Current Balance': acc.balances.current || 0,
    'Available Balance': acc.balances.available || 0,
    Currency: acc.balances.iso_currency_code || '',
    'Account ID': acc.account_id,
  }));
};
