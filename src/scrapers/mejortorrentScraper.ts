import { load } from 'cheerio';
import { slugify } from '../lib/strings';
import Scraper from './scraper';
import { ScraperRequest, Magnet } from '../interfaces';

const DEFAULT_URL = 'https://www20.mejortorrent.zip/';

export class MejortorrentScraper extends Scraper {
  
  baseUrl: string = process.env.BASE_URL || DEFAULT_URL;

  constructor() {
    super('mejortorrent');
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
    // console.log('MT - getMovieLinks', title, year, storageKey);
    const results = [];
    try {
      const searchable = title.replace(/[&;:,)(]/g, '');
      const encodedTitle = encodeURI(searchable);
      const searchUrl = `${this.baseUrl}busqueda?q=${encodedTitle}`;
      console.log('MT - searchURL', searchUrl);
      const result = await fetch(searchUrl);
      const $ = load(await result.text());
      const movies = $('.mb-2').toArray();
      for (const value of movies) {
        const movieLink = $(value).find('a').first();
        const foundTitle = slugify(movieLink.text().split('.')[0]);
        const category = $(value).find('span').last().text();
        console.log(`MT - found valid item ${movieLink} ${foundTitle} ${category}`);
        if (category === 'peliculas') {
          const link = movieLink.attr('href');
          if (foundTitle.startsWith(slugify(title)) && link) {
            results.push(
              await this.getMovieInfo(link, year),
            );
          }
        }
      }
      return results.filter(Boolean) as Magnet[];
    } catch (error) {
      console.log('ERROR', error);
      return [];
    }
  }

  async getMovieInfo(url: string, year: number) : Promise<Magnet | null> {
    const result = await fetch(url);
    try {
      const $ = load(await result.text());
      const foundYear = $('.mb-4:nth-child(2) a').text();
      if (`${year}` === foundYear) {
        let downloadLink = $('.just').children('a').attr('href');
        const foundFormat =
          $('.py-4+ .border-gray-400 .mb-4 a').text() || 'UNKNOWN';
        // console.log(`MT - valid download link ${downloadLink} ${foundFormat}`);
        if (downloadLink) {
          console.log('MT - found download link', downloadLink);
          if (downloadLink.startsWith('/')) {
            const re = /\/$/;
            const baseUrl = this.baseUrl.replace(re, '');
            downloadLink = `${baseUrl}${downloadLink}`;
          }
          const magnetData = await this.getMagnetFromTorrentUrl(
            downloadLink,
            this.baseUrl,
          );
          if (magnetData.magnetUrl.length > 'magnet:?'.length) {
            delete magnetData.files;
            const magnet = {
              ...magnetData,
              language: 'es',
              quality: foundFormat,
              source: 'MejorTorrent',
            };
            return magnet;
          }
        }
      }
      return null;
    } catch (error) {
      console.log(`ERROR MEJORTORRENTT getmovieinfo: ${error}`);
      return null;
    }
  }

  async getEpisodeLinks(title: string, season: string, episode: string): Promise<Magnet[]> {
    try {
      const encodedTitle = encodeURI(title + ' - ' + season);
      const searchUrl = `${this.baseUrl}busqueda?q=${encodedTitle}`;
      // console.log('MT - searchUrl', searchUrl);
      const result = await fetch(searchUrl);
      const $ = load(await result.text());
      const results = [];
      //td a
      const shows = $('.mb-2').toArray();
      for (const value of shows) {
        const showLink = $(value).find('a').first();
        const foundTitle = slugify(showLink.text());
        const foundKind = $(value).find('span').last().text();
        if (foundKind.toLowerCase() === 'series') {
          const link = showLink.attr('href');
          if (foundTitle.startsWith(slugify(`${title}${season}temporada`)) && link) {
            results.push(
              await this.getEpisodeInfo(
                link,
                season,
                episode,
              ),
            );
          }
        }
      }
      return results.filter(Boolean) as Magnet[];
    } catch (error) {
      console.log(`ERROR MEJORTORRENTT getEpisodeLinks: ${error}`);
      return [];
    }
  }

  async getEpisodeInfo(url: string, season: string, episode: string): Promise<Magnet | null> {
    const paddedEpisode = `${episode}`.padStart(2, '0');
    const result = await fetch(`${url}`);
    try {
      const $ = load(await result.text());
      let foundFormat = 'UNKNOWN';

      const format = $('.mb-4 a span').first().text();
      if (format) {
        foundFormat = format;
      }
      const values = $('tr.border.border-gray-800').toArray();
      for (const value of values) {
        if ($(value).text().includes(`${season}x${paddedEpisode}`)) {
          const link = $(value).find('a').first();
          let torrent = $(link).attr('href');
          if (torrent) {
            console.log('MT - found download link', torrent);
            if (torrent.startsWith('/')) {
              const re = /\/$/;
              const baseUrl = this.baseUrl.replace(re, '');
              torrent = `${baseUrl}${torrent}`;
            }
            const magnetData = await this.getMagnetFromTorrentUrl(torrent, this.baseUrl);
            if (magnetData.magnetUrl.length > 'magnet:?'.length) {
              let fileIdx = undefined;
              const regex = new RegExp(`.*${season}.*${paddedEpisode}.*(.mp4|.mkv|.avi)`, 'g');
              for (const [index, file] of (magnetData.files || []).entries()) {
                const filename = Buffer.from(file.path[0]).toString();
                if (regex.test(filename)) {
                  fileIdx = index;
                }
              }
              const magnet = {
                ...magnetData,
                fileIdx,
                language: 'es',
                quality: foundFormat,
                source: 'MejorTorrent',
              };
              delete magnet.files;
              return magnet;
            }
          }
        }
      }
      return null;
    } catch (error) {
      console.log(`ERROR MEJORTORRENTT getepisodeinfo: ${error}`);
      return null;
    }
  }
}

if (require.main === module) {
  const scraper = new MejortorrentScraper();
  scraper.getMovieLinks('Five Nights at Freddys', 2023).then(console.log);
}