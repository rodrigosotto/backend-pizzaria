import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseStorageService {
  private readonly logger = new Logger(SupabaseStorageService.name);
  private _client: SupabaseClient | null = null;

  private get client(): SupabaseClient {
    if (!this._client) {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!url || !key) {
        throw new InternalServerErrorException(
          'SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios para upload de arquivos',
        );
      }

      this._client = createClient(url, key);
    }
    return this._client;
  }

  async uploadFile(
    bucket: string,
    path: string,
    file: Buffer,
    contentType: string,
  ): Promise<string> {
    const { error } = await this.client.storage
      .from(bucket)
      .upload(path, file, { contentType, upsert: true });

    if (error) {
      this.logger.error(`Storage upload failed: ${error.message}`);
      throw new InternalServerErrorException(`Falha no upload: ${error.message}`);
    }

    const { data } = this.client.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }
}
