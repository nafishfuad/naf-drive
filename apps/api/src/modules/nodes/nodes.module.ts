import { Module } from '@nestjs/common';

import { ConnectionsModule } from '../connections/connections.module';
import { NodesController } from './nodes.controller';
import { NodesService } from './nodes.service';

@Module({
  imports: [ConnectionsModule],
  controllers: [NodesController],
  providers: [NodesService],
})
export class NodesModule {}
