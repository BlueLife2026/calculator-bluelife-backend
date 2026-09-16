import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MicrosoftGraphService } from '../microsoft-graph/microsoft-graph.service';

type GraphMessage = {
  id: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime: string;
  from?: { emailAddress?: { address?: string } };
  categories?: string[];
};

type GraphMessageResponse = { value: GraphMessage[]; '@odata.nextLink'?: string };

@Injectable()
export class HealthDepartmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: MicrosoftGraphService,
    private readonly config: ConfigService,
  ) {}

  async listTickets() {
    return this.prisma.healthTicket.findMany({ orderBy: { receivedAt: 'desc' } });
  }

  async syncOutlook() {
    const mailbox = this.config.get('MICROSOFT_MAILBOX_USER')?.trim() || 'service@bluelifepools.com';
    const category = this.config.get('MICROSOFT_HEALTH_CATEGORY')?.trim() || 'Health Department';
    const filter = encodeURIComponent(`categories/any(c:c eq '${category}')`);
    const select = encodeURIComponent('id,subject,bodyPreview,receivedDateTime,from,categories');
    const response = await this.graph.request<GraphMessageResponse>(
      `/users/${encodeURIComponent(mailbox)}/mailFolders/inbox/messages?$filter=${filter}&$select=${select}&$top=50`,
    );
    let created = 0;
    for (const message of response.value ?? []) {
      const exists = await this.prisma.healthTicket.findUnique({ where: { outlookMessageId: message.id } });
      if (exists) continue;
      await this.prisma.healthTicket.create({
        data: {
          ticketNumber: `HD-${Date.now().toString().slice(-7)}${created}`,
          outlookMessageId: message.id,
          subject: message.subject?.trim() || 'Health Department request',
          senderEmail: message.from?.emailAddress?.address ?? null,
          receivedAt: new Date(message.receivedDateTime),
          bodyPreview: message.bodyPreview?.slice(0, 1000) ?? null,
        },
      });
      created += 1;
    }
    return { created, mailbox, category, total: (await this.listTickets()).length };
  }

  async integrationStatus() {
    return {
      mailbox: this.config.get('MICROSOFT_MAILBOX_USER')?.trim() || 'service@bluelifepools.com',
      category: this.config.get('MICROSOFT_HEALTH_CATEGORY')?.trim() || 'Health Department',
      configured: Boolean(this.config.get('MICROSOFT_TENANT_ID') && this.config.get('MICROSOFT_CLIENT_ID') && this.config.get('MICROSOFT_CLIENT_SECRET')),
    };
  }
}
