import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, FindOptionsWhere } from 'typeorm';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import AsistenciaDiaria from '../entities/asistencia-diaria.entity';
import Curso from '../entities/curso.entity';
import Colegio from '../entities/colegio.entity';
import { AttendanceReportDto } from './dto/attendance-report.dto';
import { GradeReportDto } from './dto/grade-report.dto';
import { ObservationsReportDto } from './dto/observations-report.dto';
import { ReportRequestBase } from './dto/report-format.dto';
import { TeachersReportDto } from './dto/teachers-report.dto';

type PDFDocumentInstance = InstanceType<typeof PDFDocument>;

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(AsistenciaDiaria)
    private readonly asistenciaRepo: Repository<AsistenciaDiaria>,
    @InjectRepository(Curso)
    private readonly cursoRepo: Repository<Curso>,
    @InjectRepository(Colegio)
    private readonly colegioRepo: Repository<Colegio>,
    private readonly dataSource: DataSource,
  ) { }

  async createAttendanceReport(payload: AttendanceReportDto): Promise<Buffer> {
    const format = payload.format ?? 'pdf';
    const { startDate, endDate } = this.resolveDateRange(payload);
    const reportPayload = await this.buildReportData(
      payload,
      startDate,
      endDate,
    );
    return format === 'excel'
      ? this.renderExcel(reportPayload)
      : this.renderPdf(reportPayload);
  }

  async createObservationsReport(
    payload: ObservationsReportDto,
  ): Promise<Buffer> {
    const format = payload.format ?? 'pdf';
    const { startDate, endDate } = this.resolveDateRange(payload);
    const reportPayload = await this.buildObservationsReport(
      payload,
      startDate,
      endDate,
    );
    return format === 'excel'
      ? this.renderObservationsExcel(reportPayload)
      : this.renderObservationsPdf(reportPayload);
  }

  async createTeachersReport(payload: TeachersReportDto): Promise<Buffer> {
    const format = payload.format ?? 'pdf';
    const { startDate, endDate } = this.resolveDateRange(payload);
    const reportPayload = await this.buildTeachersReport(
      payload,
      startDate,
      endDate,
    );
    return format === 'excel'
      ? this.renderTeachersExcel(reportPayload)
      : this.renderTeachersPdf(reportPayload);
  }

  async createGradesReport(payload: GradeReportDto): Promise<Buffer> {
    const format = payload.format ?? 'pdf';
    const { startDate, endDate } = this.resolveDateRange(payload);
    const reportPayload = await this.buildGradesReport(
      payload,
      startDate,
      endDate,
    );
    return format === 'excel'
      ? this.renderGradesExcel(reportPayload)
      : this.renderGradesPdf(reportPayload);
  }

  private async buildReportData(
    payload: AttendanceReportDto,
    startDate: Date,
    endDate: Date,
  ): Promise<ReportPayload> {
    const colegio = await this.colegioRepo.findOneBy({ id: payload.colegioId });
    const colegioName = colegio?.nombreInstitucion ?? 'Colegio';

    const query = this.asistenciaRepo
      .createQueryBuilder('a')
      .innerJoin(Curso, 'c', 'c.id = a.cursoId')
      .where('c.colegioId = :colegioId', { colegioId: payload.colegioId })
      .andWhere('a.fecha BETWEEN :start AND :end', {
        start: this.formatDate(startDate),
        end: this.formatDate(endDate),
      });

    if (payload.cursoId) {
      query.andWhere('a.cursoId = :cursoId', { cursoId: payload.cursoId });
    }

    const rows: Array<any> = await query
      .select([
        'c.id AS "courseId"',
        'c.nombre AS "courseName"',
        'c.annio AS "courseYear"',
        'a.estado AS "estado"',
      ])
      .addSelect('COUNT(*)::int', 'count')
      .groupBy('c.id')
      .addGroupBy('c.nombre')
      .addGroupBy('c.annio')
      .addGroupBy('a.estado')
      .getRawMany();

    const courseMap = new Map<string, CourseAttendanceSummary>();
    const overall: AttendanceCount = {
      present: 0,
      absent: 0,
      tardanza: 0,
      total: 0,
    };

    const ensureCourse = (id: string, name: string, year: number | null) => {
      if (!courseMap.has(id)) {
        courseMap.set(id, {
          courseId: id,
          courseName: name || 'Sin curso',
          year,
          counts: { present: 0, absent: 0, tardanza: 0, total: 0 },
        });
      }
      return courseMap.get(id)!;
    };

    const courseWhere: FindOptionsWhere<Curso> = {
      colegioId: payload.colegioId,
    };
    if (payload.cursoId) {
      courseWhere.id = payload.cursoId;
    }
    const colegioCourses = await this.cursoRepo.findBy(courseWhere);
    colegioCourses.forEach((course) => {
      ensureCourse(course.id, course.nombre, course.annio);
    });

    for (const row of rows) {
      const courseId = String(row.courseId ?? '');
      const courseName = String(row.courseName ?? 'Sin curso');
      const parsedYear = Number(row.courseYear ?? NaN);
      const courseYear = Number.isFinite(parsedYear) ? parsedYear : null;
      const summary = ensureCourse(courseId, courseName, courseYear);
      const count = Number(row.count ?? 0);
      const status = String(row.estado ?? '').toLowerCase();

      if (status === 'presente') {
        summary.counts.present += count;
        overall.present += count;
      } else if (status === 'ausente') {
        summary.counts.absent += count;
        overall.absent += count;
      } else if (status === 'tardanza') {
        summary.counts.tardanza += count;
        overall.tardanza += count;
      }

      summary.counts.total += count;
      overall.total += count;
    }

    const totalCoursesInColegio = await this.cursoRepo.countBy({
      colegioId: payload.colegioId,
    });

    return {
      colegioName,
      courses: Array.from(courseMap.values()),
      overall,
      startDate,
      endDate,
      totalCoursesInColegio,
    };
  }

  private async buildGradesReport(
    payload: GradeReportDto,
    startDate: Date,
    endDate: Date,
  ): Promise<GradeReportPayload> {
    const colegio = await this.colegioRepo.findOneBy({ id: payload.colegioId });
    const colegioName = colegio?.nombreInstitucion ?? 'Colegio';

    let query = `
      SELECT c.id as "courseId",
             c.nombre as "courseName",
             m.id as "subjectId",
             m.nombre as "subjectName",
             AVG(n.valor)::numeric(5,2) as "average",
             SUM(n.valor)::numeric(10,2) as "sumGrades",
             COUNT(*)::int as "entries"
      FROM notas n
      JOIN evaluaciones e ON e.id = n.evaluacion_id
      JOIN cursos_materias cm ON cm.id = e.curso_materia_id
      JOIN cursos c ON c.id = cm.curso_id
      JOIN materias m ON m.id = cm.materia_id
      WHERE c.colegio_id = $1
        AND e.fecha BETWEEN $2 AND $3
    `;

    const params: Array<string> = [
      payload.colegioId,
      this.formatDate(startDate),
      this.formatDate(endDate),
    ];

    if (payload.cursoId) {
      params.push(payload.cursoId);
      query += ` AND c.id = $${params.length}`;
    }

    if (payload.materiaId) {
      params.push(payload.materiaId);
      query += ` AND m.id = $${params.length}`;
    }

    query +=
      ' GROUP BY c.id, c.nombre, m.id, m.nombre ORDER BY c.nombre, m.nombre';

    const rows: Array<any> = await this.dataSource.query(query, params);

    const courses: GradeCourseSummary[] = rows.map((row) => ({
      courseId: String(row.courseId ?? ''),
      courseName: String(row.courseName ?? 'Sin curso'),
      subjectId: String(row.subjectId ?? ''),
      subjectName: String(row.subjectName ?? 'Sin asignatura'),
      average: Number(row.average ?? 0),
      entries: Number(row.entries ?? 0),
    }));

    const totalEntries = courses.reduce((acc, row) => acc + row.entries, 0);
    const overallSum = rows.reduce(
      (acc, row) => acc + Number(row.sumGrades ?? 0),
      0,
    );
    const overallAverage = totalEntries === 0 ? 0 : overallSum / totalEntries;

    return {
      colegioName,
      courses,
      overallAverage,
      totalEntries,
      startDate,
      endDate,
    };
  }

  private async buildTeachersReport(
    payload: TeachersReportDto,
    startDate: Date,
    endDate: Date,
  ): Promise<TeacherReportPayload> {
    const colegio = await this.colegioRepo.findOneBy({ id: payload.colegioId });
    const colegioName = colegio?.nombreInstitucion ?? 'Colegio';

    const teacherRows: Array<any> = await this.dataSource.query(
      `
      SELECT v.id as "teacherId",
             (p.nombre || ' ' || p.apellido_paterno || COALESCE(' ' || p.apellido_materno, '')) as "teacherName",
             v.email_institucional as "email",
             c.id as "courseId",
             c.nombre as "courseName",
             c.annio as "courseYear",
             m.id as "subjectId",
             m.nombre as "subjectName"
      FROM vinculos_institucionales v
      JOIN roles r ON v.rol_id = r.id AND r.nombre = 'profesor'
      JOIN personas p ON v.persona_id = p.id
      JOIN cursos_materias cm ON cm.profesor_vinculo_id = v.id
      JOIN cursos c ON cm.curso_id = c.id
      JOIN materias m ON cm.materia_id = m.id
      WHERE c.colegio_id = $1
      ORDER BY "teacherName", c.nombre, m.nombre
      `,
      [payload.colegioId],
    );

    const teacherMap = new Map<string, TeacherSummaryBuilder>();

    const ensureTeacher = (id: string, name: string, email: string | null) => {
      if (!teacherMap.has(id)) {
        teacherMap.set(id, {
          teacherId: id,
          teacherName: name || 'Profesor',
          email,
          weeklyHours: 0,
          averageGrade: null,
          performance: 'sin datos',
          courses: [],
          courseKeys: new Set<string>(),
        });
      }
      return teacherMap.get(id)!;
    };

    for (const row of teacherRows) {
      const teacherId = String(row.teacherId ?? '');
      if (!teacherId) continue;
      const teacherName = String(row.teacherName ?? 'Profesor');
      const email = row.email ?? null;
      const courseId = String(row.courseId ?? '');
      const courseName = String(row.courseName ?? 'Sin curso');
      const parsedYear = Number(row.courseYear ?? NaN);
      const courseYear = Number.isFinite(parsedYear) ? parsedYear : null;
      const subjectId = String(row.subjectId ?? '');
      const subjectName = String(row.subjectName ?? 'Sin asignatura');

      const teacher = ensureTeacher(teacherId, teacherName, email);
      const courseKey = `${courseId}::${subjectId}`;
      if (!teacher.courseKeys.has(courseKey)) {
        teacher.courseKeys.add(courseKey);
        teacher.courses.push({
          courseId,
          courseName,
          year: courseYear,
          subjectId,
          subjectName,
        });
      }
    }

    const hoursRows: Array<any> = await this.dataSource.query(
      `
      SELECT cm.profesor_vinculo_id as "teacherId",
             SUM(EXTRACT(EPOCH FROM (h.hora_fin::time - h.hora_inicio::time)) / 3600)::numeric(6,2) as "weeklyHours"
      FROM horarios h
      JOIN cursos_materias cm ON h.curso_materia_id = cm.id
      JOIN cursos c ON cm.curso_id = c.id
      WHERE c.colegio_id = $1
      GROUP BY cm.profesor_vinculo_id
      `,
      [payload.colegioId],
    );

    for (const row of hoursRows) {
      const teacher = teacherMap.get(String(row.teacherId ?? ''));
      if (!teacher) continue;
      const hours = row.weeklyHours !== null ? Number(row.weeklyHours) : 0;
      teacher.weeklyHours = Number.isNaN(hours) ? 0 : hours;
    }

    const perfRows: Array<any> = await this.dataSource.query(
      `
      SELECT cm.profesor_vinculo_id as "teacherId",
             AVG(n.valor)::numeric(4,2) as "averageGrade"
      FROM notas n
      JOIN evaluaciones e ON n.evaluacion_id = e.id
      JOIN cursos_materias cm ON e.curso_materia_id = cm.id
      JOIN cursos c ON cm.curso_id = c.id
      WHERE c.colegio_id = $1
        AND e.fecha BETWEEN $2::date AND $3::date
      GROUP BY cm.profesor_vinculo_id
      `,
      [payload.colegioId, this.formatDate(startDate), this.formatDate(endDate)],
    );

    for (const row of perfRows) {
      const teacher = teacherMap.get(String(row.teacherId ?? ''));
      if (!teacher) continue;
      const avg = row.averageGrade !== null ? Number(row.averageGrade) : null;
      teacher.averageGrade = Number.isNaN(avg ?? NaN) ? null : avg;
      teacher.performance = this.getPerformanceLabel(teacher.averageGrade);
    }

    const teachers = Array.from(teacherMap.values()).map((teacher) => ({
      teacherId: teacher.teacherId,
      teacherName: teacher.teacherName,
      email: teacher.email,
      weeklyHours: teacher.weeklyHours,
      averageGrade: teacher.averageGrade,
      performance: teacher.performance,
      courses: teacher.courses,
    }));

    const totalTeachers = teachers.length;
    const totalWeeklyHours = teachers.reduce(
      (sum, t) => sum + t.weeklyHours,
      0,
    );
    const gradedTeachers = teachers.filter((t) => t.averageGrade !== null);
    const overallAverageGrade =
      gradedTeachers.length === 0
        ? 0
        : gradedTeachers.reduce((sum, t) => sum + (t.averageGrade ?? 0), 0) /
        gradedTeachers.length;

    return {
      colegioName,
      teachers,
      startDate,
      endDate,
      totalTeachers,
      totalWeeklyHours,
      overallAverageGrade,
    };
  }

  private async buildObservationsReport(
    payload: ObservationsReportDto,
    startDate: Date,
    endDate: Date,
  ): Promise<ObservationsReportPayload> {
    const colegio = await this.colegioRepo.findOneBy({ id: payload.colegioId });
    const colegioName = colegio?.nombreInstitucion ?? 'Colegio';

    let query = `
      SELECT c.id as "courseId",
             c.nombre as "courseName",
             c.annio as "courseYear",
             o.tipo as "tipo",
             COUNT(*)::int as "count"
      FROM observaciones o
      JOIN cursos c ON o.curso_id = c.id
      WHERE c.colegio_id = $1
        AND o.fecha BETWEEN $2::date AND $3::date
    `;

    const params: Array<string> = [
      payload.colegioId,
      this.formatDate(startDate),
      this.formatDate(endDate),
    ];

    if (payload.cursoId) {
      params.push(payload.cursoId);
      query += ` AND c.id = $${params.length}`;
    }

    query +=
      ' GROUP BY c.id, c.nombre, c.annio, o.tipo ORDER BY c.nombre, o.tipo';

    const rows: Array<any> = await this.dataSource.query(query, params);

    const courseMap = new Map<string, ObservationCourseSummary>();
    const overall: ObservationCounts = {
      positiva: 0,
      negativa: 0,
      informativa: 0,
      total: 0,
    };

    const ensureCourse = (id: string, name: string, year: number | null) => {
      if (!courseMap.has(id)) {
        courseMap.set(id, {
          courseId: id,
          courseName: name || 'Sin curso',
          year,
          counts: { positiva: 0, negativa: 0, informativa: 0, total: 0 },
        });
      }
      return courseMap.get(id)!;
    };

    for (const row of rows) {
      const courseId = String(row.courseId ?? '');
      const courseName = String(row.courseName ?? 'Sin curso');
      const parsedYear = Number(row.courseYear ?? NaN);
      const courseYear = Number.isFinite(parsedYear) ? parsedYear : null;
      const summary = ensureCourse(courseId, courseName, courseYear);
      const count = Number(row.count ?? 0);
      const tipo = String(row.tipo ?? '').toLowerCase();

      if (tipo === 'positiva') {
        summary.counts.positiva += count;
        overall.positiva += count;
      } else if (tipo === 'negativa') {
        summary.counts.negativa += count;
        overall.negativa += count;
      } else if (tipo === 'informativa') {
        summary.counts.informativa += count;
        overall.informativa += count;
      }

      summary.counts.total += count;
      overall.total += count;
    }

    return {
      colegioName,
      courses: Array.from(courseMap.values()),
      overall,
      startDate,
      endDate,
    };
  }

  private async renderPdf(report: ReportPayload): Promise<Buffer> {
    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    const buffers: Buffer[] = [];

    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => { });

    doc
      .fontSize(16)
      .text(`${report.colegioName} - Asistencia`, { align: 'center' });
    doc.moveDown(0.5);
    doc
      .fontSize(12)
      .text(
        `Periodo: ${this.formatDate(report.startDate)} - ${this.formatDate(report.endDate)}`,
        { align: 'center' },
      );
    doc.moveDown();

    this.drawAttendanceTable(doc, report);
    this.drawAttendanceSummary(
      doc,
      report.overall,
      report.totalCoursesInColegio,
    );

    doc.end();
    await this.waitForStream(doc);
    return Buffer.concat(buffers);
  }

  private drawAttendanceTable(doc: PDFDocumentInstance, report: ReportPayload) {
    const tableTop = doc.y + 10;
    const rowHeight = 20;
    const columnWidths = [120, 80, 80, 80, 80];

    doc.fontSize(10).font('Helvetica-Bold');
    this.drawTableRow(
      doc,
      tableTop,
      ['Curso', 'Año', 'Presentes', 'Ausentes', 'Tardanzas'],
      columnWidths,
    );
    doc.font('Helvetica');

    const currentYear = new Date().getFullYear();
    report.courses.forEach((course, index) => {
      const y = tableTop + rowHeight * (index + 1);
      const displayYear = course.year ?? currentYear;
      this.drawTableRow(
        doc,
        y,
        [
          course.courseName,
          `${displayYear}`,
          `${course.counts.present}`,
          `${course.counts.absent}`,
          `${course.counts.tardanza}`,
        ],
        columnWidths,
      );
    });
  }

  private drawAttendanceSummary(
    doc: PDFDocumentInstance,
    overall: AttendanceCount,
    totalCourses: number,
  ) {
    doc.moveDown();
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('Resumen General', { underline: true });
    doc.fontSize(10).font('Helvetica');
    doc.text(`Cursos activos: ${totalCourses}`);
    doc.text(`Total presentes: ${overall.present}`);
    doc.text(`Total ausentes: ${overall.absent}`);
    doc.text(`Total tardanzas: ${overall.tardanza}`);
    doc.text(`Registros totales: ${overall.total}`);
  }

  private async renderExcel(report: ReportPayload): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Asistencia');

    sheet.columns = [
      { header: 'Curso', key: 'courseName', width: 30 },
      { header: 'Año', key: 'year', width: 10 },
      { header: 'Presentes', key: 'present', width: 12 },
      { header: 'Ausentes', key: 'absent', width: 12 },
      { header: 'Tardanzas', key: 'tardanza', width: 12 },
    ];

    report.courses.forEach((course) => {
      sheet.addRow({
        courseName: course.courseName,
        year: course.year ?? '-',
        present: course.counts.present,
        absent: course.counts.absent,
        tardanza: course.counts.tardanza,
      });
    });

    const summaryRow = sheet.addRow({
      courseName: 'Resumen',
      year: '',
      present: report.overall.present,
      absent: report.overall.absent,
      tardanza: report.overall.tardanza,
    });
    summaryRow.font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private async renderGradesPdf(report: GradeReportPayload): Promise<Buffer> {
    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    const buffers: Buffer[] = [];
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => { });

    doc.fontSize(16).text(`${report.colegioName} - Notas`, { align: 'center' });
    doc.moveDown(0.5);
    doc
      .fontSize(12)
      .text(
        `Periodo: ${this.formatDate(report.startDate)} - ${this.formatDate(report.endDate)}`,
        { align: 'center' },
      );
    doc.moveDown();

    this.drawGradesTable(doc, report);
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .text(`Promedio general: ${report.overallAverage.toFixed(2)}`, {
        align: 'right',
      });

    doc.end();
    await this.waitForStream(doc);
    return Buffer.concat(buffers);
  }

  private drawGradesTable(doc: PDFDocumentInstance, report: GradeReportPayload) {
    const header = ['Curso', 'Asignatura', 'Promedio'];
    const columnWidths = [150, 150, 80];
    const rowHeight = 20;
    const tableTop = doc.y;

    doc.font('Helvetica-Bold').fontSize(10);
    this.drawTableRow(doc, tableTop, header, columnWidths);
    doc.font('Helvetica');

    report.courses.forEach((course, index) => {
      const y = tableTop + rowHeight * (index + 1);
      this.drawTableRow(
        doc,
        y,
        [course.courseName, course.subjectName, course.average.toFixed(2)],
        columnWidths,
      );
    });
  }

  private async renderGradesExcel(report: GradeReportPayload): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Notas');
    sheet.columns = [
      { header: 'Curso', key: 'course', width: 30 },
      { header: 'Asignatura', key: 'subject', width: 30 },
      { header: 'Promedio', key: 'average', width: 15 },
    ];

    report.courses.forEach((course) => {
      sheet.addRow({
        course: course.courseName,
        subject: course.subjectName,
        average: Number(course.average.toFixed(2)),
      });
    });

    const summaryRow = sheet.addRow({
      course: 'Resumen',
      subject: '',
      average: Number(report.overallAverage.toFixed(2)),
    });
    summaryRow.font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private async renderTeachersPdf(
    report: TeacherReportPayload,
  ): Promise<Buffer> {
    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    const buffers: Buffer[] = [];
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => { });

    doc
      .fontSize(16)
      .text(`${report.colegioName} - Profesores`, { align: 'center' });
    doc.moveDown(0.5);
    doc
      .fontSize(12)
      .text(
        `Periodo: ${this.formatDate(report.startDate)} - ${this.formatDate(report.endDate)}`,
        { align: 'center' },
      );
    doc.moveDown();

    this.drawTeachersTable(doc, report);
    doc.end();
    await this.waitForStream(doc);
    return Buffer.concat(buffers);
  }

  private drawTeachersTable(doc: PDFDocumentInstance, report: TeacherReportPayload) {
    const header = ['Profesor', 'Cursos y asignaturas', 'Promedio'];
    const columnWidths = [140, 260, 90];
    const rowHeight = 28;
    const bottomLimit = doc.page.height - doc.page.margins.bottom - rowHeight - 10;

    const renderHeader = () => {
      const headerY = doc.y;
      doc.font('Helvetica-Bold').fontSize(10);
      this.drawTableRow(doc, headerY, header, columnWidths);
      doc.font('Helvetica');
      return headerY + rowHeight;
    };

    let currentY = renderHeader();

    report.teachers.forEach((teacher) => {
      if (currentY > bottomLimit) {
        doc.addPage();
        currentY = renderHeader();
      }

      const courseList = teacher.courses
        .map((course) => `${course.courseName} (${course.subjectName})`)
        .join('; ');
      const coursesLabel = courseList || `${teacher.courses.length} cursos`;
      this.drawTableRow(
        doc,
        currentY,
        [
          teacher.teacherName,
          coursesLabel,
          (teacher.averageGrade ?? 0).toFixed(2),
        ],
        columnWidths,
      );
      currentY += rowHeight;
    });
  }

  private async renderTeachersExcel(
    report: TeacherReportPayload,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Profesores');
    sheet.columns = [
      { header: 'Profesor', key: 'name', width: 30 },
      { header: 'Cursos asignados', key: 'courses', width: 20 },
      { header: 'Promedio', key: 'average', width: 15 },
    ];

    report.teachers.forEach((teacher) => {
      sheet.addRow({
        name: teacher.teacherName,
        courses: teacher.courses.length,
        average: teacher.averageGrade ?? 0,
      });
    });

    const summaryRow = sheet.addRow({
      name: 'Resumen',
      courses: report.totalTeachers,
      average: Number(report.overallAverageGrade.toFixed(2)),
    });
    summaryRow.font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private async renderObservationsPdf(
    report: ObservationsReportPayload,
  ): Promise<Buffer> {
    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    const buffers: Buffer[] = [];
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => { });

    doc
      .fontSize(16)
      .text(`${report.colegioName} - Observaciones`, { align: 'center' });
    doc.moveDown(0.5);
    doc
      .fontSize(12)
      .text(
        `Periodo: ${this.formatDate(report.startDate)} - ${this.formatDate(report.endDate)}`,
        { align: 'center' },
      );
    doc.moveDown();

    this.drawObservationsTable(doc, report);
    doc.end();
    await this.waitForStream(doc);
    return Buffer.concat(buffers);
  }

  private drawObservationsTable(
    doc: PDFDocumentInstance,
    report: ObservationsReportPayload,
  ) {
    const header = ['Curso', 'Positivas', 'Negativas', 'Informativas'];
    const columnWidths = [200, 80, 80, 80];
    const rowHeight = 22;
    const tableTop = doc.y;

    doc.font('Helvetica-Bold').fontSize(10);
    this.drawTableRow(doc, tableTop, header, columnWidths);
    doc.font('Helvetica');

    report.courses.forEach((course, index) => {
      const y = tableTop + rowHeight * (index + 1);
      this.drawTableRow(
        doc,
        y,
        [
          course.courseName,
          `${course.counts.positiva}`,
          `${course.counts.negativa}`,
          `${course.counts.informativa}`,
        ],
        columnWidths,
      );
    });

    const summaryY = tableTop + rowHeight * (report.courses.length + 1) + 10;
    doc.font('Helvetica-Bold').text('Totales', 36, summaryY);
    doc
      .font('Helvetica')
      .text(`Positivas: ${report.overall.positiva}`, 36, summaryY + 14);
    doc.text(`Negativas: ${report.overall.negativa}`);
    doc.text(`Informativas: ${report.overall.informativa}`);
  }

  private async renderObservationsExcel(
    report: ObservationsReportPayload,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Observaciones');
    sheet.columns = [
      { header: 'Curso', key: 'course', width: 30 },
      { header: 'Positivas', key: 'positiva', width: 12 },
      { header: 'Negativas', key: 'negativa', width: 12 },
      { header: 'Informativas', key: 'informativa', width: 12 },
    ];

    report.courses.forEach((course) => {
      sheet.addRow({
        course: course.courseName,
        positiva: course.counts.positiva,
        negativa: course.counts.negativa,
        informativa: course.counts.informativa,
      });
    });

    const summaryRow = sheet.addRow({
      course: 'Totales',
      positiva: report.overall.positiva,
      negativa: report.overall.negativa,
      informativa: report.overall.informativa,
    });
    summaryRow.font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private drawTableRow(
    doc: PDFDocumentInstance,
    y: number,
    cells: string[],
    widths: number[],
  ) {
    let x = 36;
    cells.forEach((text, index) => {
      doc.text(text, x, y, { width: widths[index], align: 'left' });
      x += widths[index];
    });
  }

  private resolveDateRange(payload: ReportRequestBase): {
    startDate: Date;
    endDate: Date;
  } {
    const customStart = this.parseDateString(payload.desde);
    const customEnd = this.parseDateString(payload.hasta);

    if (customStart && customEnd) {
      return this.ensureOrder(customStart, customEnd);
    }

    const now = new Date();
    switch (payload.period) {
      case 'week':
        return {
          startDate: this.startOfWeek(now),
          endDate: this.endOfWeek(now),
        };
      case 'month':
        return this.monthRange(now);
      case 'semester':
        return this.semesterRange(now);
      case 'year':
        return this.yearRange(now);
      case 'custom':
        throw new BadRequestException('Debe proveer desde y hasta para periodos personalizados');
      default:
        return {
          startDate: this.startOfWeek(now),
          endDate: this.endOfWeek(now),
        };
    }
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private parseDateString(value?: string): Date | undefined {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Fecha inválida en el rango de reporte');
    }
    return date;
  }

  private ensureOrder(start: Date, end: Date): { startDate: Date; endDate: Date } {
    if (start > end) {
      throw new BadRequestException('La fecha inicial no puede ser mayor a la final');
    }
    return { startDate: start, endDate: end };
  }

  private startOfWeek(date: Date): Date {
    const start = new Date(date);
    const day = start.getDay();
    const diff = (day + 6) % 7;
    start.setDate(start.getDate() - diff);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  private endOfWeek(date: Date): Date {
    const end = this.startOfWeek(date);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
  }

  private monthRange(date: Date): { startDate: Date; endDate: Date } {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  private semesterRange(date: Date): { startDate: Date; endDate: Date } {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstSemester = month < 6;
    if (firstSemester) {
      const start = new Date(year, 0, 1);
      const end = new Date(year, 5, 30);
      end.setHours(23, 59, 59, 999);
      return { startDate: start, endDate: end };
    }
    const start = new Date(year, 6, 1);
    const end = new Date(year, 11, 31);
    end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  private yearRange(date: Date): { startDate: Date; endDate: Date } {
    const year = date.getFullYear();
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  private getPerformanceLabel(average: number | null): string {
    if (average === null) return 'sin datos';
    if (average >= 4.5) return 'Excelente';
    if (average >= 3.5) return 'Bueno';
    if (average >= 2.5) return 'Regular';
    return 'En seguimiento';
  }

  private waitForStream(doc: PDFDocumentInstance): Promise<void> {
    return new Promise((resolve) => doc.on('end', resolve));
  }
}

interface ReportPayload {
  colegioName: string;
  courses: CourseAttendanceSummary[];
  overall: AttendanceCount;
  startDate: Date;
  endDate: Date;
  totalCoursesInColegio: number;
}

interface CourseAttendanceSummary {
  courseId: string;
  courseName: string;
  year: number | null;
  counts: AttendanceCount;
}

interface AttendanceCount {
  present: number;
  absent: number;
  tardanza: number;
  total: number;
}

interface GradeReportPayload {
  colegioName: string;
  courses: GradeCourseSummary[];
  overallAverage: number;
  totalEntries: number;
  startDate: Date;
  endDate: Date;
}

interface GradeCourseSummary {
  courseId: string;
  courseName: string;
  subjectId: string;
  subjectName: string;
  average: number;
  entries: number;
}

interface TeacherReportPayload {
  colegioName: string;
  teachers: TeacherSummary[];
  startDate: Date;
  endDate: Date;
  totalTeachers: number;
  totalWeeklyHours: number;
  overallAverageGrade: number;
}

interface ObservationCourseSummary {
  courseId: string;
  courseName: string;
  year: number | null;
  counts: ObservationCounts;
}

interface ObservationCounts {
  positiva: number;
  negativa: number;
  informativa: number;
  total: number;
}

interface ObservationsReportPayload {
  colegioName: string;
  courses: ObservationCourseSummary[];
  overall: ObservationCounts;
  startDate: Date;
  endDate: Date;
}

interface TeacherSummary {
  teacherId: string;
  teacherName: string;
  email: string | null;
  weeklyHours: number;
  averageGrade: number | null;
  performance: string;
  courses: Array<{
    courseId: string;
    courseName: string;
    year: number | null;
    subjectId: string;
    subjectName: string;
  }>;
}

interface TeacherSummaryBuilder extends TeacherSummary {
  courseKeys: Set<string>;
}
