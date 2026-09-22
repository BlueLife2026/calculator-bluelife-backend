import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportIncidentDto, UpdateReportIncidentDto } from './dto/report-incident.dto';
import { ReportOptionDto } from './dto/report-option.dto';

const TYPE_SEEDS = [
  ['Leak', '#5bb8d4'], ['Pump / Motor', '#ef9f76'], ['Filter', '#87c69d'],
  ['Heater', '#d59ad8'], ['Water level', '#72a7db'], ['Water quality', '#e8be63'],
  ['Cleaning', '#82c8bd'], ['Equipment', '#e58b9c'], ['Electrical system', '#9f9bdc'],
  ['Disinfection system', '#76b68a'], ['Other', '#aeb8c4'],
] as const;

const PERSON_ROLES = ['SUPERVISOR', 'INSPECTOR', 'TECHNICIAN'] as const;
type PersonRole = typeof PERSON_ROLES[number];
const OPTION_COLORS = ['#5bb8d4', '#ef9f76', '#87c69d', '#d59ad8', '#72a7db', '#e8be63', '#82c8bd', '#e58b9c', '#9f9bdc', '#76b68a'];

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private include = {
    type: true,
    technician: true,
    supervisor: true,
    inspector: true,
  } as const;

  private async ensureTypes() {
    for (const [name, color] of TYPE_SEEDS) {
      await this.prisma.reportIncidentType.upsert({ where: { name }, update: {}, create: { name, color } });
    }
  }

  async dashboard() {
    await this.ensureTypes();
    const [incidents, people, types] = await Promise.all([
      this.prisma.reportIncident.findMany({ include: this.include, orderBy: [{ occurredAt: 'desc' }, { status: 'asc' }, { createdAt: 'desc' }] }),
      this.prisma.reportPerson.findMany({ where: { active: true }, orderBy: [{ role: 'asc' }, { name: 'asc' }] }),
      this.prisma.reportIncidentType.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    ]);
    return { incidents, people, types };
  }

  async createIncident(data: CreateReportIncidentDto) {
    this.validateInspector(data.requiresInspector, data.inspectorId);
    await this.validatePeople(data.technicianId, data.supervisorId, data.inspectorId);
    return this.prisma.reportIncident.create({
      data: {
        occurredAt: new Date(`${data.occurredAt}T00:00:00.000Z`),
        propertyName: data.propertyName.trim(), typeId: data.typeId,
        importance: data.importance, description: data.description.trim(),
        technicianId: data.technicianId, supervisorId: data.supervisorId,
        requiresInspector: data.requiresInspector,
        inspectorId: data.requiresInspector ? data.inspectorId : null,
        status: 'PENDING',
      },
      include: this.include,
    });
  }

  async updateIncident(id: string, data: UpdateReportIncidentDto) {
    const current = await this.prisma.reportIncident.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Report not found.');
    const requiresInspector = data.requiresInspector ?? current.requiresInspector;
    const inspectorId = requiresInspector ? (data.inspectorId ?? current.inspectorId ?? undefined) : undefined;
    this.validateInspector(requiresInspector, inspectorId);
    if (data.technicianId || data.supervisorId || inspectorId) {
      await this.validatePeople(data.technicianId ?? current.technicianId, data.supervisorId ?? current.supervisorId, inspectorId);
    }
    const status = data.status ?? current.status;
    const resolution = data.resolution === undefined ? current.resolution : data.resolution.trim();
    if (status === 'SOLVED' && !resolution) throw new BadRequestException('Describe what was done before solving the report.');
    return this.prisma.reportIncident.update({
      where: { id },
      data: {
        occurredAt: data.occurredAt ? new Date(`${data.occurredAt}T00:00:00.000Z`) : undefined,
        propertyName: data.propertyName?.trim(), typeId: data.typeId,
        importance: data.importance, description: data.description?.trim(),
        technicianId: data.technicianId, supervisorId: data.supervisorId,
        requiresInspector: data.requiresInspector,
        inspectorId: requiresInspector ? inspectorId : null,
        status: data.status, resolution,
        solvedAt: data.status === 'SOLVED' ? new Date() : data.status === 'PENDING' ? null : undefined,
      },
      include: this.include,
    });
  }

  deleteIncident(id: string) { return this.prisma.reportIncident.delete({ where: { id } }); }

  async createOption(kind: string, data: ReportOptionDto) {
    const name = data.name.trim();
    if (kind === 'type') {
      const color = data.color || await this.nextColor('type');
      return this.prisma.reportIncidentType.upsert({ where: { name }, update: { active: true, color }, create: { name, color } });
    }
    const role = this.personRole(kind);
    if (role === 'TECHNICIAN' && data.defaultSupervisorId) await this.assertRole(data.defaultSupervisorId, 'SUPERVISOR');
    const color = data.color || await this.nextColor(role);
    return this.prisma.reportPerson.upsert({ where: { role_name: { role, name } }, update: { active: true, color, defaultSupervisorId: role === 'TECHNICIAN' ? data.defaultSupervisorId : null }, create: { name, role, color, defaultSupervisorId: role === 'TECHNICIAN' ? data.defaultSupervisorId : null } });
  }

  async updateOption(kind: string, id: string, data: ReportOptionDto) {
    if (kind === 'type') return this.prisma.reportIncidentType.update({ where: { id }, data: { name: data.name.trim(), color: data.color } });
    const role = this.personRole(kind);
    if (role === 'TECHNICIAN' && data.defaultSupervisorId) await this.assertRole(data.defaultSupervisorId, 'SUPERVISOR');
    return this.prisma.reportPerson.update({ where: { id, role }, data: { name: data.name.trim(), color: data.color, defaultSupervisorId: role === 'TECHNICIAN' ? data.defaultSupervisorId ?? null : null } });
  }

  async deleteOption(kind: string, id: string) {
    if (kind === 'type') return this.prisma.reportIncidentType.update({ where: { id }, data: { active: false } });
    return this.prisma.reportPerson.update({ where: { id, role: this.personRole(kind) }, data: { active: false, defaultSupervisorId: null } });
  }

  private personRole(kind: string): PersonRole {
    const role = kind.toUpperCase() as PersonRole;
    if (!PERSON_ROLES.includes(role)) throw new BadRequestException('Invalid configuration list.');
    return role;
  }

  private validateInspector(required: boolean, inspectorId?: string | null) {
    if (required && !inspectorId) throw new BadRequestException('Select an inspector when inspection is required.');
  }

  private async validatePeople(technicianId: string, supervisorId: string, inspectorId?: string | null) {
    await Promise.all([
      this.assertRole(technicianId, 'TECHNICIAN'), this.assertRole(supervisorId, 'SUPERVISOR'),
      inspectorId ? this.assertRole(inspectorId, 'INSPECTOR') : Promise.resolve(),
    ]);
  }

  private async assertRole(id: string, role: PersonRole) {
    const person = await this.prisma.reportPerson.findFirst({ where: { id, role, active: true } });
    if (!person) throw new BadRequestException(`Invalid ${role.toLowerCase()}.`);
  }

  private async nextColor(kind: PersonRole | 'type') {
    const count = kind === 'type'
      ? await this.prisma.reportIncidentType.count({ where: { active: true } })
      : await this.prisma.reportPerson.count({ where: { role: kind, active: true } });
    return OPTION_COLORS[count % OPTION_COLORS.length];
  }
}
