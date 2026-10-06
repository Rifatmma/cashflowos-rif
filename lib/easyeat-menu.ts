// What EasyEat's menu is made of: the variant groups and the add-ons.
//
// Read from partner.easyeat.ai on 6 Oct 2026 (Restaurant Jaosamut): 21
// categories, 50 variant groups, 23 add-ons. The groups are what the POS puts
// in the VARIATION OPTIONS column of the daily dish report, so this list is the
// vocabulary the recipe book has to speak.
//
// `suggest` is my read on whether the group changes what leaves the freezer --
// a starting position for the variations screen, never the answer. The owner
// confirms every one; nothing here decides anything on its own.
//
// The add-ons are seeded as a variant group because the dish report does NOT
// carry them today: "Extra Shrimp (3 pieces)" appears nowhere in any export.
// The owner is rebuilding them as variations in EasyEat so they arrive on the
// line (6 Oct 2026). Five of them state their own quantity in the name, so
// those arrive pre-filled and only need confirming.

export type SeedGroup = {
  key: string
  label: string
  options: string[]
  suggest: boolean          // does it change what's used?
}

const G = (label: string, suggest: boolean, options: string[]): SeedGroup =>
  ({ key: label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), label, options, suggest })

export const VARIANT_GROUPS: SeedGroup[] = [
  // ── taste and service: nothing leaves the freezer ──────────────────────────
  G('Spiciness', false, ['No Chilli ไม่พริก', 'Less Spicy พริก 1', 'Normal Spicy เผ็ดกลาง', 'Extra Spicy เผ็ดมาก']),
  G('Sugar level', false, ['No Sugar Tanpa Gula', 'Less Sugar Kurang Gula', 'Normal Sugar Manis Biasa']),
  G('Drink Temperature', false, ['Iced Sejuk', 'Warm Suam', 'Hot Panas']),
  G('Choice', false, ['Hot Panas', 'Cold Sejuk']),
  G('ADD ON ICE', false, ['No Ice', 'Ice']),

  // ── size: the same dish, more of it ────────────────────────────────────────
  G('Sotong Size', true, ['Small เล็ก', 'Medium กลาง']),
  G('Size Beef', true, ['Small เล็ก', 'Medium กลาง']),
  G('Size Chicken', true, ['Small เล็ก', 'Medium ใหญ่']),
  G('Size (Veggies)', true, ['Small', 'Medium']),
  G('Size pad krapow chicken', true, ['Small 2ถุง', 'Medium 3ถุง']),
  G('Size pad krapow beef', true, ['Small 2 ถุง', 'Medium 3 ถุง']),
  G('Rice Size', true, ['Normal Plate', 'Large Bowl (5-7 Serve)']),
  G('Rice', true, ['2 Plate Rice', '3 Plate Rice', '4 Plate Rice', '1 Bowl Of Rice']),
  G('Drink Size', false, ['Glass', 'Jug']),
  G('Juice Size', false, ['Glass', 'Jug']),
  G('Water size', false, ['Glass', 'Jug']),
  G('Green tea size', false, ['Glass', 'Jug']),
  G('Drink size susu', false, ['Glass', 'Jug']),

  // ── the protein changes entirely ───────────────────────────────────────────
  G('Choice Chicken / Beef', true, ['Chicken ไก่', 'Beef เนื้อ']),
  G('Chicken or Beef', true, ['Chicken', 'Beef']),
  G('Choice of meat', true, ['Chicken', 'Beef', 'Seafood']),
  G('Padthai', true, ['Chicken ไก่', 'Beef เนื้อ', 'Shrimp (Udang)กุ้ง']),
  G('Nasi Choice', true, ['Nasi Putih Plain Rice ข้าวเปล่า', 'Nasi Goreng Fried Rice ข้าวผัด']),
  G('Types of noodle', true, ['Maggie มาม่า', 'Bihoon หมี่ฮุ้น', 'Kuey Teow ก๋วยเตี๋ยว']),
  G('Type of noodle', true, ['Rice Noodle', 'Meggi']),
  G('Kailan or Kangkung', true, ['Kailan คะน้า', 'Kangkung ผักบุ้ง']),
  G('Egg tomyum', true, ['No Egg', 'Add On Egg']),

  // ── the soup or the cooking method changes ─────────────────────────────────
  G('Choice of Tomyum', true, ['Kuah Merah Red Soup ต้มยำน้ำข้น', 'Kuah Putih Clear Soup ต้มยำน้ำใส']),
  G('Tomyam Seafood', true, ['Kuah Merah Red Soup ต้มยำน้ำข้น', 'Kuah Putih Clear Soup ต้มยำน้ำใส', 'Upgrade Tomyam Kelapa (Tomyam Coconut) ต้มยำมะพร้าวทะเล']),
  G('Fish Cooking Method', true, ['Miang Pla Goreng เมี่ยงปลาทอด', 'Miang Pla Bakar เมี่ยงปลาเผา', 'Siakap 3 Rasa ปลากระพงสามรส', 'Siakap Stim Limau ปลากระพงนึ่งมะนาว', 'Siakap Mango Salad ปลากระพงยำมะม่วง', 'Siakap Stim Soy Sauce ปลากระพงนึ่งซีอิ๊ว', 'Siakap Goreng Herbs ปลากระพงทอดสมุนไพร', 'Siakap Kengsom แกงส้มปลากระพง', 'Kerabu Siakap ลาบปลาทอด', 'Siakap Sweet & Sour ปลาเปรี้ยวหวาน']),

  // ── set menu choices: each becomes a set_part recipe ───────────────────────
  G('2 choice of siakap', true, ['Siakap Stim Limau นึ่งมะนาว', 'Siakap 3 Rasa สามรส', 'Siakap Mango Salad ปลาทอดน้ำปลา', 'Siakap Fried Herbs ปลาทอดสมุนไพร', 'Siakap Stim Soy Sauce ปลานึ่งซีอิ๊ว', 'Kengsom Siakap แกงส้มปลา', 'Tomyum Siakap (Kuah Merah Red Soup) ต้มยำปลาน้ำข้น', 'Tomyum Siakap (Kuah Putih Clear Soup) ต้มยำปลาน้ำใส', 'Miang Pla Siakap Bakar เมี่ยงปลาเผา', 'Miang Pla Siakap Goreng เมี่ยงปลาทอด', 'Siakap Sweet & Sour ปลาเปรี้ยวหวาน']),
  G('Choice of Chicken 2-3', true, ['Chicken Cashew Nuts ไก่ผัดเม็ด', 'Chicken Spicy ยำไก่แซ่บ', 'Chicken Fried Chilli ไก่คั่วพริกเกลือ', 'Chicken Fried Garlic ไก่ทอดกระเทียม', 'Sweet & Sour Chicken ไก่เปรี้ยวหวาน', 'Crispy Pad Krapow Chicken กระเพราไก่กรอบ', 'Padped Chicken ผัดเผ็ดไก่', 'Ayam Goreng Serai (Chicken) ไก่ตะไคร้', 'Ayam Butter ไก่ทอดเนย']),
  G('Choice of Chicken 4-6', true, ['Chicken Cashew Nuts ไก่ผัดเม็ด', 'Chicken Spicy ยำไก่แซ่บ', 'Chicken Fried Chilli ไก่คั่วพริกเกลือ', 'Chicken Fried Garlic ไก่ทอดกระเทียม', 'Sweet & Sour Chicken ไก่เปรี้ยวหวาน', 'Crispy Pad Krapow Chicken กระเพราไก่กรอบ', 'Patpet Chicken ผัดพริกแกงไก่', 'Khua Kling Chicken (S) คั่วกลิ้งไก่(เล็ก)', 'Pad Krapow Chicken Cincang (S) กระเพราไก่สับ(เล็ก)', 'Ayam Goreng Serai (Chicken) ไก่ตะไคร้', 'Ayam Butter ไก่ทอดเนย']),
  G('Choice of Beef', true, ['Black Pepper Beef พริกไทยดำเนื้อ', 'Beef Fried Garlic เนื้อกระเทียม', 'Daging Merah (Beef) เนื้อแดง', 'Beef Oyster Sauce เนื้อน้ำมันหอย', 'Lidah Merah ลิ้นแดง', 'Lidah Goreng Cili ลิ้นคั่วพริกเกลือ', 'Khua Kling Beef คั่วกลิ้งเนื้อ(เล็ก)', 'Pad Krapow Beef กระเพราเนื้อ(เล็ก)']),
  G('Choice of Shrimp', true, ['Jaosamut Shrimp กุ้งชิลลี่แครบ', 'Udang Masak Petai (Stinky Bean Shrimp) กุ้งผัดสะตอ', 'Shrimp Salted Egg กุ้งไข่เค็ม', 'Shrimp Fried Chili กุ้งคั่วพริกเกลือ', 'Pad Krapow Shrimp กะเพรากุ้ง', 'Shrimp Fried Garlic กุ้งทอดกระเทียม', 'Butter Shrimp กุ้งทอดเนย', 'Crispy Fried Shrimp กุ้งชุปแป้งทอด']),
  G('Choice of Calamari 2-4', true, ['Jaosamut Calamari หมึกชิลลี่แครบ', 'Calamari Fried Garlic หมึกทอดกระเทียม', 'Pad Krapow Calamari กะเพราหมึก', 'Calamari Salted Egg หมึกไข่เค็ม', 'Calamari Fried Chili หมึกคั่วพริกเกลือ', 'Butter Calamari หมึกทอดเนย', 'Sotong Celup Tepung หมึกชุปแป้งทอด']),
  G('Choice of Calamari 4-6', true, ['Jaosamut Calamari หมึกชิลลี่แครบ', 'Calamari Fried Garlic หมึกทอดกระเทียม', 'Pad Krapow Calamari กะเพราหมึก', 'Calamari Salted Egg หมึกไข่เค็ม', 'Calamari Fried Chili หมึกคั่วพริกเกลือ', 'Butter Calamari หมึกทอดเนย', 'Sotong Celup Tepung หมึกชุปแป้งทอด']),
  G('Choice of Vegetable', true, ['Sayur Campur ผัดผักรวม', 'Kailan Ikan Masin คะน้าปลาเค็ม', 'Kailan Sos Tiram คะน้าน้ำมันหอย', 'Kangkung Goreng Cina บุ้งไฟแดง', 'Kangkung Belacan บุ้งกะปิ']),
  G('Add on Sayur Medium size', true, ['No Add On', 'Kangkung Goreng Belacan (ผักบุ้งซอสกะปิ)', 'Kangkung Goreng Cina (ผักบุ้งไฟแดง)', 'Kailan Masak Tiram (คะน้าน้ำมันหอย)', 'Kailan Goreng Cina (คะน้าไฟแดง)', 'Sayur Campur (ผัดผักรวม)', 'Kailan Ikan Masin (คะน้าปลาเค็ม)']),
  G('Add on Sayur Small Size', true, ['No Add On', 'Kangkung Goreng Belacan (ผักบุ้งซอสกะปิ)', 'Kangkung Goreng Cina (ผักบุ้งไฟแดง)', 'Kailan Masak Tiram (คะน้าน้ำมันหอย)', 'Kailan Goreng Cina (คะน้าไฟแดง)', 'Sayur Campur (ผัดผักรวม)', 'Kailan Ikan Masin (คะน้าปลาเค็ม)']),
  G('Free Bingsu', true, ['No Bingsu', 'Bingsu Strawberry', 'Bingsu Oreo', 'Bingsu Mango Sticky Rice']),
  G('Dessert', true, ['No Dessert', 'Mango Sticky Rice', 'Bingsu Oreo', 'Bingsu Strawberry', 'Bingsu Mango Sticky Rice']),
  G('Type of Sausage', true, ['Red Sausage ไส้กรอกแดง', 'Pulut Jumbo ไส้กรอกอีสาน', 'Ayam Suhun ไก่จ๊อ', 'Cheese Sausage Jumbo ไส้กรอกชีสใหญ่']),
  G('Make it 3 sticks!', true, ['Pulut Jumbo ไส้กรอกอีสาน', 'Red Sausage ไส้กรอกแดง', 'Ayam Suhun ไก่จ๊อ', 'Meatball ลูกชิ้นเนื้อ', 'Cheese Jumbo ไส้กรอกชีส']),
  G('Make it 3 sticks', true, ['Ayam Susu ไก่ย่างนมสด', 'Daging Masam แหนมเนื้อ']),

  // ── drinks that come with a set: a jug is not a glass ──────────────────────
  G('Drinks in set', true, ['Teh O Ais (Jug)', 'Sirap Ais (Jug)', 'Teh O Limau (Jug)', 'Thai Green Tea (Jug)', 'Green Tea O (Jug)', 'Iced Thai Tea (Jug)', 'Milo (Jug)', 'Lychee (Jug)', 'Green Tea O Limau (Jug)', 'Teh Bunga Biru Limau (Jug)', 'Sirap Limau (Jug)', 'Orange Sunquick (Jug)', 'Kopi Ais (Jug)', 'Limau Ais (Jug)', 'Kopi O (Jug)']),
  G('Combo Drinks', true, ['Kopi O Ais (Glass)', 'Teh O Ais (Glass)', 'Limau Ais (Glass)', 'Sirap Ais (Glass)', 'Kopi Ais (Glass)', 'Orange Sunquick (Glass)', 'Sirap Limau (Glass)', 'Teh Ice (Glass)', 'Teh O Limau Ais (Glass)', 'Teh Tarik (Glass)', 'Teh Bunga Biru (Glass)', 'Green Tea O Lime (Glass)', 'Lychee Juice (Glass)', 'Milo Ais (Glass)', 'Thai Green Tea (Glass)']),
  G('Choice of drinks', true, ['Teh O Ais ชาดำเย็น', 'Sirap Ais น้ำแดงเย็น', 'Teh O Panas ชาดำร้อน', 'Sirap Panas น้ำแดงร้อน']),
]

/** An add-on, and the quantity its own name states. */
export type SeedAddon = {
  label: string
  price: number
  /** Pre-filled from the name where it states one -- confirmed, never assumed. */
  line?: { ingredient: string; qty: number; unit: string }
}

export const ADDONS: SeedAddon[] = [
  { label: 'Extra Shrimp (3 pieces)', price: 6, line: { ingredient: 'shrimp', qty: 3, unit: 'pcs' } },
  { label: 'Extra Udang Galah (2 Pieces)', price: 10, line: { ingredient: 'galah', qty: 2, unit: 'pcs' } },
  { label: 'Extra Chicken (100 grams)', price: 4, line: { ingredient: 'breast', qty: 100, unit: 'g' } },
  { label: 'Extra Calamari (80 Grams)', price: 6, line: { ingredient: 'squid', qty: 80, unit: 'g' } },
  { label: 'Isi Ketam (30 Grams)', price: 25, line: { ingredient: 'crab', qty: 30, unit: 'g' } },
  { label: 'Telur Mata', price: 2, line: { ingredient: 'egg', qty: 1, unit: 'pcs' } },
  { label: 'Telur Dada', price: 2, line: { ingredient: 'egg', qty: 1, unit: 'pcs' } },
  { label: 'Telur Masin', price: 3 },
  { label: 'Extra Crabsticks', price: 4 },
  { label: 'Extra Sausages', price: 4 },
  { label: 'Extra Petai', price: 2.9 },
  { label: 'Extra Soohoon', price: 2 },
  { label: 'Extra Bihoon', price: 2 },
  { label: 'Extra Maggie', price: 2 },
  { label: 'Extra noodles', price: 2 },
  { label: 'Extra Mixed Herbs', price: 2 },
  { label: 'Extra Fried Herbs', price: 2 },
  { label: 'Extra Mango Salad', price: 2 },
  { label: 'Extra Salad', price: 4 },
  { label: 'Crispy Ruby', price: 8 },
  { label: 'Roti Sangkaya', price: 8 },
  { label: 'Mango Sticky Rice', price: 9 },
  { label: 'Ice', price: 0.5 },
]

/** The add-ons as a variant group, for when they arrive on the line. */
export const ADDON_GROUP: SeedGroup = {
  key: 'add-ons',
  label: 'Add-ons',
  options: ADDONS.map(a => a.label),
  suggest: true,
}
