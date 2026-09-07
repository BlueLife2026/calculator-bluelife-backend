import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type GraphFolder = {
  id: string;
  name: string;
  webUrl: string;
  folder?: unknown;
};

type GraphChildrenResponse = {
  value: GraphFolder[];
};

@Injectable()
export class SharePointService {
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;
  private siteId: string | null = null;
  private driveId: string | null = null;

  constructor(private readonly config: ConfigService) {}

  private required(name: string) {
    const value = this.config.get<string>(name)?.trim();
    if (!value) {
      throw new Error(`Missing SharePoint configuration: ${name}`);
    }
    return value;
  }

  private async getAccessToken() {
    if (
      this.accessToken &&
      Date.now() < this.accessTokenExpiresAt - 60_000
    ) {
      return this.accessToken;
    }

    const tenantId = this.required('MICROSOFT_TENANT_ID');
    const body = new URLSearchParams({
      client_id: this.required('MICROSOFT_CLIENT_ID'),
      client_secret: this.required('MICROSOFT_CLIENT_SECRET'),
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });
    const response = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
    );

    if (!response.ok) {
      throw new Error(`Microsoft authentication failed (${response.status})`);
    }

    const token = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.accessToken = token.access_token;
    this.accessTokenExpiresAt = Date.now() + token.expires_in * 1000;
    return this.accessToken;
  }

  private async graph<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await this.getAccessToken();
    const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Microsoft Graph request failed (${response.status})`);
    }

    return (await response.json()) as T;
  }

  private encodePath(path: string) {
    return path
      .split('/')
      .filter(Boolean)
      .map(encodeURIComponent)
      .join('/');
  }

  private sanitizeFolderName(value: string, fallback: string) {
    return value
      .replace(/["*:<>?/\\|#%]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/g, '') || fallback;
  }

  private async resolveDrive() {
    if (this.siteId && this.driveId) {
      return { siteId: this.siteId, driveId: this.driveId };
    }

    const hostname = this.required('SHAREPOINT_SITE_HOSTNAME');
    const sitePath = this.required('SHAREPOINT_SITE_PATH');
    const site = await this.graph<{ id: string }>(
      `/sites/${hostname}:${sitePath}`,
    );
    const drives = await this.graph<{
      value: Array<{ id: string; name: string }>;
    }>(`/sites/${site.id}/drives`);
    const libraryName = this.required('SHAREPOINT_LIBRARY_NAME');
    const drive = drives.value.find((item) => item.name === libraryName);

    if (!drive) {
      throw new Error(`SharePoint library not found: ${libraryName}`);
    }

    this.siteId = site.id;
    this.driveId = drive.id;
    return { siteId: site.id, driveId: drive.id };
  }

  async createPropertyFolder(propertyId: string, propertyName: string) {
    const { driveId } = await this.resolveDrive();
    const parentPath = this.config
      .get<string>('SHAREPOINT_PARENT_FOLDER')
      ?.trim()
      .replace(/^\/+|\/+$/g, '');
    const safeName = this.sanitizeFolderName(propertyName, 'Property');
    const sku = propertyId.slice(0, 7).toLowerCase();
    const folderName = `${safeName} - (${sku})`;
    const fullPath = [parentPath, folderName].filter(Boolean).join('/');

    try {
      return await this.graph<GraphFolder>(
        `/drives/${driveId}/root:/${this.encodePath(fullPath)}`,
      );
    } catch {
      // Continue to creation when the deterministic folder does not exist.
    }

    const parent = parentPath
      ? await this.graph<GraphFolder>(
          `/drives/${driveId}/root:/${this.encodePath(parentPath)}`,
        )
      : await this.graph<GraphFolder>(`/drives/${driveId}/root`);

    return this.graph<GraphFolder>(
      `/drives/${driveId}/items/${parent.id}/children`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: folderName,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'fail',
        }),
      },
    );
  }

  async ensureWaterBodyFolders(
    propertyFolderId: string,
    waterBodyNames: string[],
  ) {
    if (waterBodyNames.length === 0) return [];

    const { driveId } = await this.resolveDrive();
    const requestedNames = Array.from(
      new Set(
        waterBodyNames
          .map((name) => this.sanitizeFolderName(name, 'Water Body'))
          .filter(Boolean),
      ),
    );
    const children = await this.graph<GraphChildrenResponse>(
      `/drives/${driveId}/items/${propertyFolderId}/children?$select=id,name,webUrl,folder`,
    );
    const foldersByName = new Map(
      children.value
        .filter((item) => Boolean(item.folder))
        .map((item) => [item.name.toLocaleLowerCase(), item]),
    );

    for (const folderName of requestedNames) {
      const key = folderName.toLocaleLowerCase();
      if (foldersByName.has(key)) continue;

      const folder = await this.graph<GraphFolder>(
        `/drives/${driveId}/items/${propertyFolderId}/children`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: folderName,
            folder: {},
            '@microsoft.graph.conflictBehavior': 'fail',
          }),
        },
      );
      foldersByName.set(key, folder);
    }

    return requestedNames.map(
      (folderName) => foldersByName.get(folderName.toLocaleLowerCase()),
    );
  }
}
