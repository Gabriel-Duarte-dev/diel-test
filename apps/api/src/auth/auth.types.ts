import { UserRole } from "@prisma/client";

export type AuthUser = {
  userId: string;
  role: UserRole;
  clientId: string | null;
  storeIds: string[];
};
