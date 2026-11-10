import { apiRequest } from "./http";
import type { LoginResponse } from "../types/domain";

export async function loginUser(email: string, senha: string) {
  return apiRequest<LoginResponse>("/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, senha }),
  });
}
