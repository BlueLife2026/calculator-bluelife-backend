import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MicrosoftGraphService } from '../microsoft-graph/microsoft-graph.service';
import { UpdateHealthTicketDto } from './dto/update-health-ticket.dto';
import { CreateHealthTicketCommentDto } from './dto/create-health-ticket-comment.dto';

type GraphMessage = {
  id: string;
  subject?: string;
  bodyPreview?: string;
  conversationId?: string;
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
    return this.prisma.healthTicket.findMany({ include: { comments: { orderBy: { createdAt: 'asc' } } }, orderBy: { receivedAt: 'desc' } });
  }

  async listComments(ticketNumber: string) {
    const ticket = await this.prisma.healthTicket.findUniqueOrThrow({ where: { ticketNumber } });
    return this.prisma.healthTicketComment.findMany({ where: { ticketId: ticket.id }, orderBy: { createdAt: 'asc' } });
  }

  async createComment(ticketNumber: string, data: CreateHealthTicketCommentDto) {
    const ticket = await this.prisma.healthTicket.findUniqueOrThrow({ where: { ticketNumber } });
    return this.prisma.healthTicketComment.create({ data: { ticketId: ticket.id, author: data.author.trim(), body: data.body.trim() } });
  }

  async updateTicket(ticketNumber: string, data: UpdateHealthTicketDto) {
    return this.prisma.healthTicket.update({ where: { ticketNumber }, data: { ...data, visitDate: data.visitDate ? new Date(data.visitDate) : undefined } });
  }

  async syncOutlook() {
    const mailbox = this.config.get('MICROSOFT_MAILBOX_USER')?.trim() || 'service@bluelifepools.com';
    const category = this.config.get('MICROSOFT_HEALTH_CATEGORY')?.trim() || 'Health department';
    const filter = encodeURIComponent(`categories/any(c:c eq '${category}')`);
    const select = encodeURIComponent('id,conversationId,subject,bodyPreview,receivedDateTime,from,categories');
    const response = await this.graph.request<GraphMessageResponse>(
      `/users/${encodeURIComponent(mailbox)}/messages?$filter=${filter}&$select=${select}&$top=50`,
    );
    let created = 0;
    for (const message of response.value ?? []) {
      const exists = await this.prisma.healthTicket.findFirst({ where: { OR: [{ outlookMessageId: message.id }, ...(message.conversationId ? [{ conversationId: message.conversationId }] : [])] } });
      if (exists) continue;
      await this.prisma.healthTicket.create({
        data: {
          ticketNumber: `HD-${Date.now().toString().slice(-7)}${created}`,
          outlookMessageId: message.id,
          conversationId: message.conversationId ?? null,
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
