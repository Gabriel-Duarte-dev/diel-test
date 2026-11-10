import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { AuthUser } from "../auth/auth.types";
import { ListStoresQuery } from "./dto/list-stores.query";
import { StoresService } from "../services/stores.service";

@Controller("stores")
@UseGuards(AuthGuard)
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Get()
  async listStores(@Query() query: ListStoresQuery, @Req() req: { user: AuthUser }) {
    return this.storesService.list(query, req.user);
  }
}
