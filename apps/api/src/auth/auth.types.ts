import { UserRole } from "@prisma/client";

/**
 * Current authorization context loaded from the database.
 * Permission fields must never be trusted from JWT claims.
 */
export type AuthUser = {
  userId: string;
  role: UserRole;
  clientId: string | null;
  storeIds: string[];
};

export type AuthenticatedSession = {
  user: AuthUser;
  expiresAt: number;
};
