import React from 'react';
import { useDownloadData } from '../../hooks/useDownloadData';
import styles from './DownloadMenu.module.scss';

interface DownloadMenuProps {
  data: any[];
  type: 'transactions' | 'accounts' | 'custom';
  filename?: string;
}

export const DownloadMenu: React.FC<DownloadMenuProps> = ({ data, type, filename = 'data' }) => {
  const { isDownloading, downloadTransactions, downloadAccounts, downloadCustomData } = useDownloadData();
  const [isOpen, setIsOpen] = React.useState(false);

  const handleDownload = async (format: 'csv' | 'json' | 'xlsx') => {
    if (type === 'transactions') {
      await downloadTransactions(data, format);
    } else if (type === 'accounts') {
      await downloadAccounts(data, format);
    } else {
      await downloadCustomData(data, filename, format);
    }
    setIsOpen(false);
  };

  return (
    <div className={styles.downloadMenu}>
      <button
        className={styles.downloadButton}
        onClick={() => setIsOpen(!isOpen)}
        disabled={isDownloading || data.length === 0}
      >
        ⬇️ Download
      </button>
      {isOpen && (
        <div className={styles.dropdown}>
          <button onClick={() => handleDownload('csv')} disabled={isDownloading}>
            Download CSV
          </button>
          <button onClick={() => handleDownload('json')} disabled={isDownloading}>
            Download JSON
          </button>
        </div>
      )}
    </div>
  );
};

export default DownloadMenu;
