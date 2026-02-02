import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { usePlaidLink, PlaidLinkOptions } from 'react-plaid-link';

type Account = {
  account_id: string;
  name: string;
  mask?: string;
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

type ApiOptions = RequestInit & { json?: any };

// Use relative URLs since frontend and backend are on same domain
const API_URL = process.env.REACT_APP_API_URL || '';

// Helper that accepts `json` and stringifies it
const api = async <T = any>(path: string, opts: ApiOptions = {}): Promise<T> => {
  const { json, headers, ...rest } = opts;
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    ...rest,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
};

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 10px',
        borderRadius: 999,
        background: '#eef2ff',
        color: '#4338ca',
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}

function Card({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16, color: '#111827' }}>{title}</h3>
        {actions}
      </div>
      {children}
    </div>
  );
}

function LinkButton({ onSuccess }: { onSuccess: (institutionName?: string | null) => void }) {
  const [linkToken, setLinkToken] = useState<string | null>(null);

  useEffect(() => {
    api<{ link_token: string }>('/api/create_link_token', { method: 'POST' })
      .then((data) => setLinkToken(data.link_token))
      .catch((err) => console.error(err));
  }, []);

  const config: PlaidLinkOptions = {
    token: linkToken ?? null,
    onSuccess: (public_token: string, metadata: any) => {
      const institutionName = metadata?.institution?.name ?? null;
      (async () => {
        await api('/api/set_access_token', {
          method: 'POST',
          json: { public_token },
        });
        onSuccess(institutionName);
      })();
    },
  };

  const { open, ready } = usePlaidLink(config);

  return (
    <button className="btn primary" onClick={() => open()} disabled={!ready || !linkToken}>
      Connect bank
    </button>
  );
}

export default function App() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [startDate, setStartDate] = useState('2024-10-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [status, setStatus] = useState('');
  const [institutions, setInstitutions] = useState<string[]>([]);

  // Handle OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthStateId = params.get('oauth_state_id');
    
    if (oauthStateId && window.location.pathname === '/oauth-callback') {
      // Plaid Link will automatically handle the OAuth flow
      console.log('OAuth callback received:', oauthStateId);
      // Redirect to home after OAuth
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    setStatus('Loading accounts...');
    try {
      const data = await api<Account[]>('/api/accounts');
      setAccounts(data);
      setStatus('Accounts loaded');
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    }
  }, []);

  const fetchTx = useCallback(async () => {
    setStatus('Fetching transactions...');
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
      setStatus(`Fetched ${data.transactions?.length || 0} transactions`);
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    }
  }, [startDate, endDate, selected]);

  const download = useCallback(
    async (format: 'csv' | 'xlsx') => {
      setStatus(`Exporting ${format}...`);
      try {
        const res = await fetch(`${API_URL}/api/transactions/export`, {
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
        a.download = `transactions.${format === 'xlsx' ? 'xlsx' : 'csv'}`;
        a.click();
        window.URL.revokeObjectURL(url);
        setStatus(`Exported ${format}`);
      } catch (e: any) {
        setStatus(`Error: ${e.message}`);
      }
    },
    [startDate, endDate, selected]
  );

  const toggleAccount = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const totalCurrent = useMemo(
    () =>
      accounts.reduce((sum, a) => {
        const amt = typeof a.balances.current === 'number' ? a.balances.current : 0;
        return sum + amt;
      }, 0),
    [accounts]
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '24px 16px', color: '#111827' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24 }}>Hawaii Farming — Plaid Demo</h1>
            <div style={{ color: '#6b7280', fontSize: 14 }}>
              Connect, view balances, fetch transactions, and export CSV/XLSX.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {institutions.length > 0 && <Pill>Connected: {institutions.join(', ')}</Pill>}
            {status && <Pill>{status}</Pill>}
          </div>
        </header>

        {/* Connection summary */}
        <div style={{ marginBottom: 12 }}>
          <Card
            title="Connection"
            actions={
              <div style={{ display: 'flex', gap: 8 }}>
                <LinkButton
                  onSuccess={(instName) => {
                    if (instName && !institutions.includes(instName)) {
                      setInstitutions((prev) => [...prev, instName]);
                    }
                    loadAccounts();
                  }}
                />
                <button className="btn ghost" onClick={loadAccounts}>
                  Refresh accounts
                </button>
              </div>
            }
          >
            {institutions.length === 0 ? (
              <div style={{ color: '#6b7280', fontSize: 14 }}>No bank connected yet.</div>
            ) : (
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', color: '#374151' }}>
                <div><strong>Banks:</strong> {institutions.join(', ')}</div>
                <div><strong>Accounts:</strong> {accounts.length}</div>
                <div><strong>Total current:</strong> {totalCurrent.toLocaleString()}</div>
              </div>
            )}
          </Card>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr', gap: 16, alignItems: 'start' }}>
          <Card title="Accounts">
            {accounts.length === 0 ? (
              <div style={{ color: '#6b7280', fontSize: 14 }}>Connect to load accounts.</div>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {accounts.map((a) => (
                  <li
                    key={a.account_id}
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: 10,
                      padding: 10,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: selected.includes(a.account_id) ? '#eef2ff' : '#fff',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{a.name} {a.mask ? `(…${a.mask})` : ''}</div>
                      <div style={{ color: '#6b7280', fontSize: 13 }}>
                        Cur: {a.balances.current ?? '—'} {a.balances.iso_currency_code || ''}
                        {a.balances.available != null ? ` • Avail: ${a.balances.available}` : ''}
                      </div>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                      <input
                        type="checkbox"
                        checked={selected.includes(a.account_id)}
                        onChange={() => toggleAccount(a.account_id)}
                      />
                      Select
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Filters & Export"
            actions={
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={fetchTx}>Fetch</button>
                <button className="btn ghost" onClick={() => download('csv')}>CSV</button>
                <button className="btn ghost" onClick={() => download('xlsx')}>XLSX</button>
              </div>
            }
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label className="field">
                <span>Start date</span>
                <input value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </label>
              <label className="field">
                <span>End date</span>
                <input value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </label>
            </div>
            <div style={{ marginTop: 12, color: '#6b7280', fontSize: 13 }}>
              Select accounts on the left. Fetch transactions, then export.
            </div>
          </Card>
        </div>

        <div style={{ marginTop: 16 }}>
          <Card title={`Transactions (${transactions.length})`}>
            <div style={{ maxHeight: 460, overflow: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Name</th>
                    <th>Amount</th>
                    <th>Category</th>
                    <th>Merchant</th>
                    <th>Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <tr key={t.transaction_id}>
                      <td>{t.date}</td>
                      <td>{t.name}</td>
                      <td>{t.amount}</td>
                      <td>{t.category?.join(' / ')}</td>
                      <td>{t.merchant_name}</td>
                      <td>{t.pending ? 'yes' : 'no'}</td>
                    </tr>
                  ))}
                  {transactions.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: '#9ca3af' }}>
                        No transactions yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}