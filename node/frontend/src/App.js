import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [linkToken, setLinkToken] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [startDate, setStartDate] = useState('2024-01-01');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const createLinkToken = async () => {
    try {
      const response = await fetch('/api/create_link_token', { method: 'POST' });
      const data = await response.json();
      setLinkToken(data.link_token);
    } catch (error) {
      setStatus({ type: 'error', message: 'Error: ' + error.message });
    }
  };

  const exchangePublicToken = async (public_token) => {
    try {
      setLoading(true);
      await fetch('/api/set_access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_token }),
      });
      setStatus({ type: 'success', message: '✅ Bank connected successfully!' });
      fetchAccounts();
    } catch (error) {
      setStatus({ type: 'error', message: 'Error: ' + error.message });
    } finally {
      setLoading(false);
    }
  };

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/accounts');
      const data = await response.json();
      setAccounts(data);
    } catch (error) {
      setStatus({ type: 'error', message: 'Error: ' + error.message });
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_date: startDate, end_date: endDate }),
      });
      const data = await response.json();
      setTransactions(data.transactions || []);
      setStatus({ type: 'success', message: `Loaded ${data.transactions?.length || 0} transactions` });
    } catch (error) {
      setStatus({ type: 'error', message: 'Error: ' + error.message });
    } finally {
      setLoading(false);
    }
  };

  const exportToSheets = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/export-to-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_date: startDate, end_date: endDate }),
      });
      const data = await response.json();
      setStatus({ type: 'success', message: `📊 ${data.message}` });
    } catch (error) {
      setStatus({ type: 'error', message: 'Error: ' + error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (linkToken && window.Plaid) {
      const handler = window.Plaid.create({
        token: linkToken,
        onSuccess: (public_token) => exchangePublicToken(public_token),
        onExit: (err) => { if (err) setStatus({ type: 'error', message: err.error_message }); },
      });
      handler.open();
    }
  }, [linkToken]);

  return (
    <div className="App">
      <header className="app-header">
        <img src="/assets/hawaii-farming-logo.png" alt="Hawaii Farming" className="app-logo" />
        <h1 className="app-title">Hawaii Farming</h1>
        <p className="app-subtitle">Financial Transaction Management</p>
      </header>
      <div className="container">
        {status && <div className={`status-message status-${status.type}`}>{status.message}</div>}
        <div className="card">
          <h2 style={{color:'#33691e',marginBottom:'20px'}}>🔗 Connect Bank Account</h2>
          <button className="btn" onClick={createLinkToken} disabled={loading}>
            {loading ? <span className="loading"></span> : 'Connect Bank Account'}
          </button>
        </div>
        {accounts.length > 0 && (
          <div className="card">
            <h2 style={{color:'#33691e',marginBottom:'20px'}}>💰 Your Accounts</h2>
            {accounts.map(acc => (
              <div key={acc.account_id} style={{padding:'16px',background:'#f5f5f5',borderRadius:'8px',marginBottom:'12px',borderLeft:'4px solid #558b2f'}}>
                <strong style={{color:'#33691e'}}>{acc.name}</strong>
                <p style={{color:'#558b2f',fontWeight:'bold',marginTop:'8px'}}>${acc.balances.current?.toFixed(2)||'0.00'}</p>
              </div>
            ))}
          </div>
        )}
        <div className="card">
          <h2 style={{color:'#33691e',marginBottom:'20px'}}>📊 Transactions</h2>
          <div className="flex gap-20 mb-20">
            <div className="form-group" style={{flex:1}}>
              <label>Start Date</label>
              <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/>
            </div>
            <div className="form-group" style={{flex:1}}>
              <label>End Date</label>
              <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/>
            </div>
          </div>
          <div className="flex gap-10">
            <button className="btn" onClick={fetchTransactions} disabled={loading}>
              {loading?<span className="loading"></span>:'Load Transactions'}
            </button>
            <button className="btn btn-secondary" onClick={exportToSheets} disabled={loading}>
              {loading?<span className="loading"></span>:'📊 Export to Sheets'}
            </button>
          </div>
          {transactions.length>0 && (
            <table className="transaction-table">
              <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Category</th><th>Status</th></tr></thead>
              <tbody>
                {transactions.map(tx=>(
                  <tr key={tx.transaction_id}>
                    <td>{tx.date}</td>
                    <td>{tx.name}</td>
                    <td style={{color:tx.amount>0?'#c62828':'#2e7d32',fontWeight:'bold'}}>${Math.abs(tx.amount).toFixed(2)}</td>
                    <td>{tx.category?.join(' / ')||'N/A'}</td>
                    <td><span style={{padding:'4px 12px',borderRadius:'12px',fontSize:'12px',background:tx.pending?'#fff3cd':'#c8e6c9',color:tx.pending?'#856404':'#1b5e20',fontWeight:'bold'}}>{tx.pending?'Pending':'Posted'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
