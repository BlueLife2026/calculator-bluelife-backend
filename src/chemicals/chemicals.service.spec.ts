import { BadRequestException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { ChemicalsService } from './chemicals.service';
import { CreateChemicalReportDto } from './dto/create-chemical-report.dto';

function reportData(): CreateChemicalReportDto {
  return {
    serviceDate: '2026-09-10',
    technicianName: 'Test Technician',
    propertyId: '00000000-0000-4000-8000-000000000001',
    waterBodyId: '00000000-0000-4000-8000-000000000002',
    tabsQuantity: 1,
    liquidChlorineGallons: 2.5,
    muriaticAcidGallons: 0,
    shockScoops: 0,
    dePowderBags: 0,
    bicarbonateScoops: 0,
    stabilizerScoops: 0,
    saltBags: 0,
    phosphatesOunces: 0,
  };
}

describe('ChemicalsService', () => {
  const create = jest.fn();
  const findMany = jest.fn();
  const findFirst = jest.fn();
  const findTechnician = jest.fn();
  const prisma = {
    chemicalReport: { create, findMany },
    chemicalTechnician: { findFirst: findTechnician, findMany: jest.fn() },
    property: { findFirst },
  } as unknown as PrismaService;
  const service = new ChemicalsService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    create.mockResolvedValue({});
  });

  it('rejects a report without chemical quantities', async () => {
    const data = reportData();
    data.tabsQuantity = 0;
    data.liquidChlorineGallons = 0;

    await expect(service.create(data)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('stores property and water body snapshots with the quantities', async () => {
    const data = reportData();
    findFirst.mockResolvedValue({
      id: data.propertyId,
      name: 'Example Property',
      waterBodies: [{ id: data.waterBodyId, name: 'Main Pool' }],
    });
    await service.create(data);

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        propertyName: 'Example Property',
        waterBodyName: 'Main Pool',
        tabsQuantity: 1,
        liquidChlorineGallons: 2.5,
      }),
    });
  });

  it('stores a warehouse withdrawal without property data', async () => {
    const data = reportData();
    delete data.propertyId;
    delete data.waterBodyId;
    await service.create(data);

    expect(findFirst).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        technicianName: 'Test Technician',
        propertyId: null,
        propertyName: null,
        waterBodyId: null,
        waterBodyName: null,
        tabsQuantity: 1,
      }),
    });
  });

  it('uses the technician associated with the shared token', async () => {
    const data = reportData();
    data.technicianName = 'Incorrect Technician';
    data.technicianToken = '00000000-0000-4000-8000-000000000003';
    findTechnician.mockResolvedValue({ name: 'Assigned Technician' });
    findFirst.mockResolvedValue({
      id: data.propertyId,
      name: 'Example Property',
      waterBodies: [{ id: data.waterBodyId, name: 'Main Pool' }],
    });

    await service.create(data);

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        technicianName: 'Assigned Technician',
      }),
    });
  });

  it('builds a private-token form link for the technician WhatsApp number', async () => {
    const shareToken = '00000000-0000-4000-8000-000000000004';
    findTechnician.mockResolvedValue({
      name: 'Assigned Technician',
      whatsappNumber: '15551234567',
      shareToken,
    });

    const result = await service.technicianWhatsAppUrl(
      '00000000-0000-4000-8000-000000000005',
      'https://app.example.com/?area=chemicals',
    );
    const whatsappUrl = new URL(result);
    const message = whatsappUrl.searchParams.get('text') ?? '';

    expect(whatsappUrl.pathname).toBe('/15551234567');
    expect(message).toContain(`technicianToken=${shareToken}`);
    expect(message).not.toContain('Assigned%20Technician');
  });
});
