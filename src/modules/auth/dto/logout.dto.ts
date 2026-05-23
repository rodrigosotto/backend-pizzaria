import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class LogoutDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000:f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Refresh token da sessão atual a ser revogado',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
