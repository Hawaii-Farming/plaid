import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { formatCurrency } from '../../utils/formatters';
import styles from './CategoryPieChart.module.scss';

interface Transaction {
  amount: number;
  category?: string[];
}

interface CategoryPieChartProps {
  transactions: Transaction[];
}

const COLORS = ['#0066ff', '#00c853', '#ff6b6b', '#ffa726', '#9c27b0', '#00acc1', '#ff5722', '#8bc34a'];

export const CategoryPieChart: React.FC<CategoryPieChartProps> = ({ transactions }) => {
  const chartData = useMemo(() => {
    // Group spending by category (only debits - positive amounts)
    const categoryTotals: Record<string, number> = {};
    
    transactions
      .filter((tx) => tx.amount > 0)
      .forEach((tx) => {
        const category = tx.category?.[0] || 'Uncategorized';
        categoryTotals[category] = (categoryTotals[category] || 0) + tx.amount;
      });

    // Convert to array and sort by amount
    return Object.entries(categoryTotals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8); // Top 8 categories
  }, [transactions]);

  if (chartData.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>No category data available.</p>
      </div>
    );
  }

  return (
    <div className={styles.chartContainer}>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
            outerRadius={100}
            fill="#8884d8"
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            }}
            formatter={(value: any) => formatCurrency(value as number)}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            iconType="circle"
            wrapperStyle={{ fontSize: '12px' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default CategoryPieChart;
