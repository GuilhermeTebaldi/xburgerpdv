export interface RequestContext {
  requestId: string;
  origin: 'API' | 'SYSTEM' | 'IMPORT';
  actorUserId?: string;
  ipAddress?: string;
  userAgent?: string;
}
