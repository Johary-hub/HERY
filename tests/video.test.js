import { describe, it, expect } from 'vitest';
import { youtubeId, searchUrl } from '../src/video.js';

describe('liens vidéo', () => {
  it('reconnaît les formats YouTube', () => {
    const id = 'dQw4w9WgXcQ';
    for (const u of [
      `https://www.youtube.com/watch?v=${id}`, `https://youtube.com/watch?feature=share&v=${id}`,
      `https://youtu.be/${id}?si=abc`, `https://www.youtube.com/shorts/${id}`,
      `https://m.youtube.com/watch?v=${id}&t=30s`, `https://www.youtube-nocookie.com/embed/${id}`, id,
    ]) expect(youtubeId(u)).toBe(id);
  });
  it('refuse le reste', () => {
    expect(youtubeId('https://example.com/video')).toBeNull();
    expect(youtubeId('')).toBeNull();
    expect(youtubeId('<script>')).toBeNull();
  });
  it('recherche pré-remplie', () => {
    expect(searchUrl({ name: 'Presse à cuisses' })).toBe('https://www.youtube.com/results?search_query=Presse%20%C3%A0%20cuisses%20exercice%20technique');
  });
});
