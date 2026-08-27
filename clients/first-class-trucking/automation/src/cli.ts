#!/usr/bin/env node
import { loadConfig } from "./config.ts";
import { openAuthenticatedTools } from "./rateview.ts";
import { runQuote } from "./runner.ts";
import { WorkflowError } from "./types.ts";

function usage(): string {
  return `First Class Trucking DAT RateView CLI

Commands:
  npm run auth
  npm run quote -- --request-id ID --origin "City, ST" --destination "City, ST" --equipment Van --approve-search

The quote command refuses to press SEARCH unless --approve-search is present.`;
}

function parseOptions(args: string[]): Record<string, string | boolean> {
  const allowed = new Set([
    "--request-id",
    "--origin",
    "--destination",
    "--equipment",
    "--approve-search",
  ]);
  const parsed: Record<string, string | boolean> = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!allowed.has(key)) {
      throw new WorkflowError(
        "VALIDATION_ERROR",
        `Unknown option: ${key}`,
        "RV-010",
      );
    }
    if (key === "--approve-search") {
      parsed[key] = true;
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new WorkflowError(
        "VALIDATION_ERROR",
        `Missing value for ${key}.`,
        "RV-010",
      );
    }
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

async function authenticate(): Promise<void> {
  const config = loadConfig();
  const { context } = await openAuthenticatedTools(config);
  try {
    outputJson({ status: "AUTHENTICATED", url: config.toolsUrl });
  } finally {
    await context.close();
  }
}

function outputJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function quote(args: string[]): Promise<void> {
  const options = parseOptions(args);
  const outcome = await runQuote({
    requestId: options["--request-id"] as string | undefined,
    origin: options["--origin"] as string | undefined,
    destination: options["--destination"] as string | undefined,
    equipmentType: options["--equipment"] as string | undefined,
    approveSearch: options["--approve-search"] === true,
  });
  outputJson(outcome);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === "auth") return authenticate();
  if (command === "quote") return quote(args);
  process.stdout.write(`${usage()}\n`);
  if (command) process.exitCode = 2;
}

main().catch((error) => {
  const category = error instanceof WorkflowError ? error.category : "STARTUP_ERROR";
  outputJson({
    status: "ERROR",
    category,
    message: error instanceof Error ? error.message : "Unknown error",
  });
  process.exitCode = 1;
});
