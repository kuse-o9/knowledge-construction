# Study Note / railway work — 2026-10-27

- The user explicitly marked study-app plan ㉔ complete. This is their plan status; end-to-end owner/account verification remains unperformed because maintenance restricts access.
- Six Kaiji screenshots show terrain covering tracks and platforms and a tall spike. User permits cutting terrain. Full-route visual correction and verification remain open; remote browser reports WebGL disabled.
- User requests all routes: stopped surrounding trains visibly open doors and passengers board, from cab and exterior cameras. Not implemented yet.
- Japanese speech should read 号車 as ごうしゃ. Implemented for express, Yamanote and railway audio controllers; bundle-based routes and other pronunciation contexts remain to be audited. Speech mock test passed; actual listening is unverified. Deployment requires live verification.

- A guard caps open-cut retaining wall rise at 12 m instead of allowing the approximate −592 m offset to produce a 593 m wall. Checked all 1,653 Kaiji and 3,194 Azusa offset samples in each direction and accelerated four direction driving tests; these are numerical checks, not visual GPU confirmation. Needs visual checks and terrain/track intersection remediation across the full route.
- Car reading correction also injected into four existing compressed-bundle routes (Chuo, Chuo local, Sobu, Keihin); actual sound verification and remaining pronunciation review are still open.
