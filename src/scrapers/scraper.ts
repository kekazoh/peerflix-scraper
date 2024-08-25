import { EventsConsumer } from '../events/consumer';
import { EventsProducer } from '../events/producer';
import { Magnet, MagnetData, ScraperRequest, SeedsNPeers, Torrent } from '../interfaces';
import { getParamFromMagnet } from '../lib/strings';
import { decodeTorrentFile, magnetURIEncode } from '../lib/torrent';

const MAGNET2TORRENT_URL = 'https://anonymiz.com/magnet2torrent/magnet2torrent.php?magnet=';

interface Magnet2Torrent {
  result: boolean;
  url: string;
}

interface CheckerResponse {
  seeds: number;
  peers: number;
  extra: { seeds: number, peers: number }[];
  error?: { code: number, message: string };
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
  }

  private async getTrackerList(): Promise<string> {
    const res = await fetch('https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best.txt');
    const text = await res.text();
    const trackers = text.split('\n').filter((line) => line.length > 0);
    return '&tr=' + trackers.join('&tr=');
  }

  public async run(): Promise<void> {
    this.trackers = await this.getTrackerList();
    console.log('Fetched trackers', this.trackers);
    // Connect to Kafka
    await this.producer.connect();
    // Start consuming messages
    await this.consumer.consume('scrapingRequests', async (message: ScraperRequest) => {
      try {
        // Process the message
        const magnets = await this.processMessage(message);
        for (const magnet of magnets) {
          const magnetMessage = { ...magnet, cacheId: message.cacheId };
          console.log('Checking seeds and peers for magnet', magnetMessage);
          const seeds = await this.getSeedersAndPeers(magnet.magnetUrl);
          console.log('Producing magnet', { ...magnetMessage, ...seeds });
          await this.producer.produce('magnets', JSON.stringify({ ...magnetMessage, ...seeds }), message.cacheId);
        }
      } catch (err) {
        console.error('Error processing message', err);
      }
    });
  }

  protected abstract processMessage(message: ScraperRequest): Promise<Magnet[]>;

  async getMagnetFromTorrentUrl(fullUrl: string, referer?: string) : Promise<MagnetData> {
    const headers = new Headers();
    if (referer) headers.append('referer', referer);
    const torrentfile = await fetch(fullUrl, {
      headers,
    });
    const torrdata = await torrentfile.arrayBuffer();
    return this.getMagnetFromRawTorrent(Buffer.from(torrdata));
  }

  async getMagnetFromRawTorrent(rawTorrentFile: Buffer): Promise<MagnetData> {
    const torrent = await decodeTorrentFile(rawTorrentFile); // Convert ArrayBuffer to Buffer
    if (!torrent) throw new Error('Error decoding torrent file');
    const magnet = magnetURIEncode(torrent as Torrent);
    return {
      magnetUrl: magnet,
      infoHash: torrent?.infoHash || getParamFromMagnet(magnet, 'xt').split(':').pop() as string,
      size: torrent?.info.length ? `${Math.round(torrent?.info.length / (1024 ** 3) * 100) / 100} GB` : undefined,
      files: torrent?.info.files || [],
    };
  }

  async getSeedersAndPeers(magnet: string): Promise<SeedsNPeers> {
    const queryParams = new URLSearchParams({
      magnet: magnet + this.trackers,
    });
    const res = await fetch(
      'https://checker.openwebtorrent.com/check?' + queryParams.toString(),
    );
    const data = await res.json() as CheckerResponse;
    const { extra } = data;
    if (data.error?.code) {
      console.warn('Error checking seeds and peers', data.error.message);
      return {};
    }
    if (res.status === 200 && extra.length) {
      // pick the tracker with max seeds
      const maxSeed = extra.reduce(
        (acc: { seeds: number, peers: number }, curr: { seeds: number, peers: number }) => (acc.seeds > curr.seeds ? acc : curr));
      return { seed: maxSeed.seeds, peer: maxSeed.peers };
    }
    console.warn('Error checking seeds and peers', data);
    return {};
  }

  async getTorrentFromMagnet(magnet: string): Promise<MagnetData | null> {
    try {
      const dTorrent = await (await fetch(
        `${MAGNET2TORRENT_URL}${magnet}`)).json() as Magnet2Torrent;
      if ('url' in dTorrent) {
        console.log('Found torrent file', dTorrent.url);
        const torrFileUrl = dTorrent.url.split('<')[0];
        const magnetInfo = await this.getMagnetFromTorrentUrl(torrFileUrl);
        if (magnetInfo) return magnetInfo;
      }
      return null;
    } catch (error) {
      console.log('Error getting torrent from magnet', error);
      return null;
    }
  }
      
}

export default Scraper;