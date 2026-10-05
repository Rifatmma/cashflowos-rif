// The ingredients the kitchen tracks, and how a receipt line becomes stock.
//
// ONLY THE COSTLY ITEMS (owner's call, 22 Sep 2026): proteins, eggs, rice. Veg,
// sauces, drinks and noodles are not deducted -- they stay as Cash Out spend.
//
// Every quantity is held in the item's own unit: grams, pieces, or fish. A
// receipt says "2 kg", a recipe says "6 shrimp", so the conversions live here in
// one place and both sides meet in the same unit.
//
// Pure: no server imports, safe to test directly.
//
// SPLIT OUT OF stock-items.ts so lib/units.ts can read the catalogue without a
// circular import: units needs to know an item's own unit to decide what it may
// be entered in, and stock-items needs units to validate a choice. The catalogue
// depends on neither (owner, 5 Oct 2026).

export type Unit = 'g' | 'pc' | 'fish'

export type ItemDef = {
  key: string
  name: string
  unit: Unit
  /** Receipt names that mean this item. Lower-case regex sources. */
  aliases: string[]
  /** Pieces per kg, for items bought by weight and used by the piece. */
  perKg?: number
  /** % of the bought weight that reaches a plate after trimming (owner's figures). */
  usablePct?: number
  /** Rough cost per unit, used ONLY until a receipt gives the real price. */
  fallbackCost: number
  /** Portioned into bags of this many grams (usable, already trimmed): counted in bags. */
  bagG?: number
  /** When a receipt line has no weight, assume this pack size in kg. */
  defaultPackKg?: number
  sort: number
}

// Owner's figures, 22 Sep 2026. Where a number is a starting guess it says so;
// the weekly count shows how far off it is.
export const ITEMS: ItemDef[] = [
  { key: 'breast', name: 'Chicken breast (boneless)', unit: 'g', sort: 10,
    // 2 kg bag loses about 80 g in trimming.
    usablePct: 96, fallbackCost: 0.012, bagG: 80,
    aliases: ['boneless breast', 'chicken breast', 'breast', 'dada ayam', 'isi dada', 'fillet ayam'] },
  { key: 'leg', name: 'Chicken leg quarter', unit: 'pc', sort: 11, perKg: 3.3, fallbackCost: 1.7,
    aliases: ['leg quarter', 'peha', 'thigh', 'drumstick', 'chicken leg'] },
  { key: 'feet', name: 'Chicken feet', unit: 'pc', sort: 12, perKg: 30, fallbackCost: 0.2,
    aliases: ['kaki ayam', 'chicken feet', 'ceker'] },
  { key: 'beef', name: 'Beef', unit: 'g', sort: 20, usablePct: 80, fallbackCost: 0.035, bagG: 80,
    // Owner's rule (22 Sep 2026): buffalo meat is stocked and used as beef.
    aliases: ['daging', 'beef', 'buffalo', 'kerbau', 'carabeef'] },
  { key: 'tongue', name: 'Beef tongue', unit: 'g', sort: 21, fallbackCost: 0.03, bagG: 120,
    aliases: ['lidah', 'tongue'] },
  // Thai names, owner 24 Sep 2026: กุ้งขาว or plain กุ้ง is this one; กุ้งแม่น้ำ
  // ("river prawn") is udang galah, which is why กุ้ง must not swallow it.
  // Owner, 24 Sep 2026: "a kilo of shrimp is about 30-35 pieces". 33 was taken
  // as the middle of that; he settled it at the top of his own range on 6 Oct
  // 2026 -- "each kg have about 33 pieces of shrimp. Let's do 35 instead."
  //
  // This is the rate a weight is READ AT, nothing more. Stock moves already
  // written keep the piece counts they were saved with, so changing it does not
  // rewrite history; it changes what the next bill is converted to.
  { key: 'shrimp', name: 'Shrimp (fresh)', unit: 'pc', sort: 30, perKg: 35, fallbackCost: 0.75,
    aliases: ['udang(?! galah)', 'prawn', 'shrimp', 'กุ้ง(?!แม่น้ำ)'] },
  // Owner, 23 Sep 2026: frozen shrimp is a different item -- it only goes into
  // fried rice; every other shrimp dish uses fresh. Checked BEFORE 'shrimp'.
  { key: 'shrimp_frozen', name: 'Shrimp (frozen)', unit: 'pc', sort: 31, perKg: 35, fallbackCost: 0.5,
    aliases: ['(frz|frozen|beku|iqf)[^a-z]*(isi )?(udang|prawn|shrimp)', '(udang|prawn|shrimp)[^a-z]*(frz|frozen|beku|iqf)'] },
  { key: 'galah', name: 'Udang galah', unit: 'pc', sort: 31, perKg: 20, fallbackCost: 3,
    aliases: ['udang galah', 'river prawn', 'galah', 'กุ้งแม่น้ำ'] },
  { key: 'crab', name: 'Crab', unit: 'pc', sort: 32, perKg: 6, fallbackCost: 6,
    aliases: ['ketam', 'crab'] },
  { key: 'squid', name: 'Squid / octopus', unit: 'g', sort: 33, usablePct: 75, fallbackCost: 0.03, bagG: 80,
    aliases: ['sotong', 'squid', 'calamari', 'octopus', 'หมึก'] },
  // Owner, 23 Sep 2026: frozen sotong is its own item -- it goes into the fried
  // squid dish only; every other sotong dish uses fresh. Rings come cleaned and
  // cut, so nothing is trimmed off (ASK if that is wrong).
  { key: 'squid_frozen', name: 'Squid (frozen rings)', unit: 'pc', sort: 33, perKg: 18, fallbackCost: 0.43,
    aliases: ['(frz|fzn|frozen|beku|iqf)[^a-z]*(sotong|squid|calamari)', '(sotong|squid|calamari)[^a-z]*(frz|fzn|frozen|beku|iqf)'] },
  { key: 'mussel', name: 'Mussels', unit: 'pc', sort: 34, perKg: 20, fallbackCost: 0.25,
    // A Sri Ternak bag is about 20 pieces; treated as a 1 kg bag when no weight prints.
    defaultPackKg: 1,
    aliases: ['kupang', 'mussel', 'kerang hijau'] },
  { key: 'lala', name: 'Lala', unit: 'g', sort: 35, fallbackCost: 0.015, bagG: 250,
    aliases: ['lala', 'clam', 'kepah'] },
  { key: 'siakap', name: 'Siakap', unit: 'fish', sort: 36, fallbackCost: 12,
    aliases: ['siakap', 'barramundi', 'sea ?bass', 'kerapu', 'ปลากระพง'] },
  { key: 'egg', name: 'Eggs', unit: 'pc', sort: 40, fallbackCost: 0.45,
    aliases: ['telur(?! masin)', '\\begg'] },
  { key: 'rice', name: 'Rice (uncooked)', unit: 'g', sort: 50, fallbackCost: 0.0046,
    // "ROYAL UMBRELLA BERAS" prints no weight; the owner buys 10 kg bags.
    defaultPackKg: 10,
    aliases: ['beras(?! pulut)', 'royal umbrella', 'jasmine rice', '\\brice\\b'] },
]

export const ITEM = Object.fromEntries(ITEMS.map(i => [i.key, i])) as Record<string, ItemDef>

// WHOLE_BIRD_ITEM and NOT_STOCK_ITEM live here too: they are catalogue keys, and
// lib/units.ts needs them to decide what units an item may be entered in.
/** Not stock at all -- e.g. "PRAWN MEE" that the name reader took for shrimp. */
export const NOT_STOCK_ITEM = 'none'
export const WHOLE_BIRD_ITEM = 'bird'
