import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Templates } from './entities/templatesMeta';

@Injectable()
export class AppServiceTemplate {
  constructor(
    @InjectRepository(Templates)
    private templateRepository: Repository<Templates>,
  ) {}

  async getTemplates({
    account,
    page = 1,
    limit = 10,
    sortorder,
  }: any) {
    const safeLimit = limit > 0 ? limit : 10;
    const safePage = page > 0 ? page : 1;
    const skip = (safePage - 1) * safeLimit;
  
    const order =
      sortorder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  
    return {
      // total,
      page: safePage,
      limit: safeLimit,
      // data,
    };
  }
}