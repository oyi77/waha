/**
 * Events
 */
import { ApiProperty } from '@nestjs/swagger';
import { ChatIdProperty } from '@waha/structures/properties.dto';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

function CallIdProperty() {
  return ApiProperty({
    description: 'Call ID',
    example: 'ABCDEFGABCDEFGABCDEFGABCDEFG',
  });
}

export class RejectCallRequest {
  @ChatIdProperty()
  @IsString()
  @IsNotEmpty()
  from: string;

  @CallIdProperty()
  @IsString()
  @IsNotEmpty()
  id: string;
}

export class CallData {
  @CallIdProperty()
  id: string | null;

  @ChatIdProperty()
  from?: string;

  @ApiProperty({
    description: 'The chat ID the call is directed to',
  })
  to?: string;

  timestamp: number;

  isVideo: boolean;

  isGroup: boolean;

  _data: any;
}

export class OfferCallRequest {
  @ChatIdProperty()
  @IsString()
  @IsNotEmpty()
  chatId: string;

  @ApiProperty({
    description: 'Whether this is a video call',
    default: false,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isVideo?: boolean;
}

export class AcceptCallRequest {
  @CallIdProperty()
  @IsString()
  @IsNotEmpty()
  id: string;
}

export class TerminateCallRequest {
  @CallIdProperty()
  @IsString()
  @IsOptional()
  id?: string;
}
