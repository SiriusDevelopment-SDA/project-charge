import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Campaign } from '../../campaigns/entities/campanhas.entity';

@Entity('categories')
export class Category {

  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  // Uma categoria pode ter várias campanhas
  @OneToMany(() => Campaign, (campaign) => campaign.category)
  campaigns!: Campaign[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
