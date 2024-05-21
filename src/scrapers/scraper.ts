import { EventsConsumer } from '../events/consumer';
import { EventsProducer } from '../events/producer';
import { Magnet, MagnetData, ScraperRequest, Torrent } from '../interfaces';
import { getParamFromMagnet } from '../lib/strings';
import { decodeTorrentFile, magnetURIEncode } from '../lib/torrent';

abstract class Scraper {
  protected consumer: EventsConsumer;

  protected producer: EventsProducer;

  public platform: string;

  constructor(platform: string) {
    this.platform = platform;
    // Initialize Kafka consumer
    this.consumer = new EventsConsumer(`${platform}-scraper`);
    this.producer = new EventsProducer();
  }

  public async run(): Promise<void> {
    // Connect to Kafka
    await this.producer.connect();
    // Start consuming messages
    await this.consumer.consume('scrapingRequests', async (message: ScraperRequest) => {
      console.log('Processing message', message);
      // Process the message
      const magnets = await this.processMessage(message);
      for (const magnet of magnets) {
        await this.producer.produce('magnets', JSON.stringify(magnet));
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
    const torrent = await decodeTorrentFile(Buffer.from(torrdata)); // Convert ArrayBuffer to Buffer
    const magnet = magnetURIEncode(torrent as Torrent);
    return {
      magnetUrl: magnet,
      infoHash: torrent?.infoHash || getParamFromMagnet(magnet, 'xt').split(':').pop() as string,
      size: torrent?.info.length ? `${Math.round(torrent?.info.length / (1024 ** 3) * 100) / 100} GB` : undefined,
      files: torrent?.info.files || [],
    };
  }
}

export default Scraper;