import {
  Controller,
  Get,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import JwtCookieGuard from '../auth/jwt.guard';
import { AnalyticsService } from './analytics.service';

@Controller('v1/api/admin/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @UseGuards(JwtCookieGuard)
  @Get('approval')
  async getApproval(@Req() req: any) {
    const colegioId = req.user?.colegioId;
    if (!colegioId) throw new ForbiddenException('colegioId missing in token');
    const { approvalRate, institutionalAvg } =
      await this.analyticsService.getApprovalAndInstitutionalAverage(colegioId);
    return { ok: true, approvalRate, institutionalAvg };
  }

  @UseGuards(JwtCookieGuard)
  @Get('subjects')
  async getSubjects(@Req() req: any) {
    const colegioId = req.user?.colegioId;
    if (!colegioId) throw new ForbiddenException('colegioId missing in token');
    const data = await this.analyticsService.getSubjectAverages(colegioId);
    return { ok: true, ...data };
  }

  @UseGuards(JwtCookieGuard)
  @Get('attendance')
  async getAttendance(@Req() req: any) {
    const colegioId = req.user?.colegioId;
    if (!colegioId) throw new ForbiddenException('colegioId missing in token');
    const data = await this.analyticsService.getAttendanceSinceMarch(colegioId);
    return { ok: true, ...data };
  }

  @UseGuards(JwtCookieGuard)
  @Get('summary')
  async getSummary(@Req() req: any) {
    const colegioId = req.user?.colegioId;
    if (!colegioId) throw new ForbiddenException('colegioId missing in token');
    const summary = await this.analyticsService.getSummary(colegioId);
    return { ok: true, ...summary };
  }

  @UseGuards(JwtCookieGuard)
  @Get('observations')
  async getObservations(@Req() req: any) {
    const colegioId = req.user?.colegioId;
    if (!colegioId) throw new ForbiddenException('colegioId missing in token');
    const data = await this.analyticsService.getObservationsSummary(colegioId);
    return { ok: true, ...data };
  }

  @UseGuards(JwtCookieGuard)
  @Get('professors')
  async getProfessorsPerformance(@Req() req: any) {
    const colegioId = req.user?.colegioId;
    if (!colegioId) throw new ForbiddenException('colegioId missing in token');
    const data = await this.analyticsService.getProfessorPerformance(colegioId);
    return { ok: true, ...data };
  }
}
