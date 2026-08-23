import { Module } from '@nestjs/common';

import { ConnectionsModule } from '../connections/connections.module';
import { PlacementModule } from '../placement/placement.module';
import { DownloadsController } from '../downloads/downloads.controller';
import { UploadsController } from '../uploads/uploads.controller';
import { UploadsService } from '../uploads/uploads.service';

@Module({
  imports: [ConnectionsModule, PlacementModule],
  controllers: [UploadsController, DownloadsController],
  providers: [UploadsService],
})
export class TransfersModule {}
