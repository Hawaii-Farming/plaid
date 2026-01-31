/**
 * Formatting utilities for currency, dates, and other data
 */

import { format, parseISO } from 'date-fns';

/**
 * Format a number as currency
 */
export const formatCurrency = (
  amount: number | null | undefined,
  currency: string = 'USD'
): string => {
  if (amount === null || amount === undefined) {
    return '—';
  }

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  } catch (error) {
    return `${currency} ${amount.toFixed(2)}`;
  }
};

/**
 * Format a date string
 */
export const formatDate = (dateString: string, formatStr: string = 'MMM d, yyyy'): string => {
  try {
    const date = parseISO(dateString);
    return format(date, formatStr);
  } catch (error) {
    return dateString;
  }
};

/**
 * Format a date for API calls (YYYY-MM-DD)
 */
export const formatDateForAPI = (date: Date): string => {
  return format(date, 'yyyy-MM-dd');
};

/**
 * Get a relative time string (e.g., "2 days ago")
 */
export const getRelativeTime = (dateString: string): string => {
  try {
    const date = parseISO(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  } catch (error) {
    return dateString;
  }
};

/**
 * Mask account number (show only last 4 digits)
 */
export const maskAccountNumber = (mask: string | undefined): string => {
  if (!mask) return '';
  return `••••${mask}`;
};

/**
 * Truncate text with ellipsis
 */
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
};

/**
 * Format account type
 */
export const formatAccountType = (type: string): string => {
  const typeMap: Record<string, string> = {
    depository: 'Checking/Savings',
    credit: 'Credit Card',
    loan: 'Loan',
    investment: 'Investment',
    other: 'Other',
  };
  return typeMap[type.toLowerCase()] || type;
};
