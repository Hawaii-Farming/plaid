import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { usePlaidLink, PlaidLinkOptions } from 'react-plaid-link';
import toast, { Toaster } from 'react-hot-toast';
import { subMonths } from 'date-fns';

// Components
import { SummaryCards } from './components/Visualizations/SummaryCards';
import { SpendingChart } from './components/Visualizations/SpendingChart';
import { CategoryPieChart } from './components/Visualizations/CategoryPieChart';
import { AccountCard } from './components/Accounts/AccountCard';
import { LoadingSkeleton } from './components/Common/LoadingSkeleton';

// Utils and Hooks
import { formatCurrency, formatDate, formatDateForAPI } from './utils/formatters';
import { useLocalStorage } from './hooks/useLocalStorage';
import { downloadCSV, downloadJSON, prepareTransactionsForExport, prepareAccountsForExport } from './utils/downloadHelpers';

type Account = {
  account_id: string;
  name: string;
  mask?: string;
  type?: string;
  subtype?: string;
  balances: {
    available: number | null;
    current: number | null;
    iso_currency_code?: string | null;
  };
};

type Transaction = {
  transaction_id: string;
  account_id: string;
  date: string;
  name: string;
  amount: number;
  category?: string[];
  merchant_name?: string | null;
  pending: boolean;
  iso_currency_code?: string | null;
};

interface StoredBankConnection {
  itemId: string;
  institutionName: string;
  connectedAt: string;
}

type ApiOptions = RequestInit & { json?: any };

// Helper that accepts `json` and stringifies it
const api = async <T = any>(path: string, opts: ApiOptions = {}): Promise<T> => {
  const { json, headers, ...rest } = opts;
  const res = await fetch(`http://localhost:8000${path}`, {
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    ...rest,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
};

function LinkButton({ onSuccess }: { onSuccess: (institutionName?: string | null) => void }) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    api<{ link_token: string }>('/api/create_link_token', { method: 'POST' })
      .then((data) => {
        setLinkToken(data.link_token);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error(err);
        toast.error('Failed to create link token');
        setIsLoading(false);
      });
  }, []);

  const config: PlaidLinkOptions = {
    token: linkToken ?? null,
    onSuccess: (public_token: string, metadata: any) => {
      const institutionName = metadata?.institution?.name ?? null;
      (async () => {
        try {
          await api('/api/set_access_token', {
            method: 'POST',
            json: { public_token },
          });
          toast.success(`Successfully connected to ${institutionName || 'bank'}`);
          onSuccess(institutionName);
        } catch (err) {
          toast.error('Failed to set access token');
        }
      })();
    },
    onExit: (err) => {
      if (err != null) {
        toast.error('Link flow was exited');
      }
    },
  };

  const { open, ready } = usePlaidLink(config);

  return (
    <button
      className="btn primary"
      onClick={() => open()}
      disabled={!ready || !linkToken || isLoading}
    >
      {isLoading ? 'Loading...' : 'Connect Bank'}
    </button>
  );
}

export default function App() {
  // State for accounts and transactions
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Date range state with defaults (last 3 months)
  const [startDate, setStartDate] = useState(formatDateForAPI(subMonths(new Date(), 3)));
  const [endDate, setEndDate] = useState(formatDateForAPI(new Date()));
  
  // UI state
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  
  // Persistent storage for bank connections
  const [institutions, setInstitutions] = useLocalStorage<StoredBankConnection[]>('plaid_institutions', []);
  
  // Category filter state
  // const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Load accounts from API
  const loadAccounts = useCallback(async () => {
    setIsLoadingAccounts(true);
    try {
      const data = await api<Account[]>('/api/accounts');
      setAccounts(data);
      toast.success(`Loaded ${data.length} accounts`);
    } catch (e: any) {
      toast.error(`Failed to load accounts: ${e.message}`);
      console.error(e);
    } finally {
      setIsLoadingAccounts(false);
    }
  }, []);

  // Fetch transactions
  const fetchTx = useCallback(async () => {
    if (selected.length === 0) {
      toast.error('Please select at least one account');
      return;
    }
    
    setIsLoadingTransactions(true);
    try {
      const data = await api<{ transactions: Transaction[] }>('/api/transactions', {
        method: 'POST',
        json: {
          start_date: startDate,
          end_date: endDate,
          account_ids: selected,
        },
      });
      setTransactions(data.transactions || []);
      toast.success(`Fetched ${data.transactions?.length || 0} transactions`);
    } catch (e: any) {
      toast.error(`Failed to fetch transactions: ${e.message}`);
      console.error(e);
    } finally {
      setIsLoadingTransactions(false);
    }
  }, [startDate, endDate, selected]);

  // Calculate total balance
  // const totalCurrent = useMemo(
  //   () =>
  //     accounts.reduce((sum, a) => {
  //       const amt = typeof a.balances.current === 'number' ? a.balances.current : 0;
  //       return sum + amt;
  //     }, 0),
  //   [accounts]
  // );

  // Get unique categories from transactions
  // const availableCategories = useMemo(() => {
  //   const cats = new Set<string>();
  //   transactions.forEach((tx) => {
  //     if (tx.category && tx.category.length > 0) {
  //       cats.add(tx.category[0]);
  //     }
  //   });
  //   return Array.from(cats).sort();
  // }, [transactions]);

  // Filter transactions by search and category
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      // Search filter
      const matchesSearch =
        searchTerm === '' ||
        tx.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tx.merchant_name?.toLowerCase().includes(searchTerm.toLowerCase());

      // Category filter - currently not filtering by category
      // const matchesCategory =
      //   selectedCategories.length === 0 ||
      //   (tx.category && tx.category.some((cat) => selectedCategories.includes(cat)));

      return matchesSearch;
    });
  }, [transactions, searchTerm]);

  // Download handlers
  const downloadTransactionsCSV = useCallback(() => {
    try {
      const preparedData = prepareTransactionsForExport(filteredTransactions);
      downloadCSV(preparedData, 'transactions');
      toast.success('Transactions downloaded as CSV');
    } catch (error) {
      toast.error('Failed to download CSV');
    }
  }, [filteredTransactions]);

  const downloadTransactionsJSON = useCallback(() => {
    try {
      downloadJSON(filteredTransactions, 'transactions');
      toast.success('Transactions downloaded as JSON');
    } catch (error) {
      toast.error('Failed to download JSON');
    }
  }, [filteredTransactions]);

  const downloadAccountsData = useCallback(() => {
    try {
      const preparedData = prepareAccountsForExport(accounts);
      downloadCSV(preparedData, 'accounts');
      toast.success('Accounts downloaded as CSV');
    } catch (error) {
      toast.error('Failed to download accounts');
    }
  }, [accounts]);

  const downloadXLSX = useCallback(
    async (format: 'xlsx') => {
      if (selected.length === 0) {
        toast.error('Please select at least one account');
        return;
      }

      try {
        const res = await fetch('http://localhost:8000/api/transactions/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            start_date: startDate,
            end_date: endDate,
            account_ids: selected,
            format,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transactions_${Date.now()}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
        toast.success('Transactions exported as XLSX');
      } catch (e: any) {
        toast.error(`Export failed: ${e.message}`);
      }
    },
    [startDate, endDate, selected]
  );

  // Toggle account selection
  const toggleAccount = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // Select all accounts
  const selectAllAccounts = () => {
    if (selected.length === accounts.length) {
      setSelected([]);
    } else {
      setSelected(accounts.map((a) => a.account_id));
    }
  };

  // Handle successful bank connection
  const handleBankConnected = useCallback(
    (instName: string | null | undefined) => {
      if (instName) {
        const newConnection: StoredBankConnection = {
          itemId: `item_${Date.now()}`,
          institutionName: instName,
          connectedAt: new Date().toISOString(),
        };
        
        // Check if institution already exists
        const exists = institutions.find((inst) => inst.institutionName === instName);
        if (!exists) {
          setInstitutions([...institutions, newConnection]);
        }
      }
      loadAccounts();
    },
    [institutions, setInstitutions, loadAccounts]
  );

  // Remove bank connection
  const handleDisconnectBank = useCallback(
    (itemId: string) => {
      setInstitutions(institutions.filter((inst) => inst.itemId !== itemId));
      toast.success('Bank disconnected');
      // Optionally clear related accounts and transactions
      setAccounts([]);
      setTransactions([]);
      setSelected([]);
    },
    [institutions, setInstitutions]
  );

  // Load accounts on mount if institutions exist
  useEffect(() => {
    if (institutions.length > 0) {
      loadAccounts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '0' }}>
      <Toaster position="top-right" />
      
      {/* Header */}
      <header
        style={{
          background: 'white',
          borderBottom: '1px solid #e2e8f0',
          padding: '20px 24px',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}
      >
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: '#1a202c', marginBottom: 4 }}>
              Hawaii Farming Dashboard
            </h1>
            <p style={{ margin: 0, color: '#718096', fontSize: 14 }}>
              Modern financial dashboard powered by Plaid
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {institutions.length > 0 && (
              <div className="badge success">
                {institutions.length} {institutions.length === 1 ? 'Bank' : 'Banks'} Connected
              </div>
            )}
            <LinkButton onSuccess={handleBankConnected} />
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 24px' }}>
        {/* Summary Cards */}
        {accounts.length > 0 && <SummaryCards accounts={accounts} transactions={transactions} />}

        {/* Connected Banks */}
        {institutions.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                background: 'white',
                borderRadius: 12,
                padding: 20,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1a202c' }}>
                  Connected Banks
                </h3>
                <button className="btn ghost" onClick={loadAccounts} disabled={isLoadingAccounts}>
                  🔄 {isLoadingAccounts ? 'Loading...' : 'Refresh'}
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {institutions.map((inst) => (
                  <div
                    key={inst.itemId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 16px',
                      background: '#f8fafc',
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: '#1a202c' }}>
                        {inst.institutionName}
                      </div>
                      <div style={{ fontSize: 12, color: '#718096' }}>
                        Connected {formatDate(inst.connectedAt, 'MMM d, yyyy')}
                      </div>
                    </div>
                    <button
                      className="btn ghost"
                      onClick={() => handleDisconnectBank(inst.itemId)}
                      style={{ padding: '6px 12px', fontSize: 12 }}
                    >
                      🗑️ Disconnect
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Main Content Grid */}
        {institutions.length === 0 ? (
          <div
            style={{
              background: 'white',
              borderRadius: 12,
              padding: 60,
              textAlign: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            <h2 style={{ fontSize: 24, fontWeight: 600, color: '#1a202c', marginBottom: 12 }}>
              Get Started
            </h2>
            <p style={{ color: '#718096', fontSize: 16, marginBottom: 24, maxWidth: 500, margin: '0 auto 24px' }}>
              Connect your bank account to start viewing balances, transactions, and financial insights.
            </p>
            <LinkButton onSuccess={handleBankConnected} />
          </div>
        ) : (
          <>
            {/* Accounts Section */}
            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  background: 'white',
                  borderRadius: 12,
                  padding: 20,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1a202c' }}>
                    Accounts ({accounts.length})
                  </h3>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn ghost" onClick={selectAllAccounts} style={{ fontSize: 13 }}>
                      {selected.length === accounts.length ? 'Deselect All' : 'Select All'}
                    </button>
                    <button className="btn ghost" onClick={downloadAccountsData} disabled={accounts.length === 0}>
                      ⬇️ Export Accounts
                    </button>
                  </div>
                </div>
                {isLoadingAccounts ? (
                  <div>
                    <LoadingSkeleton height={80} count={3} />
                  </div>
                ) : accounts.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: '#718096' }}>
                    No accounts found. Try refreshing or reconnecting your bank.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                    {accounts.map((account) => (
                      <AccountCard
                        key={account.account_id}
                        account={account}
                        isSelected={selected.includes(account.account_id)}
                        onSelect={toggleAccount}
                        showCheckbox
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Transaction Filters */}
            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  background: 'white',
                  borderRadius: 12,
                  padding: 20,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1a202c' }}>
                    Transaction Filters
                  </h3>
                  <button
                    className="btn ghost"
                    onClick={() => setShowFilters(!showFilters)}
                    style={{ fontSize: 13 }}
                  >
                    🔍 {showFilters ? 'Hide' : 'Show'} Filters
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
                  <label className="field">
                    <span>Start Date</span>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </label>
                  <label className="field">
                    <span>End Date</span>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </label>
                </div>
                {showFilters && (
                  <div style={{ marginBottom: 16 }}>
                    <label className="field">
                      <span>Search Transactions</span>
                      <input
                        type="text"
                        placeholder="🔍 Search by name or merchant..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </label>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn primary" onClick={fetchTx} disabled={isLoadingTransactions || selected.length === 0}>
                    {isLoadingTransactions ? 'Fetching...' : 'Fetch Transactions'}
                  </button>
                  <button className="btn ghost" onClick={downloadTransactionsCSV} disabled={filteredTransactions.length === 0}>
                    ⬇️ CSV
                  </button>
                  <button className="btn ghost" onClick={downloadTransactionsJSON} disabled={filteredTransactions.length === 0}>
                    ⬇️ JSON
                  </button>
                  <button className="btn ghost" onClick={() => downloadXLSX('xlsx')} disabled={selected.length === 0}>
                    ⬇️ XLSX
                  </button>
                </div>
              </div>
            </div>

            {/* Charts */}
            {transactions.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 24, marginBottom: 24 }}>
                <SpendingChart transactions={transactions} startDate={startDate} endDate={endDate} />
                <CategoryPieChart transactions={transactions} />
              </div>
            )}

            {/* Transactions Table */}
            <div
              style={{
                background: 'white',
                borderRadius: 12,
                padding: 20,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1a202c' }}>
                  Transactions ({filteredTransactions.length})
                </h3>
              </div>
              {isLoadingTransactions ? (
                <div>
                  <LoadingSkeleton height={40} count={8} />
                </div>
              ) : (
                <div style={{ maxHeight: 600, overflow: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Name</th>
                        <th>Amount</th>
                        <th>Category</th>
                        <th>Merchant</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#718096' }}>
                            {transactions.length === 0
                              ? 'No transactions yet. Fetch transactions to see data here.'
                              : 'No transactions match your filters.'}
                          </td>
                        </tr>
                      ) : (
                        filteredTransactions.map((tx) => (
                          <tr key={tx.transaction_id}>
                            <td>{formatDate(tx.date)}</td>
                            <td style={{ fontWeight: 500 }}>{tx.name}</td>
                            <td style={{ fontWeight: 600, color: tx.amount > 0 ? '#f44336' : '#00c853' }}>
                              {formatCurrency(tx.amount, tx.iso_currency_code || 'USD')}
                            </td>
                            <td style={{ fontSize: 13 }}>{tx.category?.join(' / ') || '—'}</td>
                            <td style={{ fontSize: 13 }}>{tx.merchant_name || '—'}</td>
                            <td>
                              {tx.pending ? (
                                <span className="badge warning">Pending</span>
                              ) : (
                                <span className="badge success">Completed</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}