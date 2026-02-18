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

            // Busca empresa
            const company = await this.companyRepository.findOne({
                where: { id: companyId }
            });

            if (!company) throw new NotFoundException('Empresa não encontrada!')

            // Busca serviços por empresa 
            const services = await this.serviceRepository.find({
                where: {
                    company: {
                        id: companyId
                    }
                }
            });

            if (services.length === 0) throw new HttpException('Nenhum serviço encontrado.', HttpStatus.NOT_FOUND);

            // Filtra Serviços repetidos
            const uniqueService = services.filter(
                (service, index, self) =>
                    index === self.findIndex(s => s.name === service.name)
            );

            return uniqueService;

        } catch (error) {
            throw new InternalServerErrorException(HttpStatus.INTERNAL_SERVER_ERROR)
        }
    }
}