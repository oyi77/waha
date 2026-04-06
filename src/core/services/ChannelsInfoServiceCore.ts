import { Injectable } from '@nestjs/common';
import {
  ChannelCategory,
  ChannelCountry,
  ChannelView,
} from '@waha/structures/channels.dto';

@Injectable()
export class ChannelsInfoServiceCore {
  async getCountries(): Promise<ChannelCountry[]> {
    return [];
  }

  async getCategories(): Promise<ChannelCategory[]> {
    return [];
  }

  async getViews(): Promise<ChannelView[]> {
    return [];
  }
}
