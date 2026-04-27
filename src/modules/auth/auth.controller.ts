import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import type { JwtPayload } from './auth.service';
import { SyncUserDto } from './dto/sync-user.dto';
import { UserWithRolesDto } from './dto/auth-response.dto';
import { ApiErrorResponse } from '../../common/swagger/api-response.swagger';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ── Sync ────────────────────────────────────────────────────────────────────

  @Public()
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sincronizar usuário Supabase',
    description:
      'Cria o usuário no banco de dados a partir do JWT emitido pelo Supabase Auth. ' +
      'Deve ser chamado após a confirmação de e-mail ou no primeiro login. ' +
      'Se o usuário já existir, retorna os dados existentes sem sobrescrever.',
  })
  @ApiResponse({ status: 200, description: 'Usuário sincronizado.', type: UserWithRolesDto })
  @ApiResponse({ status: 401, description: 'Token inválido ou expirado.', type: ApiErrorResponse })
  syncUser(@Req() req: any, @Body() dto: SyncUserDto) {
    const token = req.headers.authorization?.split(' ')[1] as string | undefined;
    return this.authService.syncUser(token, dto);
  }

  // ── Me ──────────────────────────────────────────────────────────────────────

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Perfil do usuário autenticado',
    description: 'Retorna os dados do usuário incluindo as pizzarias e roles vinculadas.',
  })
  @ApiResponse({ status: 200, description: 'Perfil retornado.', type: UserWithRolesDto })
  @ApiResponse({ status: 401, description: 'Token ausente, inválido ou expirado.', type: ApiErrorResponse })
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.me(user.sub);
  }
}
