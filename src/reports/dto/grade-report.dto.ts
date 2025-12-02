import { ReportFormat, ReportRequestBase } from './report-format.dto';

export class GradeReportDto implements ReportRequestBase {
  colegioId: string;
  format: ReportFormat;
  period: ReportRequestBase['period'];
  cursoId?: string;
  materiaId?: string;
  desde?: string;
  hasta?: string;
}
