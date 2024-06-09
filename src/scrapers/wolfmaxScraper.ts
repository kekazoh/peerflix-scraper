import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import Scraper from './scraper';
import { Magnet, ScraperRequest } from '../interfaces';
import { extractQuality } from '../lib/strings';
import { strict as assert } from 'assert';

interface TorrentMessage {
  message: string;
  file: {
    media: {
      mimeType: string;
    };
    fileReference: Buffer;
  };
}
const TELEGRAM_CHANNEL = '-1002106865514';
const TELEGRAM_APP_ID = process.env.TELEGRAM_APP_ID;
const TELEGRAM_API_KEY = process.env.TELEGRAM_API_KEY;
const TELEGRAM_SESSION = new StringSession(process.env.TELEGRAM_STRING_SESSION);

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class WolfmaxScraper extends Scraper {

  private client: TelegramClient;

  protected cache: any;

  constructor() {
    super('wolfmax');
    assert(TELEGRAM_APP_ID && TELEGRAM_API_KEY, 'TELEGRAM_APP_ID && TELEGRAM_API_KEY are required');
    this.client = new TelegramClient(
      TELEGRAM_SESSION,
      parseInt(TELEGRAM_APP_ID),
      TELEGRAM_API_KEY,
      {
        connectionRetries: 5,
      },
    );
    this.getCacheFromTelegram().then((cache) => {
      this.cache = cache;
    });
  }

  async getCacheFromTelegram(): Promise<any> {
    if (this.cache) {
      return this.cache;
    }
    await this.client.start({
      phoneNumber: async () => '',
      phoneCode: async () => '',
      onError: (err) => console.log(err),
    });
    const messages = await this.client.getMessages(TELEGRAM_CHANNEL) as any as TorrentMessage[];
    return messages
      .filter((message: TorrentMessage) => (message.file?.media?.mimeType === 'application/x-bittorrent'))
      .map((message: TorrentMessage) => ({ message: message.message, file: message.file.media }));
  }

  protected processMessage(message: ScraperRequest): Promise<Magnet[]> {
    if (message.seasonNum && message.episodeNum) {
      return this.getEpisodeLinks(
        message.spanishTitle || message.title,
        message.seasonNum,
        message.episodeNum,
        message.cacheId,
      );
    } else {
      return this.getMovieLinks(
        message.spanishTitle || message.title,
        message.year,
        message.cacheId,
      );
    }
  }

  async getMovieLinks(title: string, year: number, cacheId: string): Promise<Magnet[]> {
    while (!this.cache) {
      console.log('Waiting for cache...');
      await delay(1000);
    }
    console.log(`Searching for ${cacheId}: ${title} (${year}) in cache...`);
    const torrents = this.cache.filter((message: any) => message.message.includes(`${title.replace(/ /g, '_')}_${year}`));
    return this.getTorrentsInfo(torrents);
  }

  async getEpisodeLinks(title: string, seasonNum: string, episodeNum: string, cacheId: string): Promise<Magnet[]> {
    while (!this.cache) {
      console.log('Waiting for cache...');
      await delay(1000);
    }
    console.log('Searching for', cacheId, title, seasonNum, episodeNum, 'in cache...');
    const torrents = this.cache.filter((message: any) =>
      message.message.includes(`${title.replace(/ /g, '_')}`) 
      && message.message.includes(`Cap_${seasonNum}${episodeNum.padStart(2, '0')}`));
    return this.getTorrentsInfo(torrents);
  }
  
  async getTorrentsInfo(torrents: any[]): Promise<Magnet[]> {
    const magnets: Magnet[] = [];
    for (const torrent of torrents) {
      console.log(torrent.message);
      const buffer = await this.client.downloadMedia(torrent.file) as Buffer;
      // Extract magnet link from torrent.file (Buffer)
      const magnetData = await this.getMagnetFromRawTorrent(buffer);
      magnets.push({
        magnetUrl: magnetData.magnetUrl,
        infoHash: magnetData.infoHash,
        size: magnetData.size,
        source: 'Wolfmax4k',
        quality: extractQuality(torrent.message),
        language: 'es',
      });
    }
    return magnets;
  }

}

if (require.main === module) {
  const scraper = new WolfmaxScraper();
  scraper.getEpisodeLinks('Doctor Who', '1', '5', 'tt123123:1:5').then((magnets) => {
    console.log(magnets);
  });
}