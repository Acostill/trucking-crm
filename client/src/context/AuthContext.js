import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { buildApiUrl } from '../config';

var AuthContext = createContext({
  user: null,
  checking: true,
  refresh: function() {},
  signOut: function() {},
  setUser: function() {}
});

export function AuthProvider(props) {
  var children = props.children;
  var [user, setUser] = useState(null);
  var [checking, setChecking] = useState(true);

  var refresh = useCallback(async function() {
    setChecking(true);
    try {
      var resp = await fetch(buildApiUrl('/api/auth/me'), { credentials: 'include' });
      if (resp.ok) {
        var data = await resp.json().catch(function(){ return null; });
        setUser(data && data.user ? data.user : null);
      } else {
        setUser(null);
      }
    } catch (_err) {
      setUser(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(function() {
    refresh();
  }, [refresh]);

  var signOut = useCallback(async function() {
    try {
      await fetch(buildApiUrl('/api/auth/signout'), { method: 'POST', credentials: 'include' });
    } catch (_e) {
      // ignore
    } finally {
      setUser(null);
    }
  }, []);

  var value = {
    user: user,
    checking: checking,
    refresh: refresh,
    signOut: signOut,
    setUser: setUser
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

