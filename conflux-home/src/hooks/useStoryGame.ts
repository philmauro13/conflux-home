// Conflux Home — Story Game Hook
// Manages story games, chapters, and seeds via Tauri commands.

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { StoryGame, StoryChapter, StorySeed, CreateStoryGameRequest } from '../types';

// Check if Tauri runtime is available
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function useStoryGames(memberId?: string) {
  const [games, setGames] = useState<StoryGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isTauri()) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await invoke<StoryGame[]>('story_games_list', { member_id: memberId ?? null });
      setGames(data);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (req: CreateStoryGameRequest) => {
    const game = await invoke<StoryGame>('story_game_create', { req });
    setGames(prev => [game, ...prev]);
    return game;
  }, []);

  return { games, loading, error, create, reload: load };
}

export function useStoryGame(gameId: string | null) {
  const [game, setGame] = useState<StoryGame | null>(null);
  const [chapters, setChapters] = useState<StoryChapter[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!gameId || !isTauri()) return;
    try {
      setLoading(true);
      const [g, ch] = await Promise.all([
        invoke<StoryGame | null>('story_game_get', { id: gameId }),
        invoke<StoryChapter[]>('story_chapters_list', { gameId }),
      ]);
      setGame(g);
      setChapters(ch);
    } catch (e) {
      console.error('Failed to load story game:', e);
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => { load(); }, [load]);

  const currentChapter = chapters.length > 0 ? chapters[chapters.length - 1] : null;

  const choosePath = useCallback(async (chapterId: string, choiceId: string) => {
    await invoke('story_choose_path', { chapterId, choiceId });
    await load(); // reload to get new chapter
  }, [load]);

  const solvePuzzle = useCallback(async (chapterId: string) => {
    await invoke('story_solve_puzzle', { chapterId });
    await load();
  }, [load]);

  const generateNextChapter = useCallback(async (gameId: string, choiceId: string) => {
    await invoke('story_generate_next_chapter', { gameId, choiceId });
    await load();
  }, [load]);

  return { game, chapters, currentChapter, loading, choosePath, solvePuzzle, generateNextChapter, reload: load };
}

export function useStorySeeds(ageGroup?: string, genre?: string) {
  const [seeds, setSeeds] = useState<StorySeed[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!isTauri()) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await invoke<StorySeed[]>('story_seeds_list', {
        ageGroup: ageGroup ?? null,
        genre: genre ?? null,
      });
      setSeeds(data);
    } catch (e) {
      console.error('Failed to load story seeds:', e);
    } finally {
      setLoading(false);
    }
  }, [ageGroup, genre]);

  useEffect(() => { load(); }, [load]);

  return { seeds, loading, reload: load };
}
