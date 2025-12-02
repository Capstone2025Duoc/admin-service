import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { AttendanceReportDto } from './dto/attendance-report.dto';
import { ObservationsReportDto } from './dto/observations-report.dto';
import { ReportFormat } from './dto/report-format.dto';
import { TeachersReportDto } from './dto/teachers-report.dto';

@Controller('v1/api/admin/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) { }

  @Post('attendance')
  async attendanceReport(
    @Body() payload: AttendanceReportDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const normalizedFormat = (
      payload.format ?? 'pdf'
    ).toLowerCase() as ReportFormat;
    const reportPayload: AttendanceReportDto = {
      ...payload,
      format: normalizedFormat,
    };
    const buffer =
      await this.reportsService.createAttendanceReport(reportPayload);

    const extension = normalizedFormat === 'pdf' ? 'pdf' : 'xlsx';
    const contentType =
      normalizedFormat === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const filename = `attendance-report-${Date.now()}.${extension}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Post('observations')
  async observationsReport(
    @Body() payload: ObservationsReportDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const normalizedFormat = (
      payload.format ?? 'pdf'
    ).toLowerCase() as ReportFormat;
    const reportPayload: ObservationsReportDto = {
      ...payload,
      format: normalizedFormat,
    };
    const buffer =
      await this.reportsService.createObservationsReport(reportPayload);

    const extension = normalizedFormat === 'pdf' ? 'pdf' : 'xlsx';
    const contentType =
      normalizedFormat === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const filename = `observations-report-${Date.now()}.${extension}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Post('teachers')
  async teachersReport(
    @Body() payload: TeachersReportDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const normalizedFormat = (
      payload.format ?? 'pdf'
    ).toLowerCase() as ReportFormat;
    const reportPayload: TeachersReportDto = {
      ...payload,
      format: normalizedFormat,
    };
    const buffer =
      await this.reportsService.createTeachersReport(reportPayload);

    const extension = normalizedFormat === 'pdf' ? 'pdf' : 'xlsx';
    const contentType =
      normalizedFormat === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const filename = `teachers-report-${Date.now()}.${extension}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }
}
