export type ResolvedStream =
  | { kind: 'iframe'; src: string }
  | { kind: 'video'; src: string }
  | { kind: 'discord'; href: string }
  | { kind: 'studio' };

export function normalizeStreamHref(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed) || /^discord:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^(www\.)?(discord\.gg|discord\.com|discordapp\.com)\b/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

export function isDiscordStreamUrl(url: string): boolean {
  const normalized = normalizeStreamHref(url);
  if (!normalized) return false;
  if (/^discord:\/\//i.test(normalized)) return true;
  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    return (
      host === 'discord.gg' ||
      host === 'discord.com' ||
      host === 'discordapp.com' ||
      host === 'ptb.discord.com' ||
      host === 'canary.discord.com'
    );
  } catch {
    return false;
  }
}

export function resolveStreamSource(url: string): ResolvedStream {
  const normalized = normalizeStreamHref(url);
  if (!normalized) return { kind: 'studio' };

  if (isDiscordStreamUrl(normalized)) {
    return { kind: 'discord', href: normalized };
  }

  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

    if (/\.(mp4|webm|ogg)$/i.test(parsed.pathname)) {
      return { kind: 'video', src: normalized };
    }

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (parsed.pathname.startsWith('/embed/')) {
        return { kind: 'iframe', src: normalized };
      }
      const v = parsed.searchParams.get('v');
      if (v) {
        return { kind: 'iframe', src: `https://www.youtube.com/embed/${v}?autoplay=1&rel=0` };
      }
      const liveMatch = parsed.pathname.match(/^\/(live|shorts)\/([^/]+)/);
      if (liveMatch) {
        return { kind: 'iframe', src: `https://www.youtube.com/embed/${liveMatch[2]}?autoplay=1&rel=0` };
      }
    }

    if (host === 'youtu.be') {
      const id = parsed.pathname.slice(1);
      if (id) {
        return { kind: 'iframe', src: `https://www.youtube.com/embed/${id}?autoplay=1&rel=0` };
      }
    }

    if (host === 'twitch.tv') {
      const channel = parsed.pathname.replace(/^\//, '').split('/')[0];
      if (channel && typeof window !== 'undefined') {
        return {
          kind: 'iframe',
          src: `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${encodeURIComponent(window.location.hostname)}`,
        };
      }
    }

    if (host === 'kick.com') {
      const channel = parsed.pathname.replace(/^\//, '').split('/')[0];
      if (channel) {
        return { kind: 'iframe', src: `https://player.kick.com/${encodeURIComponent(channel)}` };
      }
    }

    return { kind: 'iframe', src: normalized };
  } catch {
    return { kind: 'studio' };
  }
}
