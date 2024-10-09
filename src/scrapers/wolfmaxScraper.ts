import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import Scraper from './scraper';
import { Magnet, ScraperRequest } from '../interfaces';
import { extractQuality, slugify } from '../lib/strings';
import { strict as assert } from 'assert';

interface TorrentMessage {
  id: number;
  message: string;
  file: {
    media: {
      mimeType: string;
    };
    fileReference: Buffer;
  };
}
const TELEGRAM_CHANNEL = process.env.TELEGRAM_CHANNEL || '-1002483296578';
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
    if (!this.client.connected) {
      await this.client.start({
        phoneNumber: async () => '',
        phoneCode: async () => '',
        onError: (err) => console.log(err),
      });
    }
    if (this.cache) {
      return this.cache;
    }
    const messages = await this.client.getMessages(TELEGRAM_CHANNEL) as any as TorrentMessage[];
    return messages
      .filter((message: TorrentMessage) => (message.file?.media?.mimeType === 'application/x-bittorrent'))
      .map((message: TorrentMessage) => ({ message: message.message, file: message.file.media, id: message.id }));
  }

  protected processMessage(message: ScraperRequest): Promise<Magnet[]> {
    if (!message.title) throw new Error('Title is required');
    if (message.seasonNum && message.episodeNum) {
      return this.getEpisodeLinks(
        message.spanishTitle || message.title,
        message.seasonNum,
        message.episodeNum,
      );
    } else {
      return this.getMovieLinks(
        message.spanishTitle || message.title,
        message.year,
      );
    }
  }

  async getMovieLinks(title: string, year: number): Promise<Magnet[]> {
    while (!this.cache) {
      console.log('Waiting for cache...');
      await delay(1000);
    }
    this.cache = await this.getCacheFromTelegram();
    console.log(`Searching for ${title} (${year}) in cache...`);
    const slugTitle = slugify(title);
    if (!slugTitle) {
      console.log('Invalid title', title);
      return [];
    }
    const torrents = this.cache.filter(
      (message: any) => {
        const messageTitle = message.message.split(' ')[0];
        return slugify(messageTitle) === `${slugTitle}${year}`;
      },
    );
    console.log(`Found ${torrents.length} torrents for ${title} (${year})`);
    return this.getTorrentsInfo(torrents);
  }

  async getEpisodeLinks(title: string, seasonNum: string, episodeNum: string): Promise<Magnet[]> {
    while (!this.cache) {
      console.log('Waiting for cache...');
      await delay(1000);
    }
    this.cache = await this.getCacheFromTelegram();
    console.log('Searching for', title, seasonNum, episodeNum, 'in cache...');
    // normalize title
    const slugTitle = slugify(title);
    if (!slugTitle) {
      console.log('Invalid title', title);
      return [];
    }
    const torrents = this.cache.filter(
      (message: any) => {
        const splitMessage = message.message.split(' ');
        const messageTitle = splitMessage[0];
        const regex = new RegExp(
          `#(?<title>.*)_S${seasonNum.padStart(2, '0')}E${episodeNum.padStart(2, '0')}`);
        const match = regex.exec(messageTitle);
        return slugify(match?.groups?.title || '') === slugTitle;
      },
    );
    console.log(`Found ${torrents.length} torrents for ${title} (${seasonNum}x${episodeNum})`);
    return this.getTorrentsInfo(torrents);
  }

  async getTorrentsInfo(torrents: any[]): Promise<Magnet[]> {
    const magnets: Magnet[] = [];
    for (const torrent of torrents) {
      console.log('Updating message', torrent.id);
      const updatedMessage = (await this.client.getMessages(TELEGRAM_CHANNEL, { ids: torrent.id }))[0] as any;
      if (updatedMessage.file?.media) {
        console.log(updatedMessage.message);
        const buffer = await this.client.downloadMedia(updatedMessage.file.media) as Buffer;
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
    }
    return magnets;
  }

}

if (require.main === module) {
  const scraper = new WolfmaxScraper();
  // scraper.getMovieLinks('Romper el círculo', 2024).then(console.log);
  // scraper.getEpisodeLinks('Sueños de libertad', '11', '54').then(console.log);
  scraper.getEpisodeLinks('El señor de los anillos: Los anillos de poder', '2', '8').then(console.log);
}