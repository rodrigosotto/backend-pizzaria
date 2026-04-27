import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createPublicKey } from 'crypto';
import { JwtService } from '@nestjs/jwt';

interface JwtPayload {
  sub: string;
  email: string;
  role?: string;
  [key: string]: unknown;
}

@Injectable()
export class SupabaseJwtService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseJwtService.name);
  private publicKeyPem: string | null = null;

  constructor(private readonly jwtService: JwtService) {}

  async onModuleInit() {
    await this.loadPublicKey();
  }

  private async loadPublicKey() {
    try {
      const supabaseUrl = process.env.SUPABASE_URL!;
      const res = await fetch(`${supabaseUrl}/auth/v1/.well-known/jwks.json`);
      const { keys } = (await res.json()) as { keys: Record<string, unknown>[] };
      const jwk = keys[0];
      const keyObj = createPublicKey({ key: jwk as import('crypto').JsonWebKey, format: 'jwk' });
      this.publicKeyPem = keyObj.export({ type: 'spki', format: 'pem' }) as string;
      this.logger.log('Supabase ES256 public key loaded');
    } catch (err) {
      this.logger.warn(`Could not load Supabase JWKS: ${err}. Falling back to HS256 secret.`);
    }
  }

  async verifyToken(token: string): Promise<JwtPayload> {
    // Decode header to determine algorithm
    const [headerB64] = token.split('.');
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString()) as { alg?: string };

    if (header.alg === 'ES256' || header.alg === 'RS256') {
      if (!this.publicKeyPem) {
        // Retry loading the key once if it failed on startup
        await this.loadPublicKey();
      }
      return this.jwtService.verifyAsync<JwtPayload>(token, {
        publicKey: this.publicKeyPem!,
        algorithms: [header.alg as 'ES256' | 'RS256'],
      });
    }

    // HS256 fallback (older Supabase projects)
    return this.jwtService.verifyAsync<JwtPayload>(token, {
      secret: process.env.SUPABASE_JWT_SECRET,
    });
  }
}
