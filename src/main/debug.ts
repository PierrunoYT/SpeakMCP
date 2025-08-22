export interface DebugFlags {
  llm: boolean
  tools: boolean
  keybinds: boolean
  tts: boolean
  all: boolean
}

const flags: DebugFlags = {
  llm: false,
  tools: false,
  keybinds: false,
  tts: false,
  all: false,
}

function strToBool(v: string | undefined): boolean {
  if (!v) return false
  const s = v.toLowerCase()
  return s === "1" || s === "true" || s === "yes" || s === "on"
}

export function initDebugFlags(argv: string[] = process.argv): DebugFlags {
  // CLI flags - support both long and short forms, with and without dashes
  const has = (name: string) => argv.includes(name)
  const hasAny = (...names: string[]) => names.some(name => argv.includes(name))

  const envDebug = (process.env.DEBUG || "").toLowerCase()
  const envParts = envDebug.split(/[,:\s]+/).filter(Boolean)

  const envLLM =
    strToBool(process.env.DEBUG_LLM) ||
    envParts.includes("llm") ||
    envDebug === "*" ||
    envDebug.includes("all")
  const envTools =
    strToBool(process.env.DEBUG_TOOLS) ||
    envParts.includes("tools") ||
    envDebug === "*" ||
    envDebug.includes("all")
  const envKeybinds =
    strToBool(process.env.DEBUG_KEYBINDS) ||
    envParts.includes("keybinds") ||
    envDebug === "*" ||
    envDebug.includes("all")
  const envTTS =
    strToBool(process.env.DEBUG_TTS) ||
    envParts.includes("tts") ||
    envDebug === "*" ||
    envDebug.includes("all")

  const all =
    hasAny("--debug", "--debug-all", "-d", "-da", "debug", "debug-all", "d", "da") ||
    envDebug === "*" ||
    envParts.includes("all")

  flags.llm = all || hasAny("--debug-llm", "-dl", "debug-llm", "dl") || envLLM
  flags.tools = all || hasAny("--debug-tools", "-dt", "debug-tools", "dt") || envTools
  flags.keybinds = all || hasAny("--debug-keybinds", "-dk", "debug-keybinds", "dk") || envKeybinds
  flags.tts = all || hasAny("--debug-tts", "-dts", "debug-tts", "dts") || envTTS
  flags.all = all

  // Force debug output to console for verification
  console.log("[DEBUG INIT] Debug flags initialized:", {
    llm: flags.llm,
    tools: flags.tools,
    keybinds: flags.keybinds,
    tts: flags.tts,
    all: flags.all,
    argv: argv.filter(a => a.startsWith('--debug') || a.startsWith('-d') || a.startsWith('debug') || a === 'd' || a === 'dt' || a === 'dl' || a === 'dk' || a === 'dts'),
    envDebug: process.env.DEBUG,
    envLLM: process.env.DEBUG_LLM,
    envTTS: process.env.DEBUG_TTS
  })

  if (flags.llm || flags.tools || flags.keybinds || flags.tts) {
    // Small banner so users can see debugs are enabled
    const enabled: string[] = []
    if (flags.llm) enabled.push("LLM")
    if (flags.tools) enabled.push("TOOLS")
    if (flags.keybinds) enabled.push("KEYBINDS")
    if (flags.tts) enabled.push("TTS")
    // eslint-disable-next-line no-console
    console.log(
      `[DEBUG] Enabled: ${enabled.join(", ")} (argv: ${argv.filter((a) => a.startsWith("--debug") || a.startsWith("-d") || a.startsWith("debug") || ["d", "dt", "dl", "dk", "dts", "da"].includes(a)).join(" ") || "none"})`,
    )
  }

  return { ...flags }
}

export function isDebugLLM(): boolean {
  return flags.llm || flags.all
}

export function isDebugTools(): boolean {
  return flags.tools || flags.all
}

export function isDebugKeybinds(): boolean {
  return flags.keybinds || flags.all
}

export function isDebugTTS(): boolean {
  return flags.tts || flags.all
}

function ts(): string {
  const d = new Date()
  return d.toISOString()
}

export function logLLM(...args: any[]) {
  if (!isDebugLLM()) return
  // eslint-disable-next-line no-console
  console.log(`[${ts()}] [DEBUG][LLM]`, ...args)
}

export function logTools(...args: any[]) {
  if (!isDebugTools()) return
  // eslint-disable-next-line no-console
  console.log(`[${ts()}] [DEBUG][TOOLS]`, ...args)
}

export function logKeybinds(...args: any[]) {
  if (!isDebugKeybinds()) return
  // eslint-disable-next-line no-console
  console.log(`[${ts()}] [DEBUG][KEYBINDS]`, ...args)
}

export function logTTS(...args: any[]) {
  if (!isDebugTTS()) return
  // eslint-disable-next-line no-console
  console.log(`[${ts()}] [DEBUG][TTS]`, ...args)
}

export function getDebugFlags(): DebugFlags {
  return { ...flags }
}
