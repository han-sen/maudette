// The core moods every mascot can show; `idle` is the one every other falls back to.
export type CoreMood = 'idle' | 'think' | 'read' | 'write' | 'run' | 'happy' | 'sad' | 'sleep' | 'waiting'

// Finer versions of a core mood, `<parent>.<name>`: used when a mascot draws them,
// else the parent. See SUB_MOODS in hooks/mood.ts.
export type SubMood = 'run.test' | 'run.git' | 'read.web' | 'read.search'

export type Mood = CoreMood | SubMood

declare module 'claude-code' {
  interface PluginState {
    maudette: { mood: Mood; detail: string }
  }
}
