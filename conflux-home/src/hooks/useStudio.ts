import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { StudioGeneration, StudioModule } from '../types';

// Compute aspect ratio string from dimension string (e.g. "1024x1024" -> "1:1")
const computeAspectRatio = (size: string): string => {
  const [w, h] = size.split('x').map(Number);
  if (w === 0 || h === 0) return '1:1';
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(w, h);
  return `${w / divisor}:${h / divisor}`;
};

export function useStudio() {
  const [activeModule, setActiveModule] = useState<StudioModule>('image');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [batchGenerations, setBatchGenerations] = useState<StudioGeneration[]>([]);
  const [generations, setGenerations] = useState<StudioGeneration[]>([]);
  const [selectedGeneration, setSelectedGeneration] = useState<StudioGeneration | null>(null);

  // New dashboard state
  const [currentProject, setCurrentProject] = useState<string>('default');
  const [projects, setProjects] = useState<Array<{ id: string; name: string; path: string }>>([
    { id: 'default', name: 'Default', path: '' },
  ]);
  const [adjustments, setAdjustments] = useState<Record<string, Record<string, any>>>({
    image: { size: '1024x1024', style: 'vivid', quality: 'standard' },
    video: { duration: 5, fps: 24, style: 'cinematic' },
    music: { genre: 'ambient', duration: 30, mood: 'calm' },
    voice: { voiceId: 'JBFqnCBsd6RMkjVDRZzb', speed: 1.0, stability: 0.5 },
    code: { language: 'html', framework: 'vanilla', complexity: 'simple' },
    design: { format: 'png', style: 'modern', colorCount: 3 },
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [enterGallery, setEnterGallery] = useState(false);

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

  // Toggle fullscreen mode for preview canvas
  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } catch (e) {
        console.error('Fullscreen request failed:', e);
      }
    } else {
      try {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } catch (e) {
        console.error('Exit fullscreen failed:', e);
      }
    }
  }, []);

  // Update adjustment for current module
  const updateAdjustment = useCallback((module: string, key: string, value: any) => {
    setAdjustments((prev) => ({
      ...prev,
      [module]: {
        ...prev[module],
        [key]: value,
      },
    }));
  }, []);

  // Project assignment
  const setGenerationProject = useCallback(async (generationId: string, projectId: string) => {
    try {
      await invoke('studio_set_generation_project', { generationId, projectId });
    } catch (e) {
      console.error('Failed to set generation project:', e);
    }
  }, []);

  // Generate with current settings
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
        model: activeModule === 'image' ? 'dall-e-3' : activeModule === 'voice' ? 'eleven_multilingual_v2' : 'mock-model',
        provider: activeModule === 'image' ? 'openai' : activeModule === 'voice' ? 'elevenlabs' : 'mock',
      });
      // Assign to current project
      try {
        await setGenerationProject(generationId, currentProject);
      } catch (e) {
        console.error('Failed to set generation project:', e);
      }
    } catch (e) {
      console.error('Failed to create generation:', e);
      setIsGenerating(false);
      return;
    }

    // Real API integrations
    if (activeModule === 'image') {
      try {
        // Derive aspectRatio from selected size
        const aspectRatio = computeAspectRatio(adjustments.image.size);
        // Incorporate style into prompt (backend will handle or store as metadata)
        const style = adjustments.image.style;
        const stylePrefix: Record<string, string> = {
          vivid: '',
          natural: 'photorealistic, natural lighting, ',
          dramatic: 'dramatic lighting, cinematic, high contrast, ',
        };
        const enhancedPrompt = `${stylePrefix[style] || ''}${prompt.trim()}`.trim();

        const result = await invoke('studio_generate_image', {
          generationId,
          prompt: enhancedPrompt,
          aspectRatio,
          // Note: style/quality not yet wired to backend; stored in metadata separately
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
        // Pass voice adjustments (backend may ignore until extended)
        const { speed, stability, voiceId } = adjustments.voice;
        const result = await invoke('studio_generate_voice', {
          generationId,
          text: prompt.trim(),
          voiceId: voiceId,
          speed,
          stability,
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

    // Mock behavior for music/video (placeholder) — store adjustments in metadata
    setTimeout(async () => {
      try {
        const metadata = JSON.stringify({
          format: activeModule === 'music' ? 'mp3' : 'mp4',
          duration: 30,
          adjustments: adjustments[activeModule], // preserve user preferences
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

    // Batch generation: spawn 4 parallel generations with same settings
    const generateBatch = useCallback(async () => {
      if (!prompt.trim() || isGenerating) return;
      setIsGenerating(true);
      setBatchGenerations([]); // clear previous batch
      setSelectedGeneration(null);

      const batchSize = 4;
      const batchIds: string[] = [];

      try {
        // Save prompt to history once
        await invoke('studio_upsert_prompt', {
          prompt: prompt.trim(),
          module: activeModule,
        });
      } catch (e) {
        console.error('Failed to save prompt to history:', e);
      }

      // Create all 4 generation records concurrently
      const createPromises = Array(batchSize).fill(null).map(async () => {
        try {
          const genId = await invoke<string>('studio_create_generation', {
            module: activeModule,
            prompt: prompt.trim(),
            model: activeModule === 'image' ? 'dall-e-3' : activeModule === 'voice' ? 'eleven_multilingual_v2' : 'mock-model',
            provider: activeModule === 'image' ? 'openai' : activeModule === 'voice' ? 'elevenlabs' : 'mock',
          });
          batchIds.push(genId);
          // Assign to current project
          try {
            await setGenerationProject(genId, currentProject);
          } catch (e) {
            console.error('Failed to set batch generation project:', e);
          }
          return genId;
        } catch (e) {
          console.error('Failed to create batch generation:', e);
          return null;
        }
      });

      await Promise.all(createPromises);

      // Now trigger generation logic for each based on module (reuse existing logic but don't block UI)
      if (activeModule === 'image') {
        batchIds.forEach((genId, idx) => {
          (async () => {
            try {
              const aspectRatio = computeAspectRatio(adjustments.image.size);
              await invoke('studio_generate_image', {
                generationId: genId,
                prompt: prompt.trim(),
                aspectRatio,
              });
            } catch (e) {
              console.error(`Batch image ${idx} failed:`, e);
            } finally {
              // Reload history after all complete (simplified: all done)
              if (idx === batchIds.length - 1) {
                loadHistory();
                setIsGenerating(false);
              }
            }
          })();
        });
      } else if (activeModule === 'voice') {
        batchIds.forEach((genId, idx) => {
          (async () => {
            try {
              const { speed, stability, voiceId } = adjustments.voice;
              await invoke('studio_generate_voice', {
                generationId: genId,
                text: prompt.trim(),
                voiceId,
                speed,
                stability,
              });
            } catch (e) {
              console.error(`Batch voice ${idx} failed:`, e);
            } finally {
              if (idx === batchIds.length - 1) {
                loadHistory();
                setIsGenerating(false);
              }
            }
          })();
        });
      } else {
        // Mock for other modules
        setTimeout(async () => {
          try {
            for (const genId of batchIds) {
              const metadata = JSON.stringify({
                format: activeModule === 'music' ? 'mp3' : 'mp4',
                duration: 30,
                adjustments: adjustments[activeModule],
              });
              await invoke('studio_update_generation_status', {
                id: genId,
                status: 'complete',
                outputPath: null,
                outputUrl: null,
                metadataJson: metadata,
                costCents: 0,
              });
            }
          } catch (e) {
            console.error('Batch mock update failed:', e);
          }
          await loadHistory();
          setIsGenerating(false);
        }, 3000);
      }

      // Show batch grid (will be populated via history listener or we could manually add)
      // The history reload will include them; for immediate feedback we could also
      // setBatchGenerations directly from newly created records (omitted for brevity)
    }, [prompt, isGenerating, activeModule, adjustments, loadHistory]);

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

  // Bulk operations
  const bulkDelete = useCallback(async (ids: string[]) => {
    await Promise.all(ids.map(id => deleteGeneration(id)));
  }, [deleteGeneration]);

  const bulkSaveToVault = useCallback(async (ids: string[]) => {
    const gens = generations.filter(g => ids.includes(g.id));
    await Promise.all(gens.map(gen => saveToVault(gen)));
  }, [saveToVault, generations]);

  const exportGenerationsZip = useCallback(async (ids: string[]) => {
    return await invoke<string>('studio_export_generations_zip', { generationIds: ids });
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
    // New state
    currentProject,
    setCurrentProject,
    projects,
    setProjects,
    adjustments,
    updateAdjustment,
    isFullscreen,
    toggleFullscreen,
    enterGallery,
    setEnterGallery,
    batchGenerations,
    setBatchGenerations,
    // Actions
    generate,
    generateBatch,
    saveToVault,
    remix,
    setGenerationProject,
    selectGeneration,
    deleteGeneration,
    loadHistory,
    bulkDelete,
    bulkSaveToVault,
    exportGenerationsZip,
  };
}
