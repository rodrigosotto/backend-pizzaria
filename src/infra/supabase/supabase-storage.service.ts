import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseStorageService {
  private readonly logger = new Logger(SupabaseStorageService.name);
  private _client: SupabaseClient | null = null;
  private readonly ensuredBuckets = new Set<string>();

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

  private async ensureBucket(bucket: string): Promise<void> {
    if (this.ensuredBuckets.has(bucket)) return;

    const { data: existing } = await this.client.storage.getBucket(bucket);
    if (!existing) {
      const { error } = await this.client.storage.createBucket(bucket, { public: true });
      if (error) {
        this.logger.error(`Falha ao criar bucket "${bucket}": ${error.message}`);
        throw new InternalServerErrorException(`Falha ao criar bucket: ${error.message}`);
      }
      this.logger.log(`Bucket "${bucket}" criado automaticamente`);
    }

    this.ensuredBuckets.add(bucket);
  }

  async uploadFile(
    bucket: string,
    path: string,
    file: Buffer,
    contentType: string,
  ): Promise<string> {
    await this.ensureBucket(bucket);

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
