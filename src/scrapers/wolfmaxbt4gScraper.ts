import * as cheerio from 'cheerio';
// import { extractQuality, getParamFromMagnet, getMagnetFromTorrentUrl } from '../torrent/torrentUtils';
import { slugify, extractQuality, getParamFromMagnet } from '../lib/strings';
import { Magnet, ScraperRequest } from '../interfaces';
import Scraper from './scraper';
import { getLegibleSizeFromBytesLength } from '../lib/torrent';

const SOURCE = 'Wolfmax4k';
const BASE_URL = 'https://bt4gprx.com';

export class Wolfmax4kBt4gScraper extends Scraper {

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
    super('wolfmaxbt4g');
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
    console.log('WOLFMAX searchUrl', searchUrl);
    const result = await fetch(searchUrl);
    const text = await result.text();
    // NOTE: Avoid .rar files
    const $ = cheerio.load(text, { xmlMode: true });
    const items = $('item').toArray();
    const results: Magnet[] = [];
    for (const value of items) {
      const foundTitle = $(value).find('title').text();
      const foundQuality = extractQuality(foundTitle);
      let season;
      let episode;
      let paddedEpisode;
      if (storageKey.includes(':')) {
        [, season, episode] = storageKey.split(':');
        paddedEpisode = `${episode}`.padStart(2, '0');
      }
      const checkTitle = year ? new RegExp(`${slugify(title)}(.*)`) : new RegExp(`${slugify(title)}(.*)${season}${paddedEpisode}`);
      if (
        slugify(foundTitle).match(checkTitle) &&
        foundTitle.includes(`${year || ''}`) &&
        !['SCREENER', 'CAM'].includes(foundQuality.toUpperCase()) &&
        $(value).text().includes('wolfmax4k')
      ) {
        const magnetUrl = $(value).find('link').text();
        let fileIdx, size;
        console.log('WOLFMAX4K magnetUrl', magnetUrl);
        // Extract files from magnetUrl
        try {
          const magnetData = await this.getTorrentFromMagnet(magnetUrl as string);
          console.log('WOLFMAX4K magnetData', magnetData);
          if (magnetData) { // Si es un episodio, buscar el archivo correcto
            if (magnetData.files?.length) {
              if (storageKey.includes(':')) {
                const regex = new RegExp(`.*${season}.*${paddedEpisode}.*(.mp4|.mkv|.avi)`, 'g');
                for (const [index, file] of (magnetData.files || []).entries()) {
                  const filename = Buffer.from(file.path[0]).toString();
                  if (regex.test(filename)) {
                    fileIdx = index;
                    break;
                  }
                }
              } else {
                const regex = new RegExp('.*(.mp4|.mkv|.avi)', 'g');
                for (const [index, file] of (magnetData.files || []).entries()) {
                  const filename = Buffer.from(file.path[0]).toString();
                  if (regex.test(filename)) {
                    fileIdx = index;
                    break;
                  }
                }
              }
            }
          }
          if (fileIdx !== undefined && magnetData?.files?.length) {
            const fileLength = magnetData.files[fileIdx].length;
            size = getLegibleSizeFromBytesLength(fileLength);
          } else if (magnetData?.size) {
            size = magnetData?.size;
          }
        } catch (error) {
          console.log('WOLFMAX4K error getting magnetData');
        }
        if (magnetUrl) {
          const infoHash = getParamFromMagnet(magnetUrl, 'xt').split(':').pop() as string;
          const magnet = {
            size,
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
      const encodedTitle = encodeURI(title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ /g, '+'));
      const searchUrl = `${BASE_URL}/search?q=${encodedTitle}+${year}+wolfmax4k&page=rss`;
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
      const searchUrl = `${BASE_URL}/search?q=${encodedTitle}+Cap.${season}${paddedEpisode}+wolfmax4k&page=rss`;
      return await this.getLinks(searchUrl, title, storageKey);
    } catch (error) {
      console.log('ST - ERROR', error);
      return [];
    }
  }
}


if (require.main === module) {
  const scraper = new Wolfmax4kBt4gScraper();
  scraper.getMovieLinks('Twisters', 2024, 'tt0133093').then(console.log);
  scraper.getEpisodeLinks('El Senor de los Anillos: Los Anillos de Poder', '2', '7', 'tt12809988:2:7').then(console.log);
}