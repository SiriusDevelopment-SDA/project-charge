import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
} from '@nestjs/common';

import { CampaignsService } from './campanhas.service';
import { CreateCampaignDto } from './dto/create-campanhas.dto';

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Post()
  create(@Body() createDto: CreateCampaignDto) {
    console.log('Received CreateCampaignDto:', createDto);
    return this.campaignsService.create(createDto);
  }

  @Get()
  findAll(@Query('account') account?: string) {
    if (account) {
      return this.campaignsService.findByAccount(account);
    }
    return this.campaignsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.campaignsService.findOne(id);
  }
}
