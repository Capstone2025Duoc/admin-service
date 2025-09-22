<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

<h1 align="center">Servicio de Administración - Sistema Escolar</h1>

## 📝 Descripción

Este repositorio contiene el código fuente del **Servicio de Administración**, uno de los microservicios del backend del Sistema de Gestión Escolar. Construido con **[NestJS](https://nestjs.com)**, este servicio es el núcleo de las operaciones administrativas y de gestión global de la institución.

Sus responsabilidades principales incluyen:
-   **Gestión de Usuarios:** Administrar el ciclo de vida (CRUD) de los usuarios de la plataforma (alumnos, profesores, administrativos).
-   **Generación de Reportes:** Proveer los endpoints necesarios para generar reportes institucionales consolidados (asistencia, calificaciones, etc.).
-   **Métricas Institucionales:** Calcular y exponer datos estadísticos a nivel global, como el rendimiento académico general, tasas de retención y asistencia promedio.
---

## 🛠️ Tecnologías Utilizadas

-   **Framework:** [NestJS](https://nestjs.com/)
-   **Lenguaje:** [TypeScript](https://www.typescriptlang.org/)
---

### ▶️ Ejecutando la Aplicación

```bash
# Modo desarrollo (con recarga automática)
$ pnpm run start:dev

# Modo producción
$ pnpm run start:prod
