import { load } from 'cheerio';
import { slugify } from '../lib/strings';
import Scraper from './scraper';
import { Magnet, ScraperRequest } from '../interfaces';

const SOURCE = 'PeliTorrent';
const DEFAULT_URL = 'https://www.pelitorrent.com/';

export class PelitorrentScraper extends Scraper {

  baseUrl: string = process.env.BASE_URL ?? DEFAULT_URL;

  headers: Record<string, string>;

  constructor() {
    super('pelitorrent');
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
      // This site prefers the English title
      return this.getEpisodeLinks(
        message.title,
        message.seasonNum,
        message.episodeNum,
      );
    } else {
      // This site prefers the English title
      return this.getMovieLinks(
        message.title,
        message.year,
      );
    }
  }

  async getMovieLinks(title: string, year: number): Promise<Magnet[]> {
    try {
      const encodedTitle = encodeURI(title);
      const searchUrl = `${this.baseUrl}/?s=${encodedTitle}`;
      const result = await fetch(searchUrl, {
        method: 'GET',
        headers: { ...this.headers, referer: searchUrl },
      });
      const text = await result.text();
      const $ = load(text);
      const items = $('main.main-site article.post').toArray();
      const results: Magnet[] = [];
      for (const value of items) {
        const el = $(value);
        const foundTitle = el.find('h2.entry-title').text();
        const foundYear = el.find('span.year').text();
        const foundLink = el.find('a.lnk-blk').attr('href');

        // To improve the search, we compare equality and substring.
        // As we use year to filter, we are safe against false positives.
        // E.g: "2 Fast 2 Furious: A todo gas 2" matches "2 Fast 2 Furious"
        const slugifyGivenTitle = slugify(title);
        const slugifyFoundTitle = slugify(foundTitle);
        const titleMatch = 
          slugifyGivenTitle === slugifyFoundTitle ||
          slugifyGivenTitle.includes(slugifyFoundTitle) ||
          slugifyFoundTitle.includes(slugifyGivenTitle);

        if (titleMatch && Number(foundYear) === year) {
          if (!foundLink) {
            console.log('PT - NO LINK FOUND', foundTitle, foundYear);
            continue;
          }
          const magnet = await this.getMovieInfo(foundLink);
          if (magnet) results.push(magnet);
        }
      }
      return results;
    } catch (error) {
      console.log('DT - ERROR', error);
      return [];
    }
  }

  async getMovieInfo(url: string): Promise<Magnet | null> {
    try {
      const result = await fetch(url);
      const $ = load(await result.text());
      const values = $('div.mdl-bd tbody tr').toArray();
      for (const value of values) {
        const el = $(value);

        // First td is the server, second is the language, third is the quality, fourth is the torrent
        const language = el.children('td').eq(1).text();
        const quality = el.children('td').eq(2).text();
        const link = el.children('td').eq(3).find('a').attr('href');

        console.log({
          language,
          quality,
          link,
        });

        if (!link) {
          console.log('PT - NO LINK FOUND', language, quality);
          continue;
        }

        const spanish = language.includes('Español');
        const magnetInfo = await this.getMagnetFromTorrentUrl(
          link,
          this.baseUrl,
        );

        const magnet = {
          ...magnetInfo,
          language: spanish ? 'es' : 'en',
          quality,
          source: SOURCE,
        };

        return magnet;
      }

      return null;
    } catch (error) {
      console.log(`ERROR Pelitorrent getMovieInfo: ${error}`);
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
            let fileIdx = undefined;
            if (magnetInfo.files?.length) {
              const regex = new RegExp(`.*${season}.*${paddedEpisode}.*(.mp4|.mkv|.avi)`, 'g');
              for (const [index, file] of (magnetInfo.files || []).entries()) {
                const filename = Buffer.from(file.path[0]).toString();
                if (regex.test(filename)) {
                  fileIdx = index;
                }
              }
            }
            const magnet = {
              ...magnetInfo,
              fileIdx,
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
  const scraper = new PelitorrentScraper();
  scraper.getMovieLinks('Blade Runner', 2017).then(console.log);
  // scraper.getEpisodeLinks('Breaking Bad', '5', '4').then(console.log);
}