import { Bencode } from 'bencode-ts';
import * as crypto from 'crypto';
import { Torrent } from '../interfaces';
import logger from './logger';

export const decodeTorrentFile = async (torrent: Buffer): Promise<Torrent | null> => {
  try {
    logger.info('Decoding torrent file');
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
    logger.info({ infoHash: result.infoHash }, 'Torrent file decoded successfully');
    return result;
  } catch (error) {
    logger.error({ error }, 'Error decoding torrent file');
    throw new Error('Error decoding torrent file');
  }
};

export const magnetURIEncode = (obj: Torrent): string => {
  logger.info('Encoding magnet URI');
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

  logger.info({ magnetURI: result }, 'Magnet URI encoded successfully');
  return result;
};

export function getLegibleSizeFromBytesLength(bytes: number): string {
  logger.info({ bytes }, 'Converting bytes to legible size');
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  // if bytes is 0 or a negative number, return 0B
  if (bytes <= 0) return '0B';
  // Get the index of the size from the sizes array
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
  // Get the size in the appropriate unit
  const size = bytes / Math.pow(1024, i);
  // Return the size with 2 decimal places and the appropriate unit
  const result = `${size.toFixed(2)} ${sizes[i]}`;
  logger.info({ result }, 'Bytes converted to legible size');
  return result;
}