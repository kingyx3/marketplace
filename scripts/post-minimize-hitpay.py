#!/usr/bin/env python3
import re
from pathlib import Path

path = Path("tests/deployment-idempotency.test.ts")
text = path.read_text(encoding="utf-8")
text = re.sub(
    r'  it\("derives non-secret HitPay configuration instead of requiring GitHub variables".*?\n  \}\);\n\}\);',
    '''  it("derives non-secret HitPay configuration from versioned defaults", async () => {
    const hitpay = await repoFile("lib/hitpay.ts");
    const webhook = await repoFile("scripts/lib/hitpay-webhook.mjs");
    const bootstrap = await repoFile("scripts/bootstrap-github.mjs");
    const config = JSON.parse(await repoFile("config/environments.json"));

    expect(hitpay).toContain('env.TARGET_ENV === "production"');
    expect(hitpay).toContain('env.HITPAY_PAYMENT_METHODS || "paynow_online"');
    expect(webhook).toContain('webhookName: `${appName} ${targetEnv} payments`');
    expect(webhook).toContain('"payment_request.completed"');
    expect(config.shared.HITPAY_API_URL).toBe("https://api.sandbox.hit-pay.com");
    expect(config.environments.production.HITPAY_API_URL).toBe("https://api.hit-pay.com");
    expect(config.shared).not.toHaveProperty("HITPAY_WEBHOOK_ENABLED_EVENTS");
    expect(bootstrap).not.toContain('  "HITPAY_API_URL",\\n  "HITPAY_PAYMENT_METHODS"');
    expect(bootstrap).toContain('deleteEnvironmentSettingIfPresent("variable", environment, legacy)');
  });
});''',
    text,
    flags=re.S,
)
path.write_text(text, encoding="utf-8")
Path(__file__).unlink()
