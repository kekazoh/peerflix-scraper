import * as cheerio from 'cheerio';
// import { extractQuality, getParamFromMagnet, getMagnetFromTorrentUrl } from '../torrent/torrentUtils';
import { slugify, extractQuality, getParamFromMagnet } from '../lib/strings';
import { Magnet, ScraperRequest } from '../interfaces';
import Scraper from './scraper';
import { getFileIdx, getLegibleSizeFromBytesLength } from '../lib/torrent';

const SOURCE = 'Wolfmax4k';
const BASE_URL = 'https://btdig.com';

export class Wolfmax4kScraper extends Scraper {

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
    super(SOURCE);
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
    const $ = cheerio.load(text);
    const items = $('div.one_result').toArray();
    const results: Magnet[] = [];
    for (const value of items) {
      const foundTitle = $(value).find('div.torrent_name').text();
      const foundQuality = extractQuality(foundTitle);
      let id;
      let season;
      let episode;
      let paddedEpisode;
      if (storageKey.includes(':')) {
        [id, season, episode] = storageKey.split(':');
        console.log('id', id);
        paddedEpisode = `${episode}`.padStart(2, '0');
      }
      const checkTitle = year ? new RegExp(`${slugify(title)}(.*)`) : new RegExp(`${slugify(title)}(.*)${season}${paddedEpisode}`);
      if (
        slugify(foundTitle).match(checkTitle) &&
        foundTitle.includes(`${year || ''}`) &&
        !['SCREENER', 'CAM'].includes(foundQuality.toUpperCase()) &&
        !$(value).text().includes('.rar') &&
        $(value).text().includes('wolfmax4k')
      ) {
        const magnetUrl = $(value).find('div.torrent_magnet div a').attr('href');
        let fileIdx, size;
        console.log('WOLFMAX4K magnetUrl', magnetUrl);
        // Extract files from magnetUrl
        try {
          const magnetData = await this.getTorrentFromMagnet(magnetUrl as string);
          console.log('WOLFMAX4K magnetData', magnetData);
          if (magnetData) {
            if (magnetData.files?.length) {
              if (storageKey.includes(':')) {
                const [, s, e] = storageKey.split(':');
                fileIdx = await getFileIdx(magnetData.files, parseInt(s), parseInt(e));
              } else {
                fileIdx = await getFileIdx(magnetData.files);
              }
            }
          }
          if (fileIdx !== undefined && magnetData?.files?.length) {
            const fileLength = magnetData.files[fileIdx].length;
            size = getLegibleSizeFromBytesLength(fileLength);
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
      const encodedTitle = encodeURI(title.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
      const searchUrl = `${BASE_URL}/search?order=0&q=${encodedTitle}+${year}+wolfmax4k`;
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
      const searchUrl = `${BASE_URL}/search?q=${encodedTitle}+Cap.${season}${paddedEpisode}+wolfmax4k`;
      return await this.getLinks(searchUrl, title, storageKey);
    } catch (error) {
      console.log('ST - ERROR', error);
      return [];
    }
  }
}


if (require.main === module) {
  const scraper = new Wolfmax4kScraper();
  scraper.getMovieLinks('Trolls 3 Todos juntos', 2023, 'tt0133093').then(console.log);
  scraper.getEpisodeLinks('Sweet Tooth', '3', '1', 'tt12809988:3:1').then(console.log);
}