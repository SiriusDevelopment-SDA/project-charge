import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessageQueue } from './entities/message-queue.entity';
import { DispatchBatch } from './entities/dispatch-batch.entity';
import { Templates } from '../templates/entities/templatesMeta';
import { RelatoryDispatchTemplate } from '../templates/entities/relatory.entity';
import { Campaign } from '../campaigns/entities/campanhas.entity';
import { MessageQueueService } from './message-queue.service';
import { MessageQueueWorker } from './message-queue.worker';
import { CampaignScheduler } from './campaign-scheduler';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MessageQueue,
      DispatchBatch,
      Templates,
      RelatoryDispatchTemplate,
      Campaign,
    ]),
  ],
  providers: [MessageQueueService, MessageQueueWorker, CampaignScheduler],
  exports: [MessageQueueService],
})
export class MessageQueueModule {}
