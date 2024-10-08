import { strict as assert } from 'assert';
import Scraper from './scrapers/scraper';
import { YtsScraper } from './scrapers/ytsScraper';
import { SolidtorrentsScraper } from './scrapers/solidtorrentsScraper';
import { PopcorntimeScraper } from './scrapers/popcorntimeScraper';
import { DontorrentScraper } from './scrapers/dontorrentScraper';
import { MejortorrentScraper } from './scrapers/mejortorrentScraper';
import { WolfmaxScraper } from './scrapers/wolfmaxScraper';
import { Wolfmax4kScraper as WolfmaxBtdigScraper } from './scrapers/wolfmaxbtdigScraper';
import { GrantorrentScraper } from './scrapers/grantorrentScraper';
import { PelitorrentScraper } from './scrapers/pelitorrentScraper';

function initializeScraper(platform: string): Scraper {
  switch (platform) {
    case 'yts':
      return new YtsScraper();
    case 'solidtorrents':
      return new SolidtorrentsScraper();
    case 'popcorntime':
      return new PopcorntimeScraper();
    case 'dontorrent':
      return new DontorrentScraper();
    case 'mejortorrent':
      return new MejortorrentScraper();
    case 'wolfmax':
      return new WolfmaxScraper();
    case 'wolfmaxbtdig':
      return new WolfmaxBtdigScraper();
    case 'grantorrent':
      return new GrantorrentScraper();
    case 'pelitorrent':
      return new PelitorrentScraper();
    default:
      throw new Error(`Invalid platform: ${platform}`);
  }
}

if (require.main === module) {
  // Example usage
  const platform = process.env.PLATFORM || process.argv[2];
  assert(platform, 'Missing PLATFORM argument');
  const scraper = initializeScraper(platform);
  scraper.run()
    .catch(() => {
      console.error(`Error running scraper for platform ${scraper.platform}`);
      process.exit(1);
    });
}