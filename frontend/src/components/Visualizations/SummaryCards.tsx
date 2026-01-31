import React, { useMemo } from 'react';
import { formatCurrency } from '../../utils/formatters';
import styles from './SummaryCards.module.scss';

interface Account {
  balances: {
    current: number | null;
    available: number | null;
  };
}

interface Transaction {
  amount: number;
  category?: string[];
  date: string;
}

interface SummaryCardsProps {
  accounts: Account[];
  transactions: Transaction[];
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({ accounts, transactions }) => {
  const summary = useMemo(() => {
    // Calculate total balance
    const totalBalance = accounts.reduce((sum, account) => {
      return sum + (account.balances.current || 0);
    }, 0);

    // Calculate total available balance
    const availableBalance = accounts.reduce((sum, account) => {
      return sum + (account.balances.available || 0);
    }, 0);

    // Calculate monthly spending (transactions with positive amounts are debits)
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlySpending = transactions
      .filter((tx) => new Date(tx.date) >= firstOfMonth && tx.amount > 0)
      .reduce((sum, tx) => sum + tx.amount, 0);

    // Get top spending category
    const categoryTotals: Record<string, number> = {};
    transactions
      .filter((tx) => tx.amount > 0)
      .forEach((tx) => {
        const category = tx.category?.[0] || 'Uncategorized';
        categoryTotals[category] = (categoryTotals[category] || 0) + tx.amount;
      });

    const topCategory = Object.entries(categoryTotals).sort(([, a], [, b]) => b - a)[0];

    return {
      totalBalance,
      availableBalance,
      monthlySpending,
      topCategory: topCategory ? topCategory[0] : 'N/A',
      topCategoryAmount: topCategory ? topCategory[1] : 0,
    };
  }, [accounts, transactions]);

  const cards = [
    {
      title: 'Total Balance',
      value: formatCurrency(summary.totalBalance),
      icon: '💰',
      color: '#0066ff',
      bgColor: '#eef2ff',
    },
    {
      title: 'Available Balance',
      value: formatCurrency(summary.availableBalance),
      icon: '📈',
      color: '#00c853',
      bgColor: '#e8f5e9',
    },
    {
      title: 'Monthly Spending',
      value: formatCurrency(summary.monthlySpending),
      icon: '💸',
      color: '#ff6b6b',
      bgColor: '#ffebee',
    },
    {
      title: 'Top Category',
      value: summary.topCategory,
      subtitle: formatCurrency(summary.topCategoryAmount),
      icon: '📊',
      color: '#ffa726',
      bgColor: '#fff3e0',
    },
  ];

  return (
    <div className={styles.summaryCards}>
      {cards.map((card, index) => (
        <div key={index} className={styles.card}>
          <div className={styles.iconWrapper} style={{ backgroundColor: card.bgColor, color: card.color }}>
            <span style={{ fontSize: 24 }}>{card.icon}</span>
          </div>
          <div className={styles.content}>
            <div className={styles.title}>{card.title}</div>
            <div className={styles.value}>{card.value}</div>
            {card.subtitle && <div className={styles.subtitle}>{card.subtitle}</div>}
          </div>
        </div>
      ))}
    </div>
  );
};

export default SummaryCards;
