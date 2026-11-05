/** Cores da identidade dos eventos (fundo escuro, fundo médio, destaque). Usadas no banner automático e no email dos ingressos. */
export const PALETTES = [["#17120a", "#3b2c08", "#ffee8c"], ["#1a0c09", "#5b1d10", "#ffb877"], ["#0c0b14", "#2a2346", "#d6c9ff"], ["#0d1322", "#2f4170", "#ffe2a8"], ["#0f140c", "#33421f", "#eef3a2"]] as const;
export const paletteFor = (eventId: number) => PALETTES[eventId % PALETTES.length]!;
