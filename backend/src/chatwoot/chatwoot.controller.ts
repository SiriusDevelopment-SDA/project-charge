import { Body, Controller, Delete, Get, Header, Headers, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
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
  bootstrap(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: ChatwootAccountQueryDto,
  ) {
    return this.chatwootService.getBootstrapByAccount(query.account, authorization);
  }

  @Get('conversations')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  @ApiOperation({ summary: 'List account conversations with filters' })
  conversations(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: ChatwootConversationsQueryDto,
  ) {
    return this.chatwootService.listConversations(query, authorization);
  }

  @Get('conversations/:id/messages')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  @ApiOperation({ summary: 'List messages from a conversation' })
  messages(
    @Param('id', ParseIntPipe) conversationId: number,
    @Headers('authorization') authorization: string | undefined,
    @Query() query: ChatwootAccountQueryDto,
  ) {
    return this.chatwootService.listMessages(
      query.account,
      conversationId,
      query.inboxIdentifier,
      query.contactIdentifier,
      authorization,
      query.refresh === 'true',
    );
  }

  @Get('conversations/:id/labels')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  @ApiOperation({ summary: 'List labels from a conversation' })
  conversationLabels(
    @Param('id', ParseIntPipe) conversationId: number,
    @Headers('authorization') authorization: string | undefined,
    @Query() query: ChatwootAccountQueryDto,
  ) {
    return this.chatwootService.listConversationLabels(
      query.account,
      conversationId,
      authorization,
    );
  }

  @Get('contacts/:id/labels')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  @ApiOperation({ summary: 'List labels from a contact' })
  listContactLabels(
    @Param('id', ParseIntPipe) contactId: number,
    @Headers('authorization') authorization: string | undefined,
    @Query() query: ChatwootAccountQueryDto,
  ) {
    return this.chatwootService.listContactLabels(
      query.account,
      contactId,
      authorization,
    );
  }

  @Get('contacts/:id')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  @ApiOperation({ summary: 'Get contact details' })
  contactDetails(
    @Param('id', ParseIntPipe) contactId: number,
    @Headers('authorization') authorization: string | undefined,
    @Query() query: ChatwootAccountQueryDto,
  ) {
    return this.chatwootService.getContactDetails(
      query.account,
      contactId,
      authorization,
    );
  }

  @Get('labels')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  @ApiOperation({ summary: 'List labels from the Chatwoot account' })
  accountLabels(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: ChatwootAccountQueryDto,
  ) {
    return this.chatwootService.listAccountLabels(
      query.account,
      authorization,
    );
  }

  @Post('ws-sync')
  @ApiOperation({ summary: 'Sync a realtime WebSocket event to the local DB' })
  wsSyncEvent(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: ChatwootAccountQueryDto,
    @Body() body: { event: string; data: Record<string, any> },
  ) {
    return this.chatwootService.syncRealtimeEvent(
      query.account,
      body.event,
      body.data ?? {},
      authorization,
    );
  }

  @Delete('conversations/:id')
  @ApiOperation({ summary: 'Delete an orphan conversation from local DB' })
  deleteLocalConversation(
    @Param('id', ParseIntPipe) conversationId: number,
    @Headers('authorization') authorization: string | undefined,
    @Query() query: ChatwootAccountQueryDto,
  ) {
    return this.chatwootService.deleteLocalConversation(query.account, conversationId, authorization);
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Send a message to conversation' })
  sendMessage(
    @Param('id', ParseIntPipe) conversationId: number,
    @Headers('authorization') authorization: string | undefined,
    @Query() query: ChatwootAccountQueryDto,
    @Body() body: ChatwootSendMessageDto,
  ) {
    return this.chatwootService.sendMessage(
      query.account,
      conversationId,
      body.content,
      query.inboxIdentifier,
      query.contactIdentifier,
      authorization,
    );
  }

  @Patch('conversations/:id/status')
  @ApiOperation({ summary: 'Change conversation status' })
  @ApiBody({ type: ChatwootStatusDto })
  status(
    @Param('id', ParseIntPipe) conversationId: number,
    @Headers('authorization') authorization: string | undefined,
    @Query() query: ChatwootAccountQueryDto,
    @Body() body: ChatwootStatusDto,
  ) {
    return this.chatwootService.updateStatus(query.account, conversationId, body.status, authorization);
  }

  @Patch('conversations/:id/assign')
  @ApiOperation({ summary: 'Transfer conversation to team/agent' })
  @ApiBody({ type: ChatwootAssignDto })
  assign(
    @Param('id', ParseIntPipe) conversationId: number,
    @Headers('authorization') authorization: string | undefined,
    @Query() query: ChatwootAccountQueryDto,
    @Body() body: ChatwootAssignDto,
  ) {
    return this.chatwootService.assignConversation(query.account, conversationId, body, authorization);
  }

  @Patch('conversations/:id/labels')
  @ApiOperation({ summary: 'Update conversation labels' })
  @ApiBody({ type: ChatwootLabelsDto })
  labels(
    @Param('id', ParseIntPipe) conversationId: number,
    @Headers('authorization') authorization: string | undefined,
    @Query() query: ChatwootAccountQueryDto,
    @Body() body: ChatwootLabelsDto,
  ) {
    return this.chatwootService.updateLabels(
      query.account,
      conversationId,
      body.labels,
      authorization,
    );
  }

  @Patch('contacts/:id/labels')
  @ApiOperation({ summary: 'Update contact labels' })
  @ApiBody({ type: ChatwootLabelsDto })
  saveContactLabels(
    @Param('id', ParseIntPipe) contactId: number,
    @Headers('authorization') authorization: string | undefined,
    @Query() query: ChatwootAccountQueryDto,
    @Body() body: ChatwootLabelsDto,
  ) {
    return this.chatwootService.updateContactLabels(
      query.account,
      contactId,
      body.labels,
      authorization,
    );
  }

  @Get('teams')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  @ApiOperation({ summary: 'List Chatwoot teams' })
  teams(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: ChatwootAccountQueryDto,
  ) {
    return this.chatwootService.listTeams(query.account, authorization);
  }

  @Get('agents')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  @ApiOperation({ summary: 'List Chatwoot agents' })
  agents(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: ChatwootAccountQueryDto,
  ) {
    return this.chatwootService.listAgents(query.account, authorization);
  }
}
