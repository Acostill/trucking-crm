import React, { useEffect, useMemo, useState } from 'react';
import { buildApiUrl } from '../config';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import AuthForm from '../components/AuthForm';

function normalizeRoles(list) {
  return Array.isArray(list) ? list.slice().sort().join('|') : '';
}

export default function AdminPortalPage() {
  const { user, checking, setUser } = useAuth();
  const [activeTab, setActiveTab] = useState('users');
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState({});
  
  // Audit logs state
  const [auditTables, setAuditTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [auditRecords, setAuditRecords] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState(null);
  const [auditPage, setAuditPage] = useState(1);
  const [auditPagination, setAuditPagination] = useState({ total: 0, totalPages: 1 });
  const isAdmin = user && Array.isArray(user.roles) && user.roles.indexOf('admin') > -1;

  useEffect(function() {
    if (activeTab === 'users') {
      fetchUsers();
    } else if (activeTab === 'audit') {
      fetchAuditTables();
    }
  }, [activeTab]);
  
  useEffect(function() {
    if (selectedTable) {
      fetchAuditRecords(selectedTable, auditPage);
    }
  }, [selectedTable, auditPage]);

  async function fetchUsers() {
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const resp = await fetch(buildApiUrl('/api/admin/users'), { credentials: 'include' });
      const data = await resp.json().catch(function(){ return null; });
      if (!resp.ok) {
        throw new Error((data && data.error) || 'Failed to load users');
      }
      setUsers(
        (data && data.users ? data.users : []).map(function(user) {
          var rolesList = Array.isArray(user.roles) ? user.roles : [];
          return {
            ...user,
            roles: rolesList,
            initialRoles: rolesList.slice()
          };
        })
      );
      setRoles(data && Array.isArray(data.roles) ? data.roles : []);
    } catch (err) {
      setError(err && err.message ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  function toggleRole(userId, roleName, enabled) {
    setUsers(function(prev) {
      return prev.map(function(user) {
        if (user.id !== userId) return user;
        var nextRoles = new Set(user.roles || []);
        if (enabled) {
          nextRoles.add(roleName);
        } else {
          nextRoles.delete(roleName);
        }
        return {
          ...user,
          roles: Array.from(nextRoles)
        };
      });
    });
  }

  function hasChanges(user) {
    return normalizeRoles(user.roles) !== normalizeRoles(user.initialRoles);
  }

  function resetRoles(userId) {
    setUsers(function(prev) {
      return prev.map(function(user) {
        if (user.id !== userId) return user;
        return {
          ...user,
          roles: (user.initialRoles || []).slice()
        };
      });
    });
  }

  async function handleSaveRoles(userId) {
    var targetUser = users.find(function(u) { return u.id === userId; });
    if (!targetUser || !hasChanges(targetUser)) return;
    setSaving(function(prev) { return { ...prev, [userId]: true }; });
    setError(null);
    setStatus(null);
    try {
      const resp = await fetch(buildApiUrl('/api/admin/users/' + userId + '/roles'), {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles: targetUser.roles })
      });
      const data = await resp.json().catch(function(){ return null; });
      if (!resp.ok) {
        throw new Error((data && data.error) || 'Failed to update roles');
      }
      var updatedUser = data && data.user ? data.user : null;
      setUsers(function(prev) {
        return prev.map(function(user) {
          if (user.id !== userId) return user;
          var nextRoles = updatedUser && Array.isArray(updatedUser.roles) ? updatedUser.roles : [];
          return {
            ...user,
            roles: nextRoles,
            initialRoles: nextRoles.slice()
          };
        });
      });
      setStatus('Roles updated for ' + (targetUser.email || 'user') + '.');
    } catch (err) {
      setError(err && err.message ? err.message : 'Failed to update roles');
    } finally {
      setSaving(function(prev) {
        var next = { ...prev };
        delete next[userId];
        return next;
      });
    }
  }

  const roleNames = useMemo(function() {
    return roles.map(function(role) { return role.name; });
  }, [roles]);

  async function fetchAuditTables() {
    setAuditLoading(true);
    setAuditError(null);
    try {
      const resp = await fetch(buildApiUrl('/api/admin/audit/tables'), { credentials: 'include' });
      const data = await resp.json().catch(function(){ return null; });
      if (!resp.ok) {
        throw new Error((data && data.error) || 'Failed to load audit tables');
      }
      const tables = (data && data.tables) ? data.tables : [];
      setAuditTables(tables);
      if (tables.length > 0 && !selectedTable) {
        setSelectedTable(tables[0]);
      }
    } catch (err) {
      setAuditError(err && err.message ? err.message : 'Failed to load audit tables');
    } finally {
      setAuditLoading(false);
    }
  }

  async function fetchAuditRecords(tableName, page) {
    setAuditLoading(true);
    setAuditError(null);
    try {
      const resp = await fetch(buildApiUrl(`/api/admin/audit/${tableName}?page=${page}&limit=50`), { credentials: 'include' });
      const data = await resp.json().catch(function(){ return null; });
      if (!resp.ok) {
        throw new Error((data && data.error) || 'Failed to load audit records');
      }
      setAuditRecords((data && data.records) ? data.records : []);
      setAuditPagination((data && data.pagination) ? data.pagination : { total: 0, totalPages: 1 });
    } catch (err) {
      setAuditError(err && err.message ? err.message : 'Failed to load audit records');
    } finally {
      setAuditLoading(false);
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch {
      return dateStr;
    }
  }

  function formatOperation(op) {
    if (!op) return '-';
    const colors = {
      'INSERT': '#10b981',
      'UPDATE': '#f59e0b',
      'DELETE': '#ef4444'
    };
    const color = colors[op] || '#6b7280';
    return (
      <span style={{ 
        color: color, 
        fontWeight: '600',
        textTransform: 'uppercase',
        fontSize: '0.75rem'
      }}>
        {op}
      </span>
    );
  }

  if (checking) {
    return (
      <div className="app-layout">
        <Sidebar />
        <main className="app-main">
          <div className="app-loading">Checking session…</div>
        </main>
      </div>
    );
  }

  if (!user) {
    return <AuthForm onAuthed={function(u){ setUser(u); }} />;
  }

  if (!isAdmin) {
    return (
      <div className="app-layout">
        <Sidebar />
        <main className="app-main">
          <div className="app-content">
            <div className="card">
              <div className="card-header">
                <h2 className="title">Admin</h2>
                <div className="subtitle">Admin access required.</div>
              </div>
              <div className="card-body">
                <div className="admin-message error">You do not have access to the admin portal.</div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="app-main">
        <div className="app-blob app-blob-1" />
        <div className="app-blob app-blob-2" />
        <div className="app-content admin-portal">
          {/* Tabs */}
          <div className="admin-tabs" style={{ marginBottom: '1.5rem' }}>
            <button
              className={activeTab === 'users' ? 'admin-tab active' : 'admin-tab'}
              onClick={() => setActiveTab('users')}
            >
              Users
            </button>
            <button
              className={activeTab === 'audit' ? 'admin-tab active' : 'admin-tab'}
              onClick={() => setActiveTab('audit')}
            >
              Audit Logs
            </button>
          </div>

          {/* Users Tab */}
          {activeTab === 'users' && (
            <div className="card">
              <div className="card-header">
                <h2 className="title">Manage users</h2>
                <div className="subtitle">Assign roles to manage permissions.</div>
                <div className="admin-header-actions">
                  <button className="btn btn-secondary" onClick={fetchUsers} disabled={loading}>
                    Refresh
                  </button>
                </div>
              </div>
              <div className="card-body admin-body">
                {loading && <div className="admin-message">Loading users…</div>}
                {!loading && error && <div className="admin-message error">{error}</div>}
                {!loading && status && <div className="admin-message success">{status}</div>}
                {!loading && !error && (
                  <div className="admin-table-wrapper">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>User</th>
                          <th>Roles</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map(function(user) {
                          var isSaving = !!saving[user.id];
                          var dirty = hasChanges(user);
                          return (
                            <tr key={user.id}>
                              <td>
                                <div className="user-primary">{user.email}</div>
                                <div className="user-secondary">
                                  {(user.firstName || user.lastName) ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'No name'}
                                </div>
                              </td>
                              <td>
                                <div className="role-checkboxes">
                                  {roleNames.length === 0 && <div className="user-secondary">No roles configured.</div>}
                                  {roleNames.map(function(role) {
                                    var checked = Array.isArray(user.roles) ? user.roles.indexOf(role) > -1 : false;
                                    var inputId = `${user.id}-${role}`;
                                    return (
                                      <label key={role} htmlFor={inputId} className="role-checkbox">
                                        <input
                                          id={inputId}
                                          type="checkbox"
                                          checked={checked}
                                          onChange={function(e){ toggleRole(user.id, role, e.target.checked); }}
                                          disabled={isSaving}
                                        />
                                        <span>{role}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </td>
                              <td>
                                <div className="admin-row-actions">
                                  <button
                                    className="btn btn-secondary"
                                    type="button"
                                    disabled={!dirty || isSaving}
                                    onClick={function(){ resetRoles(user.id); }}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    className="btn"
                                    type="button"
                                    disabled={!dirty || isSaving}
                                    onClick={function(){ handleSaveRoles(user.id); }}
                                  >
                                    {isSaving ? 'Saving…' : 'Save'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Audit Logs Tab */}
          {activeTab === 'audit' && (
            <div className="card">
              <div className="card-header">
                <h2 className="title">Audit Logs</h2>
                <div className="subtitle">View change history for all tables.</div>
                <div className="admin-header-actions">
                  <button className="btn btn-secondary" onClick={fetchAuditTables} disabled={auditLoading}>
                    Refresh
                  </button>
                </div>
              </div>
              <div className="card-body admin-body">
                {auditLoading && !auditRecords.length && <div className="admin-message">Loading audit tables…</div>}
                {!auditLoading && auditError && <div className="admin-message error">{auditError}</div>}
                {!auditLoading && !auditError && (
                  <>
                    {/* Table Selector */}
                    <div style={{ marginBottom: '1.5rem' }}>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#374151' }}>
                        Select Audit Table:
                      </label>
                      <select
                        value={selectedTable || ''}
                        onChange={(e) => {
                          setSelectedTable(e.target.value);
                          setAuditPage(1);
                        }}
                        style={{
                          padding: '0.5rem',
                          borderRadius: '0.375rem',
                          border: '1px solid #d1d5db',
                          fontSize: '0.875rem',
                          minWidth: '200px',
                          backgroundColor: 'white'
                        }}
                      >
                        {auditTables.map(function(table) {
                          return (
                            <option key={table} value={table}>
                              {table.replace('_audit', '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {/* Audit Records Table */}
                    {selectedTable && (
                      <>
                        {auditLoading && <div className="admin-message">Loading records…</div>}
                        {!auditLoading && auditRecords.length === 0 && (
                          <div className="admin-message">No audit records found for this table.</div>
                        )}
                        {!auditLoading && auditRecords.length > 0 && (
                          <>
                            <div className="admin-table-wrapper" style={{ overflowX: 'auto', maxHeight: '600px' }}>
                              <table className="admin-table">
                                <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f9fafb' }}>
                                  <tr>
                                    <th>Operation</th>
                                    <th>Timestamp</th>
                                    <th>User</th>
                                    <th>Record ID</th>
                                    <th>Details</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {auditRecords.map(function(record, idx) {
                                    var recordId = record.id || record[Object.keys(record).find(k => k === 'id' || k.endsWith('_id'))] || '-';
                                    return (
                                      <tr key={record.audit_id || idx}>
                                        <td>{formatOperation(record.audit_operation)}</td>
                                        <td>{formatDate(record.audit_timestamp)}</td>
                                        <td style={{ fontSize: '0.75rem' }}>
                                          {record.audit_user_email ? (
                                            <div>
                                              <div style={{ color: '#374151', fontWeight: '500' }}>
                                                {record.audit_user_email}
                                              </div>
                                              <div style={{ color: '#6b7280', fontSize: '0.7rem', marginTop: '2px' }}>
                                                {record.audit_user_id || '-'}
                                              </div>
                                            </div>
                                          ) : (
                                            <div style={{ color: '#6b7280' }}>
                                              {record.audit_user_id || '-'}
                                            </div>
                                          )}
                                        </td>
                                        <td style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                          {recordId}
                                        </td>
                                        <td>
                                          <details style={{ cursor: 'pointer' }}>
                                            <summary style={{ fontSize: '0.75rem', color: '#3b82f6' }}>
                                              View Details
                                            </summary>
                                            <div style={{ marginTop: '0.5rem', padding: '0.5rem', backgroundColor: '#f9fafb', borderRadius: '0.25rem', fontSize: '0.75rem' }}>
                                              {record.audit_old_values && (
                                                <div style={{ marginBottom: '0.5rem' }}>
                                                  <strong>Old Values:</strong>
                                                  <pre style={{ marginTop: '0.25rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                                    {JSON.stringify(record.audit_old_values, null, 2)}
                                                  </pre>
                                                </div>
                                              )}
                                              {record.audit_new_values && (
                                                <div>
                                                  <strong>New Values:</strong>
                                                  <pre style={{ marginTop: '0.25rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                                    {JSON.stringify(record.audit_new_values, null, 2)}
                                                  </pre>
                                                </div>
                                              )}
                                            </div>
                                          </details>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                            
                            {/* Pagination */}
                            {auditPagination.totalPages > 1 && (
                              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                                  Showing page {auditPagination.page} of {auditPagination.totalPages} ({auditPagination.total} total records)
                                </div>
                                <div>
                                  <button
                                    className="btn btn-secondary"
                                    onClick={() => setAuditPage(p => Math.max(1, p - 1))}
                                    disabled={auditPage === 1 || auditLoading}
                                    style={{ marginRight: '0.5rem' }}
                                  >
                                    Previous
                                  </button>
                                  <button
                                    className="btn btn-secondary"
                                    onClick={() => setAuditPage(p => Math.min(auditPagination.totalPages, p + 1))}
                                    disabled={auditPage >= auditPagination.totalPages || auditLoading}
                                  >
                                    Next
                                  </button>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

