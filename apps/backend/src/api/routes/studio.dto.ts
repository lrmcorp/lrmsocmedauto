import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { STUDIO_PERMISSIONS } from '@gitroom/nestjs-libraries/database/prisma/studio-access.service';

export class StudioMemberPolicyDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsString({ each: true })
  accounts: string[];
  @IsArray()
  @ArrayUnique()
  @IsIn([...STUDIO_PERMISSIONS], { each: true })
  permissions: string[];
  @IsBoolean()
  disabled: boolean;
}
export class StudioMemberDto extends StudioMemberPolicyDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/)
  username: string;
  @IsString()
  @MinLength(12)
  @MaxLength(72)
  password: string;
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;
}
export class StudioPasswordDto {
  @IsString()
  @MinLength(12)
  @MaxLength(72)
  password: string;
}
export class StudioKeyDto {
  @IsString()
  @Matches(/^sk-[A-Za-z0-9_-]{16,500}$/)
  key: string;
}
export class StudioAiDto {
  @IsIn(['caption', 'image'])
  type: 'caption' | 'image';
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  prompt: string;
}
export class StudioPostDto {
  @IsString()
  @MaxLength(100)
  integrationId: string;
  @IsIn(['draft', 'schedule', 'now'])
  action: 'draft' | 'schedule' | 'now';
  @IsString()
  @MaxLength(20000)
  content: string;
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  mediaIds: string[];
  @IsOptional()
  @IsString()
  @MaxLength(100)
  date?: string;
  @IsOptional()
  @IsString()
  @MaxLength(100)
  postId?: string;
  @IsOptional()
  @IsIn(['post', 'story'])
  postType?: 'post' | 'story';
}
