// Adapters: effects on SVG marks drawn by other libraries. Like the charts, they import only from core
// (and share the charts' SVG drawing layer) and never name an effect.

export { expressive } from "./expressive";
export { fromVegaView, type VegaAttachment, type VegaItem, type VegaMark, type VegaOptions, type VegaSample, type VegaViewLike } from "./vega";
export type { Attachment, ExpressiveOptions, HostMark, MarkSource } from "./types";
