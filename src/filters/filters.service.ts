import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Curso from '../entities/curso.entity';

@Injectable()
export class FiltersService {
  constructor(
    @InjectRepository(Curso)
    private readonly cursoRepo: Repository<Curso>,
  ) {}

  async getCourses(colegioId: string) {
    const courses = await this.cursoRepo.find({
      select: ['id', 'nombre'],
      where: { colegioId },
      order: { nombre: 'ASC' },
    });
    return courses.map((course) => ({ id: course.id, nombre: course.nombre }));
  }
}
