// frontend/src/types/maplibre-gl-draw-compat.d.ts
import type { IControl } from "maplibre-gl";

declare module "@mapbox/mapbox-gl-draw" {
  // MapboxDraw は IControl を実装し、built-in modes を static に持つ
  export default class MapboxDraw implements IControl {
    constructor(options?: any);
    onAdd(map: any): HTMLElement;
    onRemove(map: any): void;

    // ★ これが無くて赤線になっていました
    static modes: any;

    // よく使う最低限のメソッドだけ型付け
    changeMode(mode: string, opts?: any): void;
    add(feature: any | any[]): string[]; // 返り値は feature id 配列
    deleteAll(): void;
    getSelected(): any;
  }
}
