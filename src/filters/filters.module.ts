import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import Curso from '../entities/curso.entity';
import { FiltersController } from './filters.controller';
import { FiltersService } from './filters.service';

@Module({
  imports: [TypeOrmModule.forFeature([Curso])],
  controllers: [FiltersController],
  providers: [FiltersService],
})
export class FiltersModule {}
