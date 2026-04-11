// Conflux Home — Voice Waveform Component
// Animated bars shown during voice capture.

import '../../styles/voice.css';

interface VoiceWaveformProps {
  barCount?: number;
  className?: string;
  active?: boolean;
}

export default function VoiceWaveform({ barCount = 7, className = '', active = true }: VoiceWaveformProps) {
  return (
    <div className={`voice-waveform ${active ? '' : 'voice-waveform-idle'} ${className}`.trim()}>
      {Array.from({ length: barCount }, (_, i) => (
        <div key={i} className="voice-waveform-bar" />
      ))}
    </div>
  );
}
