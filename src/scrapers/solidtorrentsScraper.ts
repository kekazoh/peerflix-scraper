import * as cheerio from 'cheerio';
// import { extractQuality, getParamFromMagnet, getMagnetFromTorrentUrl } from '../torrent/torrentUtils';
import { slugify, extractQuality, getParamFromMagnet } from '../lib/strings';
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
    //console.log('FOUND ITEMS', items.length);
    const results: Magnet[] = [];
    for (const value of items) {
      const foundTitle = $(value).find('h5.title.w-100.truncate').text();
      const foundQuality = extractQuality(foundTitle);
      const checkTitle = year ? slugify(title) : `${slugify(title)}temporada`;
      //console.log('SOLIDTORRENTS checkTitle', slugify(foundTitle), checkTitle);
      if (
        slugify(foundTitle).startsWith(checkTitle) &&
        foundTitle.includes(`${year || ''}`) &&
        !['SCREENER', 'CAM'].includes(foundQuality.toUpperCase()) // Evitar calidades chungas
      ) {
        //console.log('SOLIDTORRENTS title checked ok');
        const stats = this.processStats($(value).find('div.stats div').toArray(), $);
        const magnetUrl = $(value).find('a.dl-magnet').attr('href');
        const torrentUrl = $(value).find('a.dl-torrent').attr('href');
        //console.log('SOLIDTORRENTS torrentUrl', torrentUrl);
        //console.log('SOLIDTORRENTS magnetUrl', magnetUrl);
        const magnetData = await this.getMagnetFromTorrentUrl(torrentUrl as string);
        let fileIdx = undefined;
        if (magnetData.files?.length && storageKey.includes(':')) { // Si es un episodio, buscar el archivo correcto
          const [id, season, episode] = storageKey.split(':');
          console.log('id', id);
          const paddedEpisode = `${episode}`.padStart(2, '0');
          const regex = new RegExp(`.*${season}.*${paddedEpisode}.*(.mp4|.mkv|.avi)`, 'g');
          for (const [index, file] of (magnetData.files || []).entries()) {
            const filename = Buffer.from(file.path[0]).toString();
            if (regex.test(filename)) {
              fileIdx = index;
              break;
            }
          }
        }
        //console.log('SOLIDTORRENTS magnetUrl', magnetUrl);
        if (magnetUrl) {
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
      //console.log('ST - SEARCH URL', searchUrl);
      return await this.getLinks(searchUrl, title, storageKey, year);
    } catch (error) {
      console.log('ST - ERROR', error);
      return [];
    }
  }



  async getEpisodeLinks(title: string, season: string, episode: string, storageKey: string): Promise<Magnet[]> {
    try {
      const encodedTitle = encodeURI(title);
      const paddedEpisode = `${episode}`.padStart(2, '0');
      const searchUrl = `${BASE_URL}/search?q=${encodedTitle}+Cap.${season}${paddedEpisode}+castellano&category=1&subcat=2`;
      return await this.getLinks(searchUrl, title, storageKey);
    } catch (error) {
      console.log('ST - ERROR', error);
      return [];
    }
  }
}
