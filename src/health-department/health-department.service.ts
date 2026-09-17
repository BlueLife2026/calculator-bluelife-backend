import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MicrosoftGraphService } from '../microsoft-graph/microsoft-graph.service';
import { UpdateHealthTicketDto } from './dto/update-health-ticket.dto';

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
export class HealthDepartmentService implements OnModuleInit, OnModuleDestroy {
  private syncTimer?: ReturnType<typeof setInterval>;
  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: MicrosoftGraphService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    // Polling keeps the workflow automatic even before a public Graph webhook URL is configured.
    void this.syncOutlook().catch((error: unknown) => {
      console.error('Initial Health Department Outlook sync failed', error);
    });
    this.syncTimer = setInterval(() => {
      void this.syncOutlook().catch((error: unknown) => {
        console.error('Health Department Outlook sync failed', error);
      });
    }, 5 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.syncTimer) clearInterval(this.syncTimer);
  }

  async listTickets() {
    return this.prisma.healthTicket.findMany({ orderBy: { receivedAt: 'desc' } });
  }

  async updateTicket(ticketNumber: string, data: UpdateHealthTicketDto) {
    return this.prisma.healthTicket.update({ where: { ticketNumber }, data: { ...data, visitDate: data.visitDate ? new Date(data.visitDate) : undefined } });
  }

  async syncOutlook() {
    const mailbox = this.config.get('MICROSOFT_MAILBOX_USER')?.trim() || 'service@bluelifepools.com';
    const category = this.config.get('MICROSOFT_HEALTH_CATEGORY')?.trim() || 'Health department';
    const filter = encodeURIComponent(`categories/any(c:c eq '${category}')`);
    const select = encodeURIComponent('id,subject,bodyPreview,receivedDateTime,from,categories');
    const response = await this.graph.request<GraphMessageResponse>(
      `/users/${encodeURIComponent(mailbox)}/messages?$filter=${filter}&$select=${select}&$top=50`,
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
      category: this.config.get('MICROSOFT_HEALTH_CATEGORY')?.trim() || 'Health department',
      configured: Boolean(this.config.get('MICROSOFT_TENANT_ID') && this.config.get('MICROSOFT_CLIENT_ID') && this.config.get('MICROSOFT_CLIENT_SECRET')),
    };
  }
}
