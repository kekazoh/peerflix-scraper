import { Magnet, ScraperRequest } from '../interfaces';
import Scraper from './scraper';

const DEFAULT_BASE_URL = 'https://yts.mx/api/v2/';

interface YtsTorrent {
  seeds: number;
  size: string;
  peers: number;
  hash: any;
  type: any;
  quality: any;
  title_long: string;
}

interface YtsResponse {
  data: {
    movies: YtsMovie[];
  };
}

interface YtsMovie {
  imdb_code: string;
  title_long: string;
  torrents: YtsTorrent[];
}

export class YtsScraper extends Scraper {

  constructor() {
    super('yts');
  }
  
  protected async processMessage(message: ScraperRequest): Promise<Magnet[]> {
    return this.getMovieLinks(message.imdbId);
  }

  async getMovieLinks(imdb_id: string): Promise<Magnet[]> {
    try {
      // console.log('YTS getMovieLinks', storageKey);
      // if (!this.baseUrl) {
      //   this.baseUrl = (await getCurrentUrl('yts')) || DEFAULT_BASE_URL;
      // }
      const searchUrl = `${DEFAULT_BASE_URL}list_movies.json?query_term=${imdb_id}`;
      const response = await fetch(searchUrl);
      const jsonResp = await response.json() as YtsResponse;
      if (response.ok) {
        const movie = jsonResp.data.movies.filter(
          (mov: { imdb_code: string })=> mov.imdb_code === imdb_id,
        )[0];
        const resultTorrents = movie.torrents.map((torrent: YtsTorrent) => {
          const magnet = YtsScraper.build_url(torrent, movie.title_long);
          return magnet;
        });
        return resultTorrents;
      }
      return [];
    } catch (error) {
      console.log(`getYTSMovieTorrents ${imdb_id}`, error);
      return [];
    }
  }

  static build_url(torrent: YtsTorrent, title_long: string) : Magnet {
    const trackers = [
      'udp://open.demonii.com:1337/announce',
      'udp://tracker.openbittorrent.com:80',
      'udp://tracker.coppersurfer.tk:6969',
      'udp://glotorrents.pw:6969/announce',
      'udp://tracker.opentrackr.org:1337/announce',
      'udp://torrent.gresille.org:80/announce',
      'udp://p4p.arenabg.com:1337',
      'udp://tracker.leechers-paradise.org:6969',
      'http://track.one:1234/announce',
      'udp://track.two:80',
    ];
    const builtTitle = `${title_long} [${torrent.quality}] [${torrent.type}] [YTS.MX]`;
    const movieNameEncoded = `dn=${encodeURI(builtTitle)}`;
    let magnet = `magnet:?xt=urn:btih:${torrent.hash}&${movieNameEncoded}`;
    trackers.forEach(tracker => {
      magnet += '&tr=' + tracker;
    });
    return {
      language: 'en',
      quality: torrent.quality,
      magnetUrl: magnet,
      source: 'yts',
      peer: torrent.peers,
      size: torrent.size,
      seed: torrent.seeds,
      infoHash: torrent.hash,
    };
  }
}
