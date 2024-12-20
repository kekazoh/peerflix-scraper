import { load } from 'cheerio';
import { slugify } from '../lib/strings';
import Scraper from './scraper';
import { Magnet, ScraperRequest } from '../interfaces';
import { getFileIdx, getFileNameFromIndex, getLegibleSizeFromBytesLength } from '../lib/torrent';

const SOURCE = 'DonTorrent';
const DEFAULT_URL = 'https://dontorrent.date';

export class DontorrentScraper extends Scraper {

  baseUrl: string = process.env.BASE_URL || DEFAULT_URL;

  headers: Record<string, string>;

  constructor() {
    super('dontorrent');
    this.headers = {
      authority: this.baseUrl.split('/')[2],
      'sec-ch-ua':
        '" Not A;Brand";v="99", "Chromium";v="90", "Google Chrome";v="90"',
      'sec-ch-ua-mobile': '?0',
      'upgrade-insecure-requests': '1',
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.93 Safari/537.36',
      accept:
        'text/html,application/xhtml+xml,application/xml;' +
        'q=0.9,image/avif,image/webp,image/apng,*/*;' +
        'q=0.8,application/signed-exchange;v=b3;q=0.9',
      'sec-fetch-site': 'same-origin',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-user': '?1',
      'sec-fetch-dest': 'document',
      referer: 'FILLED IN LATER',
      'accept-language': 'es,en-US;q=0.9,en;q=0.8',
      cookie: 'telegram=true; mode=light',
    };
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
    try {
      const encodedTitle = encodeURI(title);
      const searchUrl = `${this.baseUrl}/buscar/${encodedTitle}`;
      const result = await fetch(searchUrl, {
        method: 'GET',
        headers: { ...this.headers, referer: searchUrl },
      });
      const text = await result.text();
      const $ = load(text);
      const items = $('div#buscador div div p span a').toArray();
      const results: Magnet[] = [];
      for (const value of items) {
        const foundTitle = slugify($(value).text());
        if (foundTitle === slugify(title)) {
          const magnet = await this.getMovieInfo($(value).attr('href') as string, year);
          if (magnet) results.push(magnet);
        }
      }
      return results;
    } catch (error) {
      console.log('DT - ERROR', error);
      return [];
    }
  }

  async getMovieInfo(url: string, year: number): Promise<Magnet | null> {
    try {
      const result = await fetch(`${this.baseUrl}${url}`);
      const $ = load(await result.text());
      const values = $('div.d-inline-block.ml-2 p.m-1').toArray();
      for (const value of values) {
        const movieData = $(value).text();
        let foundYear = 0;
        let foundFormat = 'UNKNOWN';
        if (movieData.includes('Año:')) {
          foundYear = parseInt(movieData.split(':')[1], 10);
        }
        if (foundYear === year) {
          const paragraphs = $('div.d-inline-block p').toArray();
          for (const block of paragraphs) {
            const txt = $(block).text();
            if (txt.includes('Formato:')) {
              foundFormat = txt.split(':')[1].trim();
              const link = $(
                'div.descargar div.card div.card-body div.text-center p a',
              ).attr('href');
              if (link) {
                const magnetInfo = await this.getMagnetFromTorrentUrl(
                  `https:${link}`,
                  this.baseUrl,
                );
                const fileIdx = await getFileIdx(magnetInfo.files);
                const fileName = fileIdx !== undefined && magnetInfo.files
                  ? getFileNameFromIndex(magnetInfo.files, fileIdx)
                  : undefined;
                const size = fileIdx !== undefined && magnetInfo.files
                  ? getLegibleSizeFromBytesLength(magnetInfo.files[fileIdx].length)
                  : undefined;
                const magnet = {
                  ...magnetInfo,
                  fileIdx,
                  fileName,
                  size: size || magnetInfo.size,
                  language: 'es',
                  quality: foundFormat,
                  source: SOURCE,
                };
                return magnet;
              }
            }
          }
        }
      }
      return null;
    } catch (error) {
      console.log(`ERROR DONTORRENT getMovieInfo: ${error}`);
      return null;
    }
  }

  async getEpisodeLinks(title: string, season: string, episode: string): Promise<Magnet[]> {
    try {
      const encodedTitle = encodeURI(`${title}`);
      const searchUrl = `${this.baseUrl}/buscar/${encodedTitle}`;
      let result = await fetch(searchUrl, {
        headers: { ...this.headers, referer: searchUrl },
      });
      let $ = load(await result.text());
      const results: Magnet[] = [];
      let nextPage = true;
      while (nextPage) {
        const items = $('div#buscador div div p span a').toArray();
        for (const value of items) {
          const foundTitle = $(value).text();
          const seasonTitle = `${title} - ${season}ª Temporada`;
          if (foundTitle.startsWith(seasonTitle)) {
            const link = $(value).attr('href') as string;
            const magnet = await this.getEpisodeInfo(link, season, episode);
            if (magnet) results.push(magnet);
          } else if (
            season === '1' &&
            foundTitle.startsWith(`${title} - Miniserie`)
          ) {
            const magnet = await this.getEpisodeInfo(
              $(value).attr('href') as string,
              season,
              episode,
            );
            if (magnet) results.push(magnet);
          }
        }
        const nextButton = $('ul.pagination li.page-item').last();
        const nextUrl = nextButton.children('a').attr('href');
        if (nextUrl && nextUrl.startsWith('/buscar/')) {
          result = await fetch(`${this.baseUrl}${nextUrl}`, {
            headers: { ...this.headers, referer: searchUrl },
          });
          $ = load(await result.text());
        } else {
          nextPage = false;
          break;
        }
      }
      return results;
    } catch (error) {
      return [];
    }
  }

  async getEpisodeInfo(url: string, season: string, episode: string): Promise<Magnet | null> {
    try {
      const paddedEpisode = `${episode}`.padStart(2, '0');
      const result = await fetch(`${this.baseUrl}${url}`);
      const $ = load(await result.text());
      let foundFormat = 'UNKNOWN';
      const paragraphs = $('div.card-body div.d-inline-block p').toArray();
      for (const par of paragraphs) {
        const tag = $(par).text();
        if (tag.includes('Formato:')) {
          foundFormat = tag.split(':')[1].trim();
        }
      }
      //Episodios
      const values = $('table.table.table-striped tbody tr').toArray();
      for (const value of values) {
        // Get the text value of the first td and compare it with the episode number
        const ep = $(value).children('td').first().text().trim();
        const episodeRegex = new RegExp('(?<fromEpisode>[0-9]+x[0-9]+)( (al|-) (?<toEpisode>[0-9]+x[0-9]+))?(.*)');
        const epMatch = ep.match(episodeRegex);
        const formattedEpisode = `${season}x${paddedEpisode}`;
        let episodeMatch = false;
        if (epMatch?.groups?.fromEpisode) {
          if (epMatch?.groups.toEpisode) {
            if (formattedEpisode >= epMatch.groups.fromEpisode && formattedEpisode <= epMatch.groups.toEpisode) {
              episodeMatch = true;
            }
          } else if (epMatch.groups.fromEpisode === formattedEpisode) {
            episodeMatch = true;
          }
        }
        if (episodeMatch) {
          const link = $(value).children('td').children('a').attr('href');
          if (link) {
            const magnetInfo = await this.getMagnetFromTorrentUrl(
              `https:${link}`,
              this.baseUrl,
            );
            const fileIdx = await getFileIdx(magnetInfo.files, parseInt(season), parseInt(episode));
            const fileName = fileIdx !== undefined && magnetInfo.files
              ? getFileNameFromIndex(magnetInfo.files, fileIdx) || undefined
              : undefined;
            const size = fileIdx !== undefined && magnetInfo.files
              ? getLegibleSizeFromBytesLength(magnetInfo.files[fileIdx].length)
              : undefined;
            const magnet = {
              ...magnetInfo,
              fileIdx,
              size: size || magnetInfo.size,
              fileName,
              language: 'es',
              quality: foundFormat,
              source: SOURCE,
            };
            return magnet;
          }
        }
      }
      return null;
    } catch (error) {
      return null;
    }
  }
}

if (require.main === module) {
  const scraper = new DontorrentScraper();
  scraper.getMovieLinks('Five Nights at Freddys', 2023).then(console.log);
  scraper.getEpisodeLinks('Breaking Bad', '5', '4').then(console.log);
}