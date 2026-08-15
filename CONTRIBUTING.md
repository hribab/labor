# Contributing to Labor

Thank you for helping make autonomous product building available to more people.

## Start in the right place

- Ask design and architecture questions in [GitHub Discussions](https://github.com/hribab/labor/discussions).
- Report reproducible bugs with the bug issue form.
- Propose focused product changes with the feature request form.
- Report vulnerabilities privately according to [SECURITY.md](SECURITY.md).

Please do not put API keys, OAuth tokens, service-account files, private source archives, customer data, project logs, or unredacted project identifiers in an issue, discussion, or pull request.

## Local setup

```bash
git clone https://github.com/hribab/labor.git
cd labor
pnpm install
cp .env.example .env.local
cp .firebaserc.example .firebaserc
cp functions/.env.example functions/.env.your-firebase-project-id
pnpm run dev
```

Use a dedicated development Firebase project. Do not point tests or experiments at a production project.

## Before a pull request

```bash
pnpm run check
```

For changes to cloud provisioning, release workflows, Storage transport, IAM, customer data-plane routing, or generated source specialization, add or update a focused Functions test.

For UI changes, verify the affected desktop and mobile layouts. Keep Labor's interface restrained, accessible, responsive, and consistent with its liquid-glass visual language.

## Engineering principles

- Generated applications belong in the connected user's cloud.
- Control-plane data should stay minimal.
- Never introduce a hidden dependency on Labor-owned infrastructure.
- Never weaken authentication, Firestore/Storage ownership boundaries, or IAM checks to make a workflow easier.
- Keep physical compatibility identifiers unless a complete migration is part of the change.
- Prefer the existing architecture and helpers over parallel implementations.
- Keep changes focused and explain behavior changes in the pull request.
- Do not add premium-only behavior or a paid feature gate.

## Pull requests

1. Open an issue or discussion first for large architectural changes.
2. Keep one pull request focused on one outcome.
3. Describe the user impact and cloud/security impact.
4. List the checks you ran.
5. Include screenshots for visible UI changes.
6. Call out migrations, new permissions, new APIs, and provider-cost implications.

By contributing, you agree that your contribution is licensed under the repository's AGPL-3.0 license.
