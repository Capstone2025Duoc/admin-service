import { ReportFormat, ReportRequestBase } from './report-format.dto';

export class AttendanceReportDto implements ReportRequestBase {
  colegioId: string;
  format: ReportFormat;
  period: ReportRequestBase['period'];
  cursoId?: string;
  desde?: string;
  hasta?: string;
}
