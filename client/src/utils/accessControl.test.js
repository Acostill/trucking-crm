import { userCanManageQuotes, userHasRole } from './accessControl';

describe('access control', function() {
  test('administrators inherit quote approver access', function() {
    const admin = { roles: ['admin'] };

    expect(userHasRole(admin, 'quote_approver')).toBe(true);
    expect(userCanManageQuotes(admin)).toBe(true);
  });

  test('non-admin users still need the requested role', function() {
    expect(userCanManageQuotes({ roles: ['agent'] })).toBe(false);
    expect(userCanManageQuotes({ roles: ['quote_approver'] })).toBe(true);
  });
});
