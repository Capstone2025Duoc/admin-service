export type ReportFormat = 'pdf' | 'excel';
export type ReportPeriod = 'week' | 'month' | 'semester' | 'year' | 'custom';

export interface ReportRequestBase {
  period: ReportPeriod;
  desde?: string;
  hasta?: string;
}
