import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Param,
  Body,
  Query,
} from '@nestjs/common';

import { CampaignsService } from './campanhas.service';
import { CreateCampaignDto } from './dto/create-campanhas.dto';
import { UpdateCampaignDto } from './dto/update-campanhas.dto';

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

  @Patch(':id/toggle-status')
  toggleStatus(@Param('id') id: string) {
    return this.campaignsService.toggleStatus(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateCampaignDto) {
    return this.campaignsService.update(id, updateDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.campaignsService.findOne(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.campaignsService.remove(id);
  }
}
