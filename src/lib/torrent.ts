import { Bencode } from 'bencode-ts';
import * as crypto from 'crypto';
import { Torrent, File } from '../interfaces';

export const decodeTorrentFile = async (torrent: Buffer): Promise<Torrent | null> => {
  try {
    const fTorrent = Bencode.decode(torrent);
    const result = {
      info: fTorrent.info,
      infoBuffer: Bencode.encode(fTorrent.info),
      name: (fTorrent.info['name.utf-8'] || fTorrent.info.name).toString(),
      announce: [],
      infoHash: '',
      files: fTorrent.files || [],
    };
    const shasum = crypto.createHash('sha1');
    shasum.update(result.infoBuffer);
    result.infoHash = shasum.digest('hex');
    return result;
  } catch (error) {
    console.error('ERROR DECODING TORRENT FILE', error);
    return null;
  }
};

export const magnetURIEncode = (obj: Torrent): string => {
  const auxObj: Record<string, any> = Object.assign({}, obj); // clone obj, so we can mutate it

  // support using convenience names, in addition to spec names
  // (example: `infoHash` for `xt`, `name` for `dn`)
  if (auxObj.infoHashBuffer) {
    auxObj.xt = `urn:btih:${auxObj.infoHashBuffer.toString('hex')}`;
  }
  if (auxObj.infoHash) {
    auxObj.xt = `urn:btih:${auxObj.infoHash}`;
  }
  if (auxObj.name) {
    auxObj.dn = auxObj.name;
  }
  if (auxObj.keywords) {
    auxObj.kt = auxObj.keywords;
  }
  if (auxObj.announce) {
    auxObj.tr = auxObj.announce;
  }
  if (auxObj.urlList) {
    auxObj.ws = auxObj.urlList;
    delete auxObj.as;
  }
  let result = 'magnet:?';
  Object.keys(auxObj)
    .filter(key => key.length === 2)
    .forEach((key, i) => {
      const values = Array.isArray(auxObj[key]) ? auxObj[key] : [auxObj[key]];
      values.forEach((val: string, j: number) => {
        if ((i > 0 || j > 0) && (key !== 'kt' || j === 0)) {
          result += '&';
        }
        if (key === 'dn') {
          val = encodeURIComponent(val).replace(/%20/g, '+');
        }
        if (key === 'tr' || key === 'xs' || key === 'as' || key === 'ws') {
          val = encodeURIComponent(val);
        }
        if (key === 'kt') {
          val = encodeURIComponent(val);
        }
        if (key === 'kt' && j > 0) {
          result += `+${val}`;
        } else {
          result += `${key}=${val}`;
        }
      });
    });

  return result;
};


export function getLegibleSizeFromBytesLength(bytes: number): string {
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  // if bytes is 0 or a negative number, return 0B
  if (bytes <= 0) return '0B';
  // Get the index of the size from the sizes array
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
  // Get the size in the appropriate unit
  const size = bytes / Math.pow(1024, i);
  // Return the size with 2 decimal places and the appropriate unit
  return `${size.toFixed(2)} ${sizes[i]}`;
}

export async function getFileIdx(files?: File[], season?: number, episode?: number): Promise<number | undefined> {
  let fileIdx = undefined;
  if (files?.length) {
    const fileRegex = season && episode
      ? `[S]?${season}[E|x]?${`${episode}`.padStart(2, '0')}.*(.mp4|.mkv|.avi)`
      : '.*(.mp4|.mkv|.avi)';
    const filteredFiles = files.filter(file => {
      const regex = new RegExp(fileRegex, 'g');
      const filePath = typeof file.path === 'string'
        ? file.path 
        : file.path.map(path => Buffer.from(path).toString()).join('/');
      return regex.test(filePath);
    });
    // sort by length descending
    const sortedFiles = filteredFiles.sort((a, b) => b.length - a.length);
    if (sortedFiles.length) {
      fileIdx = files.indexOf(sortedFiles[0]);
    }
  }
  return fileIdx;
}