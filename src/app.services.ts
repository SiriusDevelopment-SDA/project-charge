import { Injectable } from '@nestjs/common';
import { Client } from './entities/clients';
import { GetClientsDto } from './dto/clientsDto';

@Injectable()
export class AppService {
  getClients(client: GetClientsDto): string {
    return 'Hello World! aquii é ixc estou aqui';
  }
}
