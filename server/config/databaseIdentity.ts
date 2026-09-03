import db from '../db';
import {
  DatabaseEnvironment,
  EnvironmentSafety,
  evaluateEnvironmentSafety
} from './environmentSafety';

export interface DatabaseIdentityStatus {
  safe: boolean;
  verified: boolean;
  expected: DatabaseEnvironment;
  actual: DatabaseEnvironment | 'missing';
  issue: string | null;
}

export function evaluateDatabaseIdentity(
  environment: EnvironmentSafety,
  storedValue: string | null | undefined,
  metadataAvailable = true
): DatabaseIdentityStatus {
  const expected = environment.databaseEnvironment;
  if (expected === 'unlabeled' || expected === 'invalid') {
    return {
      safe: !environment.enforced && environment.safe,
      verified: false,
      expected,
      actual: metadataAvailable ? 'missing' : 'missing',
      issue: 'The application database environment is not labeled.'
    };
  }

  if (!metadataAvailable || !storedValue) {
    return {
      safe: !environment.enforced,
      verified: false,
      expected,
      actual: 'missing',
      issue: 'The database identity marker is missing. Run the Phase 1 hardening migration.'
    };
  }

  const actual = String(storedValue).trim().toLowerCase() as DatabaseEnvironment;
  const matches = actual === expected;
  return {
    safe: environment.safe && matches,
    verified: matches,
    expected,
    actual,
    issue: matches
      ? null
      : `Database identity mismatch: application expects ${expected}, database is labeled ${actual}.`
  };
}

export async function inspectDatabaseIdentity(
  env: NodeJS.ProcessEnv = process.env
): Promise<DatabaseIdentityStatus> {
  const environment = evaluateEnvironmentSafety(env);
  try {
    const result = await db.query(
      `SELECT environment
       FROM public.application_environment
       WHERE singleton = TRUE`
    );
    return evaluateDatabaseIdentity(
      environment,
      result.rows[0] && result.rows[0].environment,
      true
    );
  } catch (err: any) {
    if (err && err.code === '42P01') {
      return evaluateDatabaseIdentity(environment, null, false);
    }
    throw err;
  }
}

export async function assertDatabaseIdentity(
  env: NodeJS.ProcessEnv = process.env
): Promise<DatabaseIdentityStatus> {
  const environment = evaluateEnvironmentSafety(env);
  const identity = await inspectDatabaseIdentity(env);
  if (environment.enforced && !identity.safe) {
    throw new Error(identity.issue || 'The configured database identity is unsafe.');
  }
  return identity;
}
