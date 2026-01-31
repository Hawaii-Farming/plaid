import React from 'react';
import { formatCurrency, maskAccountNumber } from '../../utils/formatters';
import styles from './AccountCard.module.scss';

interface Account {
  account_id: string;
  name: string;
  mask?: string;
  type?: string;
  subtype?: string;
  balances: {
    current: number | null;
    available: number | null;
    iso_currency_code?: string | null;
  };
}

interface AccountCardProps {
  account: Account;
  isSelected?: boolean;
  onSelect?: (accountId: string) => void;
  showCheckbox?: boolean;
}

export const AccountCard: React.FC<AccountCardProps> = ({
  account,
  isSelected = false,
  onSelect,
  showCheckbox = false,
}) => {
  const handleClick = () => {
    if (onSelect) {
      onSelect(account.account_id);
    }
  };

  return (
    <div
      className={`${styles.accountCard} ${isSelected ? styles.selected : ''} ${
        onSelect ? styles.clickable : ''
      }`}
      onClick={handleClick}
    >
      <div className={styles.iconWrapper}>
        💳
      </div>
      <div className={styles.content}>
        <div className={styles.header}>
          <div className={styles.name}>{account.name}</div>
          {account.mask && <div className={styles.mask}>{maskAccountNumber(account.mask)}</div>}
        </div>
        {account.subtype && <div className={styles.type}>{account.subtype}</div>}
        <div className={styles.balances}>
          <div className={styles.balance}>
            <span className={styles.label}>Current:</span>
            <span className={styles.amount}>
              {formatCurrency(account.balances.current, account.balances.iso_currency_code || 'USD')}
            </span>
          </div>
          {account.balances.available !== null && (
            <div className={styles.balance}>
              <span className={styles.label}>Available:</span>
              <span className={styles.amount}>
                {formatCurrency(account.balances.available, account.balances.iso_currency_code || 'USD')}
              </span>
            </div>
          )}
        </div>
      </div>
      {showCheckbox && (
        <div className={styles.checkbox}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation();
              if (onSelect) onSelect(account.account_id);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
      {isSelected && !showCheckbox && (
        <div className={styles.selectedIcon}>
          ✓
        </div>
      )}
    </div>
  );
};

export default AccountCard;
