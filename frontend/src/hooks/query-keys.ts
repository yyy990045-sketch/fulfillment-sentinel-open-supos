export const queryKeys = {
  judgeManifest: (tenantId: string, contextId: string) => ["judge-manifest", tenantId, contextId] as const,
};
