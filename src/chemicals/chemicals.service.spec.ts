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
  const prisma = {
    chemicalReport: { create, findMany },
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
});
