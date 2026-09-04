import assert from 'assert';
import db from '../db';
import { evaluateEnvironmentSafety, runtimeEnvironment } from '../config/environmentSafety';
import { evaluateDatabaseIdentity } from '../config/databaseIdentity';
import { deriveGmailHealth } from '../services/operationsHealth';
import { userHasAnyRole, userHasPermission } from '../utils/auth';

function gmailState(overrides: Record<string, any> = {}): any {
  return {
    running: false,
    enabled: true,
    configured: true,
    mailboxAddress: 'emailbot@example.com',
    lastDiscovered: 0,
    lastCreated: 0,
    lastSkipped: 0,
    lastFailed: 0,
    ...overrides
  };
}

async function main() {
  assert.equal(
    userHasPermission({ permissions: ['quotes.read', 'loads.read'] }, 'loads.read'),
    true
  );
  assert.equal(userHasPermission({ permissions: ['quotes.read'] }, 'loads.manage'), false);
  assert.equal(userHasPermission(null, 'loads.read'), false);

  assert.equal(userHasAnyRole({ roles: ['admin'] }, ['quote_approver']), true);
  assert.equal(userHasAnyRole({ roles: ['quote_approver'] }, ['quote_approver']), true);
  assert.equal(userHasAnyRole({ roles: ['agent'] }, ['quote_approver']), false);

  assert.equal(runtimeEnvironment({ RAILWAY_ENVIRONMENT: 'production' }), 'production');
  assert.equal(runtimeEnvironment({ RAILWAY_PROJECT_ID: 'project-id' }), 'production');

  const productionUnlabeled = evaluateEnvironmentSafety({ NODE_ENV: 'production' });
  assert.equal(productionUnlabeled.enforced, true);
  assert.equal(productionUnlabeled.safe, false);

  const productionSafe = evaluateEnvironmentSafety({
    NODE_ENV: 'production',
    DATABASE_ENVIRONMENT: 'production'
  });
  assert.equal(productionSafe.safe, true);

  const developmentProductionDb = evaluateEnvironmentSafety({
    NODE_ENV: 'development',
    DATABASE_ENVIRONMENT: 'production',
    DATABASE_SAFETY_ENFORCED: 'true'
  });
  assert.equal(developmentProductionDb.safe, false);

  const developmentUnlabeledEnforced = evaluateEnvironmentSafety({
    NODE_ENV: 'development',
    DATABASE_SAFETY_ENFORCED: 'true'
  });
  assert.equal(developmentUnlabeledEnforced.safe, false);

  assert.equal(evaluateDatabaseIdentity(productionSafe, 'production').safe, true);
  assert.equal(evaluateDatabaseIdentity(productionSafe, 'development').safe, false);
  assert.equal(evaluateDatabaseIdentity(productionSafe, null, false).safe, false);

  const now = Date.parse('2026-09-03T12:00:00.000Z');
  assert.equal(
    deriveGmailHealth(
      gmailState({ lastSuccessAt: '2026-09-03T11:59:30.000Z' }),
      60000,
      now
    ).state,
    'online'
  );
  assert.equal(
    deriveGmailHealth(
      gmailState({ lastSuccessAt: '2026-09-03T11:50:00.000Z' }),
      60000,
      now
    ).state,
    'stale'
  );
  assert.equal(
    deriveGmailHealth(gmailState({ lastError: 'OAuth refresh failed' }), 60000, now).state,
    'error'
  );
  assert.equal(
    deriveGmailHealth(gmailState({ configured: false }), 60000, now).state,
    'misconfigured'
  );

  console.log('Phase 1 hardening checks passed.');
}

main()
  .catch(function(err) {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async function() {
    await db.pool.end();
  });
