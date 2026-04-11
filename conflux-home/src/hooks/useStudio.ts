import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { StudioGeneration, StudioModule } from '../types';

export function useStudio() {
  const [activeModule, setActiveModule] = useState<StudioModule>('image');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generations, setGenerations] = useState<StudioGeneration[]>([]);
  const [selectedGeneration, setSelectedGeneration] = useState<StudioGeneration | null>(null);

  const loadHistory = useCallback(async (): Promise<void> => {
    try {
      const result = await invoke<StudioGeneration[]>('studio_get_generations');
      setGenerations(result);
    } catch (e) {
      console.error('Failed to load studio generations:', e);
    }
  }, []);

  const selectGeneration = useCallback((gen: StudioGeneration | null) => {
    setSelectedGeneration(gen);
  }, []);

  const deleteGeneration = useCallback(async (id: string): Promise<boolean> => {
    try {
      await invoke('studio_delete_generation', { id });
      setGenerations((prev) => prev.filter((g) => g.id !== id));
      if (selectedGeneration?.id === id) {
        setSelectedGeneration(null);
      }
      return true;
    } catch (e) {
      console.error('Failed to delete generation:', e);
      return false;
    }
  }, [selectedGeneration]);

  const generate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setSelectedGeneration(null);

    try {
      // Save prompt to history
      await invoke('studio_upsert_prompt', {
        prompt: prompt.trim(),
        module: activeModule,
      });
    } catch (e) {
      console.error('Failed to save prompt to history:', e);
    }

    let generationId: string | null = null;

    try {
      // Create generation record in DB
      generationId = await invoke<string>('studio_create_generation', {
        module: activeModule,
        prompt: prompt.trim(),
        model: activeModule === 'image' ? 'flux-schnell' : activeModule === 'voice' ? 'eleven_multilingual_v2' : 'mock-model',
        provider: activeModule === 'image' ? 'replicate' : activeModule === 'voice' ? 'elevenlabs' : 'mock',
      });
    } catch (e) {
      console.error('Failed to create generation:', e);
      setIsGenerating(false);
      return;
    }

    // Real API integrations
    if (activeModule === 'image') {
      try {
        const result = await invoke('studio_generate_image', {
          generationId,
          prompt: prompt.trim(),
          aspectRatio: '1:1',
        });
        console.log('Image generation complete:', result);
        await loadHistory();
      } catch (e) {
        console.error('Image generation failed:', e);
        await loadHistory();
      }
      setIsGenerating(false);
      setPrompt('');
      return;
    }

    if (activeModule === 'voice') {
      try {
        const result = await invoke('studio_generate_voice', {
          generationId,
          text: prompt.trim(),
          voiceId: null, // default Rachel voice
        });
        console.log('Voice generation complete:', result);
        await loadHistory();
      } catch (e) {
        console.error('Voice generation failed:', e);
        await loadHistory();
      }
      setIsGenerating(false);
      setPrompt('');
      return;
    }

    // Mock behavior for music/video (placeholder)
    setTimeout(async () => {
      try {
        const metadata = JSON.stringify({
          format: activeModule === 'music' ? 'mp3' : 'mp4',
          duration: 30,
        });

        await invoke('studio_update_generation_status', {
          id: generationId,
          status: 'complete',
          outputPath: null,
          outputUrl: null,
          metadataJson: metadata,
          costCents: 0,
        });

        // Reload from DB
        await loadHistory();
      } catch (e) {
        console.error('Failed to update generation status:', e);
      }

      setIsGenerating(false);
      setPrompt('');
    }, 3000);
  }, [prompt, isGenerating, activeModule, loadHistory]);

  const saveToVault = useCallback(async (generation: StudioGeneration): Promise<void> => {
    try {
      const result = await invoke('studio_save_to_vault', { generationId: generation.id });
      console.log('Saved to vault:', result);
      // Reload history to show vault_file_id link
      await loadHistory();
    } catch (e) {
      console.error('Failed to save to vault:', e);
    }
  }, [loadHistory]);

  const remix = useCallback((generation: StudioGeneration) => {
    setPrompt(`Remix of: ${generation.prompt}`);
    setActiveModule(generation.module);
    setSelectedGeneration(generation);
  }, []);

  // Load history on mount
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return {
    // State
    activeModule,
    setActiveModule,
    prompt,
    setPrompt,
    isGenerating,
    generations,
    selectedGeneration,
    // Actions
    generate,
    saveToVault,
    remix,
    selectGeneration,
    deleteGeneration,
    loadHistory,
  };
}
