/** Melani hygiene guides — sectioned (Pre-wash / In the shower / …). */

export type RoutineStep = {
  num: number;
  title: string;
  subtitle: string;
  note?: string;
  bullets?: string[];
};

export type RoutineSection = {
  id: string;
  title: string;
  steps: RoutineStep[];
};

export const DAILY_SHOWER_SECTIONS: RoutineSection[] = [
  {
    "id": "pre_shower",
    "title": "Pre-wash",
    "steps": [
      {
        "num": 1,
        "title": "La Roche-Posay Lipikar AP+ Gentle Foaming Cleansing Oil",
        "subtitle": "Pre-wash",
        "note": "Only if sunscreen is applied throughout the body, etc.",
        "bullets": [
          "Apply onto damp skin all over your body to break down sweat, deodorants, and surface oils before your main cleanse.",
          "Rinse off."
        ]
      }
    ]
  },
  {
    "id": "during_shower",
    "title": "In the shower",
    "steps": [
      {
        "num": 2,
        "title": "PanOxyl 10% Wash",
        "subtitle": "Underarms only",
        "note": "",
        "bullets": [
          "Massage a small amount strictly into your underarms.",
          "Let it sit for 1 minute to completely kill odor-causing bacteria, then rinse thoroughly."
        ]
      },
      {
        "num": 3,
        "title": "Soft Services Comfort Cleanse",
        "subtitle": "Daily body wash",
        "note": "",
        "bullets": [
          "Pump onto a washcloth or your hands and wash your entire body from top to bottom.",
          "Rinse completely."
        ]
      }
    ]
  },
  {
    "id": "post_shower",
    "title": "Post-wash",
    "steps": [
      {
        "num": 4,
        "title": "Nécessaire The Body Serum",
        "subtitle": "Post-wash hydration",
        "note": "",
        "bullets": [
          "Step out of the shower, gently pat your skin so it is still slightly damp.",
          "Smooth this serum all over your body to flood it with hydration."
        ]
      },
      {
        "num": 5,
        "title": "La Roche-Posay Lipikar AP+M Triple Repair Body Cream",
        "subtitle": "Barrier lock",
        "note": "",
        "bullets": [
          "Immediately follow up with a generous layer of this cream over your entire body.",
          "Lock in the serum and protect your skin barrier all day."
        ]
      }
    ]
  }
];

export const EVERYTHING_SHOWER_SECTIONS: RoutineSection[] = [
  {
    "id": "pre_shower",
    "title": "Pre-wash",
    "steps": [
      {
        "num": 1,
        "title": "La Roche-Posay Lipikar AP+ Gentle Foaming Cleansing Oil",
        "subtitle": "Pre-wash",
        "note": "",
        "bullets": [
          "Undress completely and turn your shower on to a warm, non-scorching temperature.",
          "Pump 2 to 3 generous squirts of the cleansing oil directly into your dry hands.",
          "Massage the oil thoroughly over your dry or slightly damp skin, focusing heavily on your legs, arms, and torso before entering the water.",
          "Wait 0 minutes. There is no need to wait; step straight into the shower stream to let the water hit your skin, transforming the oil into a milky lather to wash away the week's sweat and oils before rinsing completely."
        ]
      }
    ]
  },
  {
    "id": "during_shower",
    "title": "In the shower",
    "steps": [
      {
        "num": 2,
        "title": "PanOxyl 10% Benzoyl Peroxide Acne Foaming Wash",
        "subtitle": "Underarms",
        "note": "",
        "bullets": [
          "Pump a dime-sized amount into your hands and massage it directly into your underarms.",
          "Step slightly back from the direct water stream and let it sit on your skin for exactly 2 minutes to eliminate odor-causing bacteria and lighten underarm shadows."
        ]
      },
      {
        "num": 3,
        "title": "Soft Services Comfort Cleanse",
        "subtitle": "Body wash",
        "note": "",
        "bullets": [
          "While your underarm treatment is sitting, pump a small amount of this gentle cleanser into your hands.",
          "Wash only your intimate areas to protect your natural pH balance.",
          "Step fully under the shower stream and thoroughly rinse both your underarms and intimate areas clean."
        ]
      },
      {
        "num": 4,
        "title": "Ingrown Hair Exfoliating Scrub",
        "subtitle": "Legs",
        "note": "",
        "bullets": [
          "Scoop out a generous amount of the scrub.",
          "Gently buff it over your legs to mechanically lift dead skin cells and clear the way for your razor.",
          "Rinse the gritty scrub completely off your skin with warm water."
        ]
      },
      {
        "num": 5,
        "title": "L'Occitane Almond Shower Oil & Razor",
        "subtitle": "Shave",
        "note": "",
        "bullets": [
          "Smooth a layer of the shower oil over your wet legs, letting it turn into a rich protective veil.",
          "Take a clean, sharp razor and shave your legs directly through that dense oil layer to prevent razor bumps.",
          "Perform a final rinse of your legs, turn off the water, step out, and towel-dry your body until damp."
        ]
      }
    ]
  },
  {
    "id": "post_shower",
    "title": "Post-wash",
    "steps": [
      {
        "num": 6,
        "title": "The Ordinary Glycolic Acid 7% Exfoliating Solution",
        "subtitle": "Knees",
        "note": "",
        "bullets": [
          "Swipe over dark knees.",
          "Wait 60 seconds to dry."
        ]
      },
      {
        "num": 7,
        "title": "Nécessaire The Body Serum",
        "subtitle": "Body",
        "note": "",
        "bullets": [
          "Apply to full body.",
          "Wait 30 seconds before step eight."
        ]
      },
      {
        "num": 8,
        "title": "La Roche-Posay Lipikar AP+M Triple Repair Body Cream",
        "subtitle": "Body",
        "note": "",
        "bullets": [
          "Apply body cream over full body, including knees on top of dried glycolic and serum.",
          "Let it absorb."
        ]
      }
    ]
  }
];

export const AM_SECTIONS: RoutineSection[] = [
  {
    "id": "daily",
    "title": "Every day",
    "steps": [
      {
        "num": 1,
        "title": "La Roche-Posay Toleriane Hydrating Gentle Cleanser",
        "subtitle": "Face wash",
        "note": "",
        "bullets": [
          "Gently massage onto your face for 60 seconds.",
          "Rinse with lukewarm water. Pat dry, leave skin slightly damp."
        ]
      },
      {
        "num": 2,
        "title": "Anua Rice 70 Glow Milky Toner",
        "subtitle": "Toner",
        "note": "",
        "bullets": [
          "Press a few drops into damp skin.",
          "Wait 30 seconds."
        ]
      },
      {
        "num": 3,
        "title": "Anua 10+ Azelaic Acid Serum",
        "subtitle": "Serum #1",
        "note": "",
        "bullets": [
          "Apply evenly across face.",
          "For embedded bumps and PIE/PIH prevention."
        ]
      },
      {
        "num": 4,
        "title": "Centella Ampoule",
        "subtitle": "Serum #2",
        "note": "",
        "bullets": [
          "One full dropper over face.",
          "Calms irritation and fresh acne marks."
        ]
      },
      {
        "num": 5,
        "title": "Ole Henriksen Banana Bright+ Vitamin C Eye Crème",
        "subtitle": "Eye cream",
        "note": "",
        "bullets": [
          "Tap around orbital bone with ring finger."
        ]
      },
      {
        "num": 6,
        "title": "La Roche-Posay SPF 50",
        "subtitle": "Sunscreen",
        "note": "",
        "bullets": [
          "Two finger-lengths over entire face, neck, and ears.",
          "Do not skip."
        ]
      },
      {
        "num": 7,
        "title": "Tatcha Lip Balm",
        "subtitle": "Lips",
        "note": "",
        "bullets": [
          "Thin layer on lips."
        ]
      }
    ]
  }
];

export const PM_ROUTINES: Record<
  string,
  {
    label: string;
    short: string;
    /** MinimalIcon name (no emoji) */
    icon: string;
    subtitle: string;
    sections: RoutineSection[];
  }
> = {
  "pm_mark_fading": {
    "label": "Regular night",
    "short": "Regular",
    "icon": "hygiene",
    "subtitle": "Turmeric or collagen mask",
    "sections": [
      {
        "id": "routine",
        "title": "Routine",
        "steps": [
          {
            "num": 1,
            "title": "Anua Oil Cleanser",
            "subtitle": "Pre-wash",
            "note": "",
            "bullets": [
              "Massage 1 to 2 pumps on dry face to dissolve SPF and sebum.",
              "Emulsify with warm water, massage, rinse clean."
            ]
          },
          {
            "num": 2,
            "title": "Anua Heartleaf Pore Deep Cleanse",
            "subtitle": "Face wash",
            "note": "",
            "bullets": [
              "Foam on wet hands, cleanse face, rinse warm.",
              "Pat damp."
            ]
          },
          {
            "num": 3,
            "title": "Turmeric Mask or Collagen Mask",
            "subtitle": "Face mask",
            "note": "",
            "bullets": [
              "Even layer on face after cleanse.",
              "Rinse per product directions. Pat damp before toner."
            ]
          },
          {
            "num": 4,
            "title": "Anua Rice 70 Glow Milky Toner",
            "subtitle": "Toner",
            "note": "",
            "bullets": [
              "Press a few drops into damp skin."
            ]
          },
          {
            "num": 5,
            "title": "Centella Brightening Serum",
            "subtitle": "Serum #1",
            "note": "",
            "bullets": [
              "Pea-sized amount over face."
            ]
          },
          {
            "num": 6,
            "title": "Anua Niacinamide 10 + TXA 4 Serum",
            "subtitle": "Serum #2",
            "note": "",
            "bullets": [
              "Even layer over face, focus on acne marks.",
              "Niacinamide + TXA block pigment for PIH and PIE."
            ]
          },
          {
            "num": 7,
            "title": "Tatcha Luminous Deep Hydration Firming Eye Serum",
            "subtitle": "Eye serum",
            "note": "",
            "bullets": [
              "Smooth around eye area."
            ]
          },
          {
            "num": 8,
            "title": "La Roche-Posay Toleriane Double Repair Face Moisturizer",
            "subtitle": "PM moisturizer",
            "note": "",
            "bullets": [
              "Generous layer on face and neck."
            ]
          },
          {
            "num": 9,
            "title": "Tatcha Lip Balm",
            "subtitle": "Lip serum",
            "note": "",
            "bullets": [
              "Thin layer on lips."
            ]
          },
          {
            "num": 10,
            "title": "Lash/Brow Serum",
            "subtitle": "Lash & brow",
            "note": "",
            "bullets": [
              "Swipe on lash lines and brows."
            ]
          }
        ]
      }
    ]
  },
  "pm_retinol": {
    "label": "Retinol night",
    "short": "Retinol",
    "icon": "doctor",
    "subtitle": "No mask allowed",
    "sections": [
      {
        "id": "routine",
        "title": "Routine",
        "steps": [
          {
            "num": 1,
            "title": "Anua Oil Cleanser",
            "subtitle": "Pre-wash",
            "note": "",
            "bullets": [
              "Massage on dry skin to dissolve SPF and oils.",
              "Rinse with warm water."
            ]
          },
          {
            "num": 2,
            "title": "Anua Heartleaf Pore Deep Cleanse",
            "subtitle": "Face wash",
            "note": "",
            "bullets": [
              "Foam cleanse, rinse, pat damp."
            ]
          },
          {
            "num": 3,
            "title": "Anua Rice 70 Glow Milky Toner",
            "subtitle": "Toner",
            "note": "",
            "bullets": [
              "Press into skin."
            ]
          },
          {
            "num": 4,
            "title": "Centella Ampoule",
            "subtitle": "Serum #1",
            "note": "",
            "bullets": [
              "Apply one full dropper across your face for a soothing, anti-inflammatory layer.",
              "Crucial: wait 3 to 5 minutes until skin is bone-dry to the touch.",
              "Do not apply retinol to damp skin. It absorbs too fast, causes irritation, peeling, and fresh red marks."
            ]
          },
          {
            "num": 5,
            "title": "CeraVe Resurfacing Retinol Serum (Teal Bottle)",
            "subtitle": "Retinol treatment · no mask allowed",
            "note": "",
            "bullets": [
              "Pump one pea-sized amount onto your finger.",
              "Dot on forehead, cheeks, and chin. Smooth evenly over face.",
              "Keep completely off eyes, eyelids, and lips."
            ]
          },
          {
            "num": 6,
            "title": "La Roche-Posay Toleriane Double Repair Face Moisturizer",
            "subtitle": "PM moisturizer",
            "note": "",
            "bullets": [
              "Wait about 60 seconds for retinol to settle.",
              "Smooth a generous layer over face and neck to lock in retinol and protect your barrier overnight."
            ]
          },
          {
            "num": 7,
            "title": "Tatcha Eye Serum",
            "subtitle": "Eye serum",
            "note": "",
            "bullets": [
              "Tap around eye area."
            ]
          },
          {
            "num": 8,
            "title": "Tatcha Lip Balm",
            "subtitle": "Lip serum",
            "note": "",
            "bullets": [
              "Thin layer on lips."
            ]
          },
          {
            "num": 9,
            "title": "Lash/Brow Serum",
            "subtitle": "Lash & brow",
            "note": "",
            "bullets": [
              "Swipe on lash lines and brows."
            ]
          }
        ]
      }
    ]
  },
  "pm_clay_night": {
    "label": "Clay mask night",
    "short": "Clay mask",
    "icon": "body",
    "subtitle": "MediCube pore mask · face mask",
    "sections": [
      {
        "id": "routine",
        "title": "Routine",
        "steps": [
          {
            "num": 1,
            "title": "Anua Oil Cleanser & Heartleaf Pore Deep Cleanse",
            "subtitle": "Double cleanse",
            "note": "",
            "bullets": [
              "Full double cleanse at sink or in shower."
            ]
          },
          {
            "num": 2,
            "title": "MediCube pore mask",
            "subtitle": "Pore mask",
            "note": "",
            "bullets": [
              "Even layer on nose, T-zone, or areas with blackheads and embedded bumps.",
              "Wait 3 to 5 minutes. Do not leave on longer.",
              "Rinse warm, pat damp."
            ]
          },
          {
            "num": 3,
            "title": "Turmeric Mask or MediCube Pink Mask",
            "subtitle": "Face mask",
            "note": "",
            "bullets": [
              "Even layer on breakout zones and embedded bump areas.",
              "Wait 10 minutes, rinse warm."
            ]
          },
          {
            "num": 4,
            "title": "Anua Rice 70 Glow Milky Toner",
            "subtitle": "Toner",
            "note": "",
            "bullets": [
              "Press into skin after masking."
            ]
          },
          {
            "num": 5,
            "title": "Centella Ampoule",
            "subtitle": "Serum #1",
            "note": "",
            "bullets": [
              "One full dropper over face.",
              "No active acids or retinol tonight."
            ]
          },
          {
            "num": 6,
            "title": "La Roche-Posay Toleriane Double Repair Face Moisturizer",
            "subtitle": "PM moisturizer",
            "note": "",
            "bullets": [
              "Thick layer on face and neck."
            ]
          },
          {
            "num": 7,
            "title": "Tatcha Eye Serum",
            "subtitle": "Eye serum",
            "note": "",
            "bullets": [
              "Tap around eye area."
            ]
          },
          {
            "num": 8,
            "title": "Tatcha Lip Balm",
            "subtitle": "Lip serum",
            "note": "",
            "bullets": [
              "Thin layer on lips."
            ]
          },
          {
            "num": 9,
            "title": "Lash/Brow Serum",
            "subtitle": "Lash & brow",
            "note": "",
            "bullets": [
              "Swipe on lash lines and brows."
            ]
          }
        ]
      }
    ]
  },
  "pm_panoxyl": {
    "label": "PanOxyl night",
    "short": "PanOxyl",
    "icon": "labs",
    "subtitle": "No mask allowed",
    "sections": [
      {
        "id": "routine",
        "title": "Routine",
        "steps": [
          {
            "num": 1,
            "title": "Anua Oil Cleanser",
            "subtitle": "Pre-wash",
            "note": "",
            "bullets": [
              "Massage on dry skin to dissolve sunscreen and makeup.",
              "Rinse clean."
            ]
          },
          {
            "num": 2,
            "title": "PanOxyl 10% Benzoyl Peroxide Acne Foaming Wash",
            "subtitle": "Face wash & treatment · no mask allowed",
            "note": "",
            "bullets": [
              "Dime-sized amount on damp face. Avoid eyes.",
              "Wait 1 to 2 minutes, rinse lukewarm, pat dry."
            ]
          },
          {
            "num": 3,
            "title": "Anua Rice 70 Glow Milky Toner",
            "subtitle": "Toner",
            "note": "",
            "bullets": [
              "Press into skin after the active wash."
            ]
          },
          {
            "num": 4,
            "title": "Centella Ampoule",
            "subtitle": "Serum #1",
            "note": "",
            "bullets": [
              "One full dropper over face.",
              "No niacinamide/TXA or retinol tonight. PanOxyl only."
            ]
          },
          {
            "num": 5,
            "title": "La Roche-Posay Toleriane Double Repair Face Moisturizer",
            "subtitle": "PM moisturizer",
            "note": "",
            "bullets": [
              "Generous layer on face and neck."
            ]
          },
          {
            "num": 6,
            "title": "Tatcha Eye Serum",
            "subtitle": "Eye serum",
            "note": "",
            "bullets": [
              "Tap around eye area."
            ]
          },
          {
            "num": 7,
            "title": "Tatcha Lip Balm",
            "subtitle": "Lip serum",
            "note": "",
            "bullets": [
              "Thin layer on lips."
            ]
          },
          {
            "num": 8,
            "title": "Lash/Brow Serum",
            "subtitle": "Lash & brow",
            "note": "",
            "bullets": [
              "Swipe on lash lines and brows."
            ]
          }
        ]
      }
    ]
  }
};

export const HAIR_SECTIONS: RoutineSection[] = [
  {
    id: "routine",
    title: "Hair care",
    steps: [
      { num: 1, title: "Fable & Mane MahaMane Smooth Scalp & Hair Oil", subtitle: "Pre-oil" },
      { num: 2, title: "The Ordinary Natural Moisturizing Factors + HA for Scalp", subtitle: "Scalp" },
      { num: 3, title: "Kérastase Spécifique Bain Divalent Balancing Shampoo", subtitle: "Shampoo" },
      { num: 4, title: "Redken Frizz Dismiss Conditioner", subtitle: "Conditioner" },
      { num: 5, title: "Wide-Tooth Shower Comb", subtitle: "Detangle" },
      { num: 6, title: "Microfibre towel", subtitle: "Dry" },
      { num: 7, title: "Redken Acidic Bonding Concentrate Leave-In Treatment", subtitle: "Leave-in" },
      { num: 8, title: "Kérastase Genesis Serum Fortifiant", subtitle: "Serum" },
      { num: 9, title: "Blow-dry", subtitle: "Style" },
      { num: 10, title: "Kérastase Elixir Ultime Hair Oil", subtitle: "Finish" },
    ],
  },
];

/** Oral care — Melani’s stack (fluoride-free goal; Sensodyne is leftover supply only). */
export const ORAL_CARE_SECTIONS: RoutineSection[] = [
  {
    id: "clean",
    title: "Clean",
    steps: [
      {
        num: 1,
        title: "Waterpik Water Flosser",
        subtitle: "Water floss",
        note: "",
        bullets: [
          "Fill reservoir with lukewarm water.",
          "Trace along the gumline and between teeth before brushing.",
        ],
      },
      {
        num: 2,
        title: "Dr. Tung's Smart Floss",
        subtitle: "String floss",
        note: "After water flosser when you want extra contact.",
        bullets: [
          "Wrap and slide gently under the gumline.",
          "Fresh section for each tooth.",
        ],
      },
      {
        num: 3,
        title: "Oral-B Electric Toothbrush",
        subtitle: "Brush",
        note: "Use soft replacement heads only.",
        bullets: [
          "Soft head, two minutes, light pressure.",
          "Outer surfaces → chewing surfaces → inner surfaces.",
        ],
      },
      {
        num: 4,
        title: "Oral-B Soft Toothbrush Heads",
        subtitle: "Heads",
        note: "Swap heads on schedule so bristles stay soft.",
        bullets: [
          "Keep spare heads dry between uses.",
          "Replace when bristles splay or on your usual cadence.",
        ],
      },
      {
        num: 5,
        title: "Fluoride-Free Toothpaste",
        subtitle: "Primary toothpaste",
        note: "Main paste for the fluoride-free goal.",
        bullets: [
          "Pea-sized amount on the soft head.",
          "Spit; no hard rinse if you want residual minerals to sit.",
        ],
      },
      {
        num: 6,
        title: "Sensodyne Toothpaste",
        subtitle: "Leftover only",
        note: "Contains fluoride — leftover supply from before the fluoride-free switch. Finish the tube; do not restock as daily.",
        bullets: [
          "Only while this leftover lasts.",
          "Prefer the fluoride-free paste for regular use.",
        ],
      },
      {
        num: 7,
        title: "Mouthwash",
        subtitle: "Rinse",
        note: "",
        bullets: [
          "After brushing, swish the timed amount on the label.",
          "Spit; avoid eating or drinking for a few minutes.",
        ],
      },
      {
        num: 8,
        title: "Dr. Tung's Tongue Scraper",
        subtitle: "Tongue",
        note: "",
        bullets: [
          "Gentle strokes front to back on the tongue.",
          "Rinse the scraper; optional second pass.",
        ],
      },
    ],
  },
  {
    id: "night",
    title: "Night protection",
    steps: [
      {
        num: 9,
        title: "SomnoDent Avant",
        subtitle: "Oral appliance · sleep",
        note: "Custom SomnoMed mandibular advancement device (provider-fitted). Finish full evening oral care first, then seat the appliance.",
        bullets: [
          "After floss, brush, tongue scrape, and rinse — mouth should be clean and dry enough to seat the trays.",
          "Rinse the device with cool water; never hot (can warp acrylic / liner).",
          "Seat upper and lower splints fully so the b-flex liner cradles the teeth; check both sides feel even.",
          "Lips closed, nasal breathing — the Avant is built to encourage mouth closure while you sleep.",
          "Morning: remove, rinse, brush the device gently with a soft brush + cool water (or the cleaner your dentist gave you).",
          "Air-dry fully, then store in the case — never leave wet in a closed bag.",
          "Follow your sleep dentist for titration / adjustment visits; don’t force fit if something feels wrong.",
        ],
      },
    ],
  },
];
