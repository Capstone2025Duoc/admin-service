import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import VinculoInstitucional from '../entities/vinculo-institucional.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(VinculoInstitucional)
    private readonly vinculoRepo: Repository<VinculoInstitucional>,
  ) {}

  async createUser(colegioId: string, dto: CreateUserDto) {
    return this.vinculoRepo.manager.transaction(async (manager) => {
      const normalizedRole = this.normalizeRoleName(dto.role);
      const roleId = await this.lookupRoleId(manager, normalizedRole);
      await this.ensureRutUnique(manager, dto.rut);
      let emailInstitucional = dto.emailInstitucional;
      if (!emailInstitucional) {
        emailInstitucional = await this.generateInstitutionalEmail(
          manager,
          colegioId,
          dto.nombre,
          dto.apellidoPaterno,
        );
      }
      await this.ensureEmailAvailable(manager, colegioId, emailInstitucional);

      const contactEmail = dto.email ?? emailInstitucional;
      const contactId = await this.insertContact(manager, {
        telefono: dto.telefono ?? null,
        direccion: dto.direccion ?? null,
        email: contactEmail,
      });

      const personaRows: Array<{ id: string }> = await manager.query(
        `INSERT INTO personas (rut, nombre, apellido_paterno, apellido_materno, fecha_nacimiento, contacto_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          dto.rut,
          dto.nombre,
          dto.apellidoPaterno,
          dto.apellidoMaterno ?? null,
          dto.fechaNacimiento ?? null,
          contactId,
        ],
      );
      const personaId = personaRows?.[0]?.id;

      const vinculoRows: Array<{ id: string }> = await manager.query(
        `INSERT INTO vinculos_institucionales (persona_id, colegio_id, rol_id, email_institucional, estado)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          personaId,
          colegioId,
          roleId,
          emailInstitucional,
          dto.estado ?? 'activo',
        ],
      );
      const vinculoId = vinculoRows?.[0]?.id;

      if (dto.cursoId) {
        await this.assignCourseForRole(
          manager,
          colegioId,
          normalizedRole,
          vinculoId,
          dto.cursoId,
        );
      }

      return this.loadUserByVinculo(manager, vinculoId, colegioId);
    });
  }

  async updateUser(colegioId: string, vinculoId: string, dto: UpdateUserDto) {
    return this.vinculoRepo.manager.transaction(async (manager) => {
      const vinculoData = await this.resolveVinculoForUpdate(
        manager,
        vinculoId,
        colegioId,
      );
      if (dto.rut) {
        await this.ensureRutUnique(manager, dto.rut, vinculoData.persona_id);
      }

      if (dto.emailInstitucional !== undefined) {
        await this.ensureEmailAvailable(
          manager,
          colegioId,
          dto.emailInstitucional,
          vinculoId,
        );
      }

      let roleId: string | null = null;
      if (dto.role) {
        const normalizedRole = this.normalizeRoleName(dto.role);
        roleId = await this.lookupRoleId(manager, normalizedRole);
      }

      await this.updatePersona(manager, vinculoData.persona_id, dto);
      await this.upsertContact(
        manager,
        vinculoData.persona_id,
        vinculoData.contacto_id,
        {
          email: dto.email,
          telefono: dto.telefono,
          direccion: dto.direccion,
        },
      );

      const vinculoUpdates: string[] = [];
      const vinculoParams: any[] = [];
      if (roleId) {
        vinculoUpdates.push(`rol_id = $${vinculoParams.length + 1}`);
        vinculoParams.push(roleId);
      }
      if (dto.emailInstitucional !== undefined) {
        vinculoUpdates.push(
          `email_institucional = $${vinculoParams.length + 1}`,
        );
        vinculoParams.push(dto.emailInstitucional ?? null);
      }
      if (dto.estado !== undefined) {
        vinculoUpdates.push(`estado = $${vinculoParams.length + 1}`);
        vinculoParams.push(dto.estado);
      }
      if (vinculoUpdates.length > 0) {
        vinculoParams.push(vinculoId);
        await manager.query(
          `UPDATE vinculos_institucionales SET ${vinculoUpdates.join(', ')} WHERE id = $${vinculoParams.length}`,
          vinculoParams,
        );
      }

      return this.loadUserByVinculo(manager, vinculoId, colegioId);
    });
  }

  private normalizeRoleName(role: string) {
    return role?.trim().toLowerCase();
  }

  private async lookupRoleId(manager: EntityManager, role: string) {
    if (!role) throw new BadRequestException('Rol inválido');
    const rows: Array<{ id: string }> = await manager.query(
      `SELECT id FROM roles WHERE nombre = $1`,
      [role],
    );
    if (!rows.length) throw new BadRequestException('Rol no encontrado');
    return rows[0].id;
  }

  private async ensureRutUnique(
    manager: EntityManager,
    rut: string,
    excludePersonaId?: string,
  ) {
    const params = [rut.trim()];
    let sql = `SELECT id FROM personas WHERE rut = $1`;
    if (excludePersonaId) {
      sql += ` AND id <> $2`;
      params.push(excludePersonaId);
    }
    const rows = await manager.query(sql, params);
    if (rows.length) throw new ConflictException('El RUT ya está registrado');
  }

  private async ensureEmailAvailable(
    manager: EntityManager,
    colegioId: string,
    email: string,
    excludeVinculoId?: string,
  ) {
    const params = [colegioId, email];
    let sql = `SELECT id FROM vinculos_institucionales WHERE colegio_id = $1 AND email_institucional = $2`;
    if (excludeVinculoId) {
      sql += ` AND id <> $3`;
      params.push(excludeVinculoId);
    }
    const rows = await manager.query(sql, params);
    if (rows.length)
      throw new ConflictException(
        'El email institucional ya fue usado en el colegio',
      );
  }

  private async insertContact(
    manager: EntityManager,
    payload: {
      telefono?: string | null;
      direccion?: string | null;
      email: string;
    },
  ) {
    const rows: Array<{ id: string }> = await manager.query(
      `INSERT INTO contactos (telefono, direccion, email) VALUES ($1, $2, $3) RETURNING id`,
      [payload.telefono ?? null, payload.direccion ?? null, payload.email],
    );
    return rows?.[0]?.id;
  }

  private async updatePersona(
    manager: EntityManager,
    personaId: string,
    dto: UpdateUserDto,
  ) {
    const updates: string[] = [];
    const params: any[] = [];
    if (dto.rut) {
      updates.push(`rut = $${params.length + 1}`);
      params.push(dto.rut);
    }
    if (dto.nombre) {
      updates.push(`nombre = $${params.length + 1}`);
      params.push(dto.nombre);
    }
    if (dto.apellidoPaterno) {
      updates.push(`apellido_paterno = $${params.length + 1}`);
      params.push(dto.apellidoPaterno);
    }
    if (dto.apellidoMaterno) {
      updates.push(`apellido_materno = $${params.length + 1}`);
      params.push(dto.apellidoMaterno);
    }
    if (dto.fechaNacimiento) {
      updates.push(`fecha_nacimiento = $${params.length + 1}`);
      params.push(dto.fechaNacimiento);
    }
    if (!updates.length) return;
    params.push(personaId);
    await manager.query(
      `UPDATE personas SET ${updates.join(', ')} WHERE id = $${params.length}`,
      params,
    );
  }

  private async upsertContact(
    manager: EntityManager,
    personaId: string,
    contactoId: string | null,
    payload: { email?: string; telefono?: string; direccion?: string },
  ) {
    const hasChanges =
      payload.email !== undefined ||
      payload.telefono !== undefined ||
      payload.direccion !== undefined;
    if (!hasChanges) return contactoId;
    if (contactoId) {
      await this.updateContact(manager, contactoId, payload);
      return contactoId;
    }
    if (!payload.email) {
      throw new BadRequestException(
        'Se requiere un email para crear un contacto nuevo',
      );
    }
    const newContactId = await this.insertContact(manager, {
      email: payload.email,
      telefono: payload.telefono ?? null,
      direccion: payload.direccion ?? null,
    });
    await manager.query(`UPDATE personas SET contacto_id = $1 WHERE id = $2`, [
      newContactId,
      personaId,
    ]);
    return newContactId;
  }

  private async updateContact(
    manager: EntityManager,
    contactoId: string,
    payload: { email?: string; telefono?: string; direccion?: string },
  ) {
    const updates: string[] = [];
    const params: any[] = [];
    if (payload.email !== undefined) {
      updates.push(`email = $${params.length + 1}`);
      params.push(payload.email);
    }
    if (payload.telefono !== undefined) {
      updates.push(`telefono = $${params.length + 1}`);
      params.push(payload.telefono ?? null);
    }
    if (payload.direccion !== undefined) {
      updates.push(`direccion = $${params.length + 1}`);
      params.push(payload.direccion ?? null);
    }
    if (!updates.length) return;
    params.push(contactoId);
    await manager.query(
      `UPDATE contactos SET ${updates.join(', ')} WHERE id = $${params.length}`,
      params,
    );
  }

  private async loadUserByVinculo(
    manager: EntityManager,
    vinculoId: string,
    colegioId: string,
  ) {
    const rows = await manager.query(
      `SELECT v.id AS vinculo_id,
              p.id AS persona_id,
              p.nombre,
              p.apellido_paterno,
              p.apellido_materno,
              p.rut,
              contact.telefono,
              contact.email AS contact_email,
              contact.direccion,
              v.email_institucional,
              v.estado,
              r.nombre AS role
       FROM vinculos_institucionales v
       JOIN personas p ON p.id = v.persona_id
       LEFT JOIN contactos contact ON contact.id = p.contacto_id
       JOIN roles r ON r.id = v.rol_id
       WHERE v.id = $1 AND v.colegio_id = $2`,
      [vinculoId, colegioId],
    );
    if (!rows.length) throw new NotFoundException('Usuario no encontrado');
    const row = rows[0];
    const fullName = [row.nombre, row.apellido_paterno, row.apellido_materno]
      .filter(Boolean)
      .join(' ');
    return {
      vinculoId: row.vinculo_id,
      personaId: row.persona_id,
      fullName,
      role: row.role,
      estado: row.estado,
      emailInstitucional: row.email_institucional ?? null,
      telefono: row.telefono ?? null,
      contactEmail: row.contact_email ?? null,
      direccion: row.direccion ?? null,
      rut: row.rut,
    };
  }

  private async resolveVinculoForUpdate(
    manager: EntityManager,
    vinculoId: string,
    colegioId: string,
  ) {
    const rows = await manager.query(
      `SELECT v.id AS vinculo_id, v.persona_id, p.contacto_id
       FROM vinculos_institucionales v
       JOIN personas p ON p.id = v.persona_id
       WHERE v.id = $1 AND v.colegio_id = $2`,
      [vinculoId, colegioId],
    );
    if (!rows.length) throw new NotFoundException('Usuario no encontrado');
    return rows[0];
  }

  private async generateInstitutionalEmail(
    manager: EntityManager,
    colegioId: string,
    nombre: string,
    apellidoPaterno: string,
  ) {
    const colegioRows: Array<{ nombre_institucion: string | null }> =
      await manager.query(
        `SELECT nombre_institucion FROM colegios WHERE id = $1`,
        [colegioId],
      );
    const colegioNombre = colegioRows?.[0]?.nombre_institucion ?? 'colegio';
    const domainName = this.slugify(colegioNombre) || 'colegio';
    const domain = `${domainName}.cl`;
    const normalizedFirst = this.slugify(nombre).charAt(0) ?? '';
    const normalizedLast = this.slugify(apellidoPaterno) || 'persona';
    const base = normalizedFirst
      ? `${normalizedFirst}.${normalizedLast}`
      : normalizedLast;

    let suffix = '';
    let tries = 0;
    while (true) {
      const candidate = `${base}${suffix}@${domain}`;
      const rows: Array<{ id: string }> = await manager.query(
        `SELECT id FROM vinculos_institucionales WHERE colegio_id = $1 AND email_institucional = $2`,
        [colegioId, candidate],
      );
      if (!rows.length) return candidate;
      tries += 1;
      suffix = String(tries);
    }
  }

  private slugify(value: string) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  private async assignCourseForRole(
    manager: EntityManager,
    colegioId: string,
    role: string,
    vinculoId: string,
    cursoId: string,
  ) {
    const cursoRows: Array<{ id: string; colegio_id: string }> =
      await manager.query(`SELECT id, colegio_id FROM cursos WHERE id = $1`, [
        cursoId,
      ]);
    if (!cursoRows.length) {
      throw new BadRequestException('Curso no encontrado');
    }
    if (cursoRows[0].colegio_id !== colegioId) {
      throw new BadRequestException(
        'El curso no pertenece al colegio autenticado',
      );
    }

    const currentYear = new Date().getFullYear();
    if (role === 'estudiante') {
      await manager.query(
        `INSERT INTO alumnos_cursos (alumno_vinculo_id, curso_id, annio)
         VALUES ($1, $2, $3)
         ON CONFLICT (alumno_vinculo_id, curso_id, annio) DO NOTHING`,
        [vinculoId, cursoId, currentYear],
      );
      return;
    }

    if (role === 'profesor') {
      await manager.query(
        `UPDATE cursos SET profesor_jefe_vinculo_id = $1 WHERE id = $2`,
        [vinculoId, cursoId],
      );
    }
  }

  async getCounts(colegioId: string) {
    // All counts are scoped to the provided colegioId to prevent cross-colegio access
    const params = [colegioId];

    const totalRes: Array<{ count: string }> = await this.vinculoRepo.query(
      `SELECT COUNT(*) as count FROM vinculos_institucionales WHERE colegio_id = $1`,
      params,
    );
    const total = parseInt(totalRes?.[0]?.count ?? '0', 10);

    const studentsRes: Array<{ count: string }> = await this.vinculoRepo.query(
      `SELECT COUNT(*) as count FROM vinculos_institucionales v JOIN roles r ON v.rol_id = r.id WHERE r.nombre = 'estudiante' AND v.colegio_id = $1`,
      params,
    );
    const students = parseInt(studentsRes?.[0]?.count ?? '0', 10);

    const teachersRes: Array<{ count: string }> = await this.vinculoRepo.query(
      `SELECT COUNT(*) as count FROM vinculos_institucionales v JOIN roles r ON v.rol_id = r.id WHERE r.nombre = 'profesor' AND v.colegio_id = $1`,
      params,
    );
    const teachers = parseInt(teachersRes?.[0]?.count ?? '0', 10);

    const adminsRes: Array<{ count: string }> = await this.vinculoRepo.query(
      `SELECT COUNT(*) as count FROM vinculos_institucionales v JOIN roles r ON v.rol_id = r.id WHERE r.nombre = 'administrativo' AND v.colegio_id = $1`,
      params,
    );
    const admins = parseInt(adminsRes?.[0]?.count ?? '0', 10);

    const activeRes: Array<{ count: string }> = await this.vinculoRepo.query(
      `SELECT COUNT(*) as count FROM vinculos_institucionales WHERE estado = 'activo' AND colegio_id = $1`,
      params,
    );
    const active = parseInt(activeRes?.[0]?.count ?? '0', 10);

    return { total, students, teachers, admins, active };
  }

  async getUsers(
    colegioId: string,
    options?: { page?: number; limit?: number; role?: string; estado?: string },
  ) {
    const page =
      options?.page && options.page > 0 ? Math.floor(options.page) : 1;
    const limit =
      options?.limit && options.limit > 0
        ? Math.min(Math.floor(options.limit), 200)
        : 20;
    const offset = (page - 1) * limit;
    const currentYear = new Date().getFullYear();

    // Build WHERE clauses with params
    const whereClauses: string[] = ['v.colegio_id = $1'];
    const params: any[] = [colegioId];
    let idx = 2;
    if (options?.role) {
      whereClauses.push(`r.nombre = $${idx}`);
      params.push(options.role);
      idx++;
    }
    if (options?.estado) {
      whereClauses.push(`v.estado = $${idx}`);
      params.push(options.estado);
      idx++;
    }

    const whereSQL = whereClauses.length
      ? 'WHERE ' + whereClauses.join(' AND ')
      : '';

    // total count
    const countQuery = `SELECT COUNT(*) as count FROM vinculos_institucionales v JOIN roles r ON v.rol_id = r.id ${whereSQL}`;
    const countRes: Array<{ count: string }> = await this.vinculoRepo.query(
      countQuery,
      params,
    );
    const total = parseInt(countRes?.[0]?.count ?? '0', 10);

    // main paginated select
    const selectSQL = `SELECT v.id as vinculo_id, v.persona_id, v.email_institucional, v.estado, r.nombre as role,
              p.nombre as nombres, p.apellido_paterno, p.apellido_materno, contact.telefono
       FROM vinculos_institucionales v
       JOIN roles r ON v.rol_id = r.id
       JOIN personas p ON v.persona_id = p.id
       LEFT JOIN contactos contact ON p.contacto_id = contact.id
       ${whereSQL}
       ORDER BY p.apellido_paterno, p.nombre
       LIMIT $${idx} OFFSET $${idx + 1}`;

    const pageParams = params.concat([limit, offset]);
    const users: Array<any> = await this.vinculoRepo.query(
      selectSQL,
      pageParams,
    );

    const vinculoIds = users.map((u) => u.vinculo_id).filter(Boolean);

    // profesor jefe mapping
    const profesorMap: Record<string, string> = {};
    if (vinculoIds.length > 0) {
      const profRows: Array<any> = await this.vinculoRepo.query(
        `SELECT profesor_jefe_vinculo_id, nombre, annio FROM cursos WHERE profesor_jefe_vinculo_id = ANY($1::uuid[]) AND colegio_id = $2`,
        [vinculoIds, colegioId],
      );
      for (const r of profRows) {
        if (r.profesor_jefe_vinculo_id)
          profesorMap[r.profesor_jefe_vinculo_id] = `${r.nombre} ${r.annio}`;
      }
    }

    // alumnos current course for currentYear
    const alumnoMap: Record<string, string> = {};
    if (vinculoIds.length > 0) {
      const stuRows: Array<any> = await this.vinculoRepo.query(
        `SELECT ac.alumno_vinculo_id, c.nombre FROM alumnos_cursos ac JOIN cursos c ON ac.curso_id = c.id WHERE ac.alumno_vinculo_id = ANY($1::uuid[]) AND ac.annio = $2 AND c.colegio_id = $3`,
        [vinculoIds, currentYear, colegioId],
      );
      for (const r of stuRows) {
        if (r.alumno_vinculo_id) alumnoMap[r.alumno_vinculo_id] = `${r.nombre}`;
      }
    }

    // colegio name
    const colegioRows: Array<any> = await this.vinculoRepo.query(
      `SELECT nombre_institucion FROM colegios WHERE id = $1`,
      [colegioId],
    );
    const colegioName = colegioRows?.[0]?.nombre_institucion ?? null;

    const items = users.map((u) => {
      const fullName = [u.nombres, u.apellido_paterno, u.apellido_materno]
        .filter(Boolean)
        .join(' ');
      const email = u.email_institucional || null;
      const role = u.role;
      const estado = u.estado;
      const telefono = u.telefono || null;

      let assignment: string | null = null;
      if (role === 'profesor') assignment = profesorMap[u.vinculo_id] ?? null;
      if (role === 'estudiante') {
        if (estado === 'egresado' || estado === 'trasladado') assignment = null;
        else assignment = alumnoMap[u.vinculo_id] ?? null;
      }
      if (role === 'administrativo') assignment = colegioName;

      return {
        fullName,
        email,
        role,
        estado,
        telefono,
        assignment,
      };
    });

    const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
    return { items, total, page, limit, totalPages };
  }
}
