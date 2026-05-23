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
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto, TokenPairResponseDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { UserWithRolesDto } from './dto/auth-response.dto';
import { ApiErrorResponse } from '../../common/swagger/api-response.swagger';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ── Sync (Supabase) ─────────────────────────────────────────────────────────

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

  // ── Login ───────────────────────────────────────────────────────────────────

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login com e-mail e senha',
    description:
      'Autentica o usuário com e-mail e senha locais. ' +
      'Retorna um `accessToken` (válido por 15 minutos) e um `refreshToken` (válido por 30 dias). ' +
      'Use `POST /auth/refresh` para renovar o access token antes de expirar.',
  })
  @ApiResponse({ status: 200, description: 'Login realizado.', type: TokenPairResponseDto })
  @ApiResponse({ status: 401, description: 'Credenciais inválidas.', type: ApiErrorResponse })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  // ── Refresh Token ───────────────────────────────────────────────────────────

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Renovar access token',
    description:
      'Valida o `refreshToken` armazenado no banco e emite um novo par `accessToken` + `refreshToken`. ' +
      'O token antigo é revogado imediatamente (rotação obrigatória). ' +
      'Se um token já revogado for enviado, todas as sessões do usuário são encerradas.',
  })
  @ApiResponse({ status: 200, description: 'Novo par de tokens retornado.', type: TokenPairResponseDto })
  @ApiResponse({ status: 401, description: 'Refresh token inválido, expirado ou revogado.', type: ApiErrorResponse })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshAccessToken(dto.refreshToken);
  }

  // ── Logout ──────────────────────────────────────────────────────────────────

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Encerrar sessão',
    description:
      'Revoga o `refreshToken` da sessão atual. ' +
      'O `accessToken` continua válido até expirar (15 min), mas não poderá ser renovado.',
  })
  @ApiResponse({ status: 204, description: 'Sessão encerrada.' })
  @ApiResponse({ status: 401, description: 'Access token ausente ou inválido.', type: ApiErrorResponse })
  logout(@CurrentUser() user: JwtPayload, @Body() dto: LogoutDto) {
    return this.authService.logout(user.sub, dto.refreshToken);
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
