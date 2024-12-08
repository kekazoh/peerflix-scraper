import { Element, load } from 'cheerio';
import { slugify } from '../lib/strings';
import Scraper from './scraper';
import { Magnet, ScraperRequest } from '../interfaces';
import { getFileIdx, getFileNameFromIndex, getLegibleSizeFromBytesLength } from '../lib/torrent';

const SOURCE = 'GranTorrent';
const DEFAULT_URL = 'https://grantorrent.wtf';

export class GrantorrentScraper extends Scraper {
  baseUrl: string = process.env.BASE_URL || DEFAULT_URL;

  constructor() {
    super('grantorrent');
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
      const searchUrl = `${this.baseUrl}/buscar?q=${encodedTitle}`;
      console.log('GRANTORRENT - GETTING MOVIE LINKS', searchUrl);
      const data = await fetch(searchUrl);
      const text = await data.text();
      const $ = load(text);
      const items = $('div.search-list div div a').toArray();
      const results: Magnet[] = [];
      for (const value of items) {
        const foundTitle = slugify(
          $(value).find('div[x-show="showDetail"] p.text-sm').text().replace(/\[[0-9a-zA-Z]*\]/, ''));
        if (foundTitle === slugify(title)) {
          console.log('GRANTORRENT - FOUND', title, $(value).attr('href'));
          console.log('GRANTORRENT - CALLING getMovieInfo with', $(value).attr('href'), year);
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
      const response = await fetch(url);
      const text = await response.text();
      const $ = load(text);
      const torrentLink = $('div.grid div div div a').attr('href');
      console.log('GRANTORRENT - FOUND TORRENT LINK', torrentLink);
      const values = $('div.grid div p.text-neutral-300').toArray();
      const yearElem = values.find((value) => $(value).text().includes('Año:'));
      const formatElem = values.find((value) => $(value).text().includes('Formato:'));
      const foundFormat = formatElem ? $(formatElem).text().split(':')[1].trim() : 'UNKNOWN';
      console.log('GRANTORRENT - FOUND FORMAT', foundFormat);
      const foundYear = yearElem ? parseInt($(yearElem).text().split(':')[1], 10) : null;
      console.log('GRANTORRENT - FOUND YEAR', foundYear);
      if (torrentLink && foundYear === year) {
        const magnetData = await this.getMagnetFromTorrentUrl(
          `${this.baseUrl}${torrentLink}`,
          this.baseUrl,
        );
        const fileIdx = await getFileIdx(magnetData.files);
        const fileName = fileIdx !== undefined && magnetData.files
          ? getFileNameFromIndex(magnetData.files, fileIdx)
          : undefined;
        const size = fileIdx !== undefined && magnetData.files
          ? getLegibleSizeFromBytesLength(magnetData.files[fileIdx].length)
          : undefined;
        return {
          ...magnetData,
          fileName,
          size: size || magnetData.size,
          quality: foundFormat,
          language: 'es',
          source: SOURCE,
        };
      }
      return null;
    } catch (error) {
      console.log(`ERROR GRANTORRENT getMovieInfo: ${error}`);
      return null;
    }
  }

  async getEpisodeLinks(title: string, season: string, episode: string): Promise<Magnet[]> {
    try {
      const encodedTitle = encodeURI(`${title} - ${season}ª Temporada`);
      const searchUrl = `${this.baseUrl}/buscar?q=${encodedTitle}`;
      console.log('GRANTORRENT - GETTING EPISODE LINKS', searchUrl);
      const response = await fetch(searchUrl);
      const text = await response.text();
      const $ = load(text);
      const items = $('div.search-list div div a').toArray();
      const results: Magnet[] = [];
      for (const value of items) {
        const foundTitle = slugify(
          $(value).find('div[x-show="showDetail"] p.text-sm').text().replace(/\[[0-9a-zA-Z]*\]/, ''));
        if (foundTitle === slugify(`${title} - ${season}ª Temporada`)) {
          console.log('GRANTORRENT - FOUND', title, $(value).attr('href'));
          console.log('GRANTORRENT - CALLING getEpisodeInfo with', $(value).attr('href'), season, episode);
          const magnet = await this.getEpisodeInfo($(value).attr('href') as string, season, episode);
          if (magnet) results.push(magnet);
        }
      }
      return results;
    } catch (error) {
      console.log('DT - ERROR', error);
      return [];
    }
  }

  async getEpisodeInfo(url: string, season: string, episode: string): Promise<Magnet | null> {
    try {
      const response = await fetch(url);
      const text = await response.text();
      const $ = load(text);
      const values = $('div.grid div p.text-neutral-300').toArray();
      const formatElem = values.find((value) => $(value).text().includes('Formato:'));
      const foundFormat = formatElem ? $(formatElem).text().split(':')[1].trim() : 'UNKNOWN';
      const paddedEpisode = episode.padStart(2, '0');
      console.log('GRANTORRENT - FOUND FORMAT', foundFormat);
      const episodes = $('table tbody tr').toArray();
      const foundEpisode = episodes.find((episodeElem: Element): boolean => {
        // Extract the text from the second td and compare it with the episode number
        const episodeNum = $(episodeElem).find('td').eq(1).text().trim();
        const regex = new RegExp(`${season}x${paddedEpisode}`);
        if (episodeNum.match(regex)) return true;
        else {
          // Check if the episode number is a range
          const regexRange = new RegExp('.*[0-9]+x(?<first>[0-9]+)(.*)[0-9]+x(?<last>[0-9]+).*');
          const regexMatch = regexRange.exec(episodeNum);
          if (regexMatch) {
            const first = parseInt(regexMatch.groups?.first || '0', 10);
            const last = parseInt(regexMatch.groups?.last || '0', 10);
            if (parseInt(episode, 10) >= first && parseInt(episode, 10) <= last) return true;
          }
          return false;
        }
      });
      if (foundEpisode) {
        const torrentLink = $(foundEpisode).find('td a').attr('href');
        console.log('GRANTORRENT - FOUND TORRENT LINK', torrentLink);
        if (torrentLink) {
          const magnet = await this.getMagnetFromTorrentUrl(
            `${this.baseUrl}${torrentLink}`,
            this.baseUrl,
          );
          const fileIdx = await getFileIdx(magnet.files, parseInt(season), parseInt(episode));
          const fileName = fileIdx !== undefined && magnet.files ? getFileNameFromIndex(magnet.files, fileIdx) || undefined : undefined;
          const size = fileIdx !== undefined && magnet.files ? getLegibleSizeFromBytesLength(magnet.files[fileIdx].length) : undefined;
          return {
            ...magnet,
            fileIdx,
            fileName,
            size: size || magnet.size,
            language: 'es',
            quality: foundFormat,
            source: SOURCE,
          };
        }
      }
      return null;
    } catch (error) {
      console.log(`ERROR GRANTORRENT getMovieInfo: ${error}`);
      return null;
    }
  }
}


if (require.main === module) {
  const scraper = new GrantorrentScraper();
  scraper.getMovieLinks('Alicia en el pais de las maravillas', 2010).then( magnets => {
    console.log('MAGNETS', magnets);
  });
  scraper.getEpisodeLinks('Breaking Bad', '4', '2').then( magnets => {
    console.log('MAGNETS', magnets);
  });
}