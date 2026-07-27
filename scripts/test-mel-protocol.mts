/**
 * Mel JSON envelope protocol — parse, reject unknown keys, intent map, execute LOG/OPEN.
 * Run: node --experimental-strip-types --experimental-loader ./scripts/ts-extension-loader.mjs scripts/test-mel-protocol.mts
 */

const values = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, String(value)),
    removeItem: (key: string) => values.delete(key),
  },
  window: {
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  },
  CustomEvent: class CustomEvent {
    type: string;
    detail: unknown;
    constructor(type: string, init?: { detail?: unknown }) {
      this.type = type;
      this.detail = init?.detail;
    }
  },
});

const {
  parseMelEnvelope,
  intentToMelEnvelope,
  executeMelEnvelope,
  looksLikeMelEnvelope,
  rejectEnvelope,
} = await import("../src/melani/melProtocol.ts");

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failed += 1;
    console.error("FAIL:", msg);
  } else {
    console.log("ok:", msg);
  }
}

// Parse eggs LOG
const eggs = parseMelEnvelope(
  JSON.stringify({
    mode: "LIFE",
    action: "LOG",
    fields: {
      water_liters_today: null,
      food_event: "2 boiled eggs",
      bowel_movement: null,
    },
    chat_response: "Logged your meal: 2 boiled eggs.",
  })
);
assert(eggs.ok === true, "parse eggs LOG");
if (eggs.ok) {
  assert(eggs.envelope.fields.food_event === "2 boiled eggs", "food_event set");
}

// Open page
const open = parseMelEnvelope(
  `{"mode":"BUILD","action":"OPEN_PAGE","fields":{"page_name":"AM skincare"},"chat_response":"Opened AM skincare."}`
);
assert(open.ok === true, "parse OPEN_PAGE");

// CHAT yo
const yo = parseMelEnvelope(
  `{"mode":"CHAT","action":"RESPOND","fields":{},"chat_response":"Hey. Mel here."}`
);
assert(yo.ok === true && yo.ok && yo.envelope.mode === "CHAT", "parse CHAT");

// Reject unknown field
const bad = parseMelEnvelope(
  `{"mode":"LIFE","action":"LOG","fields":{"calories":100},"chat_response":"x"}`
);
assert(bad.ok === false, "reject unknown field calories");

// Reject bad mode
const badMode = parseMelEnvelope(
  `{"mode":"SLEEP","action":"LOG","fields":{},"chat_response":"x"}`
);
assert(badMode.ok === false, "reject bad mode");

// Fence extract
const fenced = parseMelEnvelope(
  "```json\n{\"mode\":\"CHAT\",\"action\":\"RESPOND\",\"fields\":{},\"chat_response\":\"Hi\"}\n```"
);
assert(fenced.ok === true, "parse fenced JSON");

// Intent NL
const intentFood = intentToMelEnvelope("i just ate 2 boiled eggs");
assert(intentFood?.mode === "LIFE" && intentFood.action === "LOG", "intent food");
assert(intentFood?.fields.food_event === "2 boiled eggs", "intent food text");

const intentMulti = intentToMelEnvelope("I drank 1L and ate beef");
assert(intentMulti?.mode === "LIFE" && intentMulti.action === "LOG", "intent multi life");
assert(intentMulti?.fields.water_add_liters === 1, "intent water add 1L");
assert(/beef/i.test(intentMulti?.fields.food_event || ""), "intent multi food");

const intentOpen = intentToMelEnvelope("open my AM skincare");
assert(intentOpen?.mode === "BUILD" && intentOpen.action === "OPEN_PAGE", "intent open");
assert(/am skincare/i.test(intentOpen?.fields.page_name || ""), "intent page name");

const intentCreate = intentToMelEnvelope("create a page called Neurotech Ideas under Learn");
assert(intentCreate?.mode === "BUILD" && intentCreate.action === "CREATE_PAGE", "intent create");
assert(intentCreate?.fields.page_title === "Neurotech Ideas", "create title");

const intentIdeas = intentToMelEnvelope("help me think of content ideas");
assert(intentIdeas?.mode === "IDEAS" && intentIdeas.action === "BRAINSTORM", "intent ideas");

const intentYo = intentToMelEnvelope("yo");
assert(intentYo?.mode === "CHAT" && intentYo.action === "RESPOND", "intent yo");

// Messy typos (ChatGPT-style tolerance)
const typoEggs = intentToMelEnvelope("i jus ate 2 boild eggs");
assert(typoEggs?.mode === "LIFE" && typoEggs.action === "LOG", "typo eggs route");
assert(/boiled eggs/i.test(typoEggs?.fields.food_event || ""), "typo eggs normalized");

const typoOpen = intentToMelEnvelope("opn am skncare");
assert(typoOpen?.mode === "BUILD" && typoOpen.action === "OPEN_PAGE", "typo open route");
assert(/am skincare/i.test(typoOpen?.fields.page_name || ""), "typo open → AM skincare");

const typoWater = intentToMelEnvelope("drnk 500ml watr");
assert(typoWater?.fields.water_add_liters === 0.5, "typo water 500ml");

const typoBro = intentToMelEnvelope("bro open meals");
assert(typoBro?.mode === "BUILD" && /meals/i.test(typoBro?.fields.page_name || ""), "bro open meals");

// Execute water absolute
const waterEnv = parseMelEnvelope(
  JSON.stringify({
    mode: "LIFE",
    action: "LOG",
    fields: { water_liters_today: 4.5, food_event: null, bowel_movement: null },
    chat_response: "Water set.",
  })
);
if (waterEnv.ok) {
  const exec = executeMelEnvelope(waterEnv.envelope);
  assert(exec.toolResults.some((t) => t.tool === "set_water_liters" && t.ok), "execute set water");
  assert(values.get("dr-melani-water-ml:" + new Date().toISOString().slice(0, 10)) === "4500" ||
    [...values.keys()].some((k) => k.startsWith("dr-melani-water-ml:") && values.get(k) === "4500"),
    "water storage 4500ml");
}

// Reject envelope message
if (!bad.ok) {
  const rej = rejectEnvelope(bad);
  assert(rej.rejected === true && rej.chat_response.includes("unknown"), "reject reask");
}

assert(looksLikeMelEnvelope(`{"mode":"CHAT","action":"RESPOND","fields":{}}`), "looksLike");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nAll melProtocol checks passed.");
