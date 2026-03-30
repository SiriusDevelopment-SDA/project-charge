import { HttpException, HttpStatus, Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { Service } from "./entities/services";
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from "../companies/entities/companies";
import { SearchServicesDTO } from "./dto/SearchServiceDto";


@Injectable()
export class AppServiceServices {
    constructor(
        @InjectRepository(Service)
        private serviceRepository: Repository<Service>,

        @InjectRepository(Company)
        private readonly companyRepository: Repository<Company>,
    ) { }

    async getServices(companyId: string, dto: SearchServicesDTO) {
        try {
            
            const services = await this.serviceRepository.find({
                where: {
                    company: {
                        id: companyId
                    }
                }
            });
            if (services.length === 0) throw new HttpException('Nenhum serviço encontrado.', HttpStatus.NOT_FOUND);
            return  services;
        } catch (error) {
            // throw new InternalServerErrorException(HttpStatus.INTERNAL_SERVER_ERROR)
            throw new HttpException('Erro interno contate o suporte.', HttpStatus.INTERNAL_SERVER_ERROR)
        }
    }
}