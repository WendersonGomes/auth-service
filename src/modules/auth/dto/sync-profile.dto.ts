import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class SyncProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  avatarUrl?: string;
}
