export interface ScraperRequest {
  imdbId: string;
  title: string;
  spanishTitle: string;
  seasonNumber: string;
  episodeNumber: string;
  tvdbId: string;
  year: number;
  cacheId: string;
}

export interface Magnet {
  language: string;
  magnetUrl: string;
  quality: string;
  peer: number;
  seed: number;
  infoHash: string;
  size: string;
  source: string;
}

interface File {
  length: number;
  path: any[];
}

export interface MagnetData {
  magnetUrl: string;
  infoHash: string;
  size?: string;
  files?: File[];
}


export interface Torrent {
  info: Record<string, any>;
  infoHashBuffer?: Buffer;
  infoBuffer?: Buffer;
  name: string;
  announce: string[];
  infoHash: string;
  files: string[];
}