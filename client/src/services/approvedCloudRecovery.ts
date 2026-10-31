// A narrowly scoped recovery approval. No farm records or credentials are bundled.
// Derived from the local PC copy in the recovery evidence, independently matched
// to pcBaseline in the completed targeted-repair result. Revision is deliberately
// not pinned: every operation reads and checks the currently saved generation.
export const APPROVED_CLOUD_RECOVERY = {
  farmId: 'farm-046e695e-c5a6-4fd5-8d36-1d9732da5e5f',
  contentSha256: 'f1e9a8a8a4c1845ec06af1b5a433b30c990ac8a28b7a2962d1a28587019da6e9',
  recordCount: 185,
  totalCount: 189,
} as const;
