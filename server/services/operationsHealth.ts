import { evaluateEnvironmentSafety } from '../config/environmentSafety';
import { inspectDatabaseIdentity } from '../config/databaseIdentity';
import { getDatWorkerStatus } from './datRateViewJobs';
import { getEmailQuotePollState } from './emailQuotePoller';
import { getGmailMailboxConfiguration } from './gmailQuoteInbox';

function safeMessage(value: any): string | null {
  const message = String(value || '').trim().replace(/\s+/g, ' ');
  return message ? message.slice(0, 300) : null;
}

export function deriveGmailHealth(
  state: ReturnType<typeof getEmailQuotePollState>,
  pollIntervalMs: number,
  nowMs = Date.now()
): any {
  const staleAfterMs = Math.max(pollIntervalMs * 3, 5 * 60 * 1000);
  const lastSuccessMs = state.lastSuccessAt ? new Date(state.lastSuccessAt).getTime() : 0;
  const staleForMs = lastSuccessMs ? Math.max(0, nowMs - lastSuccessMs) : null;
  let healthState = 'online';
  if (!state.enabled) healthState = 'disabled';
  else if (!state.configured) healthState = 'misconfigured';
  else if (state.lastError) healthState = 'error';
  else if (state.running) healthState = 'checking';
  else if (!lastSuccessMs) healthState = 'starting';
  else if (staleForMs != null && staleForMs > staleAfterMs) healthState = 'stale';

  return {
    state: healthState,
    enabled: state.enabled,
    configured: state.configured,
    running: state.running,
    mailboxAddress: state.mailboxAddress,
    connectedAddress: state.connectedAddress || null,
    lastAttemptAt: state.lastAttemptAt || null,
    lastSuccessAt: state.lastSuccessAt || null,
    lastError: safeMessage(state.lastError),
    lastDiscovered: state.lastDiscovered,
    lastCreated: state.lastCreated,
    lastFailed: state.lastFailed,
    staleForMs,
    staleAfterMs,
    missing: state.configured ? [] : (state.missing || [])
  };
}

export async function getOperationsHealth(): Promise<any> {
  const gmailState = getEmailQuotePollState();
  const gmailConfig = getGmailMailboxConfiguration();
  const [dat, databaseIdentity] = await Promise.all([
    getDatWorkerStatus(),
    inspectDatabaseIdentity()
  ]);
  const environment = evaluateEnvironmentSafety();
  const gmail = deriveGmailHealth(gmailState, gmailConfig.pollIntervalMs);
  const integrationAttention = [
    'disabled', 'misconfigured', 'error', 'stale', 'offline', 'needs_auth'
  ];
  const databaseSafe = environment.safe && databaseIdentity.safe;
  const databaseState = databaseSafe
    ? (environment.issues.length || !databaseIdentity.verified ? 'warning' : 'online')
    : 'unsafe';
  const needsAttention =
    integrationAttention.indexOf(gmail.state) > -1 ||
    integrationAttention.indexOf(dat.state) > -1 ||
    !databaseSafe;

  return {
    overall: needsAttention ? 'attention' : 'online',
    checkedAt: new Date().toISOString(),
    gmail,
    dat,
    database: {
      state: databaseState,
      runtimeEnvironment: environment.runtimeEnvironment,
      databaseEnvironment: environment.databaseEnvironment,
      storedEnvironment: databaseIdentity.actual,
      verified: databaseIdentity.verified,
      enforced: environment.enforced,
      issues: environment.issues.concat(databaseIdentity.issue ? [databaseIdentity.issue] : [])
    }
  };
}
