// Public News & Twitter/X Style Rumors Sentiment Scraper
// Scrapes RSS football feeds ( SkySports, BBC, L'Equipe transfer rumors)
// Calculates team-specific morale and sentiment score (0.80 bad to 1.20 exceptional)
// strictly no keys required.

import { normalizeTeamName } from "../team-matcher";

export interface TeamSentiment {
  team: string;
  sentimentScore: number; // 0.8 to 1.2
  latestNews: string[];
}

// Map of popular RSS news feeds
const FEEDS = [
  "https://www.skysports.com/rss/12040", // Football News
  "https://feeds.bbci.co.uk/sport/football/rss.xml", // BBC Football
];

/**
 * Scrapes recent football rumors & injury news to extract a team sentiment score
 * @param teamName - Name of the team to audit
 */
export async function fetchTeamSentiment(teamName: string): Promise<TeamSentiment> {
  const normTarget = normalizeTeamName(teamName);
  const latestNews: string[] = [];
  let scoreSum = 0;
  let count = 0;

  try {
    for (const feed of FEEDS) {
      const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(feed)}`, {
        next: { revalidate: 3600 }, // Cache 1 hour
      });

      if (!res.ok) continue;
      const data = await res.json();
      const xml = data.contents;

      // Extract item titles & descriptions
      const items = xml.match(/<item>([\s\S]*?)<\/item>/gi) || [];
      for (const item of items) {
        const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/i);
        const descMatch = item.match(/<description>([\s\S]*?)<\/description>/i);
        const title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/gi, "$1") : "";
        const desc = descMatch ? descMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/gi, "$1") : "";

        const text = `${title} ${desc}`.toLowerCase();

        // Check if the news is relevant to our target team
        if (text.includes(normTarget) || text.includes(teamName.toLowerCase())) {
          latestNews.push(title);

          // Simple heuristic lexical sentiment analysis (Twitter/X transfer & injury style)
          let sentiment = 1.0;
          if (/\b(injury|injured|out|miss|broken|absent|doubt|doubtful|suspension|suspended|fracture)\b/i.test(text)) {
            sentiment -= 0.15; // Injury crisis
          }
          if (/\b(sign|signing|joined|transfer|arrival|welcome|contract|extends|renewed|agree)\b/i.test(text)) {
            sentiment += 0.12; // Positive transfer news
          }
          if (/\b(defeat|loss|crisis|sack|sacked|unhappy|disappointing|internal|anger|fined)\b/i.test(text)) {
            sentiment -= 0.10; // Bad morale
          }
          if (/\b(win|victory|unbeaten|dominant|thrilled|extension|recovery|back|fit)\b/i.test(text)) {
            sentiment += 0.08; // Recovery or winning streak
          }

          scoreSum += sentiment;
          count++;
        }
      }
    }
  } catch (err) {
    console.warn(`[sentiment-scraper] failed for ${teamName}:`, err);
  }

  // Capped final score between 0.85 (injury/crisis) and 1.15 (all star signings / fitness recovery)
  const finalScore = count > 0 ? Math.max(0.85, Math.min(1.15, scoreSum / count)) : 1.0;

  return {
    team: teamName,
    sentimentScore: Math.round(finalScore * 100) / 100,
    latestNews: latestNews.slice(0, 3),
  };
}
