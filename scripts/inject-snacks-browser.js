/* Run inside Wonder origin (127.0.0.1:5173) */
(function () {
  var day = new Date().toISOString().slice(0, 10);
  var created = [
    {
      id: "n-snack-pocky-" + day,
      day: day,
      slot: "snack",
      name: "Pocky, chocolate",
      grams: 140,
      qtyLabel: "2 packs",
      macros: {
        calories: 720,
        protein_g: 8,
        carbs_g: 102.1,
        fat_g: 32.1,
        fiber_g: 2,
      },
      foodId: "pocky-chocolate",
      source: "manual",
      loggedAt: new Date().toISOString(),
    },
    {
      id: "n-snack-pom-" + day,
      day: day,
      slot: "snack",
      name: "Pomegranate seeds",
      grams: 160,
      qtyLabel: "1 whole (arils)",
      macros: {
        calories: 133,
        protein_g: 2.7,
        carbs_g: 29.9,
        fat_g: 1.9,
        fiber_g: 6.4,
      },
      foodId: "pomegranate-seeds",
      source: "manual",
      loggedAt: new Date().toISOString(),
    },
    {
      id: "n-snack-cherries-" + day,
      day: day,
      slot: "snack",
      name: "Cherries",
      grams: 230,
      qtyLabel: "1 bowl",
      macros: {
        calories: 145,
        protein_g: 2.5,
        carbs_g: 36.8,
        fat_g: 0.5,
        fiber_g: 4.8,
      },
      foodId: "cherries",
      source: "manual",
      loggedAt: new Date().toISOString(),
    },
  ];

  var key = "wonder-nutrition-entries-v1";
  var map = {};
  try {
    map = JSON.parse(localStorage.getItem(key) || "{}") || {};
  } catch (e) {
    map = {};
  }
  var dayList = Array.isArray(map[day]) ? map[day].slice() : [];
  var ids = {};
  dayList.forEach(function (e) {
    ids[e.id] = true;
  });
  created.forEach(function (e) {
    if (!ids[e.id]) dayList.push(e);
  });
  map[day] = dayList;
  localStorage.setItem(key, JSON.stringify(map));

  var totals = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 };
  dayList.forEach(function (e) {
    var m = e.macros || {};
    totals.calories += m.calories || 0;
    totals.protein_g += m.protein_g || 0;
    totals.carbs_g += m.carbs_g || 0;
    totals.fat_g += m.fat_g || 0;
    totals.fiber_g += m.fiber_g || 0;
  });
  localStorage.setItem(
    "dr-melani-meals-usuals:" + day,
    JSON.stringify({
      loggedIds: dayList.map(function (e) {
        return e.presetId || e.id;
      }),
      totals: {
        calories: Math.round(totals.calories),
        protein_g: Math.round(totals.protein_g * 10) / 10,
        carbs_g: Math.round(totals.carbs_g * 10) / 10,
        fat_g: Math.round(totals.fat_g * 10) / 10,
        fiber_g: Math.round(totals.fiber_g * 10) / 10,
      },
    })
  );
  window.dispatchEvent(new Event("wonder-nutrition-update"));
  return JSON.stringify({
    day: day,
    count: dayList.length,
    snackCals: 720 + 133 + 145,
    dayTotals: totals,
  });
})();
