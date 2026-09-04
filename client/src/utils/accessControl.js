export function userHasRole(user, requiredRole) {
  const roles = user && Array.isArray(user.roles) ? user.roles : [];
  return roles.indexOf('admin') > -1 || roles.indexOf(requiredRole) > -1;
}

export function userCanManageQuotes(user) {
  return userHasRole(user, 'quote_approver');
}
