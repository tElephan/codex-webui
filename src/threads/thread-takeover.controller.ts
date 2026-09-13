import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../common/dto/api-responses.dto';
import { ThreadResumeResponseDto } from '../codex/dto/v2';
import {
  ThreadTakeoverPreviewDto,
  ThreadTakeoverRequestDto,
} from './dto/thread-takeover.dto';
import { ThreadTakeoverService } from './thread-takeover.service';

@ApiTags('threads')
@ApiBearerAuth()
@ApiConflictResponse({ type: ApiErrorResponseDto })
@Controller('threads/:threadId/takeover')
export class ThreadTakeoverController {
  constructor(private readonly takeoverService: ThreadTakeoverService) {}

  @Get()
  @ApiOperation({
    summary:
      'Preview the local Codex writer and conversations affected by force takeover',
  })
  @ApiOkResponse({ type: ThreadTakeoverPreviewDto })
  preview(@Param('threadId') threadId: string) {
    return this.takeoverService.preview(threadId);
  }

  @Post()
  @ApiOperation({
    summary:
      'Stop the confirmed external Codex writer and resume the original conversation',
  })
  @ApiCreatedResponse({ type: ThreadResumeResponseDto })
  takeover(
    @Param('threadId') threadId: string,
    @Body() body: ThreadTakeoverRequestDto,
  ) {
    return this.takeoverService.takeover(threadId, body?.confirmationToken);
  }
}
