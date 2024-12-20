export interface ScraperRequest {
  imdbId: string;
  title: string;
  spanishTitle: string;
  seasonNum: string;
  episodeNum: string;
  tvdbId: string;
  year: number;
  cacheId: string;
}

export interface Magnet {
  infoHash: string;
  language: string;
  magnetUrl: string;
  quality: string;
  source: string;
  peer?: number;
  seed?: number;
  size?: string;
  fileIdx?: number;
  fileName?: string;
}

export interface File {
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
  keywords?: string[];
  urlList?: string[];
}

export interface SeedsNPeers {
  seed?: number;
  peer?: number;
}

export interface CheckerResponse {
  seeds: number;
  peers: number;
  extra: { seeds: number, peers: number }[];
  error?: { code: number, message: string };
}