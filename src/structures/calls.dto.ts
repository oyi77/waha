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

  @ApiProperty({
    description: 'Unix timestamp for when the call was initiated',
    example: 1666943582,
  })
  timestamp: number;

  @ApiProperty({
    description: 'Whether this is a video call',
    example: false,
  })
  isVideo: boolean;

  @ApiProperty({
    description: 'Whether this is a group call',
    example: false,
  })
  isGroup: boolean;

  @ApiProperty({
    description:
      'Raw call data from WhatsApp. May change anytime, use with caution!',
  })
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
