import Scraper from './scraper';
import { ScraperRequest, Magnet } from '../interfaces';
import { getParamFromMagnet } from '../lib/strings';
import { getFileIdxFromName, getLegibleSizeFromBytesLength } from '../lib/torrent';

// const SOURCE_NAME = 'PopcornTime';
const DEFAULT_BASE_URL = 'https://jfper.link';

interface PopcorntimeResponse {
  title: string;
  year: number;
}

interface PopcorntimeMovie extends PopcorntimeResponse {
  torrents: Record<string, any>;
}

interface PopcorntimeShow extends PopcorntimeResponse {
  episodes: ResponseEpisode[];
}

interface ResponseEpisode {
  tvdb_id: number;
  torrents: Record<string, any>
}

export class PopcorntimeScraper extends Scraper {

  constructor() {
    super('popcorntime');
  }

  protected processMessage(message: ScraperRequest): Promise<Magnet[]> {
    if (!message.imdbId) throw new Error('IMDB ID is required');
    if (message.seasonNum && message.episodeNum) {
      return this.getEpisodeLinks(
        message.imdbId,
        parseInt(message.tvdbId),
        message.cacheId,
      );
    } else {
      return this.getMovieLinks(
        message.imdbId,
        message.cacheId,
      );
    }
  }

  async getMovieLinks(imdb_id: string, storageKey: string): Promise<Magnet[]> {
    try {
      // console.log('GET MOVIE LINKS', imdb_id, storageKey);
      const MOVIES_BASE_URL = `${DEFAULT_BASE_URL}/movie`;
      const resp = await fetch(`${MOVIES_BASE_URL}/${imdb_id}`);
      const jsonresp = await resp.json() as PopcorntimeMovie;
      const magnets = Object.entries(jsonresp.torrents).map(([lang, qualities]) => {
        return Object.entries(qualities as Record<string, any>).map(([quality, value]) => {
          const builtTitle = `[POPCORNTIME] ${jsonresp.title} (${jsonresp.year}) [${quality}]`;
          const movieNameEncoded = `&dn=${encodeURI(builtTitle)}`;
          const ptUrl: string = value.url.includes('dn=')
            ? value.url
            : value.url + movieNameEncoded;
          if ('file' in value) {
            // we need to indicate a fileIdx
          }
          const magnet = {
            magnetUrl: ptUrl,
            source: value.provider,
            quality: quality,
            language: lang,
            peer: value.peer,
            seed: value.seed,
            size: value.filesize,
            infoHash: getParamFromMagnet(ptUrl, 'xt').split(':').pop() as string,
            cacheId: storageKey,
          };
          return magnet;
        });
      });
      return magnets.flat().filter(Boolean);
    } catch (error) {
      console.log('ERROR POPCORNTIME MAGNETS', error);
      return [];
    }
  }

  async getEpisodeLinks(show_imdb_id: string, episode_tvdb_id: number, storageKey: string): Promise<Magnet[]> {
    try {
      const SHOWS_BASE_URL = `${DEFAULT_BASE_URL}/show/`;
      const resp = await fetch(SHOWS_BASE_URL + show_imdb_id);
      const jsonresp = await resp.json() as PopcorntimeShow;
      if (!jsonresp) {
        console.log('MAGNETS FROM EPISODE - NOT JSONRESP: ', resp);
        return [];
      }
      const results = jsonresp.episodes.filter((item: { tvdb_id: number }): boolean => {
        return item.tvdb_id === episode_tvdb_id;
      });
      if (results.length && results[0].torrents) {
        const magnets = Object.keys(results[0].torrents).map(async key => {
          const torrent = results[0].torrents[key];
          const magnet = {
            magnetUrl: torrent.url,
            source: torrent.provider || 'PopcornTime',
            language: 'en',
            quality: key,
            peer: torrent.peers,
            seed: torrent.seeds,
            size: torrent.filesize || undefined,
            infoHash: getParamFromMagnet(torrent.url, 'xt').split(':').pop() as string,
            fileIdx: undefined,
            cacheId: storageKey,
          } as Magnet;
          if ('file' in torrent) {
            console.log('TORRENT FILE', torrent.file);
            const magnetInfo = await this.getTorrentFromMagnet(torrent.url);
            if (magnetInfo) {
              const fileName = torrent.file.split('/').pop();
              magnet.fileIdx = await getFileIdxFromName(fileName, magnetInfo.files);
              magnet.fileName = fileName;
              const size = magnet.fileIdx !== undefined && magnetInfo.files
                ? getLegibleSizeFromBytesLength(magnetInfo.files[magnet.fileIdx].length) : undefined;
              magnet.size = size || magnet.size || magnetInfo.size || undefined;
            }
          }
          return magnet;
        });
        return await Promise.all(magnets);
      } else return [];
    } catch (e) {
      console.log('MAGNETS FROM EPISODE - CATCH ERROR:', e);
      return [];
    }
  }
}

if (require.main === module) {
  const scraper = new PopcorntimeScraper();
  // Example usage for a movie
  scraper.getMovieLinks('tt0133093', 'someCacheId').then(magnets => {
    console.log('Movie Magnets:', magnets);
  });

  // Example usage for an episode
  scraper.getEpisodeLinks('tt13024830', 9683277, 'someCacheId').then(magnets => {
    console.log('Episode Magnets:', magnets);
  });
}

