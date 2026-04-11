import { Module } from '@nestjs/common';
import { WahaMcpController } from './waha.mcp.controller';

@Module({
  controllers: [WahaMcpController],
})
export class WahaMcpModule {}
