import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
  ParseUUIDPipe,
} from '@nestjs/common';
import JwtCookieGuard from '../auth/jwt.guard';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('v1/api/admin/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtCookieGuard)
  @Get('counts')
  async getCounts(@Req() req: any) {
    const colegioId = req.user?.colegioId;
    if (!colegioId) throw new ForbiddenException('colegioId missing in token');
    const counts = await this.usersService.getCounts(colegioId);
    return { ok: true, counts };
  }

  @UseGuards(JwtCookieGuard)
  @Get('list')
  async getList(@Req() req: any) {
    const colegioId = req.user?.colegioId;
    if (!colegioId) throw new ForbiddenException('colegioId missing in token');

    // parse query params
    const qp = req.query || {};
    const page = qp.page ? parseInt(qp.page, 10) : undefined;
    const limit = qp.limit ? parseInt(qp.limit, 10) : undefined;
    const role = qp.role ? String(qp.role) : undefined;
    const estado = qp.estado ? String(qp.estado) : undefined;

    const users = await this.usersService.getUsers(colegioId, {
      page,
      limit,
      role,
      estado,
    });
    return { ok: true, ...users };
  }

  @UseGuards(JwtCookieGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @Post()
  async createUser(@Req() req: any, @Body() body: CreateUserDto) {
    const colegioId = req.user?.colegioId;
    if (!colegioId) throw new ForbiddenException('colegioId missing in token');

    const user = await this.usersService.createUser(colegioId, body);
    return { ok: true, user };
  }

  @UseGuards(JwtCookieGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @Patch(':id')
  async updateUser(
    @Req() req: any,
    @Param('id', new ParseUUIDPipe({ version: '4' })) vinculoId: string,
    @Body() body: UpdateUserDto,
  ) {
    const colegioId = req.user?.colegioId;
    if (!colegioId) throw new ForbiddenException('colegioId missing in token');

    const user = await this.usersService.updateUser(colegioId, vinculoId, body);
    return { ok: true, user };
  }
}
