import * as cheerio from 'cheerio';
// import { extractQuality, getParamFromMagnet, getMagnetFromTorrentUrl } from '../torrent/torrentUtils';
import { extractQuality, getParamFromMagnet, slugify } from '../lib/strings';
import { Magnet, ScraperRequest } from '../interfaces';
import Scraper from './scraper';

const SOURCE = 'BitSearch';
const BASE_URL = 'https://solidtorrents.to';

export class SolidtorrentsScraper extends Scraper {

  protected processMessage(message: ScraperRequest): Promise<Magnet[]> {
    if (!message.title) throw new Error('Title is required');
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

  constructor() {
    super('solidtorrents');
  }

  processStats(stats: any[], $: cheerio.CheerioAPI): Record<string, string | number> {
    const statsAttrs : Record <string, string | number> = {};
    for (const stat of stats) {
      const alt = $(stat).find('img').attr('alt');
      switch (alt) {
        case 'Seeder':
          statsAttrs.seed = parseInt($(stat).text());
          break;
        case 'Leecher':
          statsAttrs.peer = parseInt($(stat).text());
          break;
        case 'Size':
          statsAttrs.size = $(stat).text();
          break;
        default:
          break;
      }
    }
    return statsAttrs;
  }

  async getLinks(searchUrl: string, title: string, storageKey: string, year?: number) : Promise<Magnet[]> {
    const result = await fetch(searchUrl);
    const text = await result.text();
    const $ = cheerio.load(text);
    const items = $('li.card.search-result').toArray();
    let season, episode, paddedEpisode;
    if (storageKey.includes(':')) { // Si es un episodio, buscar el archivo correcto
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      [, season, episode] = storageKey.split(':');
      paddedEpisode = `${episode}`.padStart(2, '0');
    }
    const results: Magnet[] = [];
    for (const value of items) {
      const foundTitle = $(value).find('h5.title.w-100.truncate').text();
      const foundQuality = extractQuality(foundTitle);
      let titleMatch;
      if (!year) {
        const showRegex = searchUrl.includes('Temporada')
          ? new RegExp(`${title} - (.*)Temporada ${season}(.*)(completa|cap.(.*)(<?fromEpisode>[0-9]+)_(<?toEpisode>[0-9]+))(.*)`, 'i')
          : new RegExp(`${title} - (.*)Cap(.*)${season}${paddedEpisode}(.*)`, 'i');
        titleMatch = foundTitle.match(showRegex);
      } else {
        const movieRegex = new RegExp(`${slugify(title)}(.*)${year}(.*)`, 'i');
        titleMatch = slugify(foundTitle).match(movieRegex);
      }
      if (
        titleMatch &&
        !['SCREENER', 'CAM'].includes(foundQuality.toUpperCase()) // Evitar calidades chungas
      ) {
        if (titleMatch.groups?.fromEpisode && titleMatch.groups?.toEpisode) {
          const currentEpisode = `${season}${paddedEpisode}`;
          if (currentEpisode < titleMatch.groups.fromEpisode || currentEpisode > titleMatch.groups.toEpisode) {
            continue;
          }
        }
        const stats = this.processStats($(value).find('div.stats div').toArray(), $);
        const magnetUrl = $(value).find('a.dl-magnet').attr('href');
        const torrentUrl = $(value).find('a.dl-torrent').attr('href');
        let magnetData;
        try {
          magnetData = await this.getMagnetFromTorrentUrl(torrentUrl as string);
        } catch (error) {
          console.log('Could not get magnet from torrent url, trying magnet2torrent...');
          magnetData = await this.getTorrentFromMagnet(magnetUrl as string);
        }
        let fileIdx = undefined;
        let regex: RegExp = new RegExp('.*(.mp4|.mkv|.avi)', 'g');
        if (season && paddedEpisode) { // Si es un episodio, buscar el archivo correcto
          regex = new RegExp(`.*${season}.*${paddedEpisode}.*(.mp4|.mkv|.avi)`, 'g');
        }
        if (magnetData?.files?.length) {
          for (const [index, file] of (magnetData.files || []).entries()) {
            const filename = Buffer.from(file.path[0]).toString();
            if (regex.test(filename)) {
              fileIdx = index;
              break;
            }
          }
        }
        if (magnetUrl && fileIdx !== undefined) {
          const infoHash = getParamFromMagnet(magnetUrl, 'xt').split(':').pop() as string;
          const magnet = {
            ...stats,
            fileIdx,
            magnetUrl,
            infoHash,
            language: 'es',
            quality: foundQuality,
            source: SOURCE,
          };
          results.push(magnet);
        }
      }
    }
    return results;
  }

  async getMovieLinks(title: string, year: number, storageKey: string): Promise<Magnet[]> {
    try {
      const encodedTitle = encodeURI(title.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
      const searchUrl = `${BASE_URL}/search?q=${encodedTitle}+${year}+castellano&category=1&subcat=2`;
      return await this.getLinks(searchUrl, title, storageKey, year);
    } catch (error) {
      console.log('ST - ERROR', error);
      return [];
    }
  }

  async getEpisodeLinks(title: string, season: string, episode: string, storageKey: string): Promise<Magnet[]> {
    try {
      const encodedTitle = encodeURI(title.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
      const paddedEpisode = `${episode}`.padStart(2, '0');
      const searchEpisodeUrl = `${BASE_URL}/search?q=${encodedTitle}+Cap.${season}${paddedEpisode}+castellano&category=1&subcat=2`;
      const resultsEpisode = await this.getLinks(searchEpisodeUrl, title, storageKey);
      const searchSeasonUrl = `${BASE_URL}/search?q=${encodedTitle}+Temporada+${season}+castellano&category=1&subcat=2`;
      const resultsSeason = await this.getLinks(searchSeasonUrl, title, storageKey);
      // return unique concatenated results
      return [...resultsEpisode, ...resultsSeason].filter((value, index, self) => {
        return self.findIndex((v) => v.infoHash === value.infoHash) === index;
      });
    } catch (error) {
      console.log('ST - ERROR', error);
      return [];
    }
  }
}

if (require.main === module) {
  const scraper = new SolidtorrentsScraper();
  scraper.getMovieLinks('Alicia en el pais de las maravillas', 2010, 'tt12451').then(console.log);
  // scraper.getEpisodeLinks('Breaking Bad', '5', '6', 'tt21324:5:6').then(console.log);
  // scraper.getEpisodeLinks('From', '1', '3', 'tt9813792:1:3').then(console.log);
}