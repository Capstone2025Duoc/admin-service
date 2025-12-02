import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import JwtCookieGuard from '../auth/jwt.guard';
import { AssignmentsService } from './assignments.service';
import { CreateHorarioPropuestoDto } from './dto/create-horario-propuesto.dto';
import { UpdateHorarioPropuestoDto } from './dto/update-horario-propuesto.dto';
import { UpdateHorarioPropuestoStatusDto } from './dto/update-horario-propuesto-status.dto';
import { GetWeeklyScheduleDto } from './dto/get-weekly-schedule.dto';

@Controller('v1/api/admin/assignments')
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @UseGuards(JwtCookieGuard)
  @Get('counts')
  async getCounts(@Req() req: any) {
    const colegioId = req.user?.colegioId;
    if (!colegioId) throw new ForbiddenException('colegioId missing in token');
    const counts = await this.assignmentsService.getCounts(colegioId);
    return { ok: true, counts };
  }

  @UseGuards(JwtCookieGuard)
  @Get('list')
  async getList(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const colegioId = req.user?.colegioId;
    if (!colegioId) throw new ForbiddenException('colegioId missing in token');

    const p = parseInt(page as any, 10) || 1;
    const l = parseInt(limit as any, 10) || 20;

    const data = await this.assignmentsService.getScheduleList(colegioId, p, l);
    return { ok: true, ...data };
  }

  @UseGuards(JwtCookieGuard)
  @Get('proposals')
  async listProposals(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const colegioId = req.user?.colegioId;
    if (!colegioId) throw new ForbiddenException('colegioId missing in token');

    const p = parseInt(page as any, 10) || 1;
    const l = parseInt(limit as any, 10) || 20;

    const data = await this.assignmentsService.listProposals(colegioId, p, l);
    return { ok: true, ...data };
  }

  @UseGuards(JwtCookieGuard)
  @Get('proposals/:id')
  async getProposal(@Req() req: any, @Param('id') id: string) {
    const colegioId = req.user?.colegioId;
    if (!colegioId) throw new ForbiddenException('colegioId missing in token');

    const detail = await this.assignmentsService.getProposalDetail(
      colegioId,
      id,
    );
    return { ok: true, ...detail };
  }

  @UseGuards(JwtCookieGuard)
  @Post('proposals')
  async createProposal(
    @Req() req: any,
    @Body() dto: CreateHorarioPropuestoDto,
  ) {
    const colegioId = req.user?.colegioId;
    if (!colegioId) throw new ForbiddenException('colegioId missing in token');

    const createdBy = req.user?.sub ?? null;
    const proposal = await this.assignmentsService.createProposal(
      colegioId,
      createdBy,
      dto,
    );
    return { ok: true, proposal };
  }

  @UseGuards(JwtCookieGuard)
  @Post('proposals/:id/reroll')
  async rerollProposal(@Req() req: any, @Param('id') id: string) {
    const colegioId = req.user?.colegioId;
    if (!colegioId) throw new ForbiddenException('colegioId missing in token');

    await this.assignmentsService.rerollProposal(colegioId, id);
    return { ok: true };
  }

  @UseGuards(JwtCookieGuard)
  @Patch('proposals/:id')
  async updateProposal(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateHorarioPropuestoDto,
  ) {
    const colegioId = req.user?.colegioId;
    if (!colegioId) throw new ForbiddenException('colegioId missing in token');

    const proposal = await this.assignmentsService.updateProposal(
      colegioId,
      id,
      dto,
    );
    return { ok: true, proposal };
  }

  @UseGuards(JwtCookieGuard)
  @Patch('proposals/:id/status')
  async updateProposalStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateHorarioPropuestoStatusDto,
  ) {
    const colegioId = req.user?.colegioId;
    if (!colegioId) throw new ForbiddenException('colegioId missing in token');

    const proposal = await this.assignmentsService.updateProposalStatus(
      colegioId,
      id,
      dto,
    );
    return { ok: true, proposal };
  }

  @UseGuards(JwtCookieGuard)
  @Get('schedule')
  async getWeeklySchedule(@Req() req: any, @Query() dto: GetWeeklyScheduleDto) {
    const colegioId = req.user?.colegioId;
    if (!colegioId) throw new ForbiddenException('colegioId missing in token');

    const schedule = await this.assignmentsService.getWeeklySchedule(
      colegioId,
      dto,
    );
    return { ok: true, ...schedule };
  }
}
