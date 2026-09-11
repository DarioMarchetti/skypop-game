export const SCENE_KINDS = ['lava', 'sky', 'ocean', 'ice', 'vines'] as const;
export type SceneKind = typeof SCENE_KINDS[number];
export const SCENES: Record<SceneKind, {name:string; top:string; bottom:string; rim:string; underside:string; fall:string}> = {
  lava: {name:'岩浆',top:'#67545d',bottom:'#292631',rim:'#ff9b46',underside:'#211320',fall:'熔岩喷溅 · 火星与烟雾'},
  sky: {name:'高空',top:'#ffffff',bottom:'#98cce9',rim:'#d9f8ff',underside:'#678fb1',fall:'穿云坠落 · 云雾与风线'},
  ocean: {name:'大海',top:'#bdf5ff',bottom:'#49a7d2',rim:'#6eeaff',underside:'#000822',fall:'落水水花 · 扩散涟漪'},
  ice: {name:'冰块',top:'#e4ffff',bottom:'#7caedc',rim:'#c0edff',underside:'#355475',fall:'冰面碎裂 · 冰晶飞散'},
  vines: {name:'藤蔓',top:'#97cd72',bottom:'#326b4b',rim:'#bbef7b',underside:'#173c2c',fall:'藤条回弹 · 落叶纷飞'},
};
export function isScene(value: unknown): value is SceneKind {
  return typeof value === 'string' && (SCENE_KINDS as readonly string[]).includes(value);
}
/** Uniform first draw; later draw uniformly from the four other scenes. */
export function chooseScene(previous: SceneKind | null, random = Math.random): SceneKind {
  const candidates = SCENE_KINDS.filter(kind => kind !== previous);
  const sample = Math.max(0, Math.min(0.999999999, random()));
  return candidates[Math.floor(sample * candidates.length)];
}
