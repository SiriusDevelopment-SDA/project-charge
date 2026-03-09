import { Body, Controller, Get, Header, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ChatwootService } from './chatwoot.service';
import {
  ChatwootAccountQueryDto,
  ChatwootAssignDto,
  ChatwootConversationsQueryDto,
  ChatwootLabelsDto,
  ChatwootSendMessageDto,
  ChatwootStatusDto,
} from './dto/chatwoot.dto';

@ApiTags('Chatwoot')
@Controller('chatwoot')
export class ChatwootController {
  constructor(private readonly chatwootService: ChatwootService) {}

  @Get('bootstrap')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  @ApiOperation({ summary: 'Returns Chatwoot bootstrap data by company account' })
  @ApiQuery({ name: 'account', required: true, type: String })
  bootstrap(@Query() query: ChatwootAccountQueryDto) {
    return this.chatwootService.getBootstrapByAccount(query.account);
  }

  @Get('conversations')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  @ApiOperation({ summary: 'List account conversations with filters' })
  conversations(@Query() query: ChatwootConversationsQueryDto) {
    return this.chatwootService.listConversations(query);
  }

  @Get('conversations/:id/messages')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  @ApiOperation({ summary: 'List messages from a conversation' })
  messages(
    @Param('id', ParseIntPipe) conversationId: number,
    @Query() query: ChatwootAccountQueryDto,
  ) {
    return this.chatwootService.listMessages(
      query.account,
      conversationId,
      query.inboxIdentifier,
      query.contactIdentifier,
    );
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Send a message to conversation' })
  sendMessage(
    @Param('id', ParseIntPipe) conversationId: number,
    @Query() query: ChatwootAccountQueryDto,
    @Body() body: ChatwootSendMessageDto,
  ) {
    return this.chatwootService.sendMessage(
      query.account,
      conversationId,
      body.content,
      query.inboxIdentifier,
      query.contactIdentifier,
    );
  }

  @Patch('conversations/:id/status')
  @ApiOperation({ summary: 'Change conversation status' })
  @ApiBody({ type: ChatwootStatusDto })
  status(
    @Param('id', ParseIntPipe) conversationId: number,
    @Query() query: ChatwootAccountQueryDto,
    @Body() body: ChatwootStatusDto,
  ) {
    return this.chatwootService.updateStatus(query.account, conversationId, body.status);
  }

  @Patch('conversations/:id/assign')
  @ApiOperation({ summary: 'Transfer conversation to team/agent' })
  @ApiBody({ type: ChatwootAssignDto })
  assign(
    @Param('id', ParseIntPipe) conversationId: number,
    @Query() query: ChatwootAccountQueryDto,
    @Body() body: ChatwootAssignDto,
  ) {
    return this.chatwootService.assignConversation(query.account, conversationId, body);
  }

  @Patch('conversations/:id/labels')
  @ApiOperation({ summary: 'Update conversation labels' })
  @ApiBody({ type: ChatwootLabelsDto })
  labels(
    @Param('id', ParseIntPipe) conversationId: number,
    @Query() query: ChatwootAccountQueryDto,
    @Body() body: ChatwootLabelsDto,
  ) {
    return this.chatwootService.updateLabels(query.account, conversationId, body.labels);
  }

  @Get('teams')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  @ApiOperation({ summary: 'List Chatwoot teams' })
  teams(@Query() query: ChatwootAccountQueryDto) {
    return this.chatwootService.listTeams(query.account);
  }

  @Get('agents')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  @ApiOperation({ summary: 'List Chatwoot agents' })
  agents(@Query() query: ChatwootAccountQueryDto) {
    return this.chatwootService.listAgents(query.account);
  }
}
