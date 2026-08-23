import { Controller, Get, Param } from '@nestjs/common';
import type { DownloadTicketResponse } from '@naf/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { NafUser } from '../../common/decorators/current-user.decorator';
import { UploadsService } from '../uploads/uploads.service';

@Controller('downloads')
export class DownloadsController {
  constructor(private readonly uploads: UploadsService) {}

  /** Mints a short-lived direct-transfer ticket for one file. */
  @Get(':nodeId')
  ticket(@CurrentUser() user: NafUser, @Param('nodeId') nodeId: string): Promise<DownloadTicketResponse> {
    return this.uploads.downloadTicket(user, nodeId);
  }
}
