import { strict as assert } from 'assert';
import { YtsScraper } from './scrapers/ytsScraper';
import { SolidtorrentsScraper } from './scrapers/solidtorrentsScraper';
import Scraper from './scrapers/scraper';

function initializeScraper(platform: string): Scraper {
  let scraper: Scraper;

  switch (platform) {
    case 'yts':
      scraper = new YtsScraper();
      break;
    case 'solidtorrents':
      scraper = new SolidtorrentsScraper();
      break;
    default:
      throw new Error(`Invalid platform: ${platform}`);
  }

  return scraper;
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