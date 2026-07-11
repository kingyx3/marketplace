# Production-readiness verification addendum — 2026-07-11

This addendum supplements `docs/production-readiness-audit-2026-07-11.md` with execution evidence collected after the initial audit report was committed.

## Initial remediation-branch run

GitHub Actions run `29142698207` executed against commit `e6ed20380e3c3f53317f1f78d346e61dd9cb811e`.

| Check | Result | Evidence |
| --- | --- | --- |
| Dependency installation (`npm ci`) | Passed | Completed successfully in the application and configuration jobs. |
| Unit tests (`npm test`) | Passed | The Vitest job, including the new refund, authorization, and SQL contract regressions, completed successfully. |
| Migration validation | Passed | All migrations applied in filename order to PostgreSQL 15 and the seed completed successfully. |
| Configuration contract | Passed | Environment/config generation and focused deployment/config tests completed successfully. |
| Terraform validation | Passed | Bootstrap and platform format, provider-lock, initialization, and validation checks completed successfully. |
| Type check | Failed | Found an invalid Zod 4 `z.record` call, an invalid Stripe refund-status type annotation, and an unsupported TypeScript 7 compiler selection. |
| Lint | Failed | The Next/TypeScript-ESLint stack crashed while loading against TypeScript 7. |
| Production build | Failed | Next.js rejected the unsupported TypeScript 7 installation. |
| Chromium Playwright | Failed | The E2E job builds first and failed at the same TypeScript toolchain gate. |

The failed checks were treated as defects, not waived.

## Corrections made from CI evidence

- Changed the B2B billing-address schema to the Zod 4 key/value `z.record` form.
- Typed refund status from `Stripe.Refund["status"]` rather than a nonexistent nested type.
- Pinned TypeScript to stable `5.9.3`.
- Replaced the legacy `FlatCompat` ESLint bridge with the native Next.js flat configurations.
- Pinned ESLint to compatible stable `9.39.2`; ESLint 10 was incompatible with the React/Next plugin stack.
- Updated `package-lock.json` from the existing lock so `npm ci` remains reproducible.
- Used branch-only one-shot workflows to update the lockfile; each workflow deleted itself in its bot commit and neither is present in the final branch.

## Intermediate repaired run

GitHub Actions run `29143003471` verified that dependency installation, typecheck, unit tests, migrations, configuration checks, and both Terraform validations passed after the TypeScript and source fixes. Lint then exposed the separate ESLint 10/plugin incompatibility. That failure was fixed rather than ignored. The build and Playwright jobs were still running when the branch advanced to the ESLint repair.

## Final verification gate

A clean GitHub Actions run is required on the fully repaired branch before this PR may be reviewed. Passing repository checks will verify only the code and migration gates available in this repository; they will not resolve the unimplemented P0/P1 product, provider-integration, backup, or observability findings in the main audit report.
