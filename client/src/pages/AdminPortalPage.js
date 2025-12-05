import React, { useEffect, useMemo, useState } from 'react';
import { buildApiUrl } from '../config';
import GlobalTopbar from '../components/GlobalTopbar';

function normalizeRoles(list) {
  return Array.isArray(list) ? list.slice().sort().join('|') : '';
}

export default function AdminPortalPage() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState({});

  useEffect(function() {
    fetchUsers();
  }, []);

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

  return (
    <div className="shell admin-portal">
      <GlobalTopbar />
      <div className="container">
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
      </div>
    </div>
  );
}

