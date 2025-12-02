import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import VinculoInstitucional from '../entities/vinculo-institucional.entity';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(VinculoInstitucional)
    private readonly vinculoRepo: Repository<VinculoInstitucional>,
  ) {}

  /**
   * Returns approval rate and institutional average grade for the current year.
   * Approval: students (in colegio and current year) with average grade > 4
   * and attendance percentage > 70%.
   */
  async getApprovalAndInstitutionalAverage(colegioId: string) {
    // Use previous year dynamically (always compute metrics for last year)
    const year = new Date().getFullYear() - 1;
    const params = [colegioId, year];

    // Total students enrolled in the colegio this year
    const totalRes: Array<{ count: string }> = await this.vinculoRepo.query(
      `SELECT COUNT(DISTINCT ac.alumno_vinculo_id) as count
       FROM alumnos_cursos ac
       JOIN cursos c ON ac.curso_id = c.id
       WHERE c.colegio_id = $1 AND ac.annio = $2`,
      params,
    );
    const totalStudents = parseInt(totalRes?.[0]?.count ?? '0', 10);

    // Count of approved students: avg grade > 4 AND attendance% > 70
    const approvedQuery = `
      SELECT COUNT(DISTINCT ac.alumno_vinculo_id) as approved
      FROM alumnos_cursos ac
      JOIN cursos c ON ac.curso_id = c.id
      LEFT JOIN (
        SELECT n.alumno_vinculo_id, AVG(n.valor) as avg_grade
        FROM notas n
        JOIN evaluaciones ev ON n.evaluacion_id = ev.id
        JOIN cursos_materias cm ON ev.curso_materia_id = cm.id
        JOIN cursos c2 ON cm.curso_id = c2.id
        WHERE c2.colegio_id = $1 AND EXTRACT(YEAR FROM ev.fecha) = $2
        GROUP BY n.alumno_vinculo_id
      ) ag ON ag.alumno_vinculo_id = ac.alumno_vinculo_id
      LEFT JOIN (
        SELECT ad.alumno_vinculo_id,
               SUM(CASE WHEN ad.estado = 'presente' THEN 1 ELSE 0 END) as present_count,
               COUNT(*) as total_count
        FROM asistencias_diarias ad
        JOIN cursos c3 ON ad.curso_id = c3.id
        WHERE c3.colegio_id = $1 AND EXTRACT(YEAR FROM ad.fecha) = $2
        GROUP BY ad.alumno_vinculo_id
      ) at ON at.alumno_vinculo_id = ac.alumno_vinculo_id
      WHERE c.colegio_id = $1 AND ac.annio = $2
        AND ag.avg_grade > 4
        AND at.total_count > 0
        AND (at.present_count::float / at.total_count) * 100 > 70
    `;

    const approvedRes: Array<{ approved: string }> =
      await this.vinculoRepo.query(approvedQuery, params);
    const approvedCount = parseInt(approvedRes?.[0]?.approved ?? '0', 10);

    // Institutional average grade across all notas in current year for colegio
    const avgQuery = `
      SELECT AVG(n.valor)::numeric(4,2) as institutional_avg
      FROM notas n
      JOIN evaluaciones ev ON n.evaluacion_id = ev.id
      JOIN cursos_materias cm ON ev.curso_materia_id = cm.id
      JOIN cursos c ON cm.curso_id = c.id
      WHERE c.colegio_id = $1 AND EXTRACT(YEAR FROM ev.fecha) = $2
    `;
    const avgRes: Array<{ institutional_avg: string }> =
      await this.vinculoRepo.query(avgQuery, params);
    const institutionalAvg = avgRes?.[0]?.institutional_avg
      ? parseFloat(avgRes[0].institutional_avg)
      : null;

    const approvalRate =
      totalStudents > 0 ? (approvedCount / totalStudents) * 100 : 0;

    return {
      approvalRate: Math.round(approvalRate * 100) / 100, // two decimals
      institutionalAvg,
    };
  }

  async getSummary(colegioId: string) {
    const year = new Date().getFullYear();
    const params = [colegioId, year];

    const totalStudentsRes: Array<{ count: string }> =
      await this.vinculoRepo.query(
        `SELECT COUNT(DISTINCT ac.alumno_vinculo_id) as count
       FROM alumnos_cursos ac
       JOIN cursos c ON ac.curso_id = c.id
       WHERE c.colegio_id = $1 AND ac.annio = $2`,
        params,
      );
    const totalStudents = parseInt(totalStudentsRes?.[0]?.count ?? '0', 10);

    const approvedStudentsRes: Array<{ count: string }> =
      await this.vinculoRepo.query(
        `SELECT COUNT(*) as count FROM (
         SELECT n.alumno_vinculo_id
         FROM notas n
         JOIN evaluaciones ev ON n.evaluacion_id = ev.id
         JOIN cursos_materias cm ON ev.curso_materia_id = cm.id
         JOIN cursos c ON cm.curso_id = c.id
         WHERE c.colegio_id = $1 AND EXTRACT(YEAR FROM ev.fecha) = $2
         GROUP BY n.alumno_vinculo_id
         HAVING AVG(n.valor) > 4
       ) sub`,
        params,
      );
    const approvedStudents = parseInt(
      approvedStudentsRes?.[0]?.count ?? '0',
      10,
    );

    const attendanceRes: Array<{ percent: string | null }> =
      await this.vinculoRepo.query(
        `SELECT CASE WHEN COUNT(*) = 0 THEN NULL ELSE SUM(CASE WHEN a.estado = 'presente' THEN 1 ELSE 0 END)::float / COUNT(*) * 100 END as percent
       FROM asistencias_diarias a
       JOIN cursos c ON a.curso_id = c.id
       WHERE c.colegio_id = $1 AND EXTRACT(YEAR FROM a.fecha) = $2`,
        params,
      );
    const attendancePercentRaw = attendanceRes?.[0]?.percent;
    const attendancePercent =
      attendancePercentRaw !== null && attendancePercentRaw !== undefined
        ? parseFloat(parseFloat(attendancePercentRaw).toFixed(2))
        : null;

    const professorAvgRes: Array<{ professor_average: string | null }> =
      await this.vinculoRepo.query(
        `SELECT AVG(sub.avg_grade)::numeric(4,2) as professor_average
       FROM (
         SELECT cm.profesor_vinculo_id, AVG(n.valor)::numeric(4,2) as avg_grade
         FROM notas n
         JOIN evaluaciones ev ON n.evaluacion_id = ev.id
         JOIN cursos_materias cm ON ev.curso_materia_id = cm.id
         JOIN cursos c ON cm.curso_id = c.id
         WHERE c.colegio_id = $1 AND EXTRACT(YEAR FROM ev.fecha) = $2
         GROUP BY cm.profesor_vinculo_id
       ) sub`,
        params,
      );
    const professorAverage =
      professorAvgRes?.[0]?.professor_average !== null &&
      professorAvgRes?.[0]?.professor_average !== undefined
        ? parseFloat(professorAvgRes[0].professor_average)
        : null;

    const institutionalAvgRes: Array<{ institutional_avg: string | null }> =
      await this.vinculoRepo.query(
        `SELECT AVG(n.valor)::numeric(4,2) as institutional_avg
       FROM notas n
       JOIN evaluaciones ev ON n.evaluacion_id = ev.id
       JOIN cursos_materias cm ON ev.curso_materia_id = cm.id
       JOIN cursos c ON cm.curso_id = c.id
       WHERE c.colegio_id = $1 AND EXTRACT(YEAR FROM ev.fecha) = $2`,
        params,
      );
    const institutionalAverage =
      institutionalAvgRes?.[0]?.institutional_avg !== null &&
      institutionalAvgRes?.[0]?.institutional_avg !== undefined
        ? parseFloat(institutionalAvgRes[0].institutional_avg)
        : null;

    const approvalRate =
      totalStudents > 0 ? (approvedStudents / totalStudents) * 100 : 0;

    return {
      year,
      approvalRate: Math.round(approvalRate * 100) / 100,
      attendancePercent,
      professorAverage,
      institutionalAverage,
    };
  }

  async getSubjectAverages(colegioId: string) {
    const year = new Date().getFullYear();
    const params = [colegioId, year];

    const query = `
      SELECT m.id as materia_id,
             m.nombre as materia,
             (
               SELECT AVG(n.valor)::numeric(4,2)
               FROM notas n
               JOIN evaluaciones ev ON n.evaluacion_id = ev.id
               JOIN cursos_materias cm ON ev.curso_materia_id = cm.id
               JOIN cursos c ON cm.curso_id = c.id
               WHERE cm.materia_id = m.id AND c.colegio_id = $1 AND EXTRACT(YEAR FROM ev.fecha) = $2
             ) as average,
             (
               SELECT CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(SUM(CASE WHEN avg_alumno > 4 THEN 1 ELSE 0 END)::numeric / COUNT(*) * 100, 2) END
               FROM (
                 SELECT n.alumno_vinculo_id, AVG(n.valor) as avg_alumno
                 FROM notas n
                 JOIN evaluaciones ev ON n.evaluacion_id = ev.id
                 JOIN cursos_materias cm ON ev.curso_materia_id = cm.id
                 JOIN cursos c ON cm.curso_id = c.id
                 WHERE cm.materia_id = m.id AND c.colegio_id = $1 AND EXTRACT(YEAR FROM ev.fecha) = $2
                 GROUP BY n.alumno_vinculo_id
               ) t
             ) as approval_percent
      FROM materias m
      WHERE m.colegio_id = $1
      ORDER BY m.nombre
    `;

    const rows: Array<any> = await this.vinculoRepo.query(query, params);

    const items = rows.map((r) => ({
      materiaId: r.materia_id,
      materia: r.materia,
      average: r.average !== null ? parseFloat(r.average) : null,
      approvalPercent:
        r.approval_percent !== null ? parseFloat(r.approval_percent) : 0,
    }));

    return { year, items };
  }

  /**
   * Attendance stats from March of the academic year to current month.
   * Academic year starts in March: if current month >= March, start = March currentYear,
   * otherwise start = March (currentYear - 1). End = last day of current month.
   */
  async getAttendanceSinceMarch(colegioId: string) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12
    const startYear = currentMonth >= 3 ? currentYear : currentYear - 1;
    const startDate = new Date(startYear, 2, 1); // March 1
    const endDateObj = new Date(now.getFullYear(), now.getMonth() + 1, 0); // last day of current month
    const formatDate = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const startStr = formatDate(startDate);
    const endStr = formatDate(endDateObj);

    const query = `
      SELECT
        COUNT(*)::bigint as total_count,
        SUM(CASE WHEN a.estado = 'presente' THEN 1 ELSE 0 END)::bigint as present_count,
        SUM(CASE WHEN a.estado = 'tardanza' THEN 1 ELSE 0 END)::bigint as tardanza_count,
        SUM(CASE WHEN a.estado = 'ausente' THEN 1 ELSE 0 END)::bigint as absent_count
      FROM asistencias_diarias a
      JOIN cursos c ON a.curso_id = c.id
      WHERE a.fecha BETWEEN $1::date AND $2::date AND c.colegio_id = $3
    `;

    const rows: Array<any> = await this.vinculoRepo.query(query, [
      startStr,
      endStr,
      colegioId,
    ]);
    const r = rows?.[0] || {
      total_count: '0',
      present_count: '0',
      tardanza_count: '0',
      absent_count: '0',
    };

    const total = parseInt(r.total_count ?? '0', 10);
    const present = parseInt(r.present_count ?? '0', 10);
    const tardanza = parseInt(r.tardanza_count ?? '0', 10);
    const absent = parseInt(r.absent_count ?? '0', 10);

    const pct = (n: number) =>
      total === 0 ? 0 : parseFloat(((n / total) * 100).toFixed(2));

    const attendancePercent = pct(present);
    // Monthly breakdown query (group by month)
    const monthlyQuery = `
      SELECT date_trunc('month', a.fecha)::date as month_start,
             COUNT(*)::bigint as total_count,
             SUM(CASE WHEN a.estado = 'presente' THEN 1 ELSE 0 END)::bigint as present_count,
             SUM(CASE WHEN a.estado = 'tardanza' THEN 1 ELSE 0 END)::bigint as tardanza_count,
             SUM(CASE WHEN a.estado = 'ausente' THEN 1 ELSE 0 END)::bigint as absent_count
      FROM asistencias_diarias a
      JOIN cursos c ON a.curso_id = c.id
      WHERE a.fecha BETWEEN $1::date AND $2::date AND c.colegio_id = $3
      GROUP BY 1
      ORDER BY 1
    `;

    const monthlyRows: Array<any> = await this.vinculoRepo.query(monthlyQuery, [
      startStr,
      endStr,
      colegioId,
    ]);
    const monthlyMap: Record<string, any> = {};
    for (const mr of monthlyRows) {
      const key = new Date(mr.month_start).toISOString().slice(0, 10); // yyyy-mm-dd
      monthlyMap[key] = mr;
    }

    // build months array from startDate to endDate inclusive
    const months: Array<{ monthStart: Date; label: string }> = [];
    const monthFmt = new Intl.DateTimeFormat('es-CL', {
      month: 'short',
      year: 'numeric',
    });
    let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const endCursor = new Date(
      endDateObj.getFullYear(),
      endDateObj.getMonth(),
      1,
    );
    while (cursor <= endCursor) {
      months.push({
        monthStart: new Date(cursor),
        label: monthFmt.format(cursor),
      });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }

    const monthly = months.map((m) => {
      const key = m.monthStart.toISOString().slice(0, 10);
      const mr = monthlyMap[key];
      const t = mr ? parseInt(mr.total_count ?? '0', 10) : 0;
      const p = mr ? parseInt(mr.present_count ?? '0', 10) : 0;
      const percent = t === 0 ? 0 : parseFloat(((p / t) * 100).toFixed(2));
      return {
        month: m.label,
        monthStart: key,
        attendancePercent: percent,
      };
    });

    return {
      period: { start: startStr, end: endStr, startYear },
      stats: {
        total,
        present: { count: present, percent: pct(present) },
        tardanza: { count: tardanza, percent: pct(tardanza) },
        absent: { count: absent, percent: pct(absent) },
        attendancePercent,
      },
      monthly,
    };
  }

  /**
   * Observations summary: total count and per-type counts + percentages
   * Types: 'positiva', 'negativa', 'informativa'
   */
  async getObservationsSummary(colegioId: string) {
    const params = [colegioId];
    const query = `
      SELECT
        COUNT(*)::bigint as total_count,
        SUM(CASE WHEN o.tipo = 'positiva' THEN 1 ELSE 0 END)::bigint as positiva_count,
        SUM(CASE WHEN o.tipo = 'negativa' THEN 1 ELSE 0 END)::bigint as negativa_count,
        SUM(CASE WHEN o.tipo = 'informativa' THEN 1 ELSE 0 END)::bigint as informativa_count
      FROM observaciones o
      JOIN cursos c ON o.curso_id = c.id
      WHERE c.colegio_id = $1
    `;

    const rows: Array<any> = await this.vinculoRepo.query(query, params);
    const r = rows?.[0] || {
      total_count: '0',
      positiva_count: '0',
      negativa_count: '0',
      informativa_count: '0',
    };

    const total = parseInt(r.total_count ?? '0', 10);
    const positiva = parseInt(r.positiva_count ?? '0', 10);
    const negativa = parseInt(r.negativa_count ?? '0', 10);
    const informativa = parseInt(r.informativa_count ?? '0', 10);

    const pct = (n: number) =>
      total === 0 ? 0 : parseFloat(((n / total) * 100).toFixed(2));

    return {
      total,
      positiva: { count: positiva, percent: pct(positiva) },
      negativa: { count: negativa, percent: pct(negativa) },
      informativa: { count: informativa, percent: pct(informativa) },
    };
  }

  /**
   * Professor performance: for each professor in the colegio return full name,
   * professorAverage (average of their subject averages) and a list of subjects
   * with course and subject average. Trend is computed client-side here.
   */
  async getProfessorPerformance(colegioId: string) {
    const year = new Date().getFullYear();
    const params = [colegioId, year];

    const query = `
      SELECT v.id as profesor_vinculo_id,
             (p.nombre || ' ' || p.apellido_paterno || COALESCE(' ' || p.apellido_materno, '')) as full_name,
             AVG(sa.subject_avg)::numeric(4,2) as professor_average,
             COALESCE(json_agg(sa.subject_obj ORDER BY sa.curso_name, sa.materia_name) FILTER (WHERE sa.subject_obj IS NOT NULL), '[]') as subjects
      FROM vinculos_institucionales v
      JOIN personas p ON v.persona_id = p.id
      JOIN cursos_materias cm ON cm.profesor_vinculo_id = v.id
      JOIN cursos c ON cm.curso_id = c.id AND c.colegio_id = $1
      JOIN materias m ON cm.materia_id = m.id
      LEFT JOIN LATERAL (
        SELECT AVG(n.valor)::numeric(4,2) as subject_avg,
               json_build_object('materia', m.nombre, 'curso', c.nombre, 'average', ROUND(AVG(n.valor)::numeric,2)) as subject_obj,
               c.nombre as curso_name,
               m.nombre as materia_name
        FROM evaluaciones ev
        JOIN notas n ON n.evaluacion_id = ev.id
        WHERE ev.curso_materia_id = cm.id AND EXTRACT(YEAR FROM ev.fecha) = $2
      ) sa ON true
      GROUP BY v.id, p.nombre, p.apellido_paterno, p.apellido_materno
      ORDER BY full_name
    `;

    const rows: Array<any> = await this.vinculoRepo.query(query, params);

    const items = rows.map((r) => {
      let subjects = r.subjects;
      if (typeof subjects === 'string') {
        try {
          subjects = JSON.parse(subjects);
        } catch (e) {
          subjects = [];
        }
      }
      const profAvg =
        r.professor_average !== null ? parseFloat(r.professor_average) : null;

      const trend = (() => {
        if (profAvg === null) return 'sin datos';
        if (profAvg >= 6.1 && profAvg <= 7) return 'excelente';
        if (profAvg >= 5.1 && profAvg <= 6) return 'bueno';
        if (profAvg >= 4.1 && profAvg <= 5) return 'regular';
        if (profAvg >= 1 && profAvg <= 3.9) return 'malo';
        return 'sin datos';
      })();

      // deduplicate subjects by materia+curso, prefer non-null average or the higher average
      const dedupMap: Record<string, any> = {};
      for (const s of subjects) {
        const key = `${s.materia}||${s.curso}`;
        const avg =
          s.average !== null && s.average !== undefined
            ? parseFloat(s.average)
            : null;
        if (!dedupMap[key]) {
          dedupMap[key] = { materia: s.materia, curso: s.curso, average: avg };
        } else {
          const existing = dedupMap[key];
          if (
            (existing.average === null || existing.average === undefined) &&
            avg !== null
          ) {
            dedupMap[key] = {
              materia: s.materia,
              curso: s.curso,
              average: avg,
            };
          } else if (
            avg !== null &&
            existing.average !== null &&
            avg > existing.average
          ) {
            dedupMap[key] = {
              materia: s.materia,
              curso: s.curso,
              average: avg,
            };
          }
        }
      }
      const dedupSubjects = Object.values(dedupMap);

      return {
        profesorVinculoId: r.profesor_vinculo_id,
        fullName: r.full_name,
        professorAverage: profAvg,
        trend,
        subjects: dedupSubjects,
      };
    });

    return { year, items };
  }
}
