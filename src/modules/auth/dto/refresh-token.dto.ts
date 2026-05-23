import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000:f47ac10b-58cc-4372-a567-0e02b2c3d479',
    description: 'Refresh token emitido pelo backend no login ou no último refresh',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class TokenPairResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000:f47ac10b-58cc-4372-a567-0e02b2c3d479' })
  refreshToken!: string;
}
