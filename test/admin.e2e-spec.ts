import {
  CanActivate,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import JwtCookieGuard from '../src/auth/jwt.guard';
import { MainController } from '../src/main/main.controller';
import { MainService } from '../src/main/main.service';

const fakeUser = {
  sub: 'u-admin',
  personaId: 'p-admin',
  rol: 'admin',
  colegioId: 'c-admin',
};

class JwtCookieGuardStub implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.user = fakeUser;
    return true;
  }
}

const countsResponse = { students: 32, teachers: 12, averageGrade: 6.4, attendancePercent: 91.7 };
const profileResponse = {
  personaId: 'p-admin',
  userId: 'u-admin',
  rol: 'admin',
  colegioId: 'c-admin',
  nombre: 'Admin Uno',
  colegio: { id: 'c-admin', nombre: 'Colegio Central' },
};
const analyticsResponse = {
  attendanceByDay: [
    { date: '2025-12-01', weekday: 'lun', percent: 95.5 },
    { date: '2025-11-30', weekday: 'sab', percent: null },
  ],
  monthlyGrades: [{ month: 'nov 2025', average: 6.4 }],
  monthlyAttendance: [{ month: 'nov 2025', percent: 90.2 }],
  gradeDistribution: {
    total: 40,
    distribution: [{ label: 'Excelente', range: '6.0-7.0', count: 20, percent: 50 }],
  },
};
const observationsSummaryResponse = {
  total: 20,
  positiva: { count: 10, percent: 50 },
  negativa: { count: 5, percent: 25 },
  informativa: { count: 5, percent: 25 },
};

const mainServiceMock = {
  getCounts: jest.fn().mockResolvedValue(countsResponse),
  getProfile: jest.fn().mockResolvedValue(profileResponse),
  getAnalytics: jest.fn().mockResolvedValue(analyticsResponse),
  getObservationsSummary: jest.fn().mockResolvedValue(observationsSummaryResponse),
};

let app: INestApplication;

describe('MainController (e2e)', () => {
  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [MainController],
      providers: [{ provide: MainService, useValue: mainServiceMock }],
    })
      .overrideGuard(JwtCookieGuard)
      .useValue(new JwtCookieGuardStub())
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns counts filtered by colegio', async () => {
    await request(app.getHttpServer())
      .get('/v1/api/admin/main/counts')
      .expect(200)
      .expect({ ok: true, counts: countsResponse });
    expect(mainServiceMock.getCounts).toHaveBeenCalledWith(fakeUser.colegioId);
  });

  it('exposes analytics data', async () => {
    await request(app.getHttpServer())
      .get('/v1/api/admin/main/analytics')
      .expect(200)
      .expect({ ok: true, analytics: analyticsResponse });
    expect(mainServiceMock.getAnalytics).toHaveBeenCalledWith(fakeUser.colegioId);
  });

  it('returns observations summary', async () => {
    await request(app.getHttpServer())
      .get('/v1/api/admin/main/observations-summary')
      .expect(200)
      .expect({ ok: true, summary: observationsSummaryResponse });
    expect(mainServiceMock.getObservationsSummary).toHaveBeenCalledWith(fakeUser.colegioId);
  });

  it('serves profile payload', async () => {
    await request(app.getHttpServer())
      .get('/v1/api/admin/main/profile')
      .expect(200)
      .expect({ ok: true, profile: profileResponse });
    expect(mainServiceMock.getProfile).toHaveBeenCalledWith(fakeUser);
  });
});
