import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import VinculoInstitucional from '../entities/vinculo-institucional.entity';

@Injectable()
export class MainService {
  constructor(
    @InjectRepository(VinculoInstitucional)
    private readonly vinculoRepo: Repository<VinculoInstitucional>,
  ) {}

  async getCounts(colegioId?: string): Promise<{
    students: number;
    teachers: number;
    averageGrade: number | null;
    attendancePercent: number | null;
  }> {
    const currentYear = new Date().getFullYear();

    // Count students: distinct alumno_vinculo_id in alumnos_cursos for current year where role = 'estudiante'
    const studentsQueryParams: any[] = [currentYear];
    let colegioClause = '';
    if (colegioId) {
      colegioClause = 'AND v.colegio_id = $2';
      studentsQueryParams.push(colegioId);
    }
    const studentsRes: Array<{ count: string }> = await this.vinculoRepo.query(
      `SELECT COUNT(DISTINCT ac.alumno_vinculo_id) as count
      FROM alumnos_cursos ac
      JOIN vinculos_institucionales v ON ac.alumno_vinculo_id = v.id
      JOIN roles r ON v.rol_id = r.id
      WHERE ac.annio = $1 AND r.nombre = 'estudiante' ${colegioClause}`,
      studentsQueryParams,
    );
    const students = parseInt(studentsRes?.[0]?.count ?? '0', 10);

    // Count teachers: distinct vinculos that appear as profesor in cursos_materias (joined to cursos) or as profesor_jefe in cursos for current year
    const teacherParams: any[] = [currentYear];
    if (colegioId) teacherParams.push(colegioId);
    const teachersRes: Array<{ count: string }> = await this.vinculoRepo.query(
      `SELECT COUNT(DISTINCT v.id) as count FROM (
         SELECT cm.profesor_vinculo_id as id
         FROM cursos_materias cm
         JOIN cursos c ON cm.curso_id = c.id
         WHERE c.annio = $1 ${colegioId ? 'AND c.colegio_id = $2' : ''}
         UNION
         SELECT c.profesor_jefe_vinculo_id as id
         FROM cursos c
         WHERE c.annio = $1 ${colegioId ? 'AND c.colegio_id = $2' : ''}
       ) s
       JOIN vinculos_institucionales v ON s.id = v.id
       JOIN roles r ON v.rol_id = r.id
       WHERE r.nombre = 'profesor'`,
      teacherParams,
    );
    const teachers = parseInt(teachersRes?.[0]?.count ?? '0', 10);

    // Average grade across the colegio for current year (evaluaciones.fecha within year)
    const avgGradeParams: any[] = [currentYear];
    let avgColegioClause = '';
    if (colegioId) {
      avgColegioClause = 'AND v.colegio_id = $2';
      avgGradeParams.push(colegioId);
    }
    const avgGradeRes: Array<{ avg: string | null }> =
      await this.vinculoRepo.query(
        `SELECT AVG(n.valor) as avg
       FROM notas n
       JOIN evaluaciones e ON n.evaluacion_id = e.id
       JOIN vinculos_institucionales v ON n.alumno_vinculo_id = v.id
       WHERE EXTRACT(YEAR FROM e.fecha) = $1 ${avgColegioClause}`,
        avgGradeParams,
      );
    const avgRaw = avgGradeRes?.[0]?.avg;
    const averageGrade =
      avgRaw !== null && avgRaw !== undefined
        ? parseFloat(parseFloat(avgRaw).toFixed(2))
        : null;

    // Attendance percent for current year
    const attParams: any[] = [currentYear];
    let attColegioClause = '';
    if (colegioId) {
      attColegioClause = 'AND c.colegio_id = $2';
      attParams.push(colegioId);
    }
    const attendanceRes: Array<{ percent: string | null }> =
      await this.vinculoRepo.query(
        `SELECT CASE WHEN COUNT(*)=0 THEN NULL ELSE SUM(CASE WHEN a.estado = 'presente' THEN 1 ELSE 0 END)::float / COUNT(*) * 100 END as percent
       FROM asistencias_diarias a
       JOIN cursos c ON a.curso_id = c.id
       WHERE EXTRACT(YEAR FROM a.fecha) = $1 ${attColegioClause}`,
        attParams,
      );
    const attRaw = attendanceRes?.[0]?.percent;
    const attendancePercent =
      attRaw !== null && attRaw !== undefined
        ? parseFloat(parseFloat(attRaw).toFixed(2))
        : null;

    return { students, teachers, averageGrade, attendancePercent };
  }

  async getProfile(user: any) {
    const personaId = user.personaId ?? user.sub;
    const colegioId = user.colegioId ?? null;

    const personaRows: Array<any> = personaId
      ? await this.vinculoRepo.manager.query(
          `SELECT p.id, p.nombre, p.apellido_paterno, p.apellido_materno
         FROM personas p
         WHERE p.id = $1 LIMIT 1`,
          [personaId],
        )
      : [];
    const persona = personaRows[0];

    let colegio: any = null;
    if (colegioId) {
      const colegioRows = await this.vinculoRepo.manager.query(
        `SELECT id, nombre_institucion FROM colegios WHERE id = $1 LIMIT 1`,
        [colegioId],
      );
      colegio = colegioRows[0];
    }

    const nameParts = [
      persona?.nombre,
      persona?.apellido_paterno,
      persona?.apellido_materno,
    ].filter((value) => value && String(value).trim() !== '');
    const nombre = nameParts.join(' ').trim() || null;

    return {
      personaId,
      userId: user.sub ?? null,
      rol: user.rol ?? null,
      colegioId,
      nombre,
      colegio: colegio
        ? { id: colegio.id, nombre: colegio.nombre_institucion }
        : null,
    };
  }

  private formatDateYMD(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  async getAnalytics(colegioId?: string) {
    // 1) Last 5 school days (skip weekends) including today
    const lastDays: Date[] = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const cursor = new Date(now);
    // Collect up to 5 school days but only from current year; stop if we reach previous year
    while (lastDays.length < 5) {
      if (cursor.getFullYear() < currentYear) break;
      // Weekday: getDay() 0=Sun,6=Sat -> skip 0 and 6
      const day = cursor.getDay();
      if (day !== 0 && day !== 6 && cursor.getFullYear() === currentYear) {
        lastDays.push(new Date(cursor));
      }
      cursor.setDate(cursor.getDate() - 1);
    }

    const attendanceByDay: Array<{
      date: string;
      weekday: string;
      percent: number | null;
    }> = [];
    const weekdayFmt = new Intl.DateTimeFormat('es-CL', { weekday: 'short' });
    for (const d of lastDays.reverse()) {
      const dateStr = this.formatDateYMD(d);
      const params: any[] = [dateStr];
      let colegioClause = '';
      if (colegioId) {
        colegioClause = 'AND c.colegio_id = $2';
        params.push(colegioId);
      }
      const res: Array<{ percent: string | null }> =
        await this.vinculoRepo.query(
          `SELECT CASE WHEN COUNT(*)=0 THEN NULL ELSE SUM(CASE WHEN a.estado = 'presente' THEN 1 ELSE 0 END)::float / COUNT(*) * 100 END as percent
         FROM asistencias_diarias a
         JOIN cursos c ON a.curso_id = c.id
         WHERE a.fecha = $1 ${colegioClause}`,
          params,
        );
      const val = res?.[0]?.percent;
      attendanceByDay.push({
        date: dateStr,
        weekday: weekdayFmt.format(d),
        percent:
          val !== null && val !== undefined
            ? parseFloat(parseFloat(val).toFixed(2))
            : null,
      });
    }

    // 2) Last 4 full months (exclude current month) but only within current year
    const months: Array<{ label: string; start: Date; end: Date }> = [];
    const monthFmt = new Intl.DateTimeFormat('es-CL', {
      month: 'short',
      year: 'numeric',
    });
    // iterate backward month by month and only keep months whose year == currentYear
    let monthCursor = new Date(now.getFullYear(), now.getMonth() - 1, 1); // previous month
    while (months.length < 4 && monthCursor.getFullYear() === currentYear) {
      const start = new Date(
        monthCursor.getFullYear(),
        monthCursor.getMonth(),
        1,
      );
      const end = new Date(
        monthCursor.getFullYear(),
        monthCursor.getMonth() + 1,
        0,
      );
      months.push({ label: monthFmt.format(start), start, end });
      monthCursor = new Date(
        monthCursor.getFullYear(),
        monthCursor.getMonth() - 1,
        1,
      );
    }

    const monthlyGrades: Array<{ month: string; average: number | null }> = [];
    const monthlyAttendance: Array<{ month: string; percent: number | null }> =
      [];

    for (const m of months) {
      const startStr = this.formatDateYMD(m.start);
      const endStr = this.formatDateYMD(m.end);
      // Avg grades for evaluations dated within month
      const gradeParams: any[] = [startStr, endStr];
      let colegioClause = '';
      if (colegioId) {
        colegioClause = 'AND v.colegio_id = $3';
        gradeParams.push(colegioId);
      }
      const gradeRes: Array<{ avg: string | null }> =
        await this.vinculoRepo.query(
          `SELECT AVG(n.valor) as avg
         FROM notas n
         JOIN evaluaciones e ON n.evaluacion_id = e.id
         JOIN vinculos_institucionales v ON n.alumno_vinculo_id = v.id
         WHERE e.fecha BETWEEN $1::date AND $2::date ${colegioClause}`,
          gradeParams,
        );
      const avgRaw = gradeRes?.[0]?.avg;
      const avg =
        avgRaw !== null && avgRaw !== undefined
          ? parseFloat(parseFloat(avgRaw).toFixed(2))
          : null;
      monthlyGrades.push({ month: m.label, average: avg });

      // Attendance percent for month
      const attParams: any[] = [startStr, endStr];
      let attColegioClause = '';
      if (colegioId) {
        attColegioClause = 'AND c.colegio_id = $3';
        attParams.push(colegioId);
      }
      const attRes: Array<{ percent: string | null }> =
        await this.vinculoRepo.query(
          `SELECT CASE WHEN COUNT(*)=0 THEN NULL ELSE SUM(CASE WHEN a.estado = 'presente' THEN 1 ELSE 0 END)::float / COUNT(*) * 100 END as percent
         FROM asistencias_diarias a
         JOIN cursos c ON a.curso_id = c.id
         WHERE a.fecha BETWEEN $1::date AND $2::date ${attColegioClause}`,
          attParams,
        );
      const attRaw = attRes?.[0]?.percent;
      const att =
        attRaw !== null && attRaw !== undefined
          ? parseFloat(parseFloat(attRaw).toFixed(2))
          : null;
      monthlyAttendance.push({ month: m.label, percent: att });
    }

    // 3) Grade distribution across ranges (only notas whose evaluacion fecha is in current year)
    const distParams: any[] = [];
    let distColegioClause = '';
    if (colegioId) {
      distColegioClause = 'AND v.colegio_id = $2';
      distParams.push(colegioId);
    }
    const distRes: Array<{
      total: string;
      excelente: string;
      bueno: string;
      regular: string;
      insuficiente: string;
    }> = await this.vinculoRepo.query(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN n.valor >= 6.0 AND n.valor <= 7.0 THEN 1 ELSE 0 END) as excelente,
              SUM(CASE WHEN n.valor >= 5.0 AND n.valor < 6.0 THEN 1 ELSE 0 END) as bueno,
              SUM(CASE WHEN n.valor >= 4.0 AND n.valor < 5.0 THEN 1 ELSE 0 END) as regular,
              SUM(CASE WHEN n.valor >= 1.0 AND n.valor < 4.0 THEN 1 ELSE 0 END) as insuficiente
       FROM notas n
       JOIN evaluaciones e ON n.evaluacion_id = e.id
       JOIN vinculos_institucionales v ON n.alumno_vinculo_id = v.id
       WHERE EXTRACT(YEAR FROM e.fecha) = $1 ${distColegioClause}`,
      [currentYear].concat(distParams),
    );
    const dr = distRes?.[0] || {
      total: '0',
      excelente: '0',
      bueno: '0',
      regular: '0',
      insuficiente: '0',
    };
    const total = parseInt(dr.total ?? '0', 10);
    const buildPercent = (countStr: string) => {
      const cnt = parseInt(countStr ?? '0', 10);
      return total === 0 ? 0 : parseFloat(((cnt / total) * 100).toFixed(2));
    };
    const distribution = [
      {
        label: 'Excelente',
        range: '6.0-7.0',
        count: parseInt(dr.excelente ?? '0', 10),
        percent: buildPercent(dr.excelente),
      },
      {
        label: 'Bueno',
        range: '5.0-5.9',
        count: parseInt(dr.bueno ?? '0', 10),
        percent: buildPercent(dr.bueno),
      },
      {
        label: 'Regular',
        range: '4.0-4.9',
        count: parseInt(dr.regular ?? '0', 10),
        percent: buildPercent(dr.regular),
      },
      {
        label: 'Insuficiente',
        range: '1.0-3.9',
        count: parseInt(dr.insuficiente ?? '0', 10),
        percent: buildPercent(dr.insuficiente),
      },
    ];

    return {
      attendanceByDay,
      monthlyGrades,
      monthlyAttendance,
      gradeDistribution: { total, distribution },
    };
  }

  async getObservationsSummary(colegioId?: string) {
    const currentYear = new Date().getFullYear();
    // first param is year
    const params: any[] = [currentYear];
    let colegioClause = '';
    if (colegioId) {
      colegioClause = 'AND c.colegio_id = $2';
      params.push(colegioId);
    }

    const res: Array<{
      total: string;
      positiva: string;
      negativa: string;
      informativa: string;
    }> = await this.vinculoRepo.query(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN o.tipo = 'positiva' THEN 1 ELSE 0 END) as positiva,
              SUM(CASE WHEN o.tipo = 'negativa' THEN 1 ELSE 0 END) as negativa,
              SUM(CASE WHEN o.tipo = 'informativa' THEN 1 ELSE 0 END) as informativa
       FROM observaciones o
       JOIN cursos c ON o.curso_id = c.id
       WHERE EXTRACT(YEAR FROM o.fecha) = $1 ${colegioClause}`,
      params,
    );

    const row = res?.[0] || {
      total: '0',
      positiva: '0',
      negativa: '0',
      informativa: '0',
    };
    const total = parseInt(row.total ?? '0', 10);
    const positiva = parseInt(row.positiva ?? '0', 10);
    const negativa = parseInt(row.negativa ?? '0', 10);
    const informativa = parseInt(row.informativa ?? '0', 10);

    const pct = (n: number) =>
      total === 0 ? 0 : parseFloat(((n / total) * 100).toFixed(2));

    return {
      total,
      positiva: { count: positiva, percent: pct(positiva) },
      negativa: { count: negativa, percent: pct(negativa) },
      informativa: { count: informativa, percent: pct(informativa) },
    };
  }
}
