import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { PrismaService } from "../src/services/prisma.service";
import { AppModule } from "../src/modules/app.module";

describe("API E2E", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "change-me";

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    app.setGlobalPrefix("api/v1");
    await app.init();

    prisma = app.get(PrismaService);

    await prisma.ingestionState.upsert({
      where: { id: "default" },
      update: { referenceTimeUtc: new Date("2026-01-15T12:00:00Z") },
      create: { id: "default", referenceTimeUtc: new Date("2026-01-15T12:00:00Z") },
    });

    await prisma.telemetryReading.upsert({
      where: {
        devId_timestampUtc: {
          devId: "IOT001",
          timestampUtc: new Date("2026-01-15T11:59:30Z"),
        },
      },
      update: {
        temperature: 23,
        inComfort: true,
        inWorkingHours: true,
      },
      create: {
        devId: "IOT001",
        environmentId: "AMB-001",
        packetTimestamp: new Date("2026-01-15T11:59:30Z"),
        packetGmt: -3,
        samplingTime: 30,
        timestampUtc: new Date("2026-01-15T11:59:30Z"),
        temperature: 23,
        inComfort: true,
        inWorkingHours: true,
        isLatePacket: false,
        isSpurious: false,
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  async function login(email: string, senha = "dev-only-change-me") {
    const response = await request(app.getHttpServer()).post("/api/v1/auth/login").send({ email, senha }).expect(201);
    return response.body.data.accessToken as string;
  }

  it("rejects protected route without token", async () => {
    await request(app.getHttpServer()).get("/api/v1/stores").expect(401);
  });

  it("authenticates seeded user", async () => {
    const token = await login("ana.ribeiro@diel.example");
    expect(token).toBeTruthy();
  });

  it("returns stores for admin", async () => {
    const token = await login("ana.ribeiro@diel.example");

    const response = await request(app.getHttpServer())
      .get("/api/v1/stores?period=last_day&page=1&limit=50")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.length).toBeGreaterThanOrEqual(5);
  });

  it("returns scoped clients", async () => {
    const token = await login("ana.ribeiro@diel.example");

    const response = await request(app.getHttpServer())
      .get("/api/v1/clients")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeGreaterThan(0);
  });

  it("restricts manager to assigned stores", async () => {
    const token = await login("juliana.prado@modacarioca.example");

    const response = await request(app.getHttpServer())
      .get("/api/v1/stores?period=last_day&page=1&limit=50")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const storeIds = response.body.data.map((item: { id: string }) => item.id);
    expect(storeIds.every((id: string) => ["LOJA-SP-001"].includes(id))).toBe(true);
    expect(storeIds.length).toBeGreaterThan(0);
  });

  it("blocks manager from unauthorized environment", async () => {
    const token = await login("juliana.prado@modacarioca.example");

    await request(app.getHttpServer())
      .get("/api/v1/environments/AMB-001/summary")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);
  });

  it("returns environment series and summary for authorized user", async () => {
    const token = await login("ana.ribeiro@diel.example");

    const summary = await request(app.getHttpServer())
      .get("/api/v1/environments/AMB-001/summary")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(summary.body.success).toBe(true);
    expect(summary.body.data.id).toBe("AMB-001");

    const series = await request(app.getHttpServer())
      .get("/api/v1/environments/AMB-001/series?period=last_day&aggregation=hourly")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(series.body.success).toBe(true);
    expect(series.body.meta).toHaveProperty("referenceTime");
    expect(Array.isArray(series.body.data.series)).toBe(true);
  });

  it("returns dashboard snapshot", async () => {
    const token = await login("ana.ribeiro@diel.example");

    const response = await request(app.getHttpServer())
      .get("/api/v1/dashboard/snapshot?period=last_day")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty("environmentsTotal");
  });
});
