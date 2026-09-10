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
        technicianName: data.technicianName.trim(),
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
