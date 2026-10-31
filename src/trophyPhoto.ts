import data from "./data/trophy-images.json" with { type: "json" };

export type TrophyPhoto = { src: string; license: string; author: string; page: string; title?: string };
const images = (data as { images: Record<string, TrophyPhoto> }).images;

/** The photograph of a trophy, by its name, or null when there is no freely licensed one. */
export const trophyPhoto = (name: string): TrophyPhoto | null => images[name] ?? null;
/** Every photograph in use, for the credits. */
export const trophyPhotos = (): [string, TrophyPhoto][] => Object.entries(images);
