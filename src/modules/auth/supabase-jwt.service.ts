import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { createPublicKey } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as jwt from 'jsonwebtoken';

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
    const [headerB64] = token.split('.');
    const header = JSON.parse(
      Buffer.from(headerB64, 'base64url').toString(),
    ) as { alg?: string };

    if (header.alg === 'ES256' || header.alg === 'RS256') {
      if (!this.publicKeyPem) {
        await this.loadPublicKey();
      }
      if (!this.publicKeyPem) {
        throw new Error('Supabase public key unavailable');
      }
      return new Promise<JwtPayload>((resolve, reject) => {
        jwt.verify(
          token,
          this.publicKeyPem!,
          { algorithms: [header.alg as 'ES256' | 'RS256'] },
          (err, decoded) => {
            if (err) reject(err);
            else resolve(decoded as JwtPayload);
          },
        );
      });
    }

    // HS256 fallback (projetos Supabase mais antigos)
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) throw new Error('SUPABASE_JWT_SECRET não configurado para HS256');
    return new Promise<JwtPayload>((resolve, reject) => {
      jwt.verify(token, secret, { algorithms: ['HS256'] }, (err, decoded) => {
        if (err) reject(err);
        else resolve(decoded as JwtPayload);
      });
    });
  }

  // ── Refresh Session ────────────────────────────────────────────────────────

  private _supabaseClient: SupabaseClient | null = null;

  private get supabaseClient(): SupabaseClient {
    if (!this._supabaseClient) {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) throw new Error('SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios');
      this._supabaseClient = createClient(url, key, { auth: { persistSession: false } });
    }
    return this._supabaseClient;
  }

  async refreshSession(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: number }> {
    const { data, error } = await this.supabaseClient.auth.refreshSession({ refresh_token: refreshToken });

    if (error || !data.session) {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    return {
      accessToken:  data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt:    data.session.expires_at ?? 0,
    };
  }
}
