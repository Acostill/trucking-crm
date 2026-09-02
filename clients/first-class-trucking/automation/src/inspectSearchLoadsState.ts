#!/usr/bin/env node
import { loadConfig } from "./config.ts";
import { openAuthenticatedTools } from "./rateview.ts";
import { inspectExistingSearchLoadsStructure } from "./searchLoads.ts";

async function main(): Promise<void> {
  const config = loadConfig();
  const opened = await openAuthenticatedTools(config, {
    allowHumanAuth: false,
    humanAuthMode: "deny",
    target: "search-loads",
  });
  try {
    await opened.page.waitForTimeout(3000);
    const state = await opened.page.evaluate(`
    (() => {
      const visible = (element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const safeText = (element) => {
        const text = (element.textContent || "").replace(/\s+/g, " ").trim();
        return /^(?:\d+\s*)?(?:Results?|Loads?|Matches?|No (?:Results?|Loads?|Matches?))(?:\s*\(\d+\))?$/i.test(text)
          ? text.slice(0, 120)
          : null;
      };
      const structural = Array.from(document.querySelectorAll(
        '[data-test*="result" i], [data-test*="count" i], [data-test*="sort" i], [class*="result" i], [class*="count" i], [class*="sort" i]',
      )).filter(visible).slice(0, 80).map((element) => ({
        tag: element.tagName.toLowerCase(),
        dataTest: element.getAttribute("data-test"),
        ariaLabel: element.getAttribute("aria-label"),
        title: element.getAttribute("title"),
        className: String(element.getAttribute("class") || "").slice(0, 160),
        safeText: safeText(element),
      }));
      const sortControls = Array.from(document.querySelectorAll('button, [role="button"], [role="combobox"]'))
        .filter(visible)
        .map((element) => ({
          text: (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
          ariaLabel: element.getAttribute("aria-label"),
          dataTest: element.getAttribute("data-test"),
          title: element.getAttribute("title"),
        }))
        .filter((control) => /sort|newest|rate\s*-\s*highest/i.test([
          control.text,
          control.ariaLabel,
          control.dataTest,
          control.title,
        ].filter(Boolean).join(" ")))
        .slice(0, 20);
      const counter = document.querySelector('[data-test="results-counter"]');
      const counterStructure = counter ? Array.from(counter.querySelectorAll('*')).slice(0, 30).map((element) => ({
        tag: element.tagName.toLowerCase(),
        dataTest: element.getAttribute('data-test'),
        ariaLabel: element.getAttribute('aria-label'),
        title: element.getAttribute('title'),
        value: 'value' in element ? String(element.value || '').slice(0, 80) : null,
        text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
        className: String(element.getAttribute('class') || '').slice(0, 160),
      })) : [];
      return {
        url: location.href,
        title: document.title,
        directRowCount: document.querySelectorAll(
          '.row-container[id^="table-row-"]:not(#table-row-similar-matches-separator)',
        ).length,
        allRowCount: document.querySelectorAll('[id^="table-row-"]').length,
        counterText: counter ? (counter.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 240) : null,
        counterStructure,
        structural,
        sortControls,
      };
    })()
    `);
    const extraction = await inspectExistingSearchLoadsStructure(opened.page, config)
      .catch((error) => ({
        errorCategory: error && typeof error === "object" && "category" in error
          ? String(error.category)
          : "UNEXPECTED_ERROR",
        errorMessage: error instanceof Error
          ? error.message.replace(/\s+/g, " ").slice(0, 600)
          : "Extraction failed",
      }));
    process.stdout.write(`${JSON.stringify({
      ...(state as Record<string, unknown>),
      extraction,
    })}\n`);
  } finally {
    await opened.context.close().catch(() => undefined);
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    status: "inspection_failed",
    category: error && typeof error === "object" && "category" in error
      ? String(error.category)
      : "UNEXPECTED_ERROR",
    message: error instanceof Error ? error.message.replace(/\s+/g, " ").slice(0, 600) : "Inspection failed",
  })}\n`);
  process.exitCode = 1;
});
