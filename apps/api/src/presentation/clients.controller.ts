import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { AuthUser } from "../auth/auth.types";
import { ClientsService } from "../services/clients.service";

@Controller("clients")
@UseGuards(AuthGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  async listClients(@Req() req: { user: AuthUser }) {
    return this.clientsService.list(req.user);
  }
}