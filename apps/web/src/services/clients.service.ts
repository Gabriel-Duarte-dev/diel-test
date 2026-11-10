import type { ClientItem } from "../types/domain";
import { apiRequest, authHeaders } from "./http";

type ClientsResponse = {
  success: boolean;
  data: ClientItem[];
};

export async function fetchClients(token: string) {
  return apiRequest<ClientsResponse>("/clients", {
    headers: authHeaders(token),
  });
}
