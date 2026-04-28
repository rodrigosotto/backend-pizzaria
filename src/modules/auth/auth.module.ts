import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PizzeriaContextGuard } from './guards/pizzeria-context.guard';
import { SupabaseJwtService } from './supabase-jwt.service';

@Module({
  controllers: [AuthController],
  providers: [
    SupabaseJwtService,
    AuthService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PizzeriaContextGuard },
  ],
  exports: [AuthService, SupabaseJwtService],
})
export class AuthModule {}
