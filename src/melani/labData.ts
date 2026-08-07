/**
 * Real labs + practical blurbs for Melani's life:
 * gym, protein, water, migraines, med school, inventing, long-term clinic path.
 * Not textbook "crazy biology" walls.
 */

export type LabStatus = "ok" | "high" | "low";

export type LabItem = {
 id: string;
 short: string;
 /** Table name (e.g. "LDL Cholesterol") , defaults to id */
 displayName?: string;
 fullName: string;
 value: number | string;
 unit: string;
 status: LabStatus;
 normalRange: string;
 /** One short line in popup , defaults to first sentence of simple */
 oneLiner?: string;
 simple: string;
 testsFor: string;
 highMeans: string;
 lowMeans: string;
 date: string;
 lab: string;
};

export function labDisplayName(lab: LabItem): string {
 return lab.displayName || lab.id;
}

/** Full first sentence only , never mid-word “…” cutoffs */
export function labOneLiner(lab: LabItem): string {
 if (lab.oneLiner?.trim()) return lab.oneLiner.trim();
 const text = (lab.simple || "").trim();
 if (!text) return lab.testsFor || labDisplayName(lab);
 // Complete first sentence (ends at . ! or ?)
 const m = text.match(/^[\s\S]+?[.!?](?=\s|$)/);
 return (m ? m[0] : text).trim();
}

export type LabSectionDef = {
 id: string;
 label: string;
 blurb: string;
 itemIds: string[];
};

/** Status cards + results by section (scientific blurbs, no personal fluff) */
export const LAB_SECTIONS: LabSectionDef[] = [
  {
    id: "cholesterol",
    label: "Cholesterol",
    blurb:
      "Measures lipids carried in blood lipoproteins. LDL and related particles can deposit cholesterol in artery walls (atherosclerosis). HDL helps return cholesterol to the liver for disposal. Triglycerides are fat used for energy storage and rise with excess carbohydrate or alcohol. Total cholesterol and non HDL summarize the load of atherogenic particles. Ratios put LDL rich fractions in context of HDL. Read as a system of lipid transport and vascular risk, not one isolated number.",
    itemIds: [
      "LDL Cholesterol",
      "HDL Cholesterol",
      "Triglycerides",
      "Total Cholesterol",
      "Non-HDL Cholesterol",
      "Chol/HDL Ratio",
    ],
  },
  {
    id: "blood_sugar",
    label: "Blood Sugar",
    blurb:
      "Measures glucose handling. Fasting glucose is a snapshot of blood sugar at one moment. Hemoglobin A1c is glucose stuck to hemoglobin and averages sugar exposure over roughly three months (red cell lifespan). Together they show short term fuel level and longer term glycemic control, which matter for energy, nerves, vessels, and metabolic disease risk.",
    itemIds: ["Glucose", "Hemoglobin A1c"],
  },
  {
    id: "blood_cells",
    label: "Blood Cells",
    blurb:
      "The complete blood count (CBC). Red cells and hemoglobin carry oxygen from lungs to tissues. Hematocrit is the fraction of blood volume that is red cells. Indices (MCV, MCH, RDW) describe red cell size and hemoglobin content and help classify anemia types. White cells and their subtypes defend against infection and inflammation. Platelets start clotting at vessel injury. This panel maps oxygen delivery, immune readiness, and clotting capacity.",
    itemIds: [
      "WBC",
      "RBC",
      "HGB",
      "HCT",
      "MCV",
      "MCH",
      "MCHC",
      "PLT",
      "RDW",
      "MPV",
      "Segmented Neutrophils",
      "Absolute Neutrophils",
      "Lymphocytes",
      "Absolute Lymphocytes",
      "Monocytes",
      "Absolute Monocytes",
      "Eosinophils",
      "Absolute Eosinophils",
      "Basophils",
      "Absolute Basophils",
    ],
  },
  {
    id: "liver",
    label: "Liver",
    blurb:
      "Markers of liver cell integrity, bile flow, protein synthesis, and heme waste handling. ALT and AST are enzymes that leak when hepatocytes are stressed. ALP rises with bile duct or bone turnover. Albumin and total protein reflect what the liver builds and what circulates. Bilirubin is the yellow product of hemoglobin breakdown processed by the liver into bile. Read as a map of liver work and injury, not a single pass/fail.",
    itemIds: [
      "ALT",
      "AST",
      "ALP",
      "Albumin",
      "Total Protein",
      "Total Bilirubin",
    ],
  },
  {
    id: "kidney",
    label: "Kidney",
    blurb:
      "How well the kidneys filter blood. Creatinine is a muscle waste product cleared by the glomerulus; higher levels mean lower filtration (or higher muscle/creatine context). BUN is nitrogen waste from protein metabolism and also rises with low flow or dehydration. eGFR estimates milliliters of blood cleaned per minute from creatinine, age, and sex equations. This panel is renal filtration and waste clearance, always read with volume status.",
    itemIds: ["Creatinine", "BUN", "GFR"],
  },
  {
    id: "electrolytes",
    label: "Electrolytes & Minerals",
    blurb:
      "Measures the main charged ions in blood serum: sodium (Na⁺), potassium (K⁺), chloride (Cl⁻), bicarbonate/CO₂ (acid base buffer), and calcium (Ca²⁺). These ions set the electrical gradient across cell membranes, so they control nerve firing, muscle contraction (including the heart), and how water moves between blood and tissues (osmolarity). Sodium is the main extracellular cation and tracks free water balance. Potassium is the main intracellular cation and is tightly regulated for cardiac rhythm. Chloride moves with sodium for electroneutrality. CO₂/bicarbonate reflects metabolic acid base status. Calcium is required for excitation contraction coupling and is controlled by PTH and vitamin D. The panel is a snapshot of fluid, electrical, and acid base homeostasis, not a single hydration score. Interpret each value against its reference range and the rest of the metabolic panel (kidney, albumin).",
    itemIds: ["Sodium", "Potassium", "Chloride", "CO2", "Calcium"],
  },
  {
    id: "thyroid",
    label: "Thyroid",
    blurb:
      "TSH (thyroid stimulating hormone) is the pituitary signal that tells the thyroid to make T4/T3. High TSH usually means the thyroid is underproducing (body asking for more hormone). Low TSH usually means excess thyroid hormone or exogenous thyroid meds (body asking for less). Thyroid hormones set basal metabolic rate, heart rate, temperature, and influence cycle, mood, and lipids. TSH is the screening gate for thyroid axis tone.",
    itemIds: ["TSH"],
  },
];

export function labById(id: string): LabItem | undefined {
 return LAB_ITEMS.find((l) => l.id === id);
}

export function sectionStatus(items: LabItem[]): LabStatus {
 if (items.some((i) => i.status === "high")) return "high";
 if (items.some((i) => i.status === "low")) return "low";
 return "ok";
}

export function formatLabDate(iso: string): string {
 const [y, m, d] = iso.split("-");
 if (!y || !m || !d) return iso;
 return `${m}/${d}/${y}`;
}

export function statusLabel(s: LabStatus): string {
 if (s === "ok") return "OK";
 if (s === "high") return "HIGH";
 return "LOW";
}

/** Short one-line status strip (never wraps into a pep talk) */
export function footerForLab(lab: LabItem): string {
 if (lab.status === "high") return "Above range.";
 if (lab.status === "low") return "Below range.";
 return "In range.";
}

export const LAB_ITEMS: LabItem[] = [
 {
 "id": "LDL Cholesterol",
 "short": "LDL",
 "displayName": "LDL Cholesterol",
 "fullName": "LDL Cholesterol",
 "value": 120,
 "unit": "mg/dL",
 "status": "high",
 "normalRange": "<110 calc",
 "oneLiner": "Main 'bad' cholesterol number on your prevention board.",
 "simple": "LDL is the cholesterol particle doctors watch most for long-term artery plaque. Your result was HIGH (120 vs a tighter young-adult prevention goal under ~110). For you this is not abstract biology. It is the number that decides how hard you push fiber, training, and what you ask Dr. Ververis about rechecks. You are building a body and a clinic career for decades. LDL is early warning, not a personality score.",
 "testsFor": "Long-term heart and artery risk, and whether food + training are enough or you need a clinician plan.",
 "highMeans": "Your 120 is flagged HIGH. Common levers you already control: more daily fiber (goal 30g), less liquid sugar, consistent lifting and walks, solid sleep. Genetics can still push it. Ask Ververis for target and recheck timing. Do not panic-cut protein. Keep the 150g goal.",
 "lowMeans": "Lower LDL is usually better for arteries. Too-low from extreme restriction is rare at your age.",
 "date": "2026-03-26",
 "lab": "Quest Diagnostics-West Hills"
 },
 {
 "id": "Total Cholesterol",
 "short": "TC",
 "fullName": "Total cholesterol",
 "value": 207,
 "unit": "mg/dL",
 "status": "high",
 "normalRange": "Often goal under ~170 mg/dL for younger people focused on prevention",
 "oneLiner": "All cholesterol added up. Useful overview, not the only number.",
 "simple": "Total cholesterol stacks LDL + HDL + other particles into one snapshot. Yours is HIGH at 207. It confirms the lipid panel needs attention, but the action plan still lives in LDL, non-HDL, triglycerides, and HDL separately. Treat this as the headline, not the full story.",
 "testsFor": "Overall lipid load and whether the panel as a whole is drifting the wrong way for a young woman planning a long career in medicine and building.",
 "highMeans": "207 is elevated. Pair it with LDL 120 and non-HDL 143. Focus on fiber, training consistency, and fewer liquid calories. Bring the full panel to clinic, not just this one number.",
 "lowMeans": "Usually fine. Extremely low totals are uncommon without illness or meds.",
 "date": "2026-03-26",
 "lab": "Quest Diagnostics-West Hills"
 },
 {
 "id": "Triglycerides",
 "short": "TG",
 "fullName": "Triglycerides",
 "value": 119,
 "unit": "mg/dL",
 "status": "high",
 "normalRange": "Goal often under 90-150 mg/dL fasting (stricter goals for prevention)",
 "oneLiner": "Blood fat that spikes with sugar, alcohol, and under-moving.",
 "simple": "Triglycerides rise when leftover sugar and calories get packaged as blood fat. Yours is HIGH at 119 (stricter prevention goals often want under ~90 to 100 fasting). This number is highly lifestyle-responsive for someone who lifts, tracks macros, and can cut liquid sugar fast.",
 "testsFor": "How your body handles carbs and meal patterns, metabolic risk, and whether training + food quality are on track.",
 "highMeans": "119 is a fixable flag. Highest leverage moves: kill sugary drinks, keep protein high so you do not graze junk, train (even walks on rest days), and recheck fasting. Alcohol spikes this hard if you drink.",
 "lowMeans": "Usually healthy. Means circulating meal-fat load is controlled.",
 "date": "2026-03-26",
 "lab": "Quest Diagnostics-West Hills"
 },
 {
 "id": "Non-HDL Cholesterol",
 "short": "Non-HDL",
 "fullName": "Non-HDL cholesterol",
 "value": 143,
 "unit": "mg/dL",
 "status": "high",
 "normalRange": "Goal often under 120 mg/dL (or ~30 above your LDL goal)",
 "oneLiner": "All the plaque-prone cholesterol, not just LDL.",
 "simple": "Non-HDL is total cholesterol minus HDL. Cardiologists like it because it catches all the riskier particles. Yours is HIGH at 143 (many prevention goals want under ~120). If LDL is the headline, non-HDL is the full risk pool.",
 "testsFor": "Fuller artery-risk picture than LDL alone. Good tracking number as you change food and training.",
 "highMeans": "143 means the whole 'bad traffic' pool is elevated. Improving triglycerides and LDL together usually drops this. Keep fiber and training. Ask clinic for your personal target.",
 "lowMeans": "Smaller plaque-prone pool. Good direction for long-term prevention.",
 "date": "2026-03-26",
 "lab": "Quest Diagnostics-West Hills"
 },
 {
 "id": "HDL Cholesterol",
 "short": "HDL",
 "fullName": "HDL , high-density lipoprotein (“good” cholesterol)",
 "value": 64,
 "unit": "mg/dL",
 "status": "ok",
 "normalRange": "Goal often above ~45-50 mg/dL for women",
 "oneLiner": "Protective cholesterol. Yours is in a solid range.",
 "simple": "HDL is the cleaner-upper side of the lipid panel. Yours is OK at 64, which is a strength on a panel that otherwise has high LDL and non-HDL. Training (especially consistent gym) and not smoking support HDL more than fancy supplements.",
 "testsFor": "Protective capacity on the lipid board and balance against high LDL.",
 "highMeans": "Often protective. Extremely high is rarely a problem by itself.",
 "lowMeans": "Less protective buffer. Exercise and overall metabolic health usually help more than 'HDL pills'.",
 "date": "2026-03-26",
 "lab": "Quest Diagnostics-West Hills"
 },
 {
 "id": "Hemoglobin A1c",
 "short": "A1c",
 "fullName": "Hemoglobin A1c (glycated hemoglobin)",
 "value": 5.3,
 "unit": "%",
 "status": "ok",
 "normalRange": "Under 5.7% is typical normal (lab cutoffs vary slightly)",
 "oneLiner": "3-month blood sugar average. Yours is solidly normal.",
 "simple": "A1c shows how high your blood sugar has been running over about 3 months. Your 5.3% is OK and well under prediabetes cutoffs. For med school + inventing + training, this means your fuel system is not silently running hot. Keep it that way with protein-first meals and fewer liquid sugars.",
 "testsFor": "Long-term sugar control and diabetes screening. Better than one random finger stick.",
 "highMeans": "5.7 to 6.4 is prediabetes range. 6.5+ often diabetes. Would mean months of elevated sugar, not one bad meal.",
 "lowMeans": "Your 5.3 is healthy. Extremely low with diabetes meds can mean too many lows. You are not on that path.",
 "date": "2026-03-26",
 "lab": "Quest Diagnostics-West Hills"
 },
 {
 "id": "TSH",
 "short": "TSH",
 "fullName": "TSH , thyroid-stimulating hormone",
 "value": 1.06,
 "unit": "mIU/L",
 "status": "ok",
 "normalRange": "About 0.5-4.3 mIU/L (lab- and age-specific)",
 "oneLiner": "Thyroid pace signal. Yours is comfortably normal.",
 "simple": "TSH is the brain's volume knob for the thyroid. Thyroid sets energy, temperature, cycle, and how heavy training feels. Your 1.06 is OK. If you ever get unexplained fatigue, cold intolerance, or cycle chaos with good sleep and food, this is one of the first panels to revisit.",
 "testsFor": "Whether metabolism is running slow or fast, and whether energy issues need a thyroid lens.",
 "highMeans": "Possible underactive pattern: fatigue, cold, weight up, heavier periods. Needs free T4/T3 and clinic context.",
 "lowMeans": "Possible overactive pattern: anxiety, racing heart, weight down. Your value is normal, not low.",
 "date": "2026-04-07",
 "lab": "Quest Diagnostics-West Hills"
 },
 {
 "id": "WBC",
 "short": "WBC",
 "fullName": "WBC , white blood cells (leukocytes)",
 "value": 7.5,
 "unit": "10^3/uL",
 "status": "ok",
 "normalRange": "About 4.1-10.9 ×10³/µL (lab-specific)",
 "oneLiner": "Immune cell count. Yours sits mid-normal.",
 "simple": "White cells rise with infection, stress, or steroids and fall with some viruses or meds. For you, a normal WBC means no obvious immune alarm on that draw. If you are sick, overtrained, or on a brutal school week, interpret with symptoms, not the number alone.",
 "testsFor": "Infection, inflammation, stress response, marrow health.",
 "highMeans": "Common with infection, hard stress, smoking, or steroids. Check how you felt that day.",
 "lowMeans": "Can follow viruses or meds. Mild dips often recover. Recurring lows need clinic follow-up.",
 "date": "2026-04-06",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "RBC",
 "short": "RBC",
 "fullName": "RBC , red blood cells (erythrocytes)",
 "value": 4.63,
 "unit": "10^6/uL",
 "status": "ok",
 "normalRange": "About 3.8-5.2 ×10⁶/µL for many young women",
 "oneLiner": "Red cell count for oxygen delivery.",
 "simple": "Red cells carry oxygen to brain and muscle. Low patterns feel like gym fatigue, stairs that suck, and brain fog. Periods + hard training make this worth watching over time even when the number is OK.",
 "testsFor": "Anemia risk, oxygen capacity, hydration concentration effects.",
 "highMeans": "Can be dehydration, altitude, smoking, or rare marrow issues. Recheck hydration first.",
 "lowMeans": "Anemia pattern: less oxygen delivery. Fatigue and poor training progress are classic.",
 "date": "2026-04-06",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "HGB",
 "short": "HGB",
 "fullName": "Hemoglobin",
 "value": 12.6,
 "unit": "g/dL",
 "status": "ok",
 "normalRange": "About 11.7-15.7 g/dL (female ranges)",
 "oneLiner": "Hemoglobin: oxygen cargo in red cells.",
 "simple": "Hemoglobin is the oxygen-binding protein. Low hemoglobin is the fatigue lab athletes and students feel. With monthly blood loss and lifting, this is a core energy marker, not trivia.",
 "testsFor": "Anemia and oxygen-carrying capacity for training and focus.",
 "highMeans": "Can track dehydration or high altitude. Rarely a primary goal to raise.",
 "lowMeans": "Classic anemia signal. Iron workup often next if periods are heavy or diet is light on iron.",
 "date": "2026-04-06",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "HCT",
 "short": "HCT",
 "fullName": "Hematocrit",
 "value": 38,
 "unit": "%",
 "status": "ok",
 "normalRange": "About 34.9-46.9%",
 "oneLiner": "Percent of blood that is red cells.",
 "simple": "Hematocrit moves with hemoglobin and hydration. A 'high' on a dry day can be concentrated blood, not superpowers. Read with water intake (you aim for 4L).",
 "testsFor": "Oxygen capacity and hydration context with the rest of the CBC.",
 "highMeans": "Often dehydration first. Recheck after normal fluids.",
 "lowMeans": "Goes with anemia patterns. Energy and training quality can drop.",
 "date": "2026-04-06",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "PLT",
 "short": "PLT",
 "fullName": "Platelets (thrombocytes)",
 "value": 223,
 "unit": "10^3/uL",
 "status": "ok",
 "normalRange": "About 150-400 ×10³/µL",
 "oneLiner": "Platelets: clotting helpers.",
 "simple": "Platelets help stop bleeding. Extreme lows matter for surgery or injury risk. Mild swings are common. Not a day-to-day training number unless flagged hard.",
 "testsFor": "Clotting readiness and marrow health.",
 "highMeans": "Can follow inflammation, iron deficiency, or stress. Context matters.",
 "lowMeans": "Bleeding risk if truly low. Avoid assuming a mild lab blip is danger.",
 "date": "2026-04-06",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "Albumin",
 "short": "Albumin",
 "fullName": "Albumin",
 "value": 4.8,
 "unit": "g/dL",
 "status": "ok",
 "normalRange": "About 3.5-5.2 g/dL",
 "oneLiner": "Main blood protein from the liver.",
 "simple": "Albumin reflects liver production, nutrition, and inflammation. For a high-protein trainer who eats, it is usually stable. Drops matter with illness or under-fueling.",
 "testsFor": "Protein status and liver synthetic function.",
 "highMeans": "Often dehydration concentrating blood.",
 "lowMeans": "Can mean inflammation, under-fueling, or liver issues. Pair with symptoms.",
 "date": "2026-03-25",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "ALT",
 "short": "ALT",
 "fullName": "ALT , alanine aminotransferase",
 "value": 14,
 "unit": "U/L",
 "status": "ok",
 "normalRange": "About 0-35 U/L (female; labs vary)",
 "oneLiner": "Liver enzyme that rises when liver cells are stressed.",
 "simple": "ALT is a liver stress flag. Hard training, illness, meds, alcohol, and fat in the liver can all bump it. One mild bump after a brutal week is different from a rising trend.",
 "testsFor": "Liver cell stress while you train, supplement, and live at high pace.",
 "highMeans": "Look at training day, meds, alcohol, illness. Recheck before assuming disease.",
 "lowMeans": "Usually fine.",
 "date": "2026-03-25",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "ALP",
 "short": "ALP",
 "fullName": "ALP , alkaline phosphatase",
 "value": 66,
 "unit": "U/L",
 "status": "ok",
 "normalRange": "About 35-105 U/L (age matters , higher in growing bones)",
 "oneLiner": "Enzyme linked to liver/bile flow and bone turnover.",
 "simple": "ALP has liver and bone sources. Mild changes need context (growth, bone, bile). Not a daily dashboard number for your OS.",
 "testsFor": "Bile flow or bone turnover clues with the rest of the liver panel.",
 "highMeans": "Needs pattern with other liver tests. Not a solo panic button.",
 "lowMeans": "Sometimes nutrition context. Rarely urgent alone.",
 "date": "2026-03-25",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "AST",
 "short": "AST",
 "fullName": "AST , aspartate aminotransferase",
 "value": 22,
 "unit": "U/L",
 "status": "ok",
 "normalRange": "About 0-32 U/L (female; labs vary)",
 "oneLiner": "Enzyme from liver and muscle.",
 "simple": "AST rises with liver stress and also with muscle damage after hard lifts. If you drew blood after a heavy session, AST can look 'scary' for boring reasons.",
 "testsFor": "Liver vs training stress. Always ask: when did I last lift hard?",
 "highMeans": "Could be muscle from gym, not only liver. Time the recheck away from max lower days.",
 "lowMeans": "Usually fine.",
 "date": "2026-03-25",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "Glucose",
 "short": "Glucose",
 "fullName": "Blood glucose (sugar)",
 "value": 89,
 "unit": "mg/dL",
 "status": "ok",
 "normalRange": "About 70-99 mg/dL fasting",
 "oneLiner": "Right-now blood sugar (best read fasting).",
 "simple": "Glucose is the instant fuel reading. Brain work, lifts, and migraines all care about stable fuel. A single high can be non-fasting, stress, or a sugary morning. Trends matter more than one spike.",
 "testsFor": "Current sugar handling and whether meals or fasting state need context.",
 "highMeans": "Could be non-fasting, stress, illness, or true sugar dysregulation. Recheck fasting before you rewrite your whole diet.",
 "lowMeans": "Can mean long fasting, meds, or overshoot after a spike. Pair with symptoms (shaky, sweaty, foggy).",
 "date": "2026-04-06",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "Creatinine",
 "short": "Creatinine",
 "fullName": "Creatinine",
 "value": 0.7,
 "unit": "mg/dL",
 "status": "ok",
 "normalRange": "About 0.51-0.95 mg/dL (typical young female range)",
 "oneLiner": "Muscle waste filtered by kidneys (creatine and muscle can raise it).",
 "simple": "Creatinine comes from muscle metabolism and is cleared by kidneys. Creatine monohydrate and higher muscle can nudge it up without 'kidney disease.' Always read with GFR, water, and whether you take creatine.",
 "testsFor": "Kidney filter context, adjusted for athlete/creatine life.",
 "highMeans": "Could be true kidney stress, dehydration, or creatine + muscle. Recheck hydrated, tell clinic you use creatine.",
 "lowMeans": "Often fine. Low muscle mass can lower it.",
 "date": "2026-04-06",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "BUN",
 "short": "BUN",
 "fullName": "BUN , blood urea nitrogen",
 "value": 15,
 "unit": "mg/dL",
 "status": "ok",
 "normalRange": "About 6-20 mg/dL",
 "oneLiner": "Protein waste handled by liver and kidneys.",
 "simple": "BUN moves with protein intake, hydration, and kidney handling. High protein days and low water can raise it. You eat for 150g protein, so interpret with water logs.",
 "testsFor": "Hydration and kidney handling of protein load.",
 "highMeans": "Often dehydration or high protein intake. Drink and recheck before spiraling.",
 "lowMeans": "Can reflect low protein intake or overhydration. Rarely urgent alone.",
 "date": "2026-04-06",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "GFR",
 "short": "GFR",
 "fullName": "eGFR , estimated glomerular filtration rate",
 "value": 104.35,
 "unit": "mL/min/1.73m2",
 "status": "ok",
 "normalRange": "90+ mL/min/1.73m² is typical normal",
 "oneLiner": "Estimated kidney filter speed.",
 "simple": "eGFR estimates how hard kidneys are filtering. Muscle and creatinine quirks can skew it. Big picture with creatinine and symptoms.",
 "testsFor": "Kidney function estimate for prevention tracking.",
 "highMeans": "High eGFR is usually not a problem.",
 "lowMeans": "Lower filter estimate. Needs clinic context, meds list, and hydration story.",
 "date": "2026-03-25",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "Sodium",
 "short": "Sodium",
 "fullName": "Sodium (Na⁺)",
 "value": 140,
 "unit": "mmol/L",
 "status": "ok",
 "normalRange": "About 136-145 mmol/L",
 "oneLiner": "Main blood salt. Hydration and nerve signals.",
 "simple": "Sodium is the main extracellular cation. Serum Na reflects free-water balance relative to sodium content (not total body salt alone). High intake of free water, losses (sweat, GI, renal), or ADH effects can shift it. Always read with clinical context and other electrolytes.",
 "testsFor": "Hydration and electrolyte balance.",
 "highMeans": "Often relative water deficit. Check fluids and illness.",
 "lowMeans": "Can follow excess water, losses, or meds. Pair with symptoms (headache, confusion rare but serious).",
 "date": "2026-04-06",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "Potassium",
 "short": "Potassium",
 "fullName": "Potassium (K⁺)",
 "value": 4.4,
 "unit": "mmol/L",
 "status": "ok",
 "normalRange": "About 3.4-5.2 mmol/L",
 "oneLiner": "Key for heart rhythm, cramps, and muscle.",
 "simple": "Potassium is a training and heart-rhythm electrolyte. Low can mean cramps and weakness. High is uncommon from food alone if kidneys work.",
 "testsFor": "Muscle function and cardiac electrolyte safety.",
 "highMeans": "Needs prompt clinical context. Do not self-correct with random supplements.",
 "lowMeans": "Cramps, weakness, extra ectopy risk. Food sources and clinic guidance if recurrent.",
 "date": "2026-04-06",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "Chloride",
 "short": "Chloride",
 "fullName": "Chloride (Cl⁻)",
 "value": 104,
 "unit": "mmol/L",
 "status": "ok",
 "normalRange": "About 98-107 mmol/L",
 "oneLiner": "Partner electrolyte with sodium.",
 "simple": "Moves with sodium and acid-base balance. Rarely the star of the show.",
 "testsFor": "Electrolyte panel completeness.",
 "highMeans": "Interpret with sodium and bicarbonate.",
 "lowMeans": "Interpret with the full electrolyte set.",
 "date": "2026-04-06",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "CO2",
 "short": "CO2",
 "fullName": "CO₂ (bicarbonate) on a chemistry panel",
 "value": 24,
 "unit": "mmol/L",
 "status": "ok",
 "normalRange": "About 22-29 mmol/L",
 "oneLiner": "Bicarbonate buffer for blood acid-base.",
 "simple": "CO2 on a basic panel is mostly bicarbonate, your acid-base buffer. Useful if very off. Mild shifts need full context.",
 "testsFor": "Acid-base balance with electrolytes.",
 "highMeans": "Can reflect compensation patterns. Clinic interprets with the set.",
 "lowMeans": "Can reflect losses or acid load. Not a DIY fix.",
 "date": "2026-04-06",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "Calcium",
 "short": "Calcium",
 "fullName": "Calcium (total)",
 "value": 9.6,
 "unit": "mg/dL",
 "status": "ok",
 "normalRange": "About 8.8-10.2 mg/dL",
 "oneLiner": "Bone, nerve, and muscle mineral in blood.",
 "simple": "Blood calcium is tightly regulated. It is not the same as 'bone calcium from food' in a simple way. Abnormal values need albumin context and clinic review.",
 "testsFor": "Nerve/muscle signaling and calcium regulation.",
 "highMeans": "Needs proper workup. Do not ignore persistent highs.",
 "lowMeans": "Can cause cramps/tingling if truly low. Check albumin-corrected values with clinician.",
 "date": "2026-04-06",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "Total Protein",
 "short": "T.Protein",
 "fullName": "Total protein",
 "value": 7.9,
 "unit": "g/dL",
 "status": "ok",
 "normalRange": "About 6.4-8.3 g/dL",
 "oneLiner": "Albumin plus other blood proteins.",
 "simple": "Broad protein snapshot. Useful with albumin, not alone.",
 "testsFor": "Overall protein balance and immune/protein mix.",
 "highMeans": "Can be dehydration or immune protein rise.",
 "lowMeans": "Can track under-fueling or losses. Check diet first.",
 "date": "2026-03-25",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "Total Bilirubin",
 "short": "Bili",
 "fullName": "Total bilirubin",
 "value": 0.7,
 "unit": "mg/dL",
 "status": "ok",
 "normalRange": "About 0.0-1.0 mg/dL",
 "oneLiner": "Yellow pigment made when hemoglobin from old red blood cells is broken down.",
 "simple": "Bilirubin is a yellow chemical pigment. When red blood cells finish their ~120-day life, hemoglobin is split: iron is recycled, and the heme ring is converted into unconjugated (indirect) bilirubin. That form is not water-soluble, so it rides on albumin in the blood to the liver. Liver cells then conjugate it (attach glucuronic acid), making conjugated (direct) bilirubin water-soluble so it can enter bile, leave through the intestines, and leave the body in stool (that brown color is partly from bilirubin breakdown products). A little is also cleared by the kidneys in urine. “Total bilirubin” on a standard lab is the sum of unconjugated + conjugated. It is not a toxin score by itself; it is a checkpoint on the pipeline: red-cell turnover → blood transport → liver processing → bile exit. If any step speeds up (more cells dying) or bottlenecks (liver injury, bile duct blockage, enzyme quirks like Gilbert’s), total bilirubin can rise and, if high enough, skin or eyes can look yellow (jaundice).",
 "testsFor": "Whether the heme-to-bile disposal path is working: red-cell breakdown rate, liver conjugation, and bile flow. Often read with ALT, AST, ALP, and sometimes direct/indirect split.",
 "highMeans": "Too much production (hemolysis / more red-cell breakdown), slower liver conjugation, blocked bile flow, or a mix. Mild isolated bumps can be benign (e.g. Gilbert’s, fasting, hard training sometimes). Rising bilirubin with high ALT/AST or ALP, dark urine, pale stools, itching, or true jaundice needs a clinician, not guesswork.",
 "lowMeans": "Usually not a problem. Labs rarely chase low total bilirubin alone.",
 "date": "2026-03-25",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "MCV",
 "short": "MCV",
 "fullName": "MCV , mean corpuscular volume",
 "value": 82.1,
 "unit": "fL",
 "status": "ok",
 "normalRange": "About 80-100 fL",
 "oneLiner": "Average red-cell size (iron vs B12 pattern clue).",
 "simple": "MCV helps sort anemia types. Small cells often iron issues. Large cells often B12/folate. Useful if hemoglobin drops later.",
 "testsFor": "Anemia type clues when energy tanks.",
 "highMeans": "Can point toward B12/folate issues or other causes. Needs full picture.",
 "lowMeans": "Often iron-related when paired with low hemoglobin.",
 "date": "2026-04-06",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "MCH",
 "short": "MCH",
 "fullName": "MCH , mean corpuscular hemoglobin",
 "value": 27.2,
 "unit": "pg",
 "status": "ok",
 "normalRange": "About 26-34 pg",
 "oneLiner": "Average hemoglobin per red cell.",
 "simple": "Travels with MCV for anemia typing. Not a solo decision number.",
 "testsFor": "Supports iron vs other anemia patterns.",
 "highMeans": "Interpret with MCV and hemoglobin.",
 "lowMeans": "Often with iron-type patterns.",
 "date": "2026-04-06",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "MCHC",
 "short": "MCHC",
 "fullName": "MCHC , mean corpuscular hemoglobin concentration",
 "value": 33.2,
 "unit": "g/dL",
 "status": "ok",
 "normalRange": "About 31-37 g/dL",
 "oneLiner": "Hemoglobin concentration inside red cells.",
 "simple": "Another CBC detail for anemia characterization. Action lives in hemoglobin + iron studies if low energy persists.",
 "testsFor": "Anemia characterization.",
 "highMeans": "Uncommon. Lab artifact possible.",
 "lowMeans": "Can accompany iron deficiency patterns.",
 "date": "2026-04-06",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "RDW",
 "short": "RDW",
 "fullName": "RDW , red cell distribution width",
 "value": 13.2,
 "unit": "%",
 "status": "ok",
 "normalRange": "About 11.5-14.3%",
 "oneLiner": "How mixed red-cell sizes are.",
 "simple": "High RDW means mixed cell sizes, often early iron change or recovery. Pair with hemoglobin and ferritin if fatigue is real.",
 "testsFor": "Early red-cell stress or mixed anemia clues.",
 "highMeans": "Can show mixed generations of red cells. Follow with iron/B12 context if tired.",
 "lowMeans": "Usually fine.",
 "date": "2026-04-06",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "MPV",
 "short": "MPV",
 "fullName": "MPV , mean platelet volume",
 "value": 10.7,
 "unit": "fL",
 "status": "ok",
 "normalRange": "About 9.2-12.7 fL",
 "oneLiner": "Average platelet size.",
 "simple": "Bigger platelets are often younger. Mostly useful if platelets are abnormal.",
 "testsFor": "Platelet production context.",
 "highMeans": "Can mean more young platelets. Context with platelet count.",
 "lowMeans": "Usually minor alone.",
 "date": "2026-04-06",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "Segmented Neutrophils",
 "short": "Neut%",
 "fullName": "Neutrophils (%)",
 "value": 71,
 "unit": "%",
 "status": "ok",
 "normalRange": "Often ~40-70% of WBCs",
 "oneLiner": "Percent of white cells that are bacterial first-responders.",
 "simple": "Neutrophil percent shifts with acute stress or infection. Read with absolute neutrophils, not alone.",
 "testsFor": "Acute immune pattern.",
 "highMeans": "Stress, infection, or steroids common.",
 "lowMeans": "Can follow viruses. Watch absolute count.",
 "date": "2026-04-06",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "Absolute Neutrophils",
 "short": "ANC",
 "fullName": "Absolute neutrophil count",
 "value": 5.3,
 "unit": "10^3/uL",
 "status": "ok",
 "normalRange": "About 1.9-8.6 ×10³/µL",
 "oneLiner": "Actual neutrophil count.",
 "simple": "The real neutrophil number. Better than percent for 'is my bacterial defense low.'",
 "testsFor": "Bacterial defense capacity.",
 "highMeans": "Infection/stress pattern.",
 "lowMeans": "If truly low, infection risk rises. Clinic if persistent.",
 "date": "2026-04-06",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "Lymphocytes",
 "short": "Lymph%",
 "fullName": "Lymphocytes (%)",
 "value": 24,
 "unit": "%",
 "status": "ok",
 "normalRange": "Often ~20-40% of WBCs",
 "oneLiner": "Percent of viral/immune-memory white cells.",
 "simple": "Lymphocyte percent often rises in viral recovery patterns. Use absolute lymphocytes for decisions.",
 "testsFor": "Viral/immune pattern.",
 "highMeans": "Often viral recovery or reactive.",
 "lowMeans": "Stress or other causes. Check absolute.",
 "date": "2026-04-06",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "Absolute Lymphocytes",
 "short": "ALC",
 "fullName": "Absolute lymphocyte count",
 "value": 1.8,
 "unit": "10^3/uL",
 "status": "ok",
 "normalRange": "About 0.5-4.4 ×10³/µL",
 "oneLiner": "Actual lymphocyte count.",
 "simple": "True lymphocyte number for immune memory context.",
 "testsFor": "Immune lymphocyte pool.",
 "highMeans": "Reactive or viral patterns common.",
 "lowMeans": "Can be stress or illness recovery.",
 "date": "2026-04-06",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "Monocytes",
 "short": "Mono%",
 "fullName": "Monocytes (%)",
 "value": 5,
 "unit": "%",
 "status": "ok",
 "normalRange": "Often ~2-10%",
 "oneLiner": "Cleanup white cell percent.",
 "simple": "Monocytes handle cleanup and chronic inflammation signals. Mild shifts are common.",
 "testsFor": "Inflammation/cleanup pattern.",
 "highMeans": "Recovery or inflammation context.",
 "lowMeans": "Usually minor alone.",
 "date": "2026-04-06",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "Absolute Monocytes",
 "short": "AMC",
 "fullName": "Absolute monocyte count",
 "value": 0.4,
 "unit": "10^3/uL",
 "status": "ok",
 "normalRange": "About 0.1-1.0 ×10³/µL",
 "oneLiner": "Actual monocyte count.",
 "simple": "Absolute monocyte level for inflammation context.",
 "testsFor": "Cleanup cell pool.",
 "highMeans": "Can track recovery/inflammation.",
 "lowMeans": "Usually minor.",
 "date": "2026-04-06",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "Eosinophils",
 "short": "Eos%",
 "fullName": "Eosinophils (%)",
 "value": 0,
 "unit": "%",
 "status": "ok",
 "normalRange": "Often ~0-4%",
 "oneLiner": "Allergy/parasite-related white cell percent.",
 "simple": "Eos rise with allergies or parasites. Relevant if you have allergy flares.",
 "testsFor": "Allergy/parasite pattern.",
 "highMeans": "Allergy or other eosinophilic drivers.",
 "lowMeans": "Usually fine.",
 "date": "2026-04-06",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "Absolute Eosinophils",
 "short": "AEC",
 "fullName": "Absolute eosinophil count",
 "value": 0,
 "unit": "10^3/uL",
 "status": "ok",
 "normalRange": "About 0.0-0.9 ×10³/µL",
 "oneLiner": "Actual eosinophil count.",
 "simple": "True eos number for allergy context.",
 "testsFor": "Allergy-related immune activity.",
 "highMeans": "Allergy workup if symptoms match.",
 "lowMeans": "Usually fine.",
 "date": "2026-04-06",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "Basophils",
 "short": "Baso%",
 "fullName": "Basophils (%)",
 "value": 0.1,
 "unit": "%",
 "status": "ok",
 "normalRange": "Often ~0-1%",
 "oneLiner": "Rare allergy-related white cell percent.",
 "simple": "Basophils are uncommon in the differential. Mild changes rarely drive decisions alone.",
 "testsFor": "Allergy-related detail.",
 "highMeans": "Uncommon. Context with symptoms.",
 "lowMeans": "Usually fine.",
 "date": "2026-04-06",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "Absolute Basophils",
 "short": "ABC",
 "fullName": "Absolute basophil count",
 "value": 0,
 "unit": "10^3/uL",
 "status": "ok",
 "normalRange": "About 0.0-0.2 ×10³/µL",
 "oneLiner": "Actual basophil count.",
 "simple": "Absolute basophils. Rarely the main story.",
 "testsFor": "Allergy detail.",
 "highMeans": "Uncommon finding.",
 "lowMeans": "Usually fine.",
 "date": "2026-04-06",
 "lab": "USC ESHC Clinical Lab"
 },
 {
 "id": "Chol/HDL Ratio",
 "short": "Chol/HDL",
 "fullName": "Total cholesterol / HDL ratio",
 "value": 3.2,
 "unit": "ratio",
 "status": "ok",
 "normalRange": "Often goal under ~5.0 (lower is better)",
 "oneLiner": "Balance of total cholesterol to protective HDL.",
 "simple": "Total cholesterol divided by HDL. Lower is better: more “cleanup” HDL relative to overall cholesterol load. It’s a quick balance score, not a replacement for LDL.",
 "testsFor": "Rough lipid risk balance.",
 "highMeans": "Less favorable balance (more total cholesterol relative to HDL).",
 "lowMeans": "More favorable balance.",
 "date": "2026-03-26",
 "lab": "Quest Diagnostics-West Hills"
 }
];
