import { expect, test as base, type Page, type TestInfo } from "@playwright/test";

interface BrowserHealthFixtures {
  browserHealth: void;
}

export const test = base.extend<BrowserHealthFixtures>({
  browserHealth: [
    async ({ page }, use, testInfo) => {
      const errors = collectBrowserErrors(page, testInfo);

      await use();

      expect.soft(errors, "browser runtime errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

function collectBrowserErrors(page: Page, testInfo: TestInfo): string[] {
  const errors: string[] = [];
  const baseURL = testInfo.project.use.baseURL;
  const appOrigin = typeof baseURL === "string" ? new URL(baseURL).origin : null;

  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`);
  });

  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console: ${message.text()}`);
    }
  });

  page.on("response", (response) => {
    const url = response.url();
    if (response.status() >= 500 && (!appOrigin || new URL(url).origin === appOrigin)) {
      errors.push(`http ${response.status()}: ${url}`);
    }
  });

  return errors;
}
