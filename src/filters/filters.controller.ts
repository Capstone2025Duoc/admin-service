import {
  Controller,
  ForbiddenException,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import JwtCookieGuard from '../auth/jwt.guard';
import { FiltersService } from './filters.service';

@Controller('v1/api/admin/filters')
export class FiltersController {
  constructor(private readonly filtersService: FiltersService) {}

  @UseGuards(JwtCookieGuard)
  @Get('courses')
  async getCourses(@Req() req: any) {
    const colegioId = req.user?.colegioId;
    if (!colegioId) throw new ForbiddenException('colegioId missing in token');

    const courses = await this.filtersService.getCourses(colegioId);
    return { ok: true, courses };
  }
}
