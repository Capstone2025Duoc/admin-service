import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import HorarioPropuesto from '../entities/horario-propuesto.entity';
import HorarioPropuestoDetalle from '../entities/horario-propuesto-detalle.entity';
import VinculoInstitucional from '../entities/vinculo-institucional.entity';
import { CreateHorarioPropuestoDto } from './dto/create-horario-propuesto.dto';
import { GetWeeklyScheduleDto } from './dto/get-weekly-schedule.dto';
import { UpdateHorarioPropuestoDto } from './dto/update-horario-propuesto.dto';
import { UpdateHorarioPropuestoStatusDto } from './dto/update-horario-propuesto-status.dto';

type CourseMateriaRow = {
  curso_materia_id: string;
  profesor_vinculo_id: string;
};

type ProposalDetailPayload = {
  profesorVinculoId: string;
  cursoMateriaId: string;
  salaId: string;
  diaSemana: number;
  horaInicio: string;
  horaFin: string;
  observaciones: string | null;
};

type ScheduleOption = {
  diaSemana: number;
  horaInicio: string;
  horaFin: string;
};

@Injectable()
export class AssignmentsService {
  constructor(
    @InjectRepository(VinculoInstitucional)
    private readonly vinculoRepo: Repository<VinculoInstitucional>,
    @InjectRepository(HorarioPropuesto)
    private readonly propuestaRepo: Repository<HorarioPropuesto>,
    @InjectRepository(HorarioPropuestoDetalle)
    private readonly detalleRepo: Repository<HorarioPropuestoDetalle>,
  ) {}

  private readonly dayOptions = [1, 2, 3, 4, 5];
  private readonly slotStarts = [
    '07:30',
    '08:30',
    '09:30',
    '10:30',
    '11:30',
    '12:30',
    '13:30',
    '14:30',
    '15:30',
  ];
  private readonly dayNames: Record<number, string> = {
    1: 'Lunes',
    2: 'Martes',
    3: 'Miércoles',
    4: 'Jueves',
    5: 'Viernes',
  };

  async getCounts(colegioId: string) {
    const params = [colegioId];

    // 1) total schedule blocks (horarios) for colegio
    const blocksRes: Array<{ count: string }> = await this.vinculoRepo.query(
      `SELECT COUNT(*) as count
       FROM horarios h
       JOIN cursos_materias cm ON h.curso_materia_id = cm.id
       JOIN cursos c ON cm.curso_id = c.id
       WHERE c.colegio_id = $1`,
      params,
    );
    const totalBlocks = parseInt(blocksRes?.[0]?.count ?? '0', 10);

    // 2) count of distinct professors assigned in cursos_materias for colegio
    const profRes: Array<{ count: string }> = await this.vinculoRepo.query(
      `SELECT COUNT(DISTINCT cm.profesor_vinculo_id) as count
       FROM cursos_materias cm
       JOIN cursos c ON cm.curso_id = c.id
       WHERE c.colegio_id = $1`,
      params,
    );
    const professorsAssigned = parseInt(profRes?.[0]?.count ?? '0', 10);

    // 3) count of materias programadas (distinct materia_id in cursos_materias for colegio)
    const matRes: Array<{ count: string }> = await this.vinculoRepo.query(
      `SELECT COUNT(DISTINCT cm.materia_id) as count
       FROM cursos_materias cm
       JOIN cursos c ON cm.curso_id = c.id
       WHERE c.colegio_id = $1`,
      params,
    );
    const materiasProgramadas = parseInt(matRes?.[0]?.count ?? '0', 10);

    // 4) count of cursos that have at least one horario
    const cursosRes: Array<{ count: string }> = await this.vinculoRepo.query(
      `SELECT COUNT(DISTINCT c.id) as count
       FROM cursos c
       JOIN cursos_materias cm ON cm.curso_id = c.id
       JOIN horarios h ON h.curso_materia_id = cm.id
       WHERE c.colegio_id = $1`,
      params,
    );
    const cursosWithHorario = parseInt(cursosRes?.[0]?.count ?? '0', 10);

    return {
      totalBlocks,
      professorsAssigned,
      materiasProgramadas,
      cursosWithHorario,
    };
  }

  async getScheduleList(colegioId: string, page = 1, limit = 20) {
    const maxLimit = 200;
    limit = Math.min(limit || 20, maxLimit);
    page = Math.max(1, page || 1);
    const offset = (page - 1) * limit;
    const year = new Date().getFullYear();

    const params = [colegioId, year, limit, offset];

    // Total count for pagination
    const countQuery = `
      SELECT COUNT(*) as count
      FROM horarios h
      JOIN cursos_materias cm ON h.curso_materia_id = cm.id
      JOIN cursos c ON cm.curso_id = c.id
      WHERE c.colegio_id = $1 AND c.annio = $2
    `;
    const countRes: Array<{ count: string }> = await this.vinculoRepo.query(
      countQuery,
      [colegioId, year],
    );
    const total = parseInt(countRes?.[0]?.count ?? '0', 10);

    const listQuery = `
      SELECT
        v.id as profesor_vinculo_id,
        (p.nombre || ' ' || p.apellido_paterno || ' ' || COALESCE(p.apellido_materno, '')) as profesor_full_name,
        cm.id as curso_materia_id,
        cm.materia_id as materia_id,
        m.nombre as materia,
        c.id as curso_id,
        c.nombre as curso_nombre,
        c.nivel as curso_nivel,
        h.dia_semana,
        h.hora_inicio,
        h.hora_fin,
        s.nombre as sala,
        (
          SELECT COUNT(*) FROM alumnos_cursos ac
          WHERE ac.curso_id = c.id AND ac.annio = $2
        ) as student_count
      FROM horarios h
      JOIN cursos_materias cm ON h.curso_materia_id = cm.id
      JOIN cursos c ON cm.curso_id = c.id
      JOIN materias m ON cm.materia_id = m.id
      JOIN vinculos_institucionales v ON cm.profesor_vinculo_id = v.id
      JOIN personas p ON v.persona_id = p.id
      LEFT JOIN salas s ON h.sala_id = s.id
      WHERE c.colegio_id = $1 AND c.annio = $2
      -- Order by weekday starting Monday (1) through Sunday (0 -> mapped to 7), then by start time
      ORDER BY (CASE WHEN h.dia_semana = 0 THEN 7 ELSE h.dia_semana END) ASC, h.hora_inicio ASC, c.nombre, m.nombre
      LIMIT $3 OFFSET $4
    `;

    const rows: Array<any> = await this.vinculoRepo.query(listQuery, params);

    const items = rows.map((r) => ({
      cursoMateriaId: r.curso_materia_id,
      materiaId: r.materia_id,
      profesorVinculoId: r.profesor_vinculo_id,
      profesorFullName: r.profesor_full_name,
      materia: r.materia,
      cursoId: r.curso_id,
      cursoNombre: r.curso_nombre,
      cursoNivel: r.curso_nivel,
      diaSemana: r.dia_semana,
      horaInicio: r.hora_inicio,
      horaFin: r.hora_fin,
      sala: r.sala,
      studentCount: parseInt(r.student_count ?? '0', 10),
    }));

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getWeeklySchedule(colegioId: string, filters?: GetWeeklyScheduleDto) {
    const criteria = filters ?? {};
    if (criteria.horaDesde && criteria.horaHasta) {
      const desdeMin = this.timeToMinutes(criteria.horaDesde);
      const hastaMin = this.timeToMinutes(criteria.horaHasta);
      if (desdeMin >= hastaMin) {
        throw new BadRequestException(
          'El rango horario debe tener horaDesde anterior a horaHasta',
        );
      }
    }

    const params: Array<string | number> = [colegioId];
    const whereClauses = ['c.colegio_id = $1', 'h.dia_semana BETWEEN 1 AND 5'];
    let paramIndex = 2;

    if (criteria.cursoId) {
      whereClauses.push(`c.id = $${paramIndex}`);
      params.push(criteria.cursoId);
      paramIndex += 1;
    }
    if (criteria.materiaId) {
      whereClauses.push(`m.id = $${paramIndex}`);
      params.push(criteria.materiaId);
      paramIndex += 1;
    }
    if (criteria.profesorVinculoId) {
      whereClauses.push(`cm.profesor_vinculo_id = $${paramIndex}`);
      params.push(criteria.profesorVinculoId);
      paramIndex += 1;
    }
    if (criteria.salaId) {
      whereClauses.push(`h.sala_id = $${paramIndex}`);
      params.push(criteria.salaId);
      paramIndex += 1;
    }
    if (criteria.diaSemana) {
      whereClauses.push(`h.dia_semana = $${paramIndex}`);
      params.push(criteria.diaSemana);
      paramIndex += 1;
    }
    if (criteria.horaDesde) {
      whereClauses.push(`h.hora_inicio >= $${paramIndex}`);
      params.push(criteria.horaDesde);
      paramIndex += 1;
    }
    if (criteria.horaHasta) {
      whereClauses.push(`h.hora_fin <= $${paramIndex}`);
      params.push(criteria.horaHasta);
      paramIndex += 1;
    }

    const rows: Array<any> = await this.vinculoRepo.query(
      `SELECT
        h.id as horario_id,
        h.dia_semana,
        h.hora_inicio,
        h.hora_fin,
        h.sala_id,
        s.nombre as sala_nombre,
        cm.id as curso_materia_id,
        c.id as curso_id,
        c.nombre as curso_nombre,
        c.nivel as curso_nivel,
        m.id as materia_id,
        m.nombre as materia_nombre,
        cm.profesor_vinculo_id,
        (p.nombre || ' ' || p.apellido_paterno || ' ' || COALESCE(p.apellido_materno, '')) as profesor_full_name
      FROM horarios h
      JOIN cursos_materias cm ON cm.id = h.curso_materia_id
      JOIN cursos c ON c.id = cm.curso_id
      JOIN materias m ON m.id = cm.materia_id
      JOIN vinculos_institucionales v ON v.id = cm.profesor_vinculo_id
      JOIN personas p ON p.id = v.persona_id
      LEFT JOIN salas s ON s.id = h.sala_id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY h.dia_semana, h.hora_inicio, h.hora_fin`,
      params,
    );

    const days = this.dayOptions.map((dia) => ({
      diaSemana: dia,
      nombre: this.getDayName(dia),
      bloques: rows
        .filter((row) => Number(row.dia_semana) === dia)
        .map((row) => ({
          horarioId: row.horario_id,
          diaSemana: Number(row.dia_semana),
          horaInicio: row.hora_inicio,
          horaFin: row.hora_fin,
          salaId: row.sala_id,
          salaNombre: row.sala_nombre,
          cursoMateriaId: row.curso_materia_id,
          cursoId: row.curso_id,
          cursoNombre: row.curso_nombre,
          cursoNivel: row.curso_nivel,
          materiaId: row.materia_id,
          materiaNombre: row.materia_nombre,
          profesorVinculoId: row.profesor_vinculo_id,
          profesorFullName: row.profesor_full_name,
        })),
    }));

    const appliedFilters = {
      salaId: criteria.salaId ?? null,
      cursoId: criteria.cursoId ?? null,
      materiaId: criteria.materiaId ?? null,
      profesorVinculoId: criteria.profesorVinculoId ?? null,
      diaSemana: criteria.diaSemana ?? null,
      horaDesde: criteria.horaDesde ?? null,
      horaHasta: criteria.horaHasta ?? null,
    };

    return {
      days,
      totalBloques: rows.length,
      appliedFilters,
    };
  }

  async createProposal(
    colegioId: string,
    createdById: string | null,
    dto: CreateHorarioPropuestoDto,
  ) {
    const periodoInicio = new Date(dto.periodoInicio);
    const periodoFin = new Date(dto.periodoFin);
    if (
      Number.isNaN(periodoInicio.getTime()) ||
      Number.isNaN(periodoFin.getTime())
    ) {
      throw new BadRequestException('Las fechas proporcionadas no son válidas');
    }
    if (periodoFin < periodoInicio) {
      throw new BadRequestException(
        'El periodo de fin no puede ser anterior al inicio',
      );
    }

    const blocks = await this.buildScheduleBlocks(colegioId);

    const propuesta = this.propuestaRepo.create({
      colegioId,
      nombre: dto.nombre.trim(),
      periodoInicio,
      periodoFin,
      descripcion: dto.descripcion?.trim() ?? null,
      createdBy: createdById,
    });

    const savedProposal = await this.propuestaRepo.save(propuesta);

    if (blocks.length > 0) {
      const detalles = blocks.map((block) =>
        this.detalleRepo.create({
          ...block,
          propuestaId: savedProposal.id,
        }),
      );
      await this.detalleRepo.save(detalles);
    }

    return savedProposal;
  }

  async rerollProposal(colegioId: string, proposalId: string) {
    const proposal = await this.findProposal(colegioId, proposalId);
    if (proposal.estado === 'aprobado') {
      throw new BadRequestException(
        'No se puede generar una nueva propuesta cuando ya está aprobada',
      );
    }

    const blocks = await this.buildScheduleBlocks(colegioId);
    await this.detalleRepo.delete({ propuestaId: proposalId });

    if (blocks.length > 0) {
      const detalles = blocks.map((block) =>
        this.detalleRepo.create({
          ...block,
          propuestaId: proposalId,
        }),
      );
      await this.detalleRepo.save(detalles);
    }

    return this.propuestaRepo.save(proposal);
  }

  async listProposals(colegioId: string, page = 1, limit = 20) {
    const clampedLimit = Math.min(Math.max(1, limit), 200);
    const safePage = Math.max(1, page);
    const offset = (safePage - 1) * clampedLimit;

    const totalRes: Array<{ count: string }> = await this.vinculoRepo.query(
      'SELECT COUNT(*) as count FROM horarios_propuestos WHERE colegio_id = $1',
      [colegioId],
    );
    const total = parseInt(totalRes?.[0]?.count ?? '0', 10);

    const rows = await this.vinculoRepo.query(
      `SELECT
        h.id,
        h.nombre,
        h.periodo_inicio,
        h.periodo_fin,
        h.estado,
        h.descripcion,
        h.created_at,
        h.updated_at,
        COUNT(d.id) as bloques,
        (
          SELECT (p.nombre || ' ' || p.apellido_paterno || ' ' || COALESCE(p.apellido_materno, ''))
          FROM vinculos_institucionales cb
          JOIN personas p ON p.id = cb.persona_id
          WHERE cb.id = h.created_by
        ) as creador_nombre
      FROM horarios_propuestos h
      LEFT JOIN horarios_propuestos_detalle d ON d.propuesta_id = h.id
      WHERE h.colegio_id = $1
      GROUP BY h.id
      ORDER BY h.created_at DESC
      LIMIT $2 OFFSET $3`,
      [colegioId, clampedLimit, offset],
    );

    const items = rows.map((row) => ({
      id: row.id,
      nombre: row.nombre,
      estado: row.estado,
      descripcion: row.descripcion,
      periodoInicio: row.periodo_inicio,
      periodoFin: row.periodo_fin,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      bloques: parseInt(row.bloques ?? '0', 10),
      creadoPor: row.creador_nombre ?? null,
    }));

    return {
      items,
      pagination: {
        total,
        page: safePage,
        limit: clampedLimit,
        totalPages: Math.ceil(total / clampedLimit),
      },
    };
  }

  async getProposalDetail(colegioId: string, proposalId: string) {
    const proposal = await this.findProposal(colegioId, proposalId);

    const detailRows: Array<any> = await this.vinculoRepo.query(
      `SELECT d.id,
        d.profesor_vinculo_id,
        d.curso_materia_id,
        d.sala_id,
        d.dia_semana,
        d.hora_inicio,
        d.hora_fin,
        d.observaciones,
        c.id as curso_id,
        c.nombre as curso_nombre,
        m.nombre as materia_nombre,
        s.nombre as sala_nombre,
        (p.nombre || ' ' || p.apellido_paterno || ' ' || COALESCE(p.apellido_materno, '')) as profesor_full_name
      FROM horarios_propuestos_detalle d
      JOIN cursos_materias cm ON cm.id = d.curso_materia_id
      JOIN cursos c ON c.id = cm.curso_id
      JOIN materias m ON m.id = cm.materia_id
      JOIN salas s ON s.id = d.sala_id
      JOIN vinculos_institucionales v ON v.id = d.profesor_vinculo_id
      JOIN personas p ON p.id = v.persona_id
      WHERE d.propuesta_id = $1
      ORDER BY d.dia_semana ASC, d.hora_inicio ASC`,
      [proposalId],
    );

    const items = detailRows.map((row) => ({
      id: row.id,
      profesorVinculoId: row.profesor_vinculo_id,
      profesorFullName: row.profesor_full_name,
      cursoMateriaId: row.curso_materia_id,
      cursoId: row.curso_id,
      cursoNombre: row.curso_nombre,
      materiaNombre: row.materia_nombre,
      salaId: row.sala_id,
      salaNombre: row.sala_nombre,
      diaSemana: row.dia_semana,
      horaInicio: row.hora_inicio,
      horaFin: row.hora_fin,
      observaciones: row.observaciones,
    }));

    return { proposal, items };
  }

  async updateProposal(
    colegioId: string,
    proposalId: string,
    dto: UpdateHorarioPropuestoDto,
  ) {
    const proposal = await this.findProposal(colegioId, proposalId);
    if (proposal.estado === 'aprobado') {
      throw new BadRequestException(
        'No se pueden editar propuestas ya aprobadas',
      );
    }

    if (dto.nombre) {
      proposal.nombre = dto.nombre.trim();
    }
    if (dto.descripcion !== undefined) {
      proposal.descripcion = dto.descripcion?.trim() ?? null;
    }
    if (dto.periodoInicio) {
      const inicio = new Date(dto.periodoInicio);
      if (Number.isNaN(inicio.getTime())) {
        throw new BadRequestException('Fecha de inicio inválida');
      }
      proposal.periodoInicio = inicio;
    }
    if (dto.periodoFin) {
      const fin = new Date(dto.periodoFin);
      if (Number.isNaN(fin.getTime())) {
        throw new BadRequestException('Fecha de fin inválida');
      }
      proposal.periodoFin = fin;
    }
    if (proposal.periodoFin < proposal.periodoInicio) {
      throw new BadRequestException(
        'El periodo de fin no puede ser anterior al inicio',
      );
    }

    return this.propuestaRepo.save(proposal);
  }

  async updateProposalStatus(
    colegioId: string,
    proposalId: string,
    dto: UpdateHorarioPropuestoStatusDto,
  ) {
    const proposal = await this.findProposal(colegioId, proposalId);
    const normalized = dto.estado.toLowerCase();
    const allowed = ['borrador', 'aprobado', 'rechazado'];
    if (!allowed.includes(normalized)) {
      throw new BadRequestException('Estado inválido');
    }
    proposal.estado = normalized;
    return this.propuestaRepo.save(proposal);
  }

  private async buildScheduleBlocks(colegioId: string) {
    const salas = await this.fetchSalas(colegioId);
    if (!salas.length) {
      throw new BadRequestException(
        'No hay salas registradas para este colegio',
      );
    }

    const cursosMaterias = await this.fetchCourseMateriaRows(colegioId);
    if (!cursosMaterias.length) {
      return [];
    }

    const opciones = this.buildScheduleOptions();
    const usedProf = new Set<string>();
    const usedRoom = new Set<string>();
    const bloques: ProposalDetailPayload[] = [];

    for (const materia of cursosMaterias) {
      const slot = this.pickSlotForProfesor(
        opciones,
        salas,
        materia.profesor_vinculo_id,
        usedProf,
        usedRoom,
      );
      bloques.push({
        profesorVinculoId: materia.profesor_vinculo_id,
        cursoMateriaId: materia.curso_materia_id,
        salaId: slot.salaId,
        diaSemana: slot.diaSemana,
        horaInicio: slot.horaInicio,
        horaFin: slot.horaFin,
        observaciones: 'Generado automáticamente',
      });
    }

    return bloques;
  }

  private async fetchCourseMateriaRows(
    colegioId: string,
  ): Promise<CourseMateriaRow[]> {
    return this.vinculoRepo.query(
      `SELECT cm.id as curso_materia_id,
              cm.profesor_vinculo_id
       FROM cursos_materias cm
       JOIN cursos c ON c.id = cm.curso_id
       WHERE c.colegio_id = $1`,
      [colegioId],
    );
  }

  private async fetchSalas(colegioId: string) {
    return this.vinculoRepo.query(
      `SELECT id
       FROM salas
       WHERE colegio_id = $1
       ORDER BY nombre`,
      [colegioId],
    );
  }

  private buildScheduleOptions(): ScheduleOption[] {
    const opciones: ScheduleOption[] = [];
    for (const dia of this.dayOptions) {
      for (const inicio of this.slotStarts) {
        opciones.push({
          diaSemana: dia,
          horaInicio: this.formatTimeWithSeconds(inicio),
          horaFin: this.formatTimeWithSeconds(this.addMinutes(inicio, 60)),
        });
      }
    }
    return opciones;
  }

  private pickSlotForProfesor(
    opciones: ScheduleOption[],
    salas: Array<{ id: string }>,
    profesorId: string,
    usedProf: Set<string>,
    usedRoom: Set<string>,
  ): ScheduleOption & { salaId: string } {
    const shuffledOptions = this.shuffle(opciones);
    for (const option of shuffledOptions) {
      for (const sala of this.shuffle(salas)) {
        const profKey = `${profesorId}-${option.diaSemana}-${option.horaInicio}`;
        const roomKey = `${sala.id}-${option.diaSemana}-${option.horaInicio}`;
        if (usedProf.has(profKey) || usedRoom.has(roomKey)) {
          continue;
        }
        usedProf.add(profKey);
        usedRoom.add(roomKey);
        return { ...option, salaId: sala.id };
      }
    }

    const fallback = opciones[0];
    const fallbackSala = salas[0];
    const profKey = `${profesorId}-${fallback.diaSemana}-${fallback.horaInicio}`;
    const roomKey = `${fallbackSala.id}-${fallback.diaSemana}-${fallback.horaInicio}`;
    usedProf.add(profKey);
    usedRoom.add(roomKey);
    return { ...fallback, salaId: fallbackSala.id };
  }

  private shuffle<T>(items: T[]): T[] {
    const array = [...items];
    for (let i = array.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  private addMinutes(time: string, minutes: number) {
    const [hourStr, minuteStr] = time.split(':').map(Number);
    const date = new Date(0, 0, 0, hourStr, minuteStr + minutes);
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  private formatTimeWithSeconds(time: string) {
    if (time.split(':').length === 3) {
      return time;
    }
    return `${time}:00`;
  }

  private getDayName(dia: number) {
    return this.dayNames[dia] ?? `Día ${dia}`;
  }

  private timeToMinutes(time: string) {
    const [hours, minutes] = time
      .split(':')
      .map((value) => parseInt(value, 10));
    return hours * 60 + minutes;
  }

  private async findProposal(colegioId: string, proposalId: string) {
    const proposal = await this.propuestaRepo.findOne({
      where: { id: proposalId, colegioId },
    });
    if (!proposal) {
      throw new NotFoundException('Propuesta de horario no encontrada');
    }
    return proposal;
  }
}
