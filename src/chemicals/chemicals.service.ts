import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

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

function technicianCode(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function tokenHash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function bearerToken(authorization?: string) {
  const [scheme, token] = authorization?.trim().split(/\s+/, 2) ?? [];
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new UnauthorizedException('Owner access is required.');
  }
  return token;
}

function passwordMatches(password: string, storedHash: string) {
  const [algorithm, saltHex, hashHex] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false;

  try {
    const expected = Buffer.from(hashHex, 'hex');
    const candidate = scryptSync(
      password,
      Buffer.from(saltHex, 'hex'),
      expected.length,
    );
    return timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

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

  async accessTechnician(code: string) {
    const requestedCode = technicianCode(code);
    const technicians = await this.prisma.chemicalTechnician.findMany({
      where: { active: true },
      select: { name: true, shareToken: true },
    });
    const technician = technicians.find(
      (item) => technicianCode(item.name) === requestedCode,
    );
    if (!technician) {
      throw new NotFoundException('Technician code not found.');
    }
    return {
      name: technician.name,
      technicianToken: technician.shareToken,
    };
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
    const whatsappUrl = new URL(`https://wa.me/${technician.whatsappNumber}`);
    whatsappUrl.searchParams.set('text', message);
    return whatsappUrl.toString();
  }

  findAll() {
    return this.prisma.chemicalReport.findMany({
      where: { deletedAt: null },
      orderBy: [{ serviceDate: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }

  async accessOwner(email: string, password: string) {
    const owner = await this.prisma.chemicalOwner.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!owner?.active || !passwordMatches(password, owner.passwordHash)) {
      throw new UnauthorizedException('Invalid owner credentials.');
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.prisma.$transaction([
      this.prisma.chemicalOwnerSession.deleteMany({
        where: { expiresAt: { lte: new Date() } },
      }),
      this.prisma.chemicalOwnerSession.create({
        data: {
          tokenHash: tokenHash(token),
          expiresAt,
          ownerId: owner.id,
        },
      }),
    ]);

    return {
      token,
      expiresAt,
      owner: { name: owner.name, email: owner.email },
    };
  }

  async ownerSession(authorization?: string) {
    const token = bearerToken(authorization);
    const session = await this.prisma.chemicalOwnerSession.findUnique({
      where: { tokenHash: tokenHash(token) },
      include: { owner: true },
    });
    if (!session || session.expiresAt <= new Date() || !session.owner.active) {
      throw new UnauthorizedException('Owner session is not valid.');
    }
    return {
      name: session.owner.name,
      email: session.owner.email,
      expiresAt: session.expiresAt,
    };
  }

  async logoutOwner(authorization?: string) {
    const token = bearerToken(authorization);
    await this.prisma.chemicalOwnerSession.deleteMany({
      where: { tokenHash: tokenHash(token) },
    });
  }

  async remove(id: string, authorization?: string) {
    const owner = await this.ownerSession(authorization);
    const report = await this.prisma.chemicalReport.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!report) throw new NotFoundException('Chemical report not found.');

    return this.prisma.chemicalReport.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedByEmail: owner.email,
      },
      select: { id: true },
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
      where: { deletedAt: null },
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
    ]);

    return `\uFEFF${[headers, ...rows]
      .map((row) => row.map(escape).join(','))
      .join('\r\n')}`;
  }
}
