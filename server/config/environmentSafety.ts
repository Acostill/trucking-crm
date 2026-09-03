export type RuntimeEnvironment = 'development' | 'test' | 'production';
export type DatabaseEnvironment = 'development' | 'staging' | 'production' | 'unlabeled' | 'invalid';

export interface EnvironmentSafety {
  safe: boolean;
  enforced: boolean;
  runtimeEnvironment: RuntimeEnvironment;
  databaseEnvironment: DatabaseEnvironment;
  issues: string[];
}

function isTrue(value: string | undefined): boolean {
  return String(value || '').trim().toLowerCase() === 'true';
}

export function runtimeEnvironment(env: NodeJS.ProcessEnv = process.env): RuntimeEnvironment {
  if (env.NODE_ENV === 'test') return 'test';
  const hostedRuntime =
    isTrue(env.RENDER) ||
    Boolean(String(env.RAILWAY_ENVIRONMENT || '').trim()) ||
    Boolean(String(env.RAILWAY_ENVIRONMENT_NAME || '').trim()) ||
    Boolean(String(env.RAILWAY_PROJECT_ID || '').trim());
  if (env.NODE_ENV === 'production' || hostedRuntime) {
    return 'production';
  }
  return 'development';
}

export function databaseEnvironment(env: NodeJS.ProcessEnv = process.env): DatabaseEnvironment {
  const value = String(env.DATABASE_ENVIRONMENT || '').trim().toLowerCase();
  if (!value) return 'unlabeled';
  if (value === 'development' || value === 'staging' || value === 'production') return value;
  return 'invalid';
}

export function evaluateEnvironmentSafety(
  env: NodeJS.ProcessEnv = process.env
): EnvironmentSafety {
  const runtime = runtimeEnvironment(env);
  const database = databaseEnvironment(env);
  const enforced = runtime === 'production' || isTrue(env.DATABASE_SAFETY_ENFORCED);
  const issues: string[] = [];

  if (database === 'unlabeled') {
    issues.push('DATABASE_ENVIRONMENT is not set. Label this database as development, staging, or production.');
  } else if (database === 'invalid') {
    issues.push('DATABASE_ENVIRONMENT must be development, staging, or production.');
  }

  if (runtime === 'production' && database !== 'production') {
    issues.push('A production server must use a database labeled production.');
  }

  if (
    runtime !== 'production' &&
    database === 'production' &&
    !isTrue(env.ALLOW_PRODUCTION_DATABASE_IN_DEVELOPMENT)
  ) {
    issues.push('A non-production server cannot use a database labeled production.');
  }

  const blockingIssue =
    database === 'invalid' ||
    (enforced && database === 'unlabeled') ||
    (runtime === 'production' && database !== 'production') ||
    (runtime !== 'production' && database === 'production' &&
      !isTrue(env.ALLOW_PRODUCTION_DATABASE_IN_DEVELOPMENT));

  return {
    safe: !blockingIssue,
    enforced,
    runtimeEnvironment: runtime,
    databaseEnvironment: database,
    issues
  };
}

export function assertEnvironmentSafety(env: NodeJS.ProcessEnv = process.env): EnvironmentSafety {
  const result = evaluateEnvironmentSafety(env);
  if (result.enforced && !result.safe) {
    throw new Error(`Unsafe database environment: ${result.issues.join(' ')}`);
  }
  return result;
}
