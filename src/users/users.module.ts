import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import VinculoInstitucional from '../entities/vinculo-institucional.entity';
import Role from '../entities/role.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  imports: [TypeOrmModule.forFeature([VinculoInstitucional, Role])],
  providers: [UsersService],
  controllers: [UsersController],
})
export class UsersModule {}
