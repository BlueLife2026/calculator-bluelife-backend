import { Module } from '@nestjs/common';
import { PropertiesController } from './properties.controller';
import { PropertiesService } from './properties.service';
import { SharePointService } from '../sharepoint/sharepoint.service';

@Module({
  controllers: [PropertiesController],
  providers: [PropertiesService, SharePointService],
})
export class PropertiesModule {}
