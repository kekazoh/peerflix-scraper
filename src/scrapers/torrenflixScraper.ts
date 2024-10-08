import { load } from 'cheerio';
import { slugify } from '../lib/strings';
import Scraper from './scraper';
import { Magnet, ScraperRequest } from '../interfaces';

const SOURCE = 'Torrenflix';
const DEFAULT_URL = 'https://torrenflix.com';

export class TorrenflixScraper extends Scraper {

  baseUrl: string = process.env.BASE_URL || DEFAULT_URL;

  constructor() {
    super('torrenflix');
  }

  protected async processMessage(message: ScraperRequest): Promise<Magnet[]> {
    if (!message.title) throw new Error('Title is required');
    if (message.seasonNum && message.episodeNum) {
      const result = await this.getEpisodeLinks(
        message.title,
        message.year,
        message.seasonNum,
        message.episodeNum,
      );
      if (result.length === 0) {
        return this.getEpisodeLinks(
          message.spanishTitle,
          message.year,
          message.seasonNum,
          message.episodeNum,
        );
      }
      return result;
    } else {
      const result = await this.getMovieLinks(
        message.title,
        message.year,
      );
      if (result.length === 0) {
        return this.getMovieLinks(
          message.spanishTitle,
          message.year,
        );
      }
      return result;
    }
  }

  async getMovieLinks(title: string, year: number): Promise<Magnet[]> {
    try {
      const encodedTitle = encodeURI(title.replace(/ /g, '+'));
      const searchUrl = `${this.baseUrl}/?s=${encodedTitle}`;
      const result = await fetch(searchUrl);
      const text = await result.text();
      const $ = load(text);
      const items = $('div#movies-a ul li').toArray();
      for (const value of items) {
        const foundTitle = slugify($(value).find('h2.entry-title').text());
        const foundYear = parseInt($(value).find('span.year').text(), 10);
        if (foundTitle === slugify(title) && foundYear === year) {
          const url = $(value).find('a.lnk-blk').attr('href') as string;
          const magnets = await this.getElementInfo(url);
          return magnets;
        }
      }
      return [];
    } catch (error) {
      console.log('PT - ERROR', error);
      return [];
    }
  }

  async getEpisodeLinks(title: string, year: number, season: string, episode: string): Promise<Magnet[]> {
    try {
      const encodedTitle = encodeURI(title.replace(/ /g, '+'));
      const searchUrl = `${this.baseUrl}/?s=${encodedTitle}`;
      const result = await fetch(searchUrl);
      const $ = load(await result.text());
      const items = $('div#movies-a ul li').toArray();
      for (const value of items) {
        const postId = $(value).attr('id')?.split('-')[1];
        const foundTitle = slugify($(value).find('h2.entry-title').text());
        const foundYear = parseInt($(value).find('span.year').text(), 10);
        if (foundTitle === slugify(title) && foundYear === year) {
          const referer = $(value).find('a.lnk-blk').attr('href') as string;
          const seasonInfo = await fetch(`${this.baseUrl}/wp-admin/admin-ajax.php`, {
            method: 'POST',
            headers: {
              'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'origin': this.baseUrl,
              'referer': referer,
              'x-requested-with': 'XMLHttpRequest',
            },
            body: `action=action_select_season&season=${season}&post=${postId}`,
          });
          const seasonText = await seasonInfo.text();
          const episodes = $(seasonText).find('li article').toArray();
          for (const episodeItem of episodes) {
            const episodeNum = $(episodeItem).find('span.num-epi').text();
            if (episodeNum === `${season}x${episode}`) {
              const episodeUrl = $(episodeItem).find('a.lnk-blk').attr('href') as string;
              const magnets = await this.getElementInfo(episodeUrl, `.*${season}.*${episode}.*(.mp4|.mkv|.avi)`);
              return magnets;
            }
          }
        }
      }
      return [];
    } catch (error) {
      return [];
    }
  }

  async getElementInfo(url: string, fileRegex: string = '.*(.mp4|.mkv|.avi)'): Promise<Magnet[]> {
    try {
      const result = await fetch(url);
      const $ = load(await result.text());
      const values = $('div.download-links table tbody tr').toArray();
      const foundMagnets = [];
      for (const value of values) {
        const [,lang, quality, link] = $(value).find('td').toArray();
        const foundLanguage = $(lang).text();
        const foundQuality = $(quality).text();
        const torrentLink = $(link).find('a').attr('href');
        if (torrentLink && foundLanguage === 'Español') {
          const magnetInfo = await this.getMagnetFromTorrentUrl(
            torrentLink,
            this.baseUrl,
          );
          let fileIdx = undefined;
          if (magnetInfo.files?.length) {
            const regex = new RegExp(fileRegex, 'g');
            for (const [index, file] of (magnetInfo.files || []).entries()) {
              const filename = Buffer.from(file.path[0]).toString();
              if (regex.test(filename)) {
                fileIdx = index;
              }
            }
          }
          if (fileIdx === undefined) {
            console.info('PT - VIDEO FILE NOT FOUND');
            continue;
          }
          const magnet = {
            ...magnetInfo,
            language: 'es',
            quality: foundQuality,
            source: SOURCE,
            fileIdx,
          };
          foundMagnets.push(magnet);
        }
      }
      return foundMagnets;
    } catch (error) {
      console.log(`ERROR PELITORRENT getMovieInfo: ${error}`);
      return [];
    }
  }
}

if (require.main === module) {
  const scraper = new TorrenflixScraper();
  scraper.getMovieLinks('Vincent debe morir', 2023).then(console.log);
  // scraper.getEpisodeLinks('El caso sancho', 2024, '1', '3').then(console.log);
}