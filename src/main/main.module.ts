import { Module } from '@nestjs/common';
import { MainController } from './main.controller';
import { MainService } from './main.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import Role from '../entities/role.entity';
import VinculoInstitucional from '../entities/vinculo-institucional.entity';

@Module({
  imports: [TypeOrmModule.forFeature([VinculoInstitucional, Role])],
  controllers: [MainController],
  providers: [MainService],
})
export class MainModule {}
