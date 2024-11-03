import { ScraperRequest, Magnet } from '../interfaces';
import { extractQuality, slugify } from '../lib/strings';
import Scraper from './scraper';

interface BitmagnetResponse {
  data: {
    torrentContent: {
      search: {
        items: {
          title: string;
          createdAt: string;
          torrent: {
            infoHash: string;
            magnetUri: string;
            files: {
              index: number;
              path: string;
              size: number;
            }[];
          };
        }[];
      };
    };
  };
}

export class BitmagnetScraper extends Scraper {

  baseUrl: string = process.env.BASE_URL || 'http://192.168.1.136:3333/graphql';

  constructor() {
    super('bitmagnet');
  }

  protected async processMessage(message: ScraperRequest): Promise<Magnet[]> {
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

  async getItemInfo(searchTerm: string, regex: RegExp, title: string): Promise<Magnet[]> {
    try {
      const query = `{
        torrentContent {
          search(
            query: {
            queryString: "${searchTerm}",
            offset: 0,
            limit: 100 }
            orderBy: {field: PublishedAt, descending: true}
          ) {
            items {
              title
              createdAt
              torrent {
                infoHash
                magnetUri
                files {
                  index
                  path
                  size
                }
              }
            }
          }
        }
      }`; // query to get the torrents
      const result = await fetch(this.baseUrl, {
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        redirect: 'follow',
        body: JSON.stringify({ query, variables: {} }),
      });
      const jsonResp = await result.json() as BitmagnetResponse;
      const items = jsonResp.data.torrentContent.search.items;
      const results = []; 
      for (const value of items) {
        const foundTitle = slugify(value.title);
        const foundQuality = extractQuality(value.title);
        if (foundTitle.startsWith(slugify(title))) {
          const videoFiles = value.torrent.files
            .filter((file) => regex.test(file.path))
            .sort((a, b) => b.size - a.size);
          if (!videoFiles.length) continue;
          const fileIdx = videoFiles[0].index;
          const magnet = {
            fileIdx,
            infoHash: value.torrent.infoHash,
            magnetUrl: value.torrent.magnetUri,
            quality: foundQuality,
            source: 'Peerflix',
            language: 'es',
          };
          results.push(magnet);
        }
      }
      return results;
    } catch (error) {
      console.error('[ERROR] Peerflix scraper getting movie links', error);
      return [];
    }
  }

  async getMovieLinks(title: string, year: number): Promise<Magnet[]> {
    return this.getItemInfo(
      `${title} ${year} Castellano`,
      new RegExp('.*(.mp4|.mkv|.avi)', 'g'),
      title,
    );
  }

  async getEpisodeLinks(title: string, season: string, episode: string): Promise<Magnet[]> {
    const paddedEpisode = `${episode}`.padStart(2, '0');
    return this.getItemInfo(
      `${title} Cap.${season}${paddedEpisode} Castellano`,
      new RegExp(`[S]?${season}[E|x]?${paddedEpisode}.*(.mp4|.mkv|.avi)`, 'g'),
      title,
    );
  }
}

if (require.main === module) {
  const scraper = new BitmagnetScraper();
  // scraper.getMovieLinks('La asistente', 2021).then(console.log);
  scraper.getEpisodeLinks('The last of us', '1', '1').then(console.log);
}