import { UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthGuard } from "./auth.guard";

describe("AuthGuard", () => {
  it("attaches the current database authorization context to the request", async () => {
    const currentUser = {
      userId: "user-1",
      role: "GERENTE_LOJA",
      clientId: null,
      storeIds: ["store-current"],
    };
    const authService = {
      authenticate: jest.fn().mockResolvedValue({
        user: currentUser,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      }),
    } as unknown as AuthService;
    const guard = new AuthGuard(authService);
    const request = { headers: { authorization: "Bearer valid-token" } } as {
      headers: { authorization: string };
      user?: typeof currentUser;
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authService.authenticate).toHaveBeenCalledWith("valid-token");
    expect(request.user).toBe(currentUser);
  });

  it("rejects requests without a bearer token", async () => {
    const authService = { authenticate: jest.fn() } as unknown as AuthService;
    const guard = new AuthGuard(authService);
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
    } as never;

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(authService.authenticate).not.toHaveBeenCalled();
  });
});
