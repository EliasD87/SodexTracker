/** One-line, timestamped logs; quiet enough to leave running. */

const stamp = () => new Date().toISOString().slice(11, 19);
const line = (level, area, msg) => console.log(`${stamp()} ${level.padEnd(5)} ${area.padEnd(8)} ${msg}`);

export const log = {
  info: (area, msg) => line("info", area, msg),
  warn: (area, msg) => line("WARN", area, msg),
  error: (area, msg) => line("ERROR", area, msg),
};
