# Security Policy

Labor can provision cloud resources, deploy code, and handle model credentials. Security reports deserve a private path and enough detail to reproduce the issue safely.

## Supported version

Security fixes are applied to the latest code on the default branch. The project does not currently maintain separate supported release lines.

## Report a vulnerability privately

Do not open a public issue for a suspected vulnerability.

Use GitHub's private vulnerability reporting for `hribab/labor` when it is available, or email [hari@onroad.app](mailto:hari@onroad.app) with the subject `[Labor Security]`.

Include:

- The affected workflow, route, Function, or resource.
- The impact and who could be affected.
- Reproduction steps or a minimal proof of concept.
- Whether the issue was observed in a control project or customer project.
- Redacted logs and screenshots when useful.
- Any temporary mitigation you discovered.

Never send active API keys, OAuth tokens, service-account private keys, customer data, or complete private source archives. We will arrange a safer transfer method if one is necessary.

## Response

We aim to acknowledge a report within 5 business days, validate it, coordinate a fix, and credit the reporter when requested and safe. Timing depends on impact, complexity, and provider coordination.

Please allow a reasonable remediation period before public disclosure.

## Operational safety

- Use a dedicated Google Cloud project while testing Labor.
- Apply least privilege and review OAuth scopes and IAM grants.
- Restrict Firebase web API keys to the intended APIs and applications.
- Use Firestore and Storage Security Rules; a hidden Firebase config is not a security boundary.
- Set cloud budgets, quotas, and billing alerts.
- Revoke credentials immediately if they appear in a commit, log, issue, or screenshot.
