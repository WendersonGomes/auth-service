import { IsEmail, IsOptional, IsString, IsUrl, IsUUID, } from 'class-validator';

export class SyncProfileDto {
  @IsUUID()
  userId!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;
}