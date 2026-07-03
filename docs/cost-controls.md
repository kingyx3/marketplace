# Cost controls

Target: **near-zero fixed cost before revenue**, linear cost after.

## Platform (scale-to-zero by default)

| Service | Free tier covers | First paid step |
| --- | --- | --- |
| Vercel (Hobby→Pro) | scaffold traffic easily | Pro ~US$20/mo when commercial use requires it |
| Supabase | 2 free projects (500MB DB) | Pro US$25/mo/project — upgrade production first |
| Stripe | no fixed fee | per-transaction only (~3.4% + S$0.50 domestic SG) |
| GitHub Actions | 2,000 min/mo (private repos) | pay-as-you-go |

Practical staging note: with only 2 free Supabase projects, run
`development` + `production` free and add `staging` when revenue
justifies a Pro project (or point staging at the development project
initially — separate Stripe *test* keys keep money paths isolated).

## CI spend

- `concurrency` groups cancel superseded runs on the same ref.
- Affected-path detection skips app jobs on ordinary docs-only changes,
  while env/deploy docs and workflow changes run focused config tests.
- Jobs are parallel and npm-cached; the whole CI suite is minutes, not
  tens of minutes.

## Waste guards

- No always-on compute anywhere in the stack.
- Vercel deployment artifacts and Actions logs age out on platform
  defaults; nothing is archived indefinitely by us.
- Prune stale Vercel preview deployments during monthly admin review if
  preview sprawl starts obscuring the active environments.
- Rotate provider secrets intentionally. The repo does not use GCP
  Secret Manager, so there are no GCP secret versions to prune.
- Notification providers are feature-gated by env keys — no key, no
  channel, no subscription.

## Monthly review

Use `docs/admin-operations.md` as the operator checklist. At minimum,
review GitHub Actions minutes, Vercel project usage, Supabase database
size/storage, Stripe test/live mode separation, and unused notification
provider keys.

## When volume arrives

Documented upgrade paths, in cost order: Supabase Pro (production),
Vercel Pro, dedicated search (Typesense self-host ~US$10/mo VPS vs
Algolia usage pricing), then warehouse/3PL integration — see
`docs/research/12-financial-model.md` for the revenue thresholds.
