import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { formatCurrency } from '../../utils/formatters';
import styles from './SpendingChart.module.scss';

interface Transaction {
  date: string;
  amount: number;
}

interface SpendingChartProps {
  transactions: Transaction[];
  startDate?: string;
  endDate?: string;
}

export const SpendingChart: React.FC<SpendingChartProps> = ({ transactions, startDate, endDate }) => {
  const chartData = useMemo(() => {
    if (transactions.length === 0) return [];

    // Get date range
    const now = new Date();
    const start = startDate ? parseISO(startDate) : startOfMonth(now);
    const end = endDate ? parseISO(endDate) : endOfMonth(now);

    // Group transactions by date
    const dailySpending: Record<string, number> = {};
    
    transactions
      .filter((tx) => {
        const txDate = parseISO(tx.date);
        return txDate >= start && txDate <= end && tx.amount > 0; // Only debits
      })
      .forEach((tx) => {
        const dateKey = tx.date;
        dailySpending[dateKey] = (dailySpending[dateKey] || 0) + tx.amount;
      });

    // Create data points for all days in range
    const days = eachDayOfInterval({ start, end });
    return days.map((day) => {
      const dateKey = format(day, 'yyyy-MM-dd');
      return {
        date: format(day, 'MMM d'),
        fullDate: dateKey,
        spending: dailySpending[dateKey] || 0,
      };
    }).filter((_, index, array) => {
      // Show every day if less than 31 days, otherwise sample
      return array.length <= 31 || index % Math.ceil(array.length / 30) === 0;
    });
  }, [transactions, startDate, endDate]);

  if (chartData.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>No spending data available for the selected period.</p>
      </div>
    );
  }

  return (
    <div className={styles.chartContainer}>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#718096', fontSize: 12 }}
            stroke="#e2e8f0"
          />
          <YAxis
            tick={{ fill: '#718096', fontSize: 12 }}
            stroke="#e2e8f0"
            tickFormatter={(value) => `$${value}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            }}
            formatter={(value: any) => [formatCurrency(value as number), 'Spending']}
            labelStyle={{ color: '#1a202c', fontWeight: 600 }}
          />
          <Legend />
          <Bar dataKey="spending" fill="#0066ff" radius={[8, 8, 0, 0]} name="Daily Spending" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SpendingChart;
