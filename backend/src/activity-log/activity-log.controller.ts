import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ActivityLogService } from './activity-log.service';
import { SearchActivityLogDto } from './dto/search-activity-log.dto';
import { NoActivityLog } from './activity.decorator';

@ApiTags('Activity Log')
@Controller('activity-log')
export class ActivityLogController {
  constructor(private readonly service: ActivityLogService) {}

  @Post('search')
  @HttpCode(200)
  @NoActivityLog()
  @ApiOperation({
    summary: 'Lista o histórico geral de atividades da empresa (admin)',
  })
  @ApiBody({ type: SearchActivityLogDto })
  search(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: SearchActivityLogDto,
  ) {
    return this.service.search(authorization, dto);
  }
}
