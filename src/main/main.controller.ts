import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import JwtCookieGuard from '../auth/jwt.guard';
import { MainService } from './main.service';

@Controller('v1/api/admin/main')
export class MainController {
  constructor(private readonly mainService: MainService) {}

  @UseGuards(JwtCookieGuard)
  @Get('counts')
  async getCounts(@Req() req: any) {
    // req.user comes from guard payload and should contain colegioId
    const colegioId = req.user?.colegioId;
    const counts = await this.mainService.getCounts(colegioId);
    return { ok: true, counts };
  }

  @UseGuards(JwtCookieGuard)
  @Get('analytics')
  async getAnalytics(@Req() req: any) {
    const colegioId = req.user?.colegioId;
    const analytics = await this.mainService.getAnalytics(colegioId);
    return { ok: true, analytics };
  }

  @UseGuards(JwtCookieGuard)
  @Get('observations-summary')
  async getObservationsSummary(@Req() req: any) {
    const colegioId = req.user?.colegioId;
    const summary = await this.mainService.getObservationsSummary(colegioId);
    return { ok: true, summary };
  }

  @UseGuards(JwtCookieGuard)
  @Get('profile')
  async getProfile(@Req() req: any) {
    const profile = await this.mainService.getProfile(req.user);
    return { ok: true, profile };
  }
}
