import { Repository } from 'typeorm';
import VinculoInstitucional from '../entities/vinculo-institucional.entity';
import { MainService } from './main.service';

type MockRepo = {
  query: jest.Mock<any, any>;
  manager: { query: jest.Mock<any, any> };
};

const createMockRepo = (): MockRepo => ({
  query: jest.fn(),
  manager: { query: jest.fn() },
});

describe('MainService', () => {
  let repo: MockRepo;
  let service: MainService;

  beforeEach(() => {
    repo = createMockRepo();
    service = new MainService(repo as unknown as Repository<VinculoInstitucional>);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns counts with colegio filtering', async () => {
    repo.query
      .mockResolvedValueOnce([{ count: '15' }])
      .mockResolvedValueOnce([{ count: '8' }])
      .mockResolvedValueOnce([{ avg: '6.7333' }])
      .mockResolvedValueOnce([{ percent: '82.31' }]);

    const result = await service.getCounts('c-12');

    expect(result).toEqual({
      students: 15,
      teachers: 8,
      averageGrade: 6.73,
      attendancePercent: 82.31,
    });
    expect(repo.query).toHaveBeenCalledTimes(4);
  });

  it('builds profile with persona and colegio info', async () => {
    repo.manager.query
      .mockResolvedValueOnce([
        {
          id: 'p-1',
          nombre: 'Ana',
          apellido_paterno: 'Rojas',
          apellido_materno: 'Cruz',
        },
      ])
      .mockResolvedValueOnce([{ id: 'col-1', nombre_institucion: 'Colegio Sur' }]);

    const result = await service.getProfile({
      personaId: 'p-1',
      sub: 'u-1',
      rol: 'admin',
      colegioId: 'col-1',
    });

    expect(result).toEqual({
      personaId: 'p-1',
      userId: 'u-1',
      rol: 'admin',
      colegioId: 'col-1',
      nombre: 'Ana Rojas Cruz',
      colegio: { id: 'col-1', nombre: 'Colegio Sur' },
    });
    expect(repo.manager.query).toHaveBeenCalledTimes(2);
  });

  it('summarizes analytics across school days, months, and distribution', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-05-14T12:00:00Z'));

    const sequence = [
      [{ percent: '90' }],
      [{ percent: '88.5' }],
      [{ percent: '92' }],
      [{ percent: null }],
      [{ percent: '85' }],
      [{ avg: '6.5' }],
      [{ percent: '80' }],
      [{ avg: '6.1' }],
      [{ percent: '78.34' }],
      [{ avg: null }],
      [{ percent: null }],
      [{ avg: '5.7' }],
      [{ percent: '74.5' }],
      [
        {
          total: '100',
          excelente: '40',
          bueno: '30',
          regular: '20',
          insuficiente: '10',
        },
      ],
    ];

    sequence.forEach((value) => repo.query.mockResolvedValueOnce(value));

    const analytics = await service.getAnalytics('col-7');

    expect(analytics.attendanceByDay).toHaveLength(5);
    expect(analytics.monthlyGrades[0].average).toBe(6.5);
    expect(analytics.monthlyAttendance[1].percent).toBeCloseTo(78.34);
    expect(analytics.gradeDistribution.distribution[0]).toMatchObject({
      label: 'Excelente',
      percent: 40,
    });
    expect(repo.query).toHaveBeenCalledTimes(sequence.length);
  });

  it('reports observation summary percentages', async () => {
    repo.query.mockResolvedValueOnce([
      { total: '20', positiva: '10', negativa: '5', informativa: '5' },
    ]);

    const summary = await service.getObservationsSummary('col-9');

    expect(summary).toEqual({
      total: 20,
      positiva: { count: 10, percent: 50 },
      negativa: { count: 5, percent: 25 },
      informativa: { count: 5, percent: 25 },
    });
  });
});
