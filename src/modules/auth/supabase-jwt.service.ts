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
  private readonly publicKeys = new Map<string, string>();

  async onModuleInit() {
    await this.loadPublicKey();
  }

  private async loadPublicKey() {
    try {
      const supabaseUrl = process.env.SUPABASE_URL!;
      if (!supabaseUrl) throw new Error('SUPABASE_URL não configurada');

      const res = await fetch(`${supabaseUrl}/auth/v1/.well-known/jwks.json`);
      if (!res.ok) throw new Error(`JWKS respondeu com status ${res.status}`);

      const { keys } = (await res.json()) as {
        keys: Array<import('crypto').JsonWebKey & { kid?: string }>;
      };

      this.publicKeys.clear();
      for (const jwk of keys) {
        if (!jwk.kid) continue;
        const keyObj = createPublicKey({ key: jwk, format: 'jwk' });
        this.publicKeys.set(
          jwk.kid,
          keyObj.export({ type: 'spki', format: 'pem' }) as string,
        );
      }

      if (this.publicKeys.size === 0) {
        throw new Error('JWKS não contém chaves públicas válidas');
      }
      this.logger.log(`${this.publicKeys.size} Supabase public key(s) loaded`);
    } catch (err) {
      this.logger.warn(`Could not load Supabase JWKS: ${err}. Falling back to HS256 secret.`);
    }
  }

  async verifyToken(token: string): Promise<JwtPayload> {
    const [headerB64] = token.split('.');
    const header = JSON.parse(
      Buffer.from(headerB64, 'base64url').toString(),
    ) as { alg?: string; kid?: string };

    if (header.alg === 'ES256' || header.alg === 'RS256') {
      if (!header.kid) throw new Error('Token assimétrico sem kid');

      let publicKeyPem = this.publicKeys.get(header.kid);
      if (!publicKeyPem) {
        // Atualiza o JWKS para suportar rotação de chaves sem reiniciar a API.
        await this.loadPublicKey();
        publicKeyPem = this.publicKeys.get(header.kid);
      }
      if (!publicKeyPem) {
        throw new Error(`Supabase public key unavailable for kid ${header.kid}`);
      }

      const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
      return new Promise<JwtPayload>((resolve, reject) => {
        jwt.verify(
          token,
          publicKeyPem,
          {
            algorithms: [header.alg as 'ES256' | 'RS256'],
            audience: 'authenticated',
            issuer: `${supabaseUrl}/auth/v1`,
          },
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
