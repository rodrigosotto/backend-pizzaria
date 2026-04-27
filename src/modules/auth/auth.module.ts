import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { SupabaseJwtService } from './supabase-jwt.service';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.SUPABASE_JWT_SECRET ?? 'change-me-in-production',
    }),
  ],
  controllers: [AuthController],
  providers: [
    SupabaseJwtService,
    AuthService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, SupabaseJwtService],
})
export class AuthModule {}
