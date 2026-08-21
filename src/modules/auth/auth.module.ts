import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PizzeriaContextGuard } from './guards/pizzeria-context.guard';
import { PizzeriaRolesGuard } from './guards/pizzeria-roles.guard';
import { SupabaseJwtService } from './supabase-jwt.service';
import { ChatWhatsAppRateLimitGuard } from '../../core/guards/chat-whatsapp-rate-limit.guard';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'MISSING_JWT_SECRET',
      signOptions: { expiresIn: '15m', issuer: 'pizzaria-backend' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    SupabaseJwtService,
    AuthService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PizzeriaContextGuard },
    { provide: APP_GUARD, useClass: PizzeriaRolesGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ChatWhatsAppRateLimitGuard },
  ],
  exports: [AuthService, SupabaseJwtService, JwtModule],
})
export class AuthModule {}
