import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateChemicalReportDto } from './dto/create-chemical-report.dto';

const quantityFields = [
  'tabsQuantity',
  'liquidChlorineGallons',
  'muriaticAcidGallons',
  'shockScoops',
  'dePowderBags',
  'bicarbonateScoops',
  'stabilizerScoops',
  'saltBags',
  'phosphatesOunces',
] as const;

@Injectable()
export class ChemicalsService {
  constructor(private readonly prisma: PrismaService) {}

  findTechnicians() {
    return this.prisma.chemicalTechnician.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  async resolveTechnician(shareToken: string) {
    const technician = await this.prisma.chemicalTechnician.findFirst({
      where: { shareToken, active: true },
      select: { name: true },
    });
    if (!technician) {
      throw new NotFoundException('Technician link not found.');
    }
    return technician;
  }

  async technicianWhatsAppUrl(id: string, formUrl: string) {
    let parsedFormUrl: URL;
    try {
      parsedFormUrl = new URL(formUrl);
    } catch {
      throw new BadRequestException('The form URL is invalid.');
    }

    if (!['http:', 'https:'].includes(parsedFormUrl.protocol)) {
      throw new BadRequestException('The form URL is invalid.');
    }

    const technician = await this.prisma.chemicalTechnician.findFirst({
      where: { id, active: true },
      select: { name: true, whatsappNumber: true, shareToken: true },
    });
    if (!technician) {
      throw new NotFoundException('Technician not found.');
    }

    parsedFormUrl.searchParams.delete('technician');
    parsedFormUrl.searchParams.set('area', 'chemicals');
    parsedFormUrl.searchParams.set('technicianToken', technician.shareToken);
    const firstName = technician.name.split(' ')[0];
    const message = `Hola ${firstName}, registra aquí las cantidades de químicos que retiraste de bodega: ${parsedFormUrl.toString()}`;
    const whatsappUrl = new URL(
      `https://wa.me/${technician.whatsappNumber}`,
    );
    whatsappUrl.searchParams.set('text', message);
    return whatsappUrl.toString();
  }

  findAll() {
    return this.prisma.chemicalReport.findMany({
      orderBy: [{ serviceDate: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }

  async create(data: CreateChemicalReportDto) {
    if (!quantityFields.some((field) => data[field] > 0)) {
      throw new BadRequestException(
        'At least one chemical quantity must be greater than zero.',
      );
    }

    const technicianName = data.technicianToken
      ? (await this.resolveTechnician(data.technicianToken)).name
      : data.technicianName.trim();

    const property = data.propertyId
      ? await this.prisma.property.findFirst({
          where: { id: data.propertyId, deletedAt: null },
          include: { waterBodies: true },
        })
      : null;

    if (data.propertyId && !property) {
      throw new NotFoundException('Property not found.');
    }

    if (data.waterBodyId && !property) {
      throw new BadRequestException(
        'A water body cannot be selected without a property.',
      );
    }

    const waterBody = data.waterBodyId
      ? property?.waterBodies.find((item) => item.id === data.waterBodyId)
      : null;

    if (data.waterBodyId && !waterBody) {
      throw new BadRequestException(
        'The selected water body does not belong to this property.',
      );
    }

    return this.prisma.chemicalReport.create({
      data: {
        serviceDate: new Date(`${data.serviceDate}T12:00:00.000Z`),
        technicianName,
        propertyId: property?.id ?? null,
        propertyName: property?.name ?? null,
        waterBodyId: waterBody?.id ?? null,
        waterBodyName: waterBody?.name ?? null,
        tabsQuantity: data.tabsQuantity,
        liquidChlorineGallons: data.liquidChlorineGallons,
        muriaticAcidGallons: data.muriaticAcidGallons,
        shockScoops: data.shockScoops,
        dePowderBags: data.dePowderBags,
        bicarbonateScoops: data.bicarbonateScoops,
        stabilizerScoops: data.stabilizerScoops,
        saltBags: data.saltBags,
        phosphatesOunces: data.phosphatesOunces,
        notes: data.notes?.trim() || null,
      },
    });
  }

  async exportCsv() {
    const reports = await this.prisma.chemicalReport.findMany({
      orderBy: [{ serviceDate: 'desc' }, { createdAt: 'desc' }],
    });
    const headers = [
      'Fecha',
      'Técnico',
      'Propiedad',
      'Cuerpo de agua',
      'Tabs (Qty)',
      'Liquid Chlorine (GAL)',
      'Muriatic Acid (Gal)',
      'Shock (Scoop)',
      'DE Filter Powder (BAG)',
      'Bicarbonate (Scoop)',
      'Estabilizador (scoop)',
      'SALT (BAG)',
      'Phosphates (oz)',
      'Notas',
      'Estado validación',
    ];
    const escape = (value: unknown) =>
      `"${String(value ?? '').replaceAll('"', '""')}"`;
    const rows = reports.map((report) => [
      report.serviceDate.toISOString().slice(0, 10),
      report.technicianName,
      report.propertyName,
      report.waterBodyName,
      report.tabsQuantity,
      report.liquidChlorineGallons,
      report.muriaticAcidGallons,
      report.shockScoops,
      report.dePowderBags,
      report.bicarbonateScoops,
      report.stabilizerScoops,
      report.saltBags,
      report.phosphatesOunces,
      report.notes,
      report.validationStatus,
    ]);

    return `\uFEFF${[headers, ...rows]
      .map((row) => row.map(escape).join(','))
      .join('\r\n')}`;
  }
}
