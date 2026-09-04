import {
  BadRequestException,
  Injectable,
  NotFoundException,
  BadGatewayException,
  Logger,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { SharePointService } from '../sharepoint/sharepoint.service';
import { CreateSalesActivityDto } from './dto/create-sales-activity.dto';
import { UpdateSalesActivityDto } from './dto/update-sales-activity.dto';

@Injectable()
export class PropertiesService {
  private readonly logger = new Logger(PropertiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sharePoint: SharePointService,
  ) {}

  findAll() {
    return this.prisma.property.findMany({
      where: {
        deletedAt: null,
      },
      orderBy: {
        name: 'asc',
      },

      include: {
        managementCompany: true,

        contacts: {
          include: {
            contact: true,
          },
        },

        waterBodies: true,

        salesActivities: {
          orderBy: {
            occurredAt: 'desc',
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const property =
      await this.prisma.property.findUnique({
        where: {
          id,
        },

        include: {
          managementCompany: true,

          contacts: {
            include: {
              contact: true,
            },
          },

          waterBodies: true,

          salesActivities: {
            orderBy: {
              occurredAt: 'desc',
            },
          },
        },
      });

    if (!property) {
      throw new NotFoundException(
        `No se encontró la propiedad con id ${id}`,
      );
    }

    return property;
  }

  async create(data: CreatePropertyDto) {
    const {
      contacts,
      waterBodies,
      managementCompanyName,
      ...propertyData
    } = data;
    const normalizedManagementCompanyName = managementCompanyName?.trim();
    const normalizedEmails = contacts.map((contact) =>
      contact.email.trim().toLowerCase(),
    );

    if (!contacts.some((contact) => contact.role === 'PROPERTY_MANAGER')) {
      throw new BadRequestException(
        'At least one Property Manager contact is required.',
      );
    }

    if (new Set(normalizedEmails).size !== normalizedEmails.length) {
      throw new BadRequestException(
        'Contact email addresses cannot be duplicated.',
      );
    }

    if (contacts.filter((contact) => contact.isPrimary).length > 1) {
      throw new BadRequestException(
        'Only one contact can be primary.',
      );
    }

    const requestedPrimaryIndex = contacts.findIndex(
      (contact) => contact.isPrimary,
    );
    const primaryIndex =
      requestedPrimaryIndex >= 0
        ? requestedPrimaryIndex
        : contacts.findIndex(
            (contact) => contact.role === 'PROPERTY_MANAGER',
          );

    const property = await this.prisma.property.create({
      data: {
        ...propertyData,
        ...(normalizedManagementCompanyName
          ? {
              managementCompany: {
                connectOrCreate: {
                  where: { name: normalizedManagementCompanyName },
                  create: { name: normalizedManagementCompanyName },
                },
              },
            }
          : {}),
        contacts: {
          create: contacts.map((contact, index) => ({
            role: contact.role,
            isPrimary: index === primaryIndex,
            contact: {
              create: {
                firstName: contact.firstName?.trim() || null,
                lastName: contact.lastName?.trim() || null,
                email: contact.email.trim().toLowerCase(),
                phone: contact.phone?.trim() || null,
              },
            },
          })),
        },
        ...(waterBodies
          ? {
              waterBodies: {
                create: waterBodies.map((waterBody) => ({
                  name: waterBody.name.trim(),
                  type: waterBody.type,
                  size: waterBody.size ?? null,
                  active: waterBody.active ?? true,
                })),
              },
            }
          : {}),
      },
      include: {
        managementCompany: true,
        contacts: {
          include: {
            contact: true,
          },
        },
        waterBodies: true,
        salesActivities: true,
      },
    });

    try {
      return await this.provisionSharePointFolder(property.id);
    } catch (error) {
      this.logger.error(
        `SharePoint folder creation failed for property ${property.id}`,
        error instanceof Error ? error.stack : undefined,
      );
      return property;
    }
  }

  async provisionSharePointFolder(id: string) {
    const property = await this.prisma.property.findFirst({
      where: { id, deletedAt: null },
    });

    if (!property) {
      throw new NotFoundException(`No se encontró la propiedad con id ${id}`);
    }

    if (property.sharepointFolderId && property.sharepointFolderUrl) {
      return this.findOne(id);
    }

    try {
      const folder = await this.sharePoint.createPropertyFolder(
        property.id,
        property.name,
      );
      await this.prisma.property.update({
        where: { id },
        data: {
          sharepointFolderId: folder.id,
          sharepointFolderUrl: folder.webUrl,
        },
      });
      return this.findOne(id);
    } catch (error) {
      this.logger.error(
        `SharePoint provisioning failed for property ${id}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BadGatewayException(
        'The SharePoint folder could not be created.',
      );
    }
  }

  async createSalesActivity(
    propertyId: string,
    data: CreateSalesActivityDto,
  ) {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, deletedAt: null },
    });

    if (!property) {
      throw new NotFoundException(
        `No se encontró la propiedad con id ${propertyId}`,
      );
    }

    return this.prisma.salesActivity.create({
      data: {
        propertyId,
        type: data.type,
        notes: data.notes,
        occurredAt: new Date(),
      },
    });
  }

  async updateSalesActivityStatus(
    propertyId: string,
    activityId: string,
    status: 'CREATED' | 'SENT' | 'APPROVED' | 'REJECTED',
  ) {
    const activity = await this.prisma.salesActivity.findFirst({
      where: { id: activityId, propertyId },
    });

    if (!activity) {
      throw new NotFoundException('Proposal not found for this property.');
    }

    const now = new Date();
    return this.prisma.salesActivity.update({
      where: { id: activityId },
      data: {
        status,
        ...(status === 'CREATED' ? { sentAt: null, approvedAt: null, rejectedAt: null } : {}),
        ...(status === 'SENT' && !activity.sentAt ? { sentAt: now } : {}),
        ...(status === 'APPROVED'
          ? {
              approvedAt: activity.approvedAt ?? now,
              rejectedAt: null,
              sentAt: activity.sentAt ?? now,
            }
          : {}),
        ...(status === 'REJECTED'
          ? {
              rejectedAt: activity.rejectedAt ?? now,
              approvedAt: null,
              sentAt: activity.sentAt ?? now,
            }
          : {}),
      },
    });
  }

  async updateSalesActivity(
    propertyId: string,
    activityId: string,
    data: UpdateSalesActivityDto,
  ) {
    const activity = await this.prisma.salesActivity.findFirst({
      where: { id: activityId, propertyId },
    });
    if (!activity) {
      throw new NotFoundException('Sales activity not found for this property.');
    }
    return this.prisma.salesActivity.update({
      where: { id: activityId },
      data: { notes: data.notes },
    });
  }

  async deleteSalesActivity(propertyId: string, activityId: string) {
    const activity = await this.prisma.salesActivity.findFirst({
      where: { id: activityId, propertyId },
    });
    if (!activity) {
      throw new NotFoundException('Sales activity not found for this property.');
    }
    return this.prisma.salesActivity.delete({ where: { id: activityId } });
  }

  findDeleted() {
    return this.prisma.property.findMany({
      where: {
        deletedAt: { not: null },
      },
      orderBy: {
        deletedAt: 'desc',
      },
      include: {
        managementCompany: true,
        contacts: {
          include: { contact: true },
        },
        waterBodies: true,
        salesActivities: true,
      },
    });
  }

  async update(
    id: string,
    data: UpdatePropertyDto,
  ) {
    const {
      contacts,
      waterBodies,
      managementCompanyName,
      ...propertyData
    } = data;
    const normalizedManagementCompanyName = managementCompanyName?.trim();
    const existing =
      await this.prisma.property.findUnique({
        where: {
          id,
          deletedAt: null,
        },
        include: {
          contacts: true,
        },
      });

    if (!existing) {
      throw new NotFoundException(
        `No se encontró la propiedad con id ${id}`,
      );
    }

    if (!contacts) {
      return this.prisma.property.update({
        where: { id },
        data: {
          ...propertyData,
          ...(managementCompanyName !== undefined
            ? normalizedManagementCompanyName
              ? {
                  managementCompany: {
                    connectOrCreate: {
                      where: { name: normalizedManagementCompanyName },
                      create: { name: normalizedManagementCompanyName },
                    },
                  },
                }
              : { managementCompany: { disconnect: true } }
            : {}),
        },
      });
    }

    const normalizedEmails = contacts.map((contact) =>
      contact.email.trim().toLowerCase(),
    );

    if (!contacts.some((contact) => contact.role === 'PROPERTY_MANAGER')) {
      throw new BadRequestException(
        'At least one Property Manager contact is required.',
      );
    }

    if (new Set(normalizedEmails).size !== normalizedEmails.length) {
      throw new BadRequestException(
        'Contact email addresses cannot be duplicated.',
      );
    }

    if (contacts.filter((contact) => contact.isPrimary).length !== 1) {
      throw new BadRequestException(
        'Exactly one contact must be primary.',
      );
    }

    const existingContactIds = new Set(
      existing.contacts.map((relation) => relation.contactId),
    );

    if (
      contacts.some(
        (contact) =>
          contact.contactId &&
          !existingContactIds.has(contact.contactId),
      )
    ) {
      throw new BadRequestException(
        'One or more contacts do not belong to this property.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.property.update({
        where: { id },
        data: {
          ...propertyData,
          ...(managementCompanyName !== undefined
            ? normalizedManagementCompanyName
              ? {
                  managementCompany: {
                    connectOrCreate: {
                      where: { name: normalizedManagementCompanyName },
                      create: { name: normalizedManagementCompanyName },
                    },
                  },
                }
              : { managementCompany: { disconnect: true } }
            : {}),
        },
      });

      await tx.propertyContact.deleteMany({
        where: { propertyId: id },
      });

      for (const contact of contacts) {
        let contactId = contact.contactId;

        if (contactId) {
          await tx.contact.update({
            where: { id: contactId },
            data: {
              firstName: contact.firstName?.trim() || null,
              lastName: contact.lastName?.trim() || null,
              email: contact.email.trim().toLowerCase(),
              phone: contact.phone?.trim() || null,
            },
          });
        } else {
          const createdContact = await tx.contact.create({
            data: {
              firstName: contact.firstName?.trim() || null,
              lastName: contact.lastName?.trim() || null,
              email: contact.email.trim().toLowerCase(),
              phone: contact.phone?.trim() || null,
            },
          });
          contactId = createdContact.id;
        }

        await tx.propertyContact.create({
          data: {
            propertyId: id,
            contactId,
            role: contact.role,
            isPrimary: contact.isPrimary ?? false,
          },
        });
      }

      if (waterBodies !== undefined) {
        await tx.waterBody.deleteMany({
          where: { propertyId: id },
        });

        if (waterBodies.length > 0) {
          await tx.waterBody.createMany({
            data: waterBodies.map((waterBody) => ({
              propertyId: id,
              name: waterBody.name.trim(),
              type: waterBody.type,
              size: waterBody.size ?? null,
              active: waterBody.active ?? true,
            })),
          });
        }
      }
    });

    return this.findOne(id);
  }

  async remove(id: string) {
    const existing = await this.prisma.property.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(
        `No se encontró la propiedad activa con id ${id}`,
      );
    }

    return this.prisma.property.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async restore(id: string) {
    const existing = await this.prisma.property.findFirst({
      where: { id, deletedAt: { not: null } },
    });

    if (!existing) {
      throw new NotFoundException(
        `No se encontró la propiedad eliminada con id ${id}`,
      );
    }

    return this.prisma.property.update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  async removePermanently(id: string) {
    const existing = await this.prisma.property.findFirst({
      where: { id, deletedAt: { not: null } },
    });

    if (!existing) {
      throw new NotFoundException(
        `No se encontró la propiedad eliminada con id ${id}`,
      );
    }

    return this.prisma.property.delete({
      where: { id },
    });
  }
}
