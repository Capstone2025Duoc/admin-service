import { ReportFormat, ReportRequestBase } from './report-format.dto';

export class TeachersReportDto implements ReportRequestBase {
  colegioId: string;
  format: ReportFormat;
  period: ReportRequestBase['period'];
  desde?: string;
  hasta?: string;
}
