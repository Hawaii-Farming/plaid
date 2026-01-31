/**
 * Custom hook for downloading data
 */

import { useState } from 'react';
import { downloadCSV, downloadJSON, prepareTransactionsForExport, prepareAccountsForExport } from '../utils/downloadHelpers';
import toast from 'react-hot-toast';

export type DownloadFormat = 'csv' | 'json' | 'xlsx';

interface UseDownloadDataReturn {
  isDownloading: boolean;
  downloadTransactions: (transactions: any[], format: DownloadFormat) => Promise<void>;
  downloadAccounts: (accounts: any[], format: DownloadFormat) => Promise<void>;
  downloadCustomData: (data: any[], filename: string, format: DownloadFormat) => Promise<void>;
}

/**
 * Hook for handling data downloads
 */
export function useDownloadData(): UseDownloadDataReturn {
  const [isDownloading, setIsDownloading] = useState(false);

  const downloadTransactions = async (transactions: any[], format: DownloadFormat) => {
    setIsDownloading(true);
    try {
      const preparedData = prepareTransactionsForExport(transactions);
      
      if (format === 'csv') {
        downloadCSV(preparedData, 'transactions');
        toast.success('Transactions downloaded as CSV');
      } else if (format === 'json') {
        downloadJSON(transactions, 'transactions');
        toast.success('Transactions downloaded as JSON');
      }
    } catch (error) {
      console.error('Error downloading transactions:', error);
      toast.error('Failed to download transactions');
    } finally {
      setIsDownloading(false);
    }
  };

  const downloadAccounts = async (accounts: any[], format: DownloadFormat) => {
    setIsDownloading(true);
    try {
      const preparedData = prepareAccountsForExport(accounts);
      
      if (format === 'csv') {
        downloadCSV(preparedData, 'accounts');
        toast.success('Accounts downloaded as CSV');
      } else if (format === 'json') {
        downloadJSON(accounts, 'accounts');
        toast.success('Accounts downloaded as JSON');
      }
    } catch (error) {
      console.error('Error downloading accounts:', error);
      toast.error('Failed to download accounts');
    } finally {
      setIsDownloading(false);
    }
  };

  const downloadCustomData = async (data: any[], filename: string, format: DownloadFormat) => {
    setIsDownloading(true);
    try {
      if (format === 'csv') {
        downloadCSV(data, filename);
        toast.success(`${filename} downloaded as CSV`);
      } else if (format === 'json') {
        downloadJSON(data, filename);
        toast.success(`${filename} downloaded as JSON`);
      }
    } catch (error) {
      console.error('Error downloading data:', error);
      toast.error('Failed to download data');
    } finally {
      setIsDownloading(false);
    }
  };

  return {
    isDownloading,
    downloadTransactions,
    downloadAccounts,
    downloadCustomData,
  };
}
