import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import type { JwtPayload } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
  AuthResponseDto,
  ChangePasswordResponseDto,
  UserWithRolesDto,
} from './dto/auth-response.dto';
import { ApiErrorResponse } from '../../common/swagger/api-response.swagger';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ── Register ────────────────────────────────────────────────────────────────

  @Public()
  @Post('register')
  @ApiOperation({
    summary: 'Criar conta',
    description:
      'Cria uma nova conta com role **owner**. Retorna o usuário criado e um JWT de acesso.',
  })
  @ApiResponse({ status: 201, description: 'Conta criada com sucesso.', type: AuthResponseDto })
  @ApiResponse({ status: 400, description: 'E-mail já cadastrado ou dados inválidos.', type: ApiErrorResponse })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // ── Login ───────────────────────────────────────────────────────────────────

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login',
    description: 'Autentica o usuário com e-mail e senha. Retorna o JWT de acesso.',
  })
  @ApiResponse({ status: 200, description: 'Login realizado com sucesso.', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Credenciais inválidas ou conta desativada.', type: ApiErrorResponse })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // ── Me ──────────────────────────────────────────────────────────────────────

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Perfil do usuário autenticado',
    description:
      'Retorna os dados do usuário extraídos do JWT, incluindo as pizzarias e roles vinculadas.',
  })
  @ApiResponse({ status: 200, description: 'Perfil retornado com sucesso.', type: UserWithRolesDto })
  @ApiResponse({ status: 401, description: 'Token ausente, inválido ou expirado.', type: ApiErrorResponse })
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.me(user.sub);
  }

  // ── Change Password ─────────────────────────────────────────────────────────

  @Patch('change-password')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Alterar senha',
    description: 'Troca a senha do usuário autenticado. Exige a senha atual para confirmar.',
  })
  @ApiResponse({ status: 200, description: 'Senha alterada com sucesso.', type: ChangePasswordResponseDto })
  @ApiResponse({ status: 400, description: 'Conta sem senha definida.', type: ApiErrorResponse })
  @ApiResponse({ status: 401, description: 'Token inválido ou senha atual incorreta.', type: ApiErrorResponse })
  changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.sub, dto);
  }
}
