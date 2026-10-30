# Validation still needed in an isolated staging environment

The automated browser suite uses real browser storage and multiple tabs but a fake account/cloud service. It does **not** validate live Supabase authentication, row-level write policies, real email delivery, two physical devices, physical microphones, or the deployed site's security. No independently verified staging deployment or project was available for this work; do not run these checks against production.

## Prerequisites

- Identify a separate staging Supabase project and deployment, with disposable test accounts and data, and verify their project ref, URL, redirects and isolation before starting. Use only public/publishable keys in browser configuration; keep administrative and SMTP credentials out of the repository.
- Prepare two test email inboxes, two devices/browsers, and consented participants with physical microphones. Preserve optional login and email/password signup without mandatory email confirmation.
- Back up the disposable staging data if needed and agree on cleanup. Use rollback-only checks where possible and avoid destructive probes. Never use real customer accounts or production data for write/security checks.

## Checks

1. **Auth and RLS:** sign up and sign in two disposable users; confirm anonymous access cannot read or write libraries and each authenticated user can select, insert and update only their own row, including attempts to supply the other user's ID. Confirm the app receives clear errors rather than leaking data. Use staging-scoped credentials and test claims only.
2. **Sync and ownership:** test a guest library adopting its first account, account A → B → A on one browser, sign-out's documented local copy, and concurrent same-item and different-item edits on two devices. Include offline edits, reconnect, deletion tombstones, clock skew and a delayed response after account change. Check that an A draft cannot be saved to B. Record which version wins under [the documented policy](sync-conflicts.md).
3. **Email:** with a configured staging sender, verify password recovery and optional verification links, expiry, redirect allowlists and behavior when delivery fails. Do not turn on mandatory confirmation merely to test email.
4. **Microphones:** on representative mobile and desktop browsers, test tuner and adaptive metronome with real instruments at low and high tempos; include permission denial, revocation, unplugging, navigation, cancellation during startup and repeated start/stop. Verify the browser's microphone indicator goes out when stopped. Synthetic streams do not establish acoustic accuracy.
5. **Deployment security:** inspect the actual staging deployment headers, trusted proxy and Host handling, HTTPS, allowed auth redirects, public environment values and absence of secret keys. Check the shipped build and routes, not only the local Vite preview. Avoid destructive or automated security scanning outside the authorized staging scope.
6. **Usability:** run the consented beginner study in [guitarist-study.md](guitarist-study.md) and repeat the [performance measurements](performance-notes.md) on representative devices and networks. Record environment, results and failures separately from automated test results.
