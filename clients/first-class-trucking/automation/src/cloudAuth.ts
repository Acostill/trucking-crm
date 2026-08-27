#!/usr/bin/env node
import { loadConfig } from "./config.ts";
import { openAuthenticatedTools } from "./rateview.ts";
import { WorkflowError } from "./types.ts";

async function waitForShutdown(): Promise<void> {
  await new Promise<void>((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
}

async function main(): Promise<void> {
  const config = loadConfig();
  if (config.headless) {
    throw new Error("Cloud authentication requires DAT_HEADLESS=0.");
  }
  process.stdout.write(`${JSON.stringify({
    status: "CLOUD_AUTH_WAITING",
    message: "Open the Railway browser desktop and complete DAT login/MFA manually.",
  })}\n`);
  const opened = await openAuthenticatedTools(config, {
    humanAuthMode: "observe",
    authenticationOnly: true,
  });
  process.stdout.write(`${JSON.stringify({
    status: "CLOUD_AUTH_READY",
    message: "DAT authenticated successfully. Switch DAT_SERVICE_MODE to worker and redeploy.",
  })}\n`);
  try {
    await waitForShutdown();
  } finally {
    await opened.context.close().catch(() => undefined);
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    status: "CLOUD_AUTH_ERROR",
    category: error instanceof WorkflowError ? error.category : "STARTUP_ERROR",
    message: error instanceof Error ? error.message : "Unknown error",
  })}\n`);
  process.exitCode = 1;
});
