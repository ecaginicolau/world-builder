import type { Chapter } from '@/features/chapters/types';
import type { ChapterEvent, TimelineEvent } from './types';

/**
 * Build a `chapterId → derivedChronoRank` map for chapters that have at least
 * one linked event. The derived chrono of a chapter = the *earliest* (smallest
 * lexicographic) `chronological_rank` among the events linked to it.
 *
 * Chapters with no linked events are absent from the map (they have no
 * chronological position — they show up in the narrative tree but not in the
 * canonical timeline).
 */
export function buildChapterChronoMap(
  chapterEvents: ChapterEvent[],
  events: TimelineEvent[],
): Map<string, string> {
  const eventChronoById = new Map<string, string>();
  for (const e of events) eventChronoById.set(e.id, e.chronological_rank);
  const out = new Map<string, string>();
  for (const ce of chapterEvents) {
    const ec = eventChronoById.get(ce.event_id);
    if (!ec) continue;
    const cur = out.get(ce.chapter_id);
    if (cur === undefined || ec < cur) out.set(ce.chapter_id, ec);
  }
  return out;
}

/**
 * Build a `eventId → list of chapters` map (used by the timeline to render
 * chapter chips on each event row).
 */
export function buildEventChaptersMap(
  chapterEvents: ChapterEvent[],
  chapters: Chapter[],
): Map<string, Chapter[]> {
  const chapterById = new Map<string, Chapter>();
  for (const c of chapters) chapterById.set(c.id, c);
  const out = new Map<string, Chapter[]>();
  for (const ce of chapterEvents) {
    const c = chapterById.get(ce.chapter_id);
    if (!c) continue;
    const list = out.get(ce.event_id) ?? [];
    list.push(c);
    out.set(ce.event_id, list);
  }
  return out;
}
