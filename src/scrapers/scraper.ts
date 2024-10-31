import { EventsConsumer } from '../events/consumer';
import { EventsProducer } from '../events/producer';
import { CheckerResponse, Magnet, MagnetData, ScraperRequest, SeedsNPeers, Torrent } from '../interfaces';
import logger from '../lib/logger';
import { getParamFromMagnet } from '../lib/strings';
import { decodeTorrentFile, magnetURIEncode } from '../lib/torrent';

const MAGNET2TORRENT_URL = 'https://anonymiz.com/magnet2torrent/magnet2torrent.php?magnet=';

interface Magnet2Torrent {
  result: boolean;
  url: string;
}

abstract class Scraper {
  protected consumer: EventsConsumer;

  protected producer: EventsProducer;

  public platform: string;

  public trackers: string;

  constructor(platform: string) {
    this.platform = platform;
    // Initialize Kafka consumer
    this.consumer = new EventsConsumer(`${platform}-scraper`);
    this.producer = new EventsProducer();
    this.trackers = '';
    this.logger.info({ platform: this.platform }, 'Scraper initialized');
  }

  /**
   * Returns a child logger instance with the platform context.
   * This logger can be used for platform-specific logging.
   * @returns A child logger instance with platform context
   */
  protected get logger(): typeof logger {
    return logger.child({ platform: this.platform });
  }

  private async getTrackerList(): Promise<string> {
    this.logger.debug('Fetching tracker list');
    const res = await fetch('https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best.txt');
    const text = await res.text();
    const trackers = text.split('\n').filter((line) => line.length > 0);
    this.logger.info({ trackers }, 'Tracker list fetched');
    return '&tr=' + trackers.join('&tr=');
  }

  public async run(): Promise<void> {
    this.trackers = await this.getTrackerList();
    // Connect to Kafka
    await this.producer.connect();
    // Start consuming messages
    await this.consumer.consume('scrapingRequests', async (message: ScraperRequest) => {
      this.logger.info({ message }, 'Received message');
      try {
        // Process the message
        const magnets = await this.processMessage(message);
        this.logger.debug({ magnets }, 'Magnets processed');
        for (const magnet of magnets) {
          const magnetMessage = { ...magnet, cacheId: message.cacheId };
          this.logger.debug({ magnetMessage }, 'Checking seeds and peers for magnet');
          const seeds = await this.getSeedersAndPeers(magnet.magnetUrl);
          this.logger.debug({ ...magnetMessage, ...seeds }, 'Producing magnet');
          await this.producer.produce('magnets', JSON.stringify({ ...magnetMessage, ...seeds }), message.cacheId);
        }
      } catch (error) {
        this.logger.error({ error }, 'Error processing message');
      }
    });
  }

  protected abstract processMessage(message: ScraperRequest): Promise<Magnet[]>;

  async getMagnetFromTorrentUrl(fullUrl: string, referer?: string) : Promise<MagnetData> {
    this.logger.debug({ fullUrl, referer }, 'Getting magnet from torrent URL');
    const url = new URL(fullUrl);
    const headers = new Headers();
    if (referer) headers.append('referer', referer);
    const torrentfile = await fetch(url, {
      headers,
    });
    const torrentData = await torrentfile.arrayBuffer();
    this.logger.debug({ torrentData }, 'Torrent data fetched');
    const magnetData = await this.getMagnetFromRawTorrent(Buffer.from(torrentData));
    this.logger.debug({ magnetData }, 'Magnet data fetched');
    return magnetData;
  }

  async getMagnetFromRawTorrent(rawTorrentFile: Buffer): Promise<MagnetData> {
    const torrent = await decodeTorrentFile(rawTorrentFile); // Convert ArrayBuffer to Buffer
    const magnet = magnetURIEncode(torrent as Torrent);
    return {
      magnetUrl: magnet,
      infoHash: torrent?.infoHash || getParamFromMagnet(magnet, 'xt').split(':').pop() as string,
      size: torrent?.info.length ? `${Math.round(torrent?.info.length / (1024 ** 3) * 100) / 100} GB` : undefined,
      files: torrent?.info.files || [],
    };
  }

  async getSeedersAndPeers(magnet: string): Promise<SeedsNPeers> {
    this.logger.debug({ magnet }, 'Getting seeders and peers');
    const queryParams = new URLSearchParams({
      magnet: magnet + this.trackers,
    });
    const res = await fetch(
      'https://checker.openwebtorrent.com/check?' + queryParams.toString(),
    );
    const data = await res.json() as CheckerResponse;
    const { extra } = data;
    if (data.error?.code) {
      this.logger.warn({ error: data.error.message }, 'Error checking seeds and peers');
      return {};
    }
    if (res.status === 200 && extra.length) {
      const filteredExtra = extra.filter((item) => item.seeds);
      // pick the tracker with max seeds
      const maxSeed = filteredExtra.reduce(
        (
          acc: { seeds: number, peers: number },
          curr: { seeds: number, peers: number }) =>
          ( acc.seeds > curr.seeds ? acc : curr),
        { seeds: 0, peers: 0 });
      const seedsNPeers = { seed: maxSeed.seeds, peer: maxSeed.peers };
      this.logger.debug({ seedsNPeers }, 'Seeds and peers fetched');
      return seedsNPeers;
    }
    this.logger.warn({ data }, 'Error checking seeds and peers');
    return {};
  }

  async getTorrentFromMagnet(magnet: string): Promise<MagnetData | null> {
    try {
      const dTorrent = await (await fetch(
        `${MAGNET2TORRENT_URL}${magnet}`)).json() as Magnet2Torrent;
      if ('url' in dTorrent) {
        this.logger.debug({ url: dTorrent.url }, 'Found torrent file');
        const torrFileUrl = dTorrent.url.split('<')[0];
        const magnetInfo = await this.getMagnetFromTorrentUrl(torrFileUrl);
        if (magnetInfo) return magnetInfo;
      }
      return null;
    } catch (error) {
      this.logger.error({ error }, 'Error getting torrent from magnet');
      return null;
    }
  }

}

export default Scraper;