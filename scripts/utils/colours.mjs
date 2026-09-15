const COLOURS = new Map();

export function getColour(name) {
  if (COLOURS.has(name)) return COLOURS.get(name);
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const fg = 90 + Math.abs(hash % 8); // 90-97 (bright)
  COLOURS.set(name, `\x1b[1;${fg}m`);
  return COLOURS.get(name);
}

export function coloured(tag) {
  const colour = getColour(tag);
  return `${colour}[${tag}]\x1b[0m`;
}
