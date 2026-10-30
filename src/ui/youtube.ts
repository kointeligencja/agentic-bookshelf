// A thin wrapper over the YouTube IFrame API: just what the theme panel uses.

export interface YTPlayer {
  getCurrentTime(): number;
  /** 1 while playing. */
  getPlayerState(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  destroy(): void;
}

interface YTNamespace {
  Player: new (el: HTMLElement, opts: { videoId: string; playerVars?: Record<string, unknown>; events?: { onReady?: () => void } }) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export const PLAYING = 1;

let api: Promise<YTNamespace> | null = null;

/** Loads the IFrame API script once. */
function loadApi(): Promise<YTNamespace> {
  api ??= new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    window.onYouTubeIframeAPIReady = () => resolve(window.YT!);
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return api;
}

/** Replaces `el` with a player for `videoId`. Never settles if the API cannot load (offline, blocked). */
export async function createPlayer(el: HTMLElement, videoId: string): Promise<YTPlayer> {
  const YT = await loadApi();
  return new YT.Player(el, { videoId, playerVars: { rel: 0, modestbranding: 1, playsinline: 1 } });
}
