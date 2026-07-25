/**
 * Offline food database.
 *
 * Every row is per-100g (USDA-style reference values) plus the household
 * portions people actually speak in ("1 large egg", "1 cup cooked rice").
 * Nothing here hits the network — the whole point is that logging works on a
 * plane, in a basement gym, or when the AI endpoint is down.
 *
 * Row format keeps the table readable:
 *   [name, aliases, group, cal, protein, carbs, fat, fiber, portions]
 * where portions is "label:grams|label:grams" and the FIRST portion is the
 * default unit for that food (what you get when you say "an egg" or "rice").
 */

export type FoodGroup =
  | "protein"
  | "dairy"
  | "grain"
  | "veg"
  | "fruit"
  | "fat"
  | "nut"
  | "legume"
  | "drink"
  | "snack"
  | "sweet"
  | "condiment"
  | "prepared"
  | "supplement";

export type Macros = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
};

export type Portion = { label: string; grams: number };

export type Food = {
  id: string;
  name: string;
  aliases: string[];
  group: FoodGroup;
  /** Macros for exactly 100 g of this food. */
  per100g: Macros;
  /** Household measures; portions[0] is the default. */
  portions: Portion[];
};

type Row = [
  name: string,
  aliases: string,
  group: FoodGroup,
  cal: number,
  protein: number,
  carbs: number,
  fat: number,
  fiber: number,
  portions: string,
];

/* eslint-disable */
const ROWS: Row[] = [
  // ── Eggs & poultry ────────────────────────────────────────────────────────
  ["Egg, whole", "egg|eggs|whole egg|boiled egg|fried egg|scrambled egg", "protein", 143, 12.6, 0.7, 9.5, 0, "large:50|medium:44|jumbo:63|cup:243"],
  ["Egg white", "egg whites|white of egg", "protein", 52, 10.9, 0.7, 0.2, 0, "large:33|cup:243|tbsp:15"],
  ["Egg yolk", "yolk|yolks", "protein", 322, 15.9, 3.6, 26.5, 0, "large:17"],
  ["Chicken breast, cooked", "chicken|chicken breast|grilled chicken|breast", "protein", 165, 31, 0, 3.6, 0, "breast:174|oz:28.35|cup diced:140"],
  ["Chicken thigh, cooked", "chicken thigh|thigh|dark meat chicken", "protein", 209, 26, 0, 10.9, 0, "thigh:52|oz:28.35"],
  ["Chicken wing, cooked", "wings|chicken wings|wing", "protein", 254, 23.1, 0, 17.1, 0, "wing:34|oz:28.35"],
  ["Rotisserie chicken", "rotisserie|roast chicken", "protein", 190, 25, 0.5, 9.5, 0, "cup:140|oz:28.35"],
  ["Turkey breast, cooked", "turkey|turkey breast", "protein", 135, 30, 0, 1, 0, "oz:28.35|slice:28|cup:140"],
  ["Ground turkey, 93%, cooked", "ground turkey|turkey mince", "protein", 176, 27, 0, 7.4, 0, "oz:28.35|cup:140"],

  // ── Red meat & pork ───────────────────────────────────────────────────────
  ["Ground beef, 93% lean, cooked", "beef|ground beef|lean beef|mince|hamburger meat", "protein", 182, 25.9, 0, 8.2, 0, "oz:28.35|patty:85|cup:140"],
  ["Ground beef, 80% lean, cooked", "fatty ground beef|80/20 beef", "protein", 254, 25.8, 0, 16.2, 0, "oz:28.35|patty:85"],
  ["Steak, sirloin, cooked", "steak|sirloin|beef steak", "protein", 201, 29.6, 0, 8.2, 0, "oz:28.35|steak:170"],
  ["Ribeye, cooked", "ribeye|rib eye", "protein", 291, 24.8, 0, 20.8, 0, "oz:28.35|steak:225"],
  ["Pork tenderloin, cooked", "pork|pork loin|tenderloin", "protein", 143, 26, 0, 3.5, 0, "oz:28.35|cup:140"],
  ["Bacon, cooked", "bacon|bacon strips", "protein", 541, 37, 1.4, 42, 0, "slice:8|oz:28.35"],
  ["Lamb, cooked", "lamb|mutton", "protein", 258, 25.6, 0, 16.5, 0, "oz:28.35"],
  ["Ham, sliced", "ham|deli ham", "protein", 145, 20.9, 1.5, 5.5, 0, "slice:28|oz:28.35"],

  // ── Fish & seafood ────────────────────────────────────────────────────────
  ["Salmon, cooked", "salmon|atlantic salmon|grilled salmon|baked salmon", "protein", 206, 22.1, 0, 12.4, 0, "fillet:154|oz:28.35"],
  ["Tuna, canned in water", "tuna|canned tuna|tuna can", "protein", 116, 25.5, 0, 0.8, 0, "can:142|oz:28.35|cup:154"],
  ["Tuna steak, cooked", "ahi|tuna steak|seared tuna", "protein", 184, 29.9, 0, 6.3, 0, "oz:28.35|steak:150"],
  ["Shrimp, cooked", "shrimp|prawns|prawn", "protein", 99, 24, 0.2, 0.3, 0, "oz:28.35|piece:11|cup:145"],
  ["Cod, cooked", "cod|white fish|whitefish", "protein", 105, 22.8, 0, 0.9, 0, "fillet:180|oz:28.35"],
  ["Tilapia, cooked", "tilapia", "protein", 129, 26.2, 0, 2.7, 0, "fillet:87|oz:28.35"],
  ["Sardines, canned", "sardines|sardine", "protein", 208, 24.6, 0, 11.5, 0, "can:92|oz:28.35"],
  ["Salmon, smoked", "smoked salmon|lox", "protein", 117, 18.3, 0, 4.3, 0, "oz:28.35|slice:28"],

  // ── Dairy ─────────────────────────────────────────────────────────────────
  ["Greek yogurt, 0% fat", "greek yogurt|fage|fage 0|nonfat greek yogurt|yogurt", "dairy", 59, 10.3, 3.6, 0, 0, "cup:227|container:170|g:1|tbsp:15"],
  ["Greek yogurt, 2% fat", "greek yogurt 2%|lowfat greek yogurt", "dairy", 73, 9.9, 3.9, 1.9, 0, "cup:227|container:170"],
  ["Greek yogurt, 5% fat", "full fat greek yogurt|greek yogurt 5%", "dairy", 97, 9, 3.9, 5, 0, "cup:227|container:170"],
  ["Kefir, low-fat", "kefir|fage kefir", "dairy", 41, 3.8, 4.5, 1, 0, "cup:243|ml:1.03"],
  ["Cottage cheese, 2%", "cottage cheese", "dairy", 84, 11, 4.3, 2.3, 0, "cup:226|container:150"],
  ["Milk, whole", "whole milk|milk", "dairy", 61, 3.2, 4.8, 3.3, 0, "cup:244|ml:1.03"],
  ["Milk, skim", "skim milk|nonfat milk|fat free milk", "dairy", 34, 3.4, 5, 0.1, 0, "cup:245|ml:1.03"],
  ["Almond milk, unsweetened", "almond milk", "dairy", 15, 0.6, 0.6, 1.2, 0.3, "cup:240|ml:1"],
  ["Oat milk", "oat milk|oatly", "dairy", 47, 1, 7.5, 1.5, 0.8, "cup:240|ml:1"],
  ["Cheddar cheese", "cheddar|cheese", "dairy", 403, 25, 1.3, 33, 0, "slice:28|oz:28.35|cup shredded:113"],
  ["Mozzarella, part-skim", "mozzarella|mozarella", "dairy", 254, 24.3, 2.8, 15.9, 0, "oz:28.35|slice:28|cup shredded:113"],
  ["Feta cheese", "feta", "dairy", 264, 14.2, 4.1, 21.3, 0, "oz:28.35|cup crumbled:150"],
  ["Parmesan, grated", "parmesan|parmigiano", "dairy", 420, 38, 4.1, 28, 0, "tbsp:5|oz:28.35"],
  ["Cream cheese", "cream cheese|philadelphia", "dairy", 342, 6, 4.1, 34, 0, "tbsp:14|oz:28.35"],
  ["Butter", "butter", "fat", 717, 0.9, 0.1, 81.1, 0, "tbsp:14|tsp:5|pat:5"],
  ["Heavy cream", "heavy cream|double cream", "dairy", 340, 2.8, 2.8, 36, 0, "tbsp:15|cup:238"],
  ["Ice cream, vanilla", "ice cream", "sweet", 207, 3.5, 23.6, 11, 0.7, "cup:132|scoop:66"],

  // ── Grains & starches ─────────────────────────────────────────────────────
  ["White rice, cooked", "rice|white rice|steamed rice|jasmine rice|basmati", "grain", 130, 2.7, 28.2, 0.3, 0.4, "cup:158|g:1"],
  ["Brown rice, cooked", "brown rice", "grain", 123, 2.7, 25.6, 1, 1.6, "cup:195|g:1"],
  ["Quinoa, cooked", "quinoa", "grain", 120, 4.4, 21.3, 1.9, 2.8, "cup:185"],
  ["Oats, dry", "oats|oatmeal|rolled oats|porridge", "grain", 389, 16.9, 66.3, 6.9, 10.6, "cup:81|half cup:40|packet:28"],
  ["Bread, whole wheat", "bread|whole wheat bread|wheat bread|toast", "grain", 247, 13, 41, 3.4, 6, "slice:32"],
  ["Bread, white", "white bread", "grain", 266, 9, 49, 3.3, 2.7, "slice:29"],
  ["Sourdough bread", "sourdough", "grain", 289, 11.7, 56.3, 1.8, 2.4, "slice:36"],
  ["Bagel, plain", "bagel", "grain", 275, 11, 53, 1.7, 2.3, "bagel:98"],
  ["Tortilla, flour", "tortilla|flour tortilla|wrap", "grain", 306, 8.2, 51.4, 7.6, 3.1, "tortilla:45|large:72"],
  ["Tortilla, corn", "corn tortilla", "grain", 218, 5.7, 44.6, 2.9, 6.3, "tortilla:26"],
  ["Pasta, cooked", "pasta|spaghetti|penne|noodles", "grain", 158, 5.8, 30.9, 0.9, 1.8, "cup:140"],
  ["Pasta, whole wheat, cooked", "whole wheat pasta|wheat pasta", "grain", 124, 5.3, 26.5, 0.5, 3.9, "cup:140"],
  ["Couscous, cooked", "couscous", "grain", 112, 3.8, 23.2, 0.2, 1.4, "cup:157"],
  ["Cereal, granola", "granola", "grain", 471, 10.3, 64.2, 20.3, 7.1, "cup:122|half cup:61"],
  ["Cornflakes", "corn flakes|cereal", "grain", 357, 7.5, 84, 0.4, 3.3, "cup:28"],
  ["Pancake", "pancake|pancakes", "prepared", 227, 6.4, 28.3, 9.7, 0.9, "pancake:38"],
  ["Waffle", "waffle|waffles", "prepared", 291, 7.9, 32.9, 14.1, 2.2, "waffle:75"],
  ["Croissant", "croissant", "grain", 406, 8.2, 45.8, 21, 2.6, "croissant:57"],
  ["Naan", "naan|naan bread", "grain", 310, 8.7, 50.4, 8.3, 2.2, "piece:90"],
  ["Roti", "roti|chapati|chapatti", "grain", 297, 11, 46, 7.5, 4.9, "piece:40"],

  // ── Potatoes & roots ──────────────────────────────────────────────────────
  ["Potato, baked", "potato|baked potato|potatoes", "veg", 93, 2.5, 21.2, 0.1, 2.2, "medium:173|cup:122|large:299"],
  ["Sweet potato, baked", "sweet potato|yam", "veg", 90, 2, 20.7, 0.2, 3.3, "medium:114|cup:200"],
  ["Mashed potato", "mashed potato|mashed potatoes|mash", "prepared", 113, 2, 16.9, 4.2, 1.5, "cup:210"],
  ["French fries", "fries|french fries|chips uk", "prepared", 312, 3.4, 41.4, 14.7, 3.8, "medium serving:117|cup:70"],

  // ── Legumes ───────────────────────────────────────────────────────────────
  ["Lentils, cooked", "lentils|dal|daal|lentil", "legume", 116, 9, 20.1, 0.4, 7.9, "cup:198"],
  ["Chickpeas, cooked", "chickpeas|garbanzo|chana", "legume", 164, 8.9, 27.4, 2.6, 7.6, "cup:164"],
  ["Black beans, cooked", "black beans|beans", "legume", 132, 8.9, 23.7, 0.5, 8.7, "cup:172"],
  ["Kidney beans, cooked", "kidney beans|rajma", "legume", 127, 8.7, 22.8, 0.5, 6.4, "cup:177"],
  ["Edamame, cooked", "edamame|soybeans", "legume", 121, 11.9, 8.9, 5.2, 5.2, "cup:155"],
  ["Tofu, firm", "tofu|firm tofu", "legume", 144, 17.3, 2.8, 8.7, 2.3, "block:396|cup:252|oz:28.35"],
  ["Tempeh", "tempeh", "legume", 192, 20.3, 7.6, 10.8, 0, "cup:166|oz:28.35"],
  ["Hummus", "hummus|houmous", "legume", 166, 7.9, 14.3, 9.6, 6, "tbsp:15|cup:246"],
  ["Peanut butter", "peanut butter|pb", "nut", 588, 25.1, 19.6, 50.4, 6, "tbsp:16|cup:258"],

  // ── Nuts & seeds ──────────────────────────────────────────────────────────
  ["Almonds", "almonds|almond", "nut", 579, 21.2, 21.6, 49.9, 12.5, "oz:28.35|cup:143|almond:1.2|handful:30"],
  ["Walnuts", "walnuts|walnut", "nut", 654, 15.2, 13.7, 65.2, 6.7, "oz:28.35|cup:117|half:2.5"],
  ["Cashews", "cashews|cashew", "nut", 553, 18.2, 30.2, 43.9, 3.3, "oz:28.35|cup:137|handful:30"],
  ["Pistachios", "pistachios|pistachio", "nut", 560, 20.2, 27.2, 45.3, 10.6, "oz:28.35|cup:123"],
  ["Peanuts", "peanuts|peanut", "nut", 567, 25.8, 16.1, 49.2, 8.5, "oz:28.35|cup:146|handful:30"],
  ["Chia seeds", "chia|chia seeds", "nut", 486, 16.5, 42.1, 30.7, 34.4, "tbsp:12|tsp:4|oz:28.35"],
  ["Flaxseed, ground", "flaxseed|flax|flaxseeds|linseed", "nut", 534, 18.3, 28.9, 42.2, 27.3, "tbsp:7|tsp:2.5|oz:28.35"],
  ["Pumpkin seeds", "pumpkin seeds|pepitas", "nut", 559, 30.2, 10.7, 49.1, 6, "tbsp:9.5|oz:28.35|cup:129"],
  ["Sunflower seeds", "sunflower seeds", "nut", 584, 20.8, 20, 51.5, 8.6, "tbsp:9|oz:28.35"],
  ["Almond butter", "almond butter", "nut", 614, 21, 18.8, 55.5, 10.3, "tbsp:16"],

  // ── Fruit ─────────────────────────────────────────────────────────────────
  ["Blueberries", "blueberries|blueberry", "fruit", 57, 0.7, 14.5, 0.3, 2.4, "cup:148|half cup:74|handful:40"],
  ["Strawberries", "strawberries|strawberry", "fruit", 32, 0.7, 7.7, 0.3, 2, "medium:12|cup:152|large:18"],
  ["Raspberries", "raspberries|raspberry", "fruit", 52, 1.2, 11.9, 0.7, 6.5, "cup:123"],
  ["Blackberries", "blackberries|blackberry", "fruit", 43, 1.4, 9.6, 0.5, 5.3, "cup:144"],
  ["Banana", "banana|bananas", "fruit", 89, 1.1, 22.8, 0.3, 2.6, "medium:118|large:136|small:101"],
  ["Apple", "apple|apples", "fruit", 52, 0.3, 13.8, 0.2, 2.4, "medium:182|large:223|cup sliced:109"],
  ["Orange", "orange|oranges", "fruit", 47, 0.9, 11.8, 0.1, 2.4, "medium:131|large:184"],
  ["Grapes", "grapes|grape", "fruit", 69, 0.7, 18.1, 0.2, 0.9, "cup:151|grape:5"],
  ["Mango", "mango|mangoes", "fruit", 60, 0.8, 15, 0.4, 1.6, "cup:165|medium:207"],
  ["Pineapple", "pineapple", "fruit", 50, 0.5, 13.1, 0.1, 1.4, "cup:165"],
  ["Watermelon", "watermelon", "fruit", 30, 0.6, 7.6, 0.2, 0.4, "cup:152|slice:286"],
  ["Avocado", "avocado|avocados", "fat", 160, 2, 8.5, 14.7, 6.7, "medium:150|half:75|cup:150"],
  ["Peach", "peach|peaches", "fruit", 39, 0.9, 9.5, 0.3, 1.5, "medium:150"],
  ["Pear", "pear|pears", "fruit", 57, 0.4, 15.2, 0.1, 3.1, "medium:178"],
  ["Kiwi", "kiwi|kiwifruit", "fruit", 61, 1.1, 14.7, 0.5, 3, "medium:69"],
  ["Cherries", "cherries|cherry", "fruit", 63, 1.1, 16, 0.2, 2.1, "cup:154"],
  ["Dates", "dates|date|medjool", "fruit", 277, 1.8, 75, 0.2, 6.7, "date:24|cup:147"],
  ["Pomegranate seeds", "pomegranate|pomegranate seeds", "fruit", 83, 1.7, 18.7, 1.2, 4, "cup:174"],

  // ── Vegetables ────────────────────────────────────────────────────────────
  ["Broccoli, cooked", "broccoli", "veg", 35, 2.4, 7.2, 0.4, 3.3, "cup:156|floret:11"],
  ["Spinach, raw", "spinach", "veg", 23, 2.9, 3.6, 0.4, 2.2, "cup:30|handful:30|bag:142"],
  ["Kale, raw", "kale", "veg", 49, 4.3, 8.8, 0.9, 3.6, "cup:67"],
  ["Carrot, raw", "carrot|carrots", "veg", 41, 0.9, 9.6, 0.2, 2.8, "medium:61|cup:128"],
  ["Cucumber", "cucumber|cucumbers", "veg", 15, 0.7, 3.6, 0.1, 0.5, "cup:104|medium:201"],
  ["Tomato", "tomato|tomatoes", "veg", 18, 0.9, 3.9, 0.2, 1.2, "medium:123|cup:180|cherry:17"],
  ["Bell pepper", "bell pepper|pepper|capsicum", "veg", 31, 1, 6, 0.3, 2.1, "medium:119|cup:149"],
  ["Onion", "onion|onions", "veg", 40, 1.1, 9.3, 0.1, 1.7, "medium:110|cup:160"],
  ["Lettuce, romaine", "lettuce|romaine|salad greens", "veg", 17, 1.2, 3.3, 0.3, 2.1, "cup:47|head:626"],
  ["Cauliflower, cooked", "cauliflower", "veg", 23, 1.8, 4.1, 0.5, 2.3, "cup:124"],
  ["Green beans, cooked", "green beans|string beans", "veg", 35, 1.9, 7.9, 0.3, 3.2, "cup:125"],
  ["Asparagus, cooked", "asparagus", "veg", 22, 2.4, 4.1, 0.2, 2, "cup:180|spear:12"],
  ["Brussels sprouts, cooked", "brussels sprouts|sprouts", "veg", 36, 2.6, 7.1, 0.5, 2.6, "cup:156"],
  ["Zucchini, cooked", "zucchini|courgette", "veg", 17, 1.2, 3.1, 0.3, 1, "cup:180|medium:196"],
  ["Mushrooms, cooked", "mushrooms|mushroom", "veg", 28, 2.2, 5.3, 0.5, 2.2, "cup:156"],
  ["Corn, cooked", "corn|sweetcorn", "veg", 96, 3.4, 21, 1.5, 2.4, "cup:164|ear:90"],
  ["Peas, cooked", "peas|green peas", "veg", 84, 5.4, 15.6, 0.2, 5.5, "cup:160"],
  ["Cabbage, raw", "cabbage", "veg", 25, 1.3, 5.8, 0.1, 2.5, "cup:89"],
  ["Beetroot, cooked", "beet|beets|beetroot", "veg", 44, 1.7, 10, 0.2, 2, "cup:170"],
  ["Okra, cooked", "okra|bhindi", "veg", 22, 1.9, 4.5, 0.2, 2.5, "cup:160"],

  // ── Fats & oils ───────────────────────────────────────────────────────────
  ["Olive oil", "olive oil|oil|evoo", "fat", 884, 0, 0, 100, 0, "tbsp:13.5|tsp:4.5"],
  ["Coconut oil", "coconut oil", "fat", 862, 0, 0, 100, 0, "tbsp:13.6|tsp:4.5"],
  ["Ghee", "ghee|clarified butter", "fat", 876, 0.3, 0, 99.5, 0, "tbsp:12.8|tsp:4.3"],
  ["Mayonnaise", "mayo|mayonnaise", "condiment", 680, 1, 0.6, 75, 0, "tbsp:14"],

  // ── Prepared & takeout ────────────────────────────────────────────────────
  ["Pizza, cheese", "pizza|cheese pizza", "prepared", 266, 11, 33, 10, 2.3, "slice:107"],
  ["Cheeseburger", "burger|cheeseburger|hamburger", "prepared", 250, 13, 21, 12, 1.3, "burger:170"],
  ["Sushi roll, salmon", "sushi|salmon roll|sushi roll", "prepared", 145, 6, 22, 3.5, 1.2, "roll:170|piece:28"],
  ["Burrito, chicken", "burrito|chicken burrito", "prepared", 190, 11, 22, 6.5, 2.5, "burrito:340"],
  ["Caesar salad with chicken", "caesar salad|chicken salad", "prepared", 130, 10, 4.5, 8.5, 1.4, "bowl:300"],
  ["Chicken curry", "curry|chicken curry", "prepared", 145, 12, 6, 8, 1.5, "cup:240"],
  ["Fried rice", "fried rice", "prepared", 163, 5.2, 24.4, 4.9, 1.1, "cup:198"],
  ["Ramen, prepared", "ramen|instant noodles", "prepared", 188, 5, 27, 7, 1.4, "bowl:400|packet:85"],
  ["Protein bar", "protein bar|quest bar|rx bar", "snack", 340, 30, 38, 10, 12, "bar:60"],
  ["Sandwich, turkey", "sandwich|turkey sandwich", "prepared", 210, 14, 24, 6.5, 2.4, "sandwich:200"],
  ["Omelette, 3-egg", "omelette|omelet", "prepared", 154, 10.6, 1.2, 11.7, 0, "omelette:180"],
  ["Soup, chicken noodle", "soup|chicken soup", "prepared", 36, 2.5, 4.2, 1.1, 0.4, "cup:241|bowl:400"],

  // ── Snacks & sweets ───────────────────────────────────────────────────────
  ["Makhana (fox nuts)", "makhana|fox nuts|lotus seeds|phool makhana", "snack", 347, 9.7, 76.9, 0.1, 14.5, "cup:32|handful:15|piece:0.6"],
  ["Popcorn, air-popped", "popcorn", "snack", 387, 12.9, 77.8, 4.5, 14.5, "cup:8|bag:35"],
  ["Potato chips", "chips|crisps|potato chips", "snack", 536, 7, 53, 34, 4.4, "oz:28.35|bag:42|handful:20"],
  ["Dark chocolate, 70%", "dark chocolate|chocolate", "sweet", 598, 7.8, 45.9, 42.6, 10.9, "square:10|bar:100|oz:28.35"],
  ["Milk chocolate", "milk chocolate", "sweet", 535, 7.6, 59.4, 29.7, 3.4, "bar:44|square:8"],
  ["Cookie, chocolate chip", "cookie|cookies", "sweet", 488, 5.1, 63.9, 24.3, 2.6, "cookie:16"],
  ["Brownie", "brownie|brownies", "sweet", 466, 6, 50, 28, 2.5, "brownie:56"],
  ["Donut, glazed", "donut|doughnut", "sweet", 452, 4.9, 51, 25, 1.5, "donut:60"],
  ["Honey", "honey|raw honey", "sweet", 304, 0.3, 82.4, 0, 0.2, "tbsp:21|tsp:7"],
  ["Maple syrup", "maple syrup|syrup", "sweet", 260, 0, 67, 0.1, 0, "tbsp:20|tsp:6.7"],
  ["Sugar, white", "sugar|white sugar", "sweet", 387, 0, 100, 0, 0, "tsp:4.2|tbsp:12.5"],
  ["Trail mix", "trail mix", "snack", 462, 13.8, 44.9, 29.4, 5.4, "cup:150|oz:28.35|handful:35"],
  ["Rice cake", "rice cake|rice cakes", "snack", 387, 8.2, 81.5, 2.8, 4.2, "cake:9"],
  ["Pretzels", "pretzels|pretzel", "snack", 384, 10, 80, 2.9, 3.4, "oz:28.35|handful:30"],

  // ── Drinks ────────────────────────────────────────────────────────────────
  ["Coffee, black", "coffee|black coffee|americano", "drink", 1, 0.1, 0, 0, 0, "cup:237|mug:355|shot:30"],
  ["Latte, whole milk", "latte|cafe latte", "drink", 55, 3, 5.3, 2.9, 0, "grande:473|tall:355|cup:240"],
  ["Cappuccino", "cappuccino", "drink", 40, 2.2, 3.9, 2.1, 0, "cup:240|grande:473"],
  ["Tea, unsweetened", "tea|green tea|black tea|chai unsweetened", "drink", 1, 0, 0.2, 0, 0, "cup:237|mug:355"],
  ["Orange juice", "orange juice|oj", "drink", 45, 0.7, 10.4, 0.2, 0.2, "cup:248|glass:240"],
  ["Soda, cola", "soda|coke|cola|pepsi", "drink", 42, 0, 10.6, 0, 0, "can:355|bottle:591"],
  ["Diet soda", "diet coke|diet soda|coke zero", "drink", 0, 0, 0, 0, 0, "can:355|bottle:591"],
  ["Beer", "beer", "drink", 43, 0.5, 3.6, 0, 0, "can:355|pint:473"],
  ["Wine, red", "wine|red wine", "drink", 85, 0.1, 2.6, 0, 0, "glass:147|bottle:750"],
  ["Smoothie, berry", "smoothie|berry smoothie", "drink", 60, 1.5, 13, 0.6, 1.8, "cup:240|large:473"],
  ["Water", "water", "drink", 0, 0, 0, 0, 0, "cup:237|bottle:500|liter:1000"],
  ["Sports drink", "gatorade|sports drink|powerade", "drink", 25, 0, 6.3, 0, 0, "bottle:591|cup:240"],
  ["Energy drink", "red bull|energy drink|celsius|monster", "drink", 45, 0.4, 11, 0, 0, "can:250|large can:473"],

  // ── Supplements & powders ─────────────────────────────────────────────────
  ["Whey protein powder", "whey|protein powder|whey protein|protein shake", "supplement", 400, 80, 8, 6, 1, "scoop:30|serving:31"],
  ["Casein protein powder", "casein|casein protein", "supplement", 370, 76, 8, 3, 1, "scoop:33"],
  ["Plant protein powder", "plant protein|vegan protein|pea protein", "supplement", 390, 75, 9, 6, 4, "scoop:33"],
  ["Collagen peptides", "collagen|collagen peptides", "supplement", 360, 90, 0, 0, 0, "scoop:11|tbsp:11"],
  ["Creatine monohydrate", "creatine", "supplement", 0, 0, 0, 0, 0, "scoop:5|tsp:5"],

  // ── Condiments ────────────────────────────────────────────────────────────
  ["Ketchup", "ketchup|tomato sauce", "condiment", 101, 1.2, 25.8, 0.1, 0.3, "tbsp:17|packet:9"],
  ["Mustard", "mustard", "condiment", 66, 4.4, 5.8, 3.3, 3.3, "tsp:5|tbsp:15"],
  ["Soy sauce", "soy sauce|shoyu", "condiment", 53, 8.1, 4.9, 0.6, 0.8, "tbsp:16|tsp:5.3"],
  ["Hot sauce", "hot sauce|sriracha|tabasco", "condiment", 93, 1.9, 19.2, 0.9, 2.3, "tsp:5|tbsp:15"],
  ["Ranch dressing", "ranch|ranch dressing", "condiment", 430, 1.3, 6.5, 44.5, 0, "tbsp:15|serving:30"],
  ["Salsa", "salsa|pico de gallo", "condiment", 36, 1.5, 7, 0.2, 1.9, "tbsp:16|cup:240"],
  ["Balsamic vinaigrette", "vinaigrette|balsamic dressing|italian dressing", "condiment", 89, 0.1, 8, 6.5, 0, "tbsp:15"],
];
/* eslint-enable */

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parsePortions(spec: string): Portion[] {
  return spec
    .split("|")
    .map((chunk) => {
      const [label, grams] = chunk.split(":");
      return { label: label.trim(), grams: Number(grams) };
    })
    .filter((p) => p.label && Number.isFinite(p.grams) && p.grams > 0);
}

export const FOODS: Food[] = ROWS.map(
  ([name, aliases, group, cal, protein, carbs, fat, fiber, portions]) => ({
    id: slug(name),
    name,
    aliases: aliases ? aliases.split("|").map((a) => a.trim()).filter(Boolean) : [],
    group,
    per100g: {
      calories: cal,
      protein_g: protein,
      carbs_g: carbs,
      fat_g: fat,
      fiber_g: fiber,
    },
    portions: parsePortions(portions),
  })
);

const BY_ID = new Map(FOODS.map((f) => [f.id, f]));

export function foodById(id: string): Food | undefined {
  return BY_ID.get(id);
}

/** Scale a food's per-100g macros to an actual gram weight. */
export function macrosFor(food: Food, grams: number): Macros {
  const k = grams / 100;
  return {
    calories: Math.round(food.per100g.calories * k),
    protein_g: Math.round(food.per100g.protein_g * k * 10) / 10,
    carbs_g: Math.round(food.per100g.carbs_g * k * 10) / 10,
    fat_g: Math.round(food.per100g.fat_g * k * 10) / 10,
    fiber_g: Math.round(food.per100g.fiber_g * k * 10) / 10,
  };
}

export function emptyMacros(): Macros {
  return { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 };
}

export function addMacros(a: Macros, b: Macros): Macros {
  return {
    calories: a.calories + b.calories,
    protein_g: Math.round((a.protein_g + b.protein_g) * 10) / 10,
    carbs_g: Math.round((a.carbs_g + b.carbs_g) * 10) / 10,
    fat_g: Math.round((a.fat_g + b.fat_g) * 10) / 10,
    fiber_g: Math.round((a.fiber_g + b.fiber_g) * 10) / 10,
  };
}

/**
 * Ranked search across names and aliases.
 * Exact > alias-exact > prefix > word-prefix > substring, with a small bonus
 * for shorter names so "egg" beats "egg salad sandwich".
 */
export function searchFoods(query: string, limit = 12): Food[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: { food: Food; score: number }[] = [];
  for (const food of FOODS) {
    const name = food.name.toLowerCase();
    const hay = [name, ...food.aliases];
    let best = 0;
    for (const term of hay) {
      let s = 0;
      if (term === q) s = 100;
      else if (term.startsWith(`${q} `) || term.startsWith(`${q},`)) s = 88;
      else if (term.startsWith(q)) s = 80;
      else if (new RegExp(`\\b${escapeRe(q)}`).test(term)) s = 66;
      else if (term.includes(q)) s = 48;
      if (s > best) best = s;
    }
    if (best > 0) {
      scored.push({ food, score: best - Math.min(12, food.name.length / 6) });
    }
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.food);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Default household portion for a food (what "an egg" means). */
export function defaultPortion(food: Food): Portion {
  return food.portions[0] || { label: "g", grams: 100 };
}
